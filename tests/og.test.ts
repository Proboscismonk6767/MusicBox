import { describe, expect, it } from "vitest";
import { getDB } from "@/lib/server/store";
import { artDataUrl, brandCard } from "@/lib/server/og";
import ListImage from "@/app/list/[id]/opengraph-image";
import ProfileImage from "@/app/[username]/opengraph-image";
import ReviewImage from "@/app/review/[id]/opengraph-image";

// Share images are public and cacheable, so they must never show more than an
// anonymous visitor could see on the page itself.

const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());

describe("share images", () => {
  it("render as PNG", async () => {
    const res = brandCard();
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((await bytes(res)).subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("show a plain brand card for private and unlisted lists, and for unknown ids", async () => {
    const db = getDB();
    const brand = await bytes(brandCard());
    const priv = db.lists.find((l) => l.visibility === "private") ?? db.lists[0];
    const original = priv.visibility;
    for (const visibility of ["private", "unlisted"] as const) {
      priv.visibility = visibility;
      const img = await bytes(await ListImage({ params: Promise.resolve({ id: priv.id }) }));
      expect(img.equals(brand), visibility).toBe(true);
    }
    priv.visibility = original;
    const missing = await bytes(await ListImage({ params: Promise.resolve({ id: "does-not-exist" }) }));
    expect(missing.equals(brand)).toBe(true);
  });

  it("never reveal a private profile's bio or counts", async () => {
    const u = getDB().users.find((x) => x.bio)!;
    const before = u.profileVisibility;
    const open = await bytes(await ProfileImage({ params: Promise.resolve({ username: u.username }) }));
    u.profileVisibility = "private";
    const locked = await bytes(await ProfileImage({ params: Promise.resolve({ username: u.username }) }));
    u.profileVisibility = before;
    expect(locked.equals(open)).toBe(false);
    expect(locked.length).toBeLessThan(open.length); // name only: no bio line, no stats row
  });

  it("don't render removed or unknown reviews", async () => {
    const brand = await bytes(brandCard());
    const img = await bytes(await ReviewImage({ params: Promise.resolve({ id: "nope" }) }));
    expect(img.equals(brand)).toBe(true);
  });

  it("only fetch artwork from allow-listed hosts and local files", async () => {
    expect(await artDataUrl("https://evil.example/cover.jpg")).toBeNull();
    expect(await artDataUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(await artDataUrl("/../.env")).toBeNull();
    expect(await artDataUrl("/artists/../../package.json")).toBeNull();
    expect(await artDataUrl(undefined)).toBeNull();
    expect(await artDataUrl("/artists/radiohead.jpg")).toMatch(/^data:image\/jpeg;base64,/);
  });
});
