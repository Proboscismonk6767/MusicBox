import { getDB } from "@/lib/server/store";
import type { DB } from "@/lib/types";

/** `TEST_BACKEND=postgres npm test` runs the suite against the embedded Postgres instead of the JSON store. */
export const onPostgres = () => process.env.TEST_BACKEND === "postgres";

/** The whole database as it is right now, whichever engine holds it. Use for assertions after an action.
 *  (Looking up seeded ids, like a username's id, can use getDB(): the seed is the same in both engines.) */
export async function state(): Promise<DB> {
  if (!onPostgres()) return getDB();
  const [{ getDb }, { loadDb }] = await Promise.all([import("@/lib/server/sql"), import("@/lib/server/sql/load-db")]);
  return loadDb(await getDb());
}

/** Changes who can see a list, whichever engine holds the data. */
export async function setListVisibility(id: string, visibility: "public" | "unlisted" | "private"): Promise<void> {
  if (!onPostgres()) { const l = getDB().lists.find((x) => x.id === id)!; l.visibility = visibility; return; }
  const { getDb } = await import("@/lib/server/sql");
  await (await getDb()).query("update lists set visibility = $2 where id = $1", [id, visibility]);
}

/** Changes who can see a profile, whichever engine holds the data. */
export async function setProfileVisibility(id: string, visibility: "public" | "followers" | "private"): Promise<void> {
  if (!onPostgres()) { const u = getDB().users.find((x) => x.id === id)!; u.profileVisibility = visibility; return; }
  const { getDb } = await import("@/lib/server/sql");
  await (await getDb()).query("update users set profile_visibility = $2 where id = $1", [id, visibility]);
}
