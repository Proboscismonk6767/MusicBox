/** One imported listening-history entry (see history-import.ts). */
export interface ImportedEntry {
  songId: string;
  listenedAt: string;
  tags: string[];
  memory: string;
}
