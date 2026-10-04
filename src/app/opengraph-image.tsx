import { brandCard } from "@/lib/server/og";

export const alt = "MusicBox: your music taste deserves a history";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return brandCard();
}
