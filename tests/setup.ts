import { vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Real data store in a throwaway directory; only Next's request context is faked.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "musicbox-test-"));
process.env.ADMIN_USERNAMES = "abtin";
// Catalogue tests never touch the network and skip the public API's 1 req/s spacing.
process.env.MUSICBRAINZ_MIN_INTERVAL_MS = "0";
process.env.MUSICBRAINZ_CONTACT = "tests@example.com";

export const jar = new Map<string, string>();
export const requestHeaders = new Headers({ "x-real-ip": "203.0.113.7" });

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => requestHeaders,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: url });
  },
}));
