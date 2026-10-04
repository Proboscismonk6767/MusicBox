import "server-only";
import { z } from "zod";
import type { DB, DiaryEntry, Song } from "../types";
import { getRev, mutate } from "./store";
import { idx } from "./indexes";
import { recomputeSongStats } from "./stats";
import { importTrack, metadataProvider, MetadataError, type ExternalTrack } from "./metadata";
import { enqueue, finishIfDone, forgetUser, jobs, nextPending, save, type QueueItem } from "./import-queue";
import { MAX_IMPORT_TRACKS, normalizeArtist, normalizeTitle, type ImportTrack } from "../spotify-import";
import { newId, todayISO } from "../util";
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

let titleIndex: { rev: number; songs: Map<string, Song[]> } | null = null;

function localSongs(): Map<string, Song[]> {
  const rev = getRev();
  if (titleIndex?.rev === rev) return titleIndex.songs;
  const songs = new Map<string, Song[]>();
  for (const s of idx().db.songs) {
    const k = normalizeTitle(s.title);
    const list = songs.get(k);
    if (list) list.push(s); else songs.set(k, [s]);
  }
  titleIndex = { rev, songs };
  return songs;
}

function artistNames(s: Song): string[] {
  const i = idx();
  return [...s.artistIds.map((id) => i.artist.get(id)?.name ?? ""), ...s.featured].filter(Boolean).map(normalizeArtist);
}

export function findLocalSong(t: Pick<ImportTrack, "t" | "a">): Song | undefined {
  const artist = normalizeArtist(t.a);
  return localSongs().get(normalizeTitle(t.t))?.find((s) => artistNames(s).includes(artist));
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

/** Adds the diary entry unless the user already has one for this song. Call inside mutate(). */
function addEntry(db: DB, userId: string, songId: string, t: ImportTrack): boolean {
  if (db.entries.some((e) => e.userId === userId && e.songId === songId && !e.removed)) return false;
  const at = new Date().toISOString();
  const entry: DiaryEntry = {
    id: newId("en"), userId, songId, liked: false, listenedAt: t.l > todayISO() ? todayISO() : t.l, isRelisten: false,
    tags: [IMPORT_TAG], memory: memoryFor(t), createdAt: at, updatedAt: at,
  };
  db.entries.push(entry);
  recomputeSongStats(db, songId);
  return true;
}

export interface ImportResult { added: number; queued: number; alreadyLogged: number }

/** Entry point for the API route (payload already validated). */
export function importHistory(userId: string, tracks: ImportTrack[]): ImportResult {
  const unmatched: ImportTrack[] = [];
  let added = 0;
  let alreadyLogged = 0;
  mutate((db) => {
    for (const t of tracks) {
      const song = findLocalSong(t);
      if (!song) { unmatched.push(t); continue; }
      if (addEntry(db, userId, song.id, t)) added++; else alreadyLogged++;
    }
  });
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
  let song = findLocalSong(item);
  if (!song) {
    const hit = pickResult(await metadataProvider.searchTracks(`${normalizeTitle(item.t)} ${normalizeArtist(item.a)}`, 10), item);
    if (!hit) { item.state = "missed"; return false; }
    const slug = await importTrack(hit.externalId);
    song = idx().db.songs.find((s) => s.slug === slug);
    if (!song) { item.state = "failed"; return false; }
  }
  const songId = song.id;
  const written = mutate((db) => addEntry(db, userId, songId, item));
  item.state = "done";
  return written;
}

/** Process one queued track. Returns false when nothing is waiting. */
export async function runImportQueueOnce(): Promise<boolean> {
  const next = nextPending();
  if (!next) return false;
  const { job, item } = next;
  if (!idx().db.users.some((u) => u.id === job.userId && !u.suspended)) {
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
