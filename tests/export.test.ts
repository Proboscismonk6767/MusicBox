import { beforeEach, describe, expect, it } from "vitest";
import { jar } from "./setup";
import { getDB } from "@/lib/server/store";
import { startSession } from "@/lib/server/auth";
import { resetRateLimits } from "@/lib/server/ratelimit";
import { data as store } from "@/lib/server/data";
import { state } from "./helpers/world";
import { GET as exportRoute } from "@/app/api/account/export/route";

const user = (username: string) => getDB().users.find((u) => u.username === username)!;

beforeEach(() => {
  resetRateLimits();
  jar.clear();
});

describe("data export", () => {
  it("contains the user's own diary, ratings and lists", async () => {
    const u = user("maya");
    const data = (await store.exportUserData(u.id))!;
    const db = await state();
    expect(data.profile.username).toBe("maya");
    expect(data.diary.length).toBe(db.entries.filter((e) => e.userId === u.id && !e.removed).length);
    expect(data.ratings.length).toBe(db.ratings.filter((r) => r.userId === u.id).length);
    expect(data.lists.length).toBe(db.lists.filter((l) => l.userId === u.id && !l.removed).length);
    expect(data.diary[0].song).toMatchObject({ title: expect.any(String), artists: expect.any(Array) });
  });

  it("never includes credentials, sessions or other people's content", async () => {
    const u = user("maya");
    const other = user("alex");
    const json = JSON.stringify(await store.exportUserData(u.id));
    expect(json).not.toContain(u.passwordHash);
    expect(json).not.toMatch(/passwordHash|scrypt\$|tokenHash|sessions/);
    const othersReview = (await state()).entries.find((e) => e.userId === other.id && e.review && e.review.length > 20)!;
    expect(json).not.toContain(othersReview.review!);
    expect(json).not.toContain(other.id); // other users appear by username only
  });

  it("is only available to the signed-in user and is rate limited", async () => {
    expect((await exportRoute()).status).toBe(401);
    await startSession(user("maya").id);
    const ok = await exportRoute();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toMatch(/^attachment; filename="musicbox-maya-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(ok.headers.get("cache-control")).toContain("no-store");
    expect(JSON.parse(await ok.text()).profile.username).toBe("maya");
    await exportRoute();
    await exportRoute();
    expect((await exportRoute()).status).toBe(429);
  });
});
