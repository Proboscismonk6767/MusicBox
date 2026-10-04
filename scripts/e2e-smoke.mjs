// End-to-end smoke test: drives a real browser through the app (sign up, onboarding, log a review,
// follow, create a list, settings, export, sign out and in, delete the account) against a running server.
//
//   npm i --no-save playwright-core
//   (build and start the app first, e.g. DATA_BACKEND=postgres ... npm start)
//   BASE=http://localhost:3000 node scripts/e2e-smoke.mjs
//
// It needs the demo community in the database (it follows "maya" and likes a seeded song), so run it
// against a development or test database, not production. CHROMIUM_PATH points at a browser if Playwright's
// own download isn't installed. It creates and then deletes its own throwaway account.

import { chromium } from "playwright-core";

const base = process.env.BASE ?? "http://localhost:3200";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": "198.51.100." + (10 + Math.floor(Math.random() * 200)) } });
const page = await ctx.newPage();
// The sandbox cannot reach external hosts (album art CDN); fail those fast so pages finish loading.
await page.route((u) => new URL(u).hostname !== "localhost", (r) => r.abort());
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const go = async (path) => { await page.goto(base + path, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(800); };
const text = async () => page.locator("body").innerText();
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", name + " :: " + String(e.message).split("\n")[0]]); }
};
const expectText = async (re, what) => { const t = await text(); if (!re.test(t)) throw new Error(`${what}: not found in "${t.slice(0, 160).replace(/\n/g, " | ")}"`); };

const username = "e2e" + Math.random().toString(36).slice(2, 8);
const password = "correct-horse-battery";

await check("landing page renders for a signed-out visitor", async () => { await go("/"); await expectText(/Create account/, "landing"); });
await check("sign up a brand-new account", async () => {
  await go("/signup");
  await page.fill("#username", username);
  await page.fill("#displayName", "E2E Tester");
  await page.fill("#password", password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/onboarding/);
});
await check("onboarding wizard completes", async () => {
  for (const b of ["Skip", "Continue", "Finish"]) { await page.getByRole("button", { name: b }).click(); await page.waitForTimeout(700); }
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
});
await check("home feed loads for the new user", async () => { await go("/"); await expectText(/Hey E2E/, "home"); });
await check("search finds a seeded song", async () => { await go("/search?q=nikes"); await expectText(/Nikes/, "search"); });
await check("song page: like it and save it for later", async () => {
  await go("/song/nikes-frank-ocean");
  const bar = page.locator("div").filter({ has: page.getByRole("button", { name: "Later", exact: true }) }).filter({ has: page.getByRole("button", { name: /review or log/i }) }).last();
  await bar.getByRole("button", { name: "Like", exact: true }).click();
  await page.waitForTimeout(800);
  await bar.getByRole("button", { name: "Later", exact: true }).click();
  await page.waitForTimeout(800);
});
await check("log the song with a review (server action)", async () => {
  await go("/song/nikes-frank-ocean");
  await page.getByRole("button", { name: /review or log/i }).click();
  await page.getByPlaceholder("What do you think about this song?").fill("Written during the end-to-end test.");
  await page.getByRole("button", { name: "Log it" }).click();
  await page.waitForTimeout(1500);
});
await check("the review shows on the diary page (written to and read from Postgres)", async () => {
  await go(`/${username}/diary`);
  await expectText(/Nikes/, "diary");
});
await check("profile page shows the account", async () => { await go(`/${username}`); await expectText(/E2E Tester/, "profile"); });
await check("the song's liked state survived (Like persisted)", async () => {
  await go(`/${username}/likes`);
  await expectText(/Nikes/, "likes page");
});
await check("listen later no longer holds the logged song (logging removes it)", async () => {
  await go("/listen-later");
  const t = await text();
  if (/Nikes/.test(t)) throw new Error("Nikes still in listen later after logging it");
});
await check("follow a seeded user and it persists", async () => {
  await go("/maya");
  await page.getByRole("button", { name: /^follow$/i }).first().click();
  await page.waitForTimeout(1000);
  await go("/maya");
  await expectText(/Following|Unfollow/i, "maya profile after reload");
});
await check("create a list with a song and open it", async () => {
  await go("/list/new");
  await page.getByPlaceholder("List title").fill("E2E list");
  await page.getByPlaceholder("Search for songs to add…").fill("nikes");
  await page.waitForTimeout(1500);
  const hit = page.getByRole("button", { name: /Nikes/ }).first();
  if (await hit.count()) await hit.click();
  await page.getByRole("button", { name: "Create list" }).click();
  await page.waitForURL((u) => /^\/list\/(?!new)/.test(u.pathname), { timeout: 15000 });
  await expectText(/E2E list/, "new list page");
});
await check("the list appears on the user's lists page", async () => { await go(`/${username}/lists`); await expectText(/E2E list/, "lists tab"); });
await check("settings: change display name", async () => {
  await go("/settings");
  await page.locator('input[name="displayName"]').fill("E2E Renamed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(1200);
  await go(`/${username}`);
  await expectText(/E2E Renamed/, "profile after rename");
});
await check("data export includes the diary entry", async () => {
  const r = await page.request.get(base + "/api/account/export");
  if (r.status() !== 200) throw new Error("export status " + r.status());
  const j = await r.json();
  if (j.profile?.username !== username) throw new Error("wrong user in export");
  if (!j.diary?.length) throw new Error("export has no diary");
  if (!j.lists?.length) throw new Error("export has no lists");
});
await check("notifications page loads", async () => { await go("/notifications"); await expectText(/Notifications/, "notifications"); });
await check("another person's private-by-default data is not exposed", async () => {
  const r = await page.request.get(base + "/api/admin/metrics");
  if (r.status() !== 404) throw new Error("admin metrics visible to a normal user: " + r.status());
});
await check("sign out", async () => {
  await go("/settings");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForTimeout(1500);
  await go("/");
  await expectText(/Create account/, "signed-out landing");
});
await check("a wrong password is refused", async () => {
  await go("/login");
  await page.fill("#username", username);
  await page.fill("#password", "wrong-password-here");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForTimeout(1200);
  await expectText(/don.t match|incorrect|invalid/i, "login error");
});
await check("signing back in works and the data is still there", async () => {
  await go("/login");
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  await go(`/${username}/diary`);
  await expectText(/Nikes/, "diary after re-login");
});
await check("delete the account removes it", async () => {
  await go("/settings");
  await page.getByRole("button", { name: /delete my account/i }).click();
  await page.waitForTimeout(500);
  await page.locator('input[name="confirm"]').fill(username);
  await page.locator('input[name="password"]').last().fill(password);
  await page.getByRole("button", { name: /delete/i }).last().click();
  await page.waitForTimeout(2000);
  await go(`/${username}`);
  await expectText(/404|doesn.t exist/i, "profile page after deleting the account");
  const r = await page.request.get(base + "/api/account/export");
  if (r.status() !== 401) throw new Error("still signed in after deleting the account: " + r.status());
});

await browser.close();
for (const [s, n] of results) console.log(s, n);
console.log(`\n${results.filter(([s]) => s === "PASS").length}/${results.length} passed`);
if (errors.length) console.log("\nBrowser page errors:\n" + [...new Set(errors)].slice(0, 6).join("\n"));
process.exit(results.some(([s]) => s === "FAIL") ? 1 : 0);
