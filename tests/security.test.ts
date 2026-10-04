import { beforeEach, describe, expect, it } from "vitest";
import { jar, requestHeaders } from "./setup";
import * as actions from "@/app/actions";
import { getDB } from "@/lib/server/store";
import { getSessionUser, hashToken, startSession } from "@/lib/server/auth";
import { resetRateLimits } from "@/lib/server/ratelimit";
import { jsonForScript, safeExternalUrl, safeRedirectPath } from "@/lib/server/security";
import { getReview, getProfile, trendingReviews, search } from "@/lib/server/queries";
import { buildCsp } from "@/lib/csp";
import { GET as openRoute } from "@/app/open/[kind]/[id]/route";
import { GET as catalogueRoute } from "@/app/api/search/catalogue/route";

const user = (username: string) => getDB().users.find((u) => u.username === username)!;
async function loginAs(username: string) {
  jar.clear();
  await startSession(user(username).id);
}
function logout() {
  jar.clear();
}
function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const entryOf = (username: string) => getDB().entries.find((e) => e.userId === user(username).id && e.review)!;
const listOf = (username: string) => getDB().lists.find((l) => l.userId === user(username).id)!;
const aSong = () => getDB().songs[0];

beforeEach(() => {
  resetRateLimits();
  logout();
});

describe("authentication boundary", () => {
  it("rejects every mutation without a session", async () => {
    const song = aSong();
    for (const call of [
      () => actions.rateSong(song.id, 4),
      () => actions.toggleLike(song.id),
      () => actions.logSong({ songId: song.id, rating: 5 }),
      () => actions.createList({ title: "x" }),
      () => actions.toggleFollow(user("alex").id),
      () => actions.moderate("re1", "remove"),
    ]) {
      const r = await call();
      expect(r.ok).toBe(false);
    }
    expect(getDB().ratings.some((r) => r.songId === song.id && !getDB().users.some((u) => u.id === r.userId))).toBe(false);
  });

  it("stores only a hash of the session token", async () => {
    await loginAs("maya");
    const token = [...jar.values()][0];
    expect(getDB().sessions.some((s) => (s as unknown as Record<string, unknown>).token === token)).toBe(false);
    expect(getDB().sessions.some((s) => s.tokenHash === hashToken(token))).toBe(true);
  });

  it("invalidates the session on logout", async () => {
    await loginAs("maya");
    const token = [...jar.values()][0];
    await expect(actions.logout()).rejects.toMatchObject({ redirectTo: "/" });
    jar.set("mb_session", token); // replay the old cookie
    expect(await getSessionUser()).toBeNull();
  });

  it("revokes other sessions when the password changes", async () => {
    await loginAs("rosa");
    const other = [...jar.values()][0];
    await loginAs("rosa");
    const r = await actions.updateSettings(null, form({ displayName: "Rosa", bio: "", location: "", website: "", profileVisibility: "public", avatarHue: "10", currentPassword: "musicbox-demo", newPassword: "a-much-better-password" }));
    expect(r.ok).toBe(true);
    const current = [...jar.values()][0];
    jar.set("mb_session", other);
    expect(await getSessionUser()).toBeNull();
    jar.set("mb_session", current);
    expect((await getSessionUser())?.username).toBe("rosa");
  });

  it("rate limits login per IP and returns a generic error for unknown users", async () => {
    const bad = form({ username: "nobody-here", password: "wrong-password" });
    const first = await actions.login(null, bad);
    expect(first).toEqual({ ok: false, error: "That username and password don't match." });
    let limited = false;
    for (let i = 0; i < 25; i++) {
      const r = await actions.login(null, form({ username: `u${i}`, password: "wrong" }));
      if (!r.ok && r.error.startsWith("Too many")) limited = true;
    }
    expect(limited).toBe(true);
  });

  it("does not let one attacker IP lock out the account owner on another IP", async () => {
    for (let i = 0; i < 10; i++) await actions.login(null, form({ username: "juno", password: "wrong" }));
    requestHeaders.set("x-real-ip", "198.51.100.9");
    await expect(actions.login(null, form({ username: "juno", password: "musicbox-demo" }))).rejects.toMatchObject({ redirectTo: "/" });
    requestHeaders.set("x-real-ip", "203.0.113.7");
  });
});

