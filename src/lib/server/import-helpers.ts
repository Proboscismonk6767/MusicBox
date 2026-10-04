// Small pure helpers shared by every backend when it turns a catalogue (MusicBrainz / iTunes)
// result into MusicBox rows.

/** "mb:1234" or "itunes:1234" → "1234". */
export const rawId = (externalId: string) => externalId.split(":")[1];

/** Providers use 1970-01-01 as "unknown" (see catalogue-core `date`). */
export const dateOrNull = (d: string) => (d.startsWith("1970-") ? null : d);

export const artistHue = (name: string) => [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

/** The three colours and pattern used for an album's generated cover until real artwork loads. */
export function generatedCover(artistName: string): { palette: [string, string, string]; pattern: number } {
  const hue = artistHue(artistName);
  return { palette: [`hsl(${hue} 40% 40%)`, `hsl(${(hue + 40) % 360} 50% 60%)`, `hsl(${hue} 30% 12%)`], pattern: hue % 22 };
}
