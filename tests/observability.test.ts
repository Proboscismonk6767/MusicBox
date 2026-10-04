import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jar } from "./setup";
import { getDB, mutate } from "@/lib/server/store";
import { startSession } from "@/lib/server/auth";
import { resetRateLimits } from "@/lib/server/ratelimit";
import { metricsSnapshot, resetMetricsForTests, track } from "@/lib/server/metrics";
import { reportError, resetMonitoringForTests } from "@/lib/server/monitoring";
import * as actions from "@/app/actions";
import { GET as health } from "@/app/api/health/route";
import { POST as events } from "@/app/api/events/route";
import { GET as adminMetrics } from "@/app/api/admin/metrics/route";

const user = (username: string) => getDB().users.find((u) => u.username === username)!;
const today = () => new Date().toISOString().slice(0, 10);
const count = (event: string) => (metricsSnapshot(1).find((d) => d.date === today()) as Record<string, number> | undefined)?.[event] ?? 0;

beforeEach(() => {
  resetMetricsForTests();
  resetMonitoringForTests();
  resetRateLimits();
  jar.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ERROR_WEBHOOK_URL;
});

describe("metrics", () => {
  it("counts events per day without any user identifier", () => {
    track("signup");
    track("signup");
    track("share_clicked", 3);
    const snap = metricsSnapshot(7);
    expect(snap).toHaveLength(1);
    expect(snap[0]).toEqual({ date: today(), signup: 2, share_clicked: 3 });
  });

  it("records a first_log only for a user's very first diary entry", async () => {
    const id = "us-first-log";
    mutate((db) => void db.users.push({ id, username: "firstlog", displayName: "First Log", bio: "", avatarHue: 10, passwordHash: "x", createdAt: new Date().toISOString(), favoriteSongIds: [], favoriteArtistIds: [], profileVisibility: "public", role: "user", onboarded: true }));
    await startSession(id);
    const [a, b] = getDB().songs;
    await actions.logSong({ songId: a.id, rating: 4 });
    expect(count("log")).toBe(1);
    expect(count("first_log")).toBe(1);
    await actions.logSong({ songId: b.id, rating: 3 });
    expect(count("log")).toBe(2);
    expect(count("first_log")).toBe(1);
  });
});

describe("browser events endpoint", () => {
  const post = (body: unknown, origin = "http://localhost") =>
    events(new Request("http://localhost/api/events", { method: "POST", headers: { host: "localhost", origin, "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("accepts only the share event, from the same origin", async () => {
    expect((await post({ event: "share_clicked" })).status).toBe(204);
    expect(count("share_clicked")).toBe(1);
    expect((await post({ event: "signup" })).status).toBe(400); // server-side events can't be forged from the browser
    expect((await post({ event: "share_clicked" }, "https://evil.example")).status).toBe(403);
    expect(count("share_clicked")).toBe(1);
  });
});

describe("admin metrics", () => {
  it("is invisible to everyone but admins", async () => {
    track("signup");
    expect((await adminMetrics(new Request("http://localhost/api/admin/metrics"))).status).toBe(404);
    await startSession(user("alex").id);
    expect((await adminMetrics(new Request("http://localhost/api/admin/metrics"))).status).toBe(404);
    await startSession(user("abtin").id);
    const res = await adminMetrics(new Request("http://localhost/api/admin/metrics?days=7"));
    expect(res.status).toBe(200);
    expect((await res.json()).days[0].signup).toBe(1);
  });
});

describe("error reporting", () => {
  it("posts a trimmed, de-duplicated report to the webhook and never includes request data", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://hooks.example.test/x";
    // env() is cached, so exercise the code path through the same getter the module uses.
    const { env } = await import("@/lib/server/env");
    const spy = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", spy);
    // Force a fresh env read for this process variable.
    (env() as { ERROR_WEBHOOK_URL?: string }).ERROR_WEBHOOK_URL = process.env.ERROR_WEBHOOK_URL;

    const err = new Error("boom " + "x".repeat(500));
    reportError(err, { route: "/song/abc?token=secret&email=a@b.c", kind: "render" });
    reportError(err, { route: "/song/abc?token=secret" }); // same error + route: de-duplicated
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://hooks.example.test/x");
    const body = JSON.parse(init.body);
    expect(body.route).toBe("/song/abc"); // query string (tokens, emails) dropped
    expect(body.message.length).toBeLessThanOrEqual(300);
    expect(init.body).not.toMatch(/secret|a@b\.c/);

    (env() as { ERROR_WEBHOOK_URL?: string }).ERROR_WEBHOOK_URL = undefined;
  });

  it("never throws, even when the webhook is down", () => {
    expect(() => reportError(new Error("x"))).not.toThrow();
    expect(() => reportError("a string")).not.toThrow();
    expect(() => reportError(undefined)).not.toThrow();
  });
});

describe("health", () => {
  it("answers 200 when the store loads", async () => {
    const res = health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