describe("authorization (BOLA/IDOR)", () => {
  it("cannot edit or delete another user's diary entry", async () => {
    const victim = entryOf("alex");
    const before = victim.review;
    await loginAs("maya");
    expect((await actions.updateEntry(victim.id, { review: "pwned" })).ok).toBe(false);
    expect((await actions.deleteEntry(victim.id)).ok).toBe(false);
    expect(getDB().entries.find((e) => e.id === victim.id)?.review).toBe(before);
  });

  it("cannot edit, add to or delete another user's list", async () => {
    const list = listOf("alex");
    const title = list.title;
    await loginAs("maya");
    expect((await actions.updateList(list.id, { title: "pwned" })).ok).toBe(false);
    expect((await actions.addToList(list.id, aSong().id)).ok).toBe(false);
    expect((await actions.deleteList(list.id)).ok).toBe(false);
    expect(getDB().lists.find((l) => l.id === list.id)?.title).toBe(title);
  });

  it("cannot delete another user's comment", async () => {
    const c = getDB().comments.find((x) => x.userId !== user("kai").id)!;
    await loginAs("kai");
    expect((await actions.deleteComment(c.id)).ok).toBe(false);
    expect(getDB().comments.some((x) => x.id === c.id)).toBe(true);
  });

  it("ignores client-supplied owner ids (identity comes from the session)", async () => {
    await loginAs("sam");
    const r = await actions.logSong({ songId: aSong().id, rating: 4, userId: user("alex").id } as never);
    expect(r.ok).toBe(false); // unknown keys are rejected outright
    const ok = await actions.logSong({ songId: aSong().id, rating: 4 });
    expect(ok.ok).toBe(true);
    expect(getDB().entries.find((e) => e.id === (ok.ok ? ok.data : ""))?.userId).toBe(user("sam").id);
  });

  it("hides private profiles' reviews from other users everywhere", async () => {
    const theo = user("theo");
    theo.profileVisibility = "private";
    try {
      const e = entryOf("theo");
      expect(getReview(e.id, user("maya").id)).toBeNull();
      expect(trendingReviews(500, user("maya").id).some((r) => r.user.id === theo.id)).toBe(false);
      expect(getProfile("theo", user("maya").id)?.canView).toBe(false);
      await loginAs("maya");
      expect((await actions.toggleReviewLike(e.id)).ok).toBe(false);
      expect((await actions.addComment("entry", e.id, "hi")).ok).toBe(false);
      expect(getReview(e.id, theo.id)).not.toBeNull(); // owner still sees it
    } finally {
      theo.profileVisibility = "public";
    }
  });

  it("blocked users cannot comment on the blocker's content", async () => {
    await loginAs("priya");
    expect((await actions.toggleBlock(user("daniel").id, "block")).ok).toBe(true);
    await loginAs("daniel");
    expect((await actions.addComment("entry", entryOf("priya").id, "hello")).ok).toBe(false);
  });

  it("profile data never includes the password hash", () => {
    const p = getProfile("alex");
    expect(JSON.stringify(p)).not.toContain("scrypt$");
  });
});

describe("admin", () => {
  it("non-admins cannot moderate", async () => {
    await loginAs("alex");
    await actions.report("entry", entryOf("maya").id, "spam");
    const rep = getDB().reports.at(-1)!;
    expect((await actions.moderate(rep.id, "remove")).ok).toBe(false);
    expect(getDB().entries.find((e) => e.id === rep.targetId)?.removed).toBeFalsy();
  });

  it("admins (from ADMIN_USERNAMES) can moderate", async () => {
    await loginAs("abtin");
    const rep = getDB().reports.find((r) => r.status === "open")!;
    expect((await actions.moderate(rep.id, "remove")).ok).toBe(true);
    expect(getDB().entries.find((e) => e.id === rep.targetId)?.removed).toBe(true);
  });

  it("role cannot be mass-assigned through settings", async () => {
    await loginAs("kai");
    const r = await actions.updateSettings(null, form({ displayName: "Kai", bio: "", location: "", website: "", profileVisibility: "public", avatarHue: "90", currentPassword: "", newPassword: "", role: "admin" }));
    expect(r.ok).toBe(true);
    expect(user("kai").role).toBe("user");
  });
});

