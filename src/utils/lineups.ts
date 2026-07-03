/**
 * lineups.ts
 *
 * Pure, framework-agnostic lineup/formation model for the EPL Trade Machine.
 * NO React / Next.js imports — all pitch geometry, formation data and slot
 * validation live here so they port unchanged to the future mobile app.
 * Only the drag-and-drop bindings belong in the UI layer.
 *
 * Coordinates: percentages of a VERTICAL pitch — x 0..100 left→right,
 * y 0..100 top (opponent's goal) → bottom (our goal). GK sits near y≈91.
 */

export type PlayerPosition = "GK" | "DF" | "MF" | "FW";

export interface FormationSlot {
  /** stable id within the formation, e.g. "LB", "ST2" */
  id: string;
  /** the broad position this slot expects */
  role: PlayerPosition;
  /** short on-pitch label, e.g. "LWB", "CAM" */
  label: string;
  x: number;
  y: number;
  /** wing-backs etc. also comfortably take players of this position */
  altRole?: PlayerPosition;
}

export type FormationId = "433" | "442" | "4231" | "352" | "343" | "532";

export const FORMATIONS: Record<FormationId, { name: string; slots: FormationSlot[] }> = {
  "433": {
    name: "4-3-3",
    slots: [
      { id: "GK", role: "GK", label: "GK", x: 50, y: 91 },
      { id: "LB", role: "DF", label: "LB", x: 15, y: 72 },
      { id: "LCB", role: "DF", label: "CB", x: 37, y: 77 },
      { id: "RCB", role: "DF", label: "CB", x: 63, y: 77 },
      { id: "RB", role: "DF", label: "RB", x: 85, y: 72 },
      { id: "LCM", role: "MF", label: "CM", x: 28, y: 52 },
      { id: "CDM", role: "MF", label: "CDM", x: 50, y: 60 },
      { id: "RCM", role: "MF", label: "CM", x: 72, y: 52 },
      { id: "LW", role: "FW", label: "LW", x: 18, y: 30 },
      { id: "ST", role: "FW", label: "ST", x: 50, y: 24 },
      { id: "RW", role: "FW", label: "RW", x: 82, y: 30 },
    ],
  },
  "442": {
    name: "4-4-2",
    slots: [
      { id: "GK", role: "GK", label: "GK", x: 50, y: 91 },
      { id: "LB", role: "DF", label: "LB", x: 15, y: 72 },
      { id: "LCB", role: "DF", label: "CB", x: 37, y: 77 },
      { id: "RCB", role: "DF", label: "CB", x: 63, y: 77 },
      { id: "RB", role: "DF", label: "RB", x: 85, y: 72 },
      { id: "LM", role: "MF", label: "LM", x: 15, y: 48 },
      { id: "LCM", role: "MF", label: "CM", x: 38, y: 54 },
      { id: "RCM", role: "MF", label: "CM", x: 62, y: 54 },
      { id: "RM", role: "MF", label: "RM", x: 85, y: 48 },
      { id: "LS", role: "FW", label: "ST", x: 38, y: 26 },
      { id: "RS", role: "FW", label: "ST", x: 62, y: 26 },
    ],
  },
  "4231": {
    name: "4-2-3-1",
    slots: [
      { id: "GK", role: "GK", label: "GK", x: 50, y: 91 },
      { id: "LB", role: "DF", label: "LB", x: 15, y: 72 },
      { id: "LCB", role: "DF", label: "CB", x: 37, y: 77 },
      { id: "RCB", role: "DF", label: "CB", x: 63, y: 77 },
      { id: "RB", role: "DF", label: "RB", x: 85, y: 72 },
      { id: "LDM", role: "MF", label: "CDM", x: 37, y: 60 },
      { id: "RDM", role: "MF", label: "CDM", x: 63, y: 60 },
      { id: "LAM", role: "MF", label: "LW", x: 16, y: 38, altRole: "FW" },
      { id: "CAM", role: "MF", label: "CAM", x: 50, y: 42 },
      { id: "RAM", role: "MF", label: "RW", x: 84, y: 38, altRole: "FW" },
      { id: "ST", role: "FW", label: "ST", x: 50, y: 23 },
    ],
  },
  "352": {
    name: "3-5-2",
    slots: [
      { id: "GK", role: "GK", label: "GK", x: 50, y: 91 },
      { id: "LCB", role: "DF", label: "CB", x: 27, y: 77 },
      { id: "CB", role: "DF", label: "CB", x: 50, y: 80 },
      { id: "RCB", role: "DF", label: "CB", x: 73, y: 77 },
      { id: "LWB", role: "DF", label: "LWB", x: 10, y: 56, altRole: "MF" },
      { id: "LCM", role: "MF", label: "CM", x: 34, y: 55 },
      { id: "CDM", role: "MF", label: "CDM", x: 50, y: 62 },
      { id: "RCM", role: "MF", label: "CM", x: 66, y: 55 },
      { id: "RWB", role: "DF", label: "RWB", x: 90, y: 56, altRole: "MF" },
      { id: "LS", role: "FW", label: "ST", x: 38, y: 26 },
      { id: "RS", role: "FW", label: "ST", x: 62, y: 26 },
    ],
  },
  "343": {
    name: "3-4-3",
    slots: [
      { id: "GK", role: "GK", label: "GK", x: 50, y: 91 },
      { id: "LCB", role: "DF", label: "CB", x: 27, y: 77 },
      { id: "CB", role: "DF", label: "CB", x: 50, y: 80 },
      { id: "RCB", role: "DF", label: "CB", x: 73, y: 77 },
      { id: "LM", role: "MF", label: "LM", x: 13, y: 52, altRole: "DF" },
      { id: "LCM", role: "MF", label: "CM", x: 38, y: 56 },
      { id: "RCM", role: "MF", label: "CM", x: 62, y: 56 },
      { id: "RM", role: "MF", label: "RM", x: 87, y: 52, altRole: "DF" },
      { id: "LW", role: "FW", label: "LW", x: 20, y: 30 },
      { id: "ST", role: "FW", label: "ST", x: 50, y: 24 },
      { id: "RW", role: "FW", label: "RW", x: 80, y: 30 },
    ],
  },
  "532": {
    name: "5-3-2",
    slots: [
      { id: "GK", role: "GK", label: "GK", x: 50, y: 91 },
      { id: "LWB", role: "DF", label: "LWB", x: 9, y: 66, altRole: "MF" },
      { id: "LCB", role: "DF", label: "CB", x: 29, y: 78 },
      { id: "CB", role: "DF", label: "CB", x: 50, y: 81 },
      { id: "RCB", role: "DF", label: "CB", x: 71, y: 78 },
      { id: "RWB", role: "DF", label: "RWB", x: 91, y: 66, altRole: "MF" },
      { id: "LCM", role: "MF", label: "CM", x: 30, y: 52 },
      { id: "CDM", role: "MF", label: "CDM", x: 50, y: 58 },
      { id: "RCM", role: "MF", label: "CM", x: 70, y: 52 },
      { id: "LS", role: "FW", label: "ST", x: 38, y: 26 },
      { id: "RS", role: "FW", label: "ST", x: 62, y: 26 },
    ],
  },
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

/**
 * A lineup: formation + player keys per slot (index-aligned with slots).
 * `subs` is also index-aligned with slots — each entry is an ordered list of
 * backup player keys for that position (top of the list = primary sub). A
 * player key appears at most once across all starters and all backup lists.
 */
export interface Lineup {
  formation: FormationId;
  slots: (string | null)[];
  subs: string[][];
}

export function emptyLineup(formation: FormationId): Lineup {
  const n = FORMATIONS[formation].slots.length;
  return {
    formation,
    slots: Array.from({ length: n }, () => null),
    subs: Array.from({ length: n }, () => []),
  };
}

/** Every player key currently assigned anywhere (starter or backup). */
export function assignedKeys(lineup: Lineup): Set<string> {
  const set = new Set<string>();
  lineup.slots.forEach((k) => k && set.add(k));
  lineup.subs.forEach((arr) => arr.forEach((k) => set.add(k)));
  return set;
}

/**
 * Change formation, keeping as many placed players as possible: starters are
 * re-seated into the first empty slot that fits them (same role, then altRole),
 * and that slot's backups travel with the starter. Remainder drop to the bench.
 */
export function reshapeLineup(
  lineup: Lineup,
  formation: FormationId,
  positionOf: (key: string) => PlayerPosition | undefined,
): Lineup {
  const next = emptyLineup(formation);
  const slots = FORMATIONS[formation].slots;
  const taken = new Set<number>();
  lineup.slots.forEach((key, oldIdx) => {
    if (!key) return;
    const pos = positionOf(key);
    let idx = slots.findIndex((sl, i) => !taken.has(i) && pos && slotFit(sl, pos) === "ok");
    if (idx === -1) idx = slots.findIndex((sl, i) => !taken.has(i) && pos && slotFit(sl, pos) !== "hard");
    if (idx !== -1) {
      next.slots[idx] = key;
      next.subs[idx] = [...(lineup.subs[oldIdx] ?? [])];
      taken.add(idx);
    }
  });
  return next;
}

export type SlotFit = "ok" | "soft" | "hard";

/**
 * How well a player position fits a slot.
 * - GK slots take ONLY goalkeepers, and goalkeepers fit ONLY GK slots (hard).
 * - Matching role (or altRole) → ok.
 * - Any other outfield mismatch → soft (allowed, flagged out-of-position).
 */
export function slotFit(slot: FormationSlot, pos: PlayerPosition): SlotFit {
  if (slot.role === "GK" || pos === "GK") {
    return slot.role === "GK" && pos === "GK" ? "ok" : "hard";
  }
  if (slot.role === pos || slot.altRole === pos) return "ok";
  return "soft";
}

/**
 * Place a starter into a slot (swapping with any occupant). Pure. Also removes
 * the player from any backup list so a key is never both a starter and a sub.
 */
export function placeInSlot(lineup: Lineup, slotIndex: number, key: string | null): Lineup {
  const slots = [...lineup.slots];
  let subs = lineup.subs.map((s) => [...s]);
  // A promoted player can't remain anyone's backup.
  if (key) subs = subs.map((arr) => arr.filter((k) => k !== key));
  // If the player is already on the pitch, vacate his old slot (swap-aware).
  const oldIndex = key ? slots.indexOf(key) : -1;
  const displaced = slots[slotIndex] ?? null;
  if (oldIndex !== -1) slots[oldIndex] = displaced;
  slots[slotIndex] = key;
  return { ...lineup, slots, subs };
}

/**
 * Add a backup to a slot's substitute hierarchy (appended = lowest priority).
 * Pulls the player out of any starter slot or other backup list first.
 */
export function addBackup(lineup: Lineup, slotIndex: number, key: string): Lineup {
  const slots = lineup.slots.map((k) => (k === key ? null : k));
  const subs = lineup.subs.map((arr) => arr.filter((k) => k !== key));
  if (!subs[slotIndex]) subs[slotIndex] = [];
  if (!subs[slotIndex].includes(key)) subs[slotIndex] = [...subs[slotIndex], key];
  return { ...lineup, slots, subs };
}

/** Remove a player from a slot — as its starter or from its backup list. Pure. */
export function removeMember(lineup: Lineup, slotIndex: number, key: string): Lineup {
  const slots = [...lineup.slots];
  const subs = lineup.subs.map((s) => [...s]);
  if (slots[slotIndex] === key) slots[slotIndex] = null;
  else subs[slotIndex] = (subs[slotIndex] ?? []).filter((k) => k !== key);
  return { ...lineup, slots, subs };
}

/** Number of filled starter slots. */
export function lineupCount(lineup: Lineup): number {
  return lineup.slots.filter(Boolean).length;
}

/** Validate a stored lineup against a roster (drops unknown & duplicate keys). */
export function sanitizeLineup(
  raw: { formation: string; slots: (string | null)[]; subs?: (string | null)[][] } | undefined | null,
  validKeys: Set<string>,
): Lineup | null {
  if (!raw || !FORMATION_IDS.includes(raw.formation as FormationId)) return null;
  const formation = raw.formation as FormationId;
  const n = FORMATIONS[formation].slots.length;
  // A key may appear at most once across starters and every backup list.
  const seen = new Set<string>();
  const slots = Array.from({ length: n }, (_, i) => {
    const k = raw.slots?.[i] ?? null;
    if (k && validKeys.has(k) && !seen.has(k)) { seen.add(k); return k; }
    return null;
  });
  const subs = Array.from({ length: n }, (_, i) => {
    const arr = raw.subs?.[i] ?? [];
    const out: string[] = [];
    for (const k of arr) {
      if (k && validKeys.has(k) && !seen.has(k)) { seen.add(k); out.push(k); }
    }
    return out;
  });
  return { formation, slots, subs };
}
