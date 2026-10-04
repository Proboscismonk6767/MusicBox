// Text normalisation shared by search and by whatever writes the rows search reads
// (the JSON store at query time; Postgres at write time, into `search_text`).
// Keeping one definition means both engines match exactly the same strings.

/** Lower-case, accents and punctuation removed, single spaces: "Beyoncé – Halo!" → "beyonce halo". */
export function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The searchable text for a row: its main name followed by its secondary text. */
export const searchText = (primary: string, secondary = "") => `${norm(primary)} ${norm(secondary)}`.trim();
