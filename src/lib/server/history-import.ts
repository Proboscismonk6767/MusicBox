import "server-only";
import { z } from "zod";
import { data, commands } from "./data";
import type { ImportedEntry } from "./commands-types";
import { importTrack, metadataProvider, MetadataError, type ExternalTrack } from "./metadata";
import { enqueue, finishIfDone, forgetUser, jobs, nextPending, save, type QueueItem } from "./import-queue";
import { MAX_IMPORT_TRACKS, normalizeArtist, normalizeTitle, type ImportTrack } from "../spotify-import";
import { todayISO } from "../util";
import { track } from "./metrics";
import { reportError } from "./monitoring";

// Listening-history import. The browser has already reduced the user's Spotify
// export to a short list of most-played tracks (src/lib/spotify-import.ts); this
// validates that list, adds the songs MusicBox already has straight away, and
// resolves the rest against the catalogue in the background.
//
// Imported listens become ONE diary entry per song (not one per play), dated to
// the last listen, with the play count in the memory field. They publish nothing
// to the activity feed, so followers aren't flooded with hundreds of events.

export const IMPORT_TAG = "spotify-import";
const MAX_TRIES = 4;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date");
const text = (max: number) => z.string().min(1).max(max);

export const historyPayload = z
  .object({
    v: z.literal(1),
    tracks: z
      .array(
        z
          .object({
            t: text(200), a: text(200), al: text(200).optional(),
            p: z.number().int().min(1).max(1_000_000), ms: z.number().int().min(0).max(1e11),
            f: day, l: day,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_IMPORT_TRACKS),
  })
  .strict();

// ── Matching against what MusicBox already has ──────────────────────────

/** The song MusicBox already has for this track (same title and artist), if any. */
export async function findLocalSong(t: Pick<ImportTrack, "t" | "a">): Promise<string | undefined> {
  return (await data.findLocalSongs([t]))[0] ?? undefined;
}

/** Pick the catalogue result that really is this track (same title and artist), not just a near match. */
export function pickResult(results: ExternalTrack[], t: Pick<ImportTrack, "t" | "a">): ExternalTrack | undefined {
  const title = normalizeTitle(t.t);
  const artist = normalizeArtist(t.a);
  return results.find((r) => normalizeTitle(r.title) === title && [r.artist.name, ...(r.featured ?? [])].map(normalizeArtist).includes(artist));
}

// ── Writing diary entries ───────────────────────────────────────────────

function memoryFor(t: ImportTrack): string {
  const plays = t.p === 1 ? "Played once on Spotify" : `Played ${t.p.toLocaleString("en-US")} times on Spotify`;
  const first = new Date(`${t.f}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${plays}, first in ${first}.`;
}

const entryFor = (songId: string, t: ImportTrack): ImportedEntry => ({
  songId, listenedAt: t.l > todayISO() ? todayISO() : t.l, tags: [IMPORT_TAG], memory: memoryFor(t),
});

export interface ImportResult { added: number; queued: number; alreadyLogged: number }

/** Entry point for the API route (payload already validated). */
export async function importHistory(userId: string, tracks: ImportTrack[]): Promise<ImportResult> {
  const songIds = await data.findLocalSongs(tracks);
  const unmatched: ImportTrack[] = [];
  const matched: { track: ImportTrack; songId: string }[] = [];
  tracks.forEach((t, n) => { const id = songIds[n]; if (id) matched.push({ track: t, songId: id }); else unmatched.push(t); });
  const written = await commands.addImportedEntries(userId, matched.map((m) => entryFor(m.songId, m.track)));
  const added = written.filter(Boolean).length;
  const alreadyLogged = written.length - added;
  track("import_started");
  if (unmatched.length || added) enqueue(userId, unmatched, added);
  if (unmatched.length) kickImportWorker(); else track("import_completed");
  return { added, queued: unmatched.length, alreadyLogged };
}

// ── Background resolution ───────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const g = globalThis as unknown as { __importWorker?: Promise<void> };

/** Resolve one track and add it to the diary. Returns true when a new entry was written. */
async function resolve(userId: string, item: QueueItem): Promise<boolean> {
  let songId = await findLocalSong(item);
  if (!songId) {
    const hit = pickResult(await metadataProvider.searchTracks(`${normalizeTitle(item.t)} ${normalizeArtist(item.a)}`, 10), item);
    if (!hit) { item.state = "missed"; return false; }
    const slug = await importTrack(hit.externalId);
    songId = await data.songIdBySlug(slug);
    if (!songId) { item.state = "failed"; return false; }
  }
  const [written] = await commands.addImportedEntries(userId, [entryFor(songId, item)]);
  item.state = "done";
  return written;
}

/** Process one queued track. Returns false when nothing is waiting. */
export async function runImportQueueOnce(): Promise<boolean> {
  const next = nextPending();
  if (!next) return false;
  const { job, item } = next;
  if (!(await data.userActive(job.userId))) {
    forgetUser(job.userId); // account deleted or suspended: drop their listening data
    return true;
  }
  try {
    if (await resolve(job.userId, item)) job.added++;
  } catch (e) {
    item.tries++;
    if (e instanceof MetadataError && item.tries < MAX_TRIES) await sleep(Math.min(item.tries * 15_000, 60_000)); // catalogue busy: back off, retry
    else item.state = "failed";
  }
  const wasOpen = !job.finishedAt;
  finishIfDone(job);
  if (wasOpen && job.finishedAt) track("import_completed");
  save();
  return true;
}

/** Start the single background worker if it isn't already running. */
export function kickImportWorker() {
  if (g.__importWorker) return;
  g.__importWorker = (async () => {
    try {
      while (await runImportQueueOnce());
    } catch (e) {
      reportError(e, { kind: "worker", route: "worker:import" });
    } finally {
      g.__importWorker = undefined;
    }
  })();
}

/** Called at server start: carry on with any import that was interrupted by a restart. */
export function resumeImports() {
  if (jobs().some((j) => !j.finishedAt && j.items.some((i) => i.state === "pending"))) kickImportWorker();
}

/** Resolves when the background worker has nothing left to do (used by tests). */
export function importWorkerIdle(): Promise<void> {
  return g.__importWorker ?? Promise.resolve();
}
