import { afterEach, describe, expect, it, vi } from "vitest";
import { getLyrics, parseLrc, parsePlain } from "@/lib/server/lyrics";
import { clearCatalogueCache } from "@/lib/server/catalogue-cache";

describe("parseLrc", () => {
  it("reads timestamps, repeats multi-tag lines, drops empty lines and sorts", () => {
    const lrc = "[ar:Someone]\n[00:12.50] first line\n[00:05.00]\n[00:20.1][01:02.345] chorus line\n[00:15.00] second\u0007 line";
    expect(parseLrc(lrc)).toEqual([
      { ms: 12_500, text: "first line" },
      { ms: 15_000, text: "second line" },
      { ms: 20_100, text: "chorus line" },
      { ms: 62_345, text: "chorus line" },
    ]);
  });

  it("splits plain lyrics into untimed lines", () => {
    expect(parsePlain("one\n\n two \n")).toEqual([{ ms: null, text: "one" }, { ms: null, text: "two" }]);
  });
});

describe("getLyrics", () => {
  afterEach(() => { vi.unstubAllGlobals(); clearCatalogueCache(); });

  it("falls back to search and prefers synced lyrics with a close duration", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/get?")) return new Response("", { status: 404 });
      return new Response(JSON.stringify([
        { duration: 400, syncedLyrics: "[00:01.00] wrong version" },
        { duration: 181, plainLyrics: "plain only" },
        { duration: 179, syncedLyrics: "[00:02.00] right version" },
      ]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await getLyrics({ id: "s1", title: "T", artist: "A", album: "Al", durationMs: 180_000 });
    expect(r).toEqual({ status: "ok", synced: true, lines: [{ ms: 2000, text: "right version" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports instrumentals", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ instrumental: true }))));
    expect(await getLyrics({ id: "s2", title: "T", artist: "A", album: "Al", durationMs: 1000 })).toEqual({ status: "instrumental" });
  });
});
