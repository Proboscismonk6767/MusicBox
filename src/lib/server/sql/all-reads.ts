import "server-only";
import type { Q } from "./driver";
import { catalogueReads } from "./reads";
import { peopleReads } from "./reads-people";
import { insightReads } from "./reads-insights";

/** Every read, answered by SQL. */
export function createSqlReads(q: Q) {
  return { ...catalogueReads(q), ...peopleReads(q), ...insightReads(q) };
}
export type SqlReads = ReturnType<typeof createSqlReads>;
