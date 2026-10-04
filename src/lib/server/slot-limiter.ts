import "server-only";

/** Spaces outbound requests at least `intervalMs` apart and refuses to queue
 *  anyone for longer than `maxWaitMs`. Each caller reserves the next free slot,
 *  so a burst of N requests is served one per interval instead of all at once
 *  (which gets a shared IP blocked by public APIs such as MusicBrainz). */
export class SlotLimiter {
  private next = 0;

  constructor(private intervalMs: number, private maxWaitMs: number) {}

  /** Resolves when it is this caller's turn; returns false if the wait would exceed `maxWaitMs`. */
  async acquire(): Promise<boolean> {
    const now = Date.now();
    const start = Math.max(now, this.next);
    if (start - now > this.maxWaitMs) return false;
    this.next = start + this.intervalMs;
    if (start > now) await new Promise((r) => setTimeout(r, start - now));
    return true;
  }

  /** The upstream told us to slow down: push every later slot out. */
  penalize(ms: number) {
    this.next = Math.max(this.next, Date.now() + ms);
  }

  /** Milliseconds a new caller would currently wait. */
  backlogMs() {
    return Math.max(0, this.next - Date.now());
  }
}
