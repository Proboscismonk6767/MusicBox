import "server-only";
import fs from "fs";
import path from "path";
import { dataDir } from "./store";
import { env } from "./env";
import type { ImportTrack } from "../spotify-import";

// Pending listening-history imports. Looking a track up in the world catalogue
// takes a second or more (MusicBrainz allows 1 request/second), so imports are
// resolved in the background, most-played first, and the user watches progress.
//
// This file holds personal listening data, so: 0600 permissions, finished jobs
// drop their track list and keep only counts, and a deleted account's job is
// purged (forgetUser). Replace with a Postgres table when the store moves.

export type ItemState = "pending" | "done" | "missed" | "failed";
export interface QueueItem extends ImportTrack { state: ItemState; tries: number }
export interface Job {
  userId: string;
  createdAt: string;
  finishedAt?: string;
  total: number;
  /** Songs added to the diary (already on MusicBox, or found in the catalogue). */
  added: number;
  /** Outcome counts, kept after `items` is dropped. */
  notFound?: number;
  failed?: number;
  items: QueueItem[];
}

export interface ImportStatus {
  active: boolean;
  total: number;
  added: number;
  pending: number;
  notFound: number;
  failed: number;
  createdAt?: string;
}

const g = globalThis as unknown as { __importJobs?: Job[]; __importFlush?: NodeJS.Timeout; __importTurn?: number };
const file = () => path.join(dataDir(), "import-queue.json");
const persistent = () => env().NODE_ENV !== "test";
const KEEP_FINISHED_MS = 14 * 24 * 3600e3;

export function jobs(): Job[] {
  if (g.__importJobs) return g.__importJobs;
  let list: Job[] = [];
  if (persistent()) {
    try {
      const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as { v?: number; jobs?: Job[] };
      if (raw.v === 1 && Array.isArray(raw.jobs)) list = raw.jobs;
    } catch {
      /* no queue yet */
    }
  }
  const cutoff = Date.now() - KEEP_FINISHED_MS;
  return (g.__importJobs = list.filter((j) => !j.finishedAt || Date.parse(j.finishedAt) > cutoff));
}

export function save() {
  if (!persistent() || g.__importFlush) return;
  g.__importFlush = setTimeout(() => {
    g.__importFlush = undefined;
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      const tmp = file() + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, jobs: jobs() }), { mode: 0o600 });
      fs.renameSync(tmp, file());
    } catch {
      /* best effort; the worker keeps going from memory */
    }
  }, 500);
  g.__importFlush.unref?.();
}

/** Start (or extend) the user's job. One job per user; tracks already queued are not repeated. */
export function enqueue(userId: string, items: ImportTrack[], addedNow: number): Job {
  const list = jobs();
  let job = list.find((j) => j.userId === userId && !j.finishedAt);
  if (!job) {
    job = { userId, createdAt: new Date().toISOString(), total: 0, added: 0, items: [] };
    list.push(job);
  }
  const have = new Set(job.items.map((i) => `${i.t}|${i.a}`));
  const fresh = items.filter((i) => !have.has(`${i.t}|${i.a}`)).map<QueueItem>((i) => ({ ...i, state: "pending", tries: 0 }));
  job.items.push(...fresh);
  job.total += fresh.length + addedNow;
  job.added += addedNow;
  if (!fresh.length) finishIfDone(job);
  save();
  return job;
}

export function finishIfDone(job: Job) {
  if (job.finishedAt || job.items.some((i) => i.state === "pending")) return;
  job.finishedAt = new Date().toISOString();
  // Keep the outcome counts for the status page; drop the listening data.
  const count = (s: ItemState) => job.items.filter((i) => i.state === s).length;
  job.notFound = count("missed");
  job.failed = count("failed");
  job.items = [];
}

export function statusFor(userId: string): ImportStatus | null {
  const job = [...jobs()].reverse().find((j) => j.userId === userId);
  if (!job) return null;
  const count = (s: ItemState) => job.items.filter((i) => i.state === s).length;
  return {
    active: !job.finishedAt,
    total: job.total,
    added: job.added,
    pending: count("pending"),
    notFound: job.finishedAt ? job.notFound ?? 0 : count("missed"),
    failed: job.finishedAt ? job.failed ?? 0 : count("failed"),
    createdAt: job.createdAt,
  };
}

/** Stop resolving the user's remaining tracks (what's already added stays). */
export function cancel(userId: string) {
  for (const j of jobs()) if (j.userId === userId && !j.finishedAt) {
    for (const i of j.items) if (i.state === "pending") i.state = "failed";
    finishIfDone(j);
  }
  save();
}

/** Account deletion: nothing about the user's listening history may remain. */
export function forgetUser(userId: string) {
  g.__importJobs = jobs().filter((j) => j.userId !== userId);
  save();
}

/** Round-robin across users so one big import can't starve another. */
export function nextPending(): { job: Job; item: QueueItem } | null {
  const active = jobs().filter((j) => !j.finishedAt && j.items.some((i) => i.state === "pending"));
  if (!active.length) return null;
  const job = active[(g.__importTurn = ((g.__importTurn ?? -1) + 1) % active.length)];
  return { job, item: job.items.find((i) => i.state === "pending")! };
}

export function resetImportQueueForTests() {
  g.__importJobs = [];
}
