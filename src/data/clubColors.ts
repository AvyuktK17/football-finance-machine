/**
 * clubColors.ts — per-club accent colours (kit primaries).
 *
 * Accents are used ONLY on non-semantic chrome (header strip, club name,
 * result-card gradient). Compliance zones keep their own green/amber/red
 * palette everywhere — never mix the two.
 */

export interface ClubAccent {
  /** Primary kit colour (hex). */
  primary: string;
  /** A text-safe tint of the primary that reads on the dark UI. */
  text: string;
}

const FALLBACK: ClubAccent = { primary: "#525252", text: "#d4d4d4" };

export const CLUB_COLORS: Record<string, ClubAccent> = {
  tottenham: { primary: "#132257", text: "#93b0f5" },
  chelsea: { primary: "#034694", text: "#7fb2f0" },
  "man-city": { primary: "#6CABDD", text: "#9fd0f5" },
  arsenal: { primary: "#EF0107", text: "#ff8a8d" },
  liverpool: { primary: "#C8102E", text: "#ff7f94" },
  "man-utd": { primary: "#DA291C", text: "#ff9088" },
  newcastle: { primary: "#241F20", text: "#cfcfcf" },
  "aston-villa": { primary: "#670E36", text: "#e39ac0" },
  everton: { primary: "#003399", text: "#8fb1f7" },
  bournemouth: { primary: "#B50E12", text: "#ff9598" },
  brighton: { primary: "#0057B8", text: "#82b6f2" },
  "crystal-palace": { primary: "#1B458F", text: "#96b6f0" },
  brentford: { primary: "#E30613", text: "#ff9298" },
  "nottingham-forest": { primary: "#DD0000", text: "#ff8f8f" },
  fulham: { primary: "#000000", text: "#d4d4d4" },
  leeds: { primary: "#FFCD00", text: "#ffe27a" },
  sunderland: { primary: "#EB172B", text: "#ff96a0" },
};

export function clubAccent(clubId: string): ClubAccent {
  return CLUB_COLORS[clubId] ?? FALLBACK;
}