describe("input validation", () => {
  it("rejects malformed and oversized payloads", async () => {
    await loginAs("noor");
    const s = aSong().id;
    const bad = [
      () => actions.rateSong(s, 7),
      () => actions.rateSong(s, 1.3),
      () => actions.rateSong(s, "5" as never),
      () => actions.logSong({ songId: s, review: "x".repeat(5001) }),
      () => actions.logSong({ songId: s, tags: "gym" as never }),
      () => actions.logSong({ songId: s, context: "<script>" as never }),
      () => actions.logSong({ songId: s, listenedAt: "2999-01-01" }),
      () => actions.logSong({ songId: "../../etc/passwd" }),
      () => actions.addComment("entry", entryOf("alex").id, "x".repeat(2001)),
      () => actions.addComment("system" as never, "x", "hi"),
      () => actions.createList({ title: "t", items: Array.from({ length: 501 }, () => ({ songId: s })) }),
      () => actions.moderate("x", "nuke" as never),
      () => actions.reorderFavoriteSongs(Array.from({ length: 50 }, () => s)),
    ];
    for (const call of bad) expect((await call()).ok).toBe(false);
  });

  it("rejects javascript: website links", async () => {
    await loginAs("ellis");
    const r = await actions.updateSettings(null, form({ displayName: "E", bio: "", location: "", website: "javascript:alert(1)", profileVisibility: "public", avatarHue: "1", currentPassword: "", newPassword: "" }));
    expect(r.ok).toBe(false);
    expect(user("ellis").website).toBeUndefined();
  });

  it("rejects reserved and malformed usernames at signup", async () => {
    expect((await actions.signup(null, form({ username: "admin", password: "long-enough-pw" }))).ok).toBe(false);
    expect((await actions.signup(null, form({ username: "<img src=x>", password: "long-enough-pw" }))).ok).toBe(false);
    expect((await actions.signup(null, form({ username: "validname", password: "x".repeat(300) }))).ok).toBe(false);
  });
});

describe("rate limiting on mutations", () => {
  it("throttles comment spam", async () => {
    await loginAs("kai");
    const target = entryOf("alex").id;
    const results = [];
    for (let i = 0; i < 30; i++) results.push(await actions.addComment("entry", target, `comment ${i}`));
    expect(results.some((r) => !r.ok && r.error.includes("a lot"))).toBe(true);
  });
});

describe("output safety", () => {
  it("JSON-LD cannot break out of its script tag", () => {
    const out = jsonForScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
  });

  it("only allows same-origin redirect paths", () => {
    for (const evil of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/%5Cevil.com\\", " /x", "\\\\evil"]) {
      expect(safeRedirectPath(evil)).toBe("/");
    }
    expect(safeRedirectPath("/song/nights?x=1")).toBe("/song/nights?x=1");
  });

  it("only accepts provider URLs on allowed hosts", () => {
    expect(safeExternalUrl("https://is1-ssl.mzstatic.com/a.jpg", ["mzstatic.com"])).toBeTruthy();
    expect(safeExternalUrl("https://mzstatic.com.evil.io/a.jpg", ["mzstatic.com"])).toBeUndefined();
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("http://169.254.169.254/", ["apple.com"])).toBeUndefined();
  });

  it("production CSP forbids inline/eval scripts and framing", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("search results expose only public user fields", () => {
    const r = search("alex");
    expect(JSON.stringify(r)).not.toMatch(/passwordHash|scrypt\$|tokenHash/);
  });
});

describe("external catalogue routes", () => {
  it("/open requires sign-in and validates ids", async () => {
    const res = await openRoute(new Request("http://localhost/open/song/itunes:123"), { params: Promise.resolve({ kind: "song", id: "itunes:123" }) });
    expect(res.headers.get("location")).toContain("/login?next=");
    await loginAs("alex");
    const evil = await openRoute(new Request("http://localhost/open/song/x"), { params: Promise.resolve({ kind: "song", id: "http://169.254.169.254" }) });
    expect(new URL(evil.headers.get("location")!).pathname).toBe("/search");
  });

  it("anonymous catalogue search is rate limited with 429", async () => {
    let status = 200;
    for (let i = 0; i < 15 && status !== 429; i++) {
      // q under 2 chars: limiter applies, but no outbound request is made.
      const res = await catalogueRoute(new Request(`http://localhost/api/search/catalogue?q=a`, { headers: { "x-real-ip": "192.0.2.50" } }));
      status = res.status;
    }
    expect(status).toBe(429);
  });
});

describe("account deletion", () => {
  it("removes the user's personal data", async () => {
    await loginAs("ellis");
    const id = user("ellis").id;
    await expect(actions.deleteAccount(null, form({ confirm: "ellis", password: "musicbox-demo" }))).rejects.toMatchObject({ redirectTo: "/" });
    const db = getDB();
    expect(db.users.some((u) => u.id === id)).toBe(false);
    expect(db.entries.some((e) => e.userId === id)).toBe(false);
    expect(db.ratings.some((r) => r.userId === id)).toBe(false);
    expect(db.sessions.some((s) => s.userId === id)).toBe(false);
    expect(db.follows.some((f) => f.followerId === id || f.followingId === id)).toBe(false);
  });
});
