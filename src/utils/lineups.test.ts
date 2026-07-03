/**
 * lineups.test.ts — run with: npx tsx src/utils/lineups.test.ts
 */
import {
  FORMATIONS,
  FORMATION_IDS,
  emptyLineup,
  slotFit,
  placeInSlot,
  reshapeLineup,
  sanitizeLineup,
  lineupCount,
  addBackup,
  removeMember,
  assignedKeys,
} from "./lineups";

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) passed++; else { failed++; console.error("  ✗ FAIL:", msg); }
}

console.log("— formation data");
for (const id of FORMATION_IDS) {
  const f = FORMATIONS[id];
  assert(f.slots.length === 11, `${id} has 11 slots`);
  assert(f.slots.filter((s) => s.role === "GK").length === 1, `${id} has exactly one GK`);
  assert(f.slots.every((s) => s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100), `${id} coords in range`);
  const ids = new Set(f.slots.map((s) => s.id));
  assert(ids.size === 11, `${id} slot ids unique`);
}

console.log("— slot fit");
const gkSlot = FORMATIONS["433"].slots[0];
const stSlot = FORMATIONS["433"].slots.find((s) => s.id === "ST")!;
const lwbSlot = FORMATIONS["352"].slots.find((s) => s.id === "LWB")!;
assert(slotFit(gkSlot, "GK") === "ok", "GK in goal");
assert(slotFit(gkSlot, "FW") === "hard", "striker cannot keep goal");
assert(slotFit(stSlot, "GK") === "hard", "keeper cannot lead the line");
assert(slotFit(stSlot, "FW") === "ok", "striker up top");
assert(slotFit(stSlot, "DF") === "soft", "defender up top is out of position");
assert(slotFit(lwbSlot, "MF") === "ok", "wing-back slot accepts midfielders (altRole)");

console.log("— placement & swaps");
{
  let l = emptyLineup("433");
  l = placeInSlot(l, 0, "keeper");
  l = placeInSlot(l, 9, "striker");
  assert(lineupCount(l) === 2, "two placed");
  // Move striker to slot 10 — slot 9 vacates.
  l = placeInSlot(l, 10, "striker");
  assert(l.slots[9] === null && l.slots[10] === "striker", "moving vacates the old slot");
  // Swap: place keeper into 10 — striker goes back to keeper's old slot 0.
  l = placeInSlot(l, 10, "keeper");
  assert(l.slots[0] === "striker" && l.slots[10] === "keeper", "occupied drop swaps the two");
  // Remove.
  l = placeInSlot(l, 10, null);
  assert(l.slots[10] === null, "clearing a slot");
}

console.log("— reshape keeps players");
{
  let l = emptyLineup("442");
  const pos: Record<string, "GK" | "DF" | "MF" | "FW"> = { g: "GK", d1: "DF", m1: "MF", f1: "FW", f2: "FW" };
  l = placeInSlot(l, 0, "g");
  l = placeInSlot(l, 1, "d1");
  l = placeInSlot(l, 6, "m1");
  l = placeInSlot(l, 9, "f1");
  l = placeInSlot(l, 10, "f2");
  const next = reshapeLineup(l, "433", (k) => pos[k]);
  assert(lineupCount(next) === 5, "all five survive the reshape");
  assert(next.slots[0] === "g", "GK stays in goal");
  const fwSlots = FORMATIONS["433"].slots.map((s, i) => (s.role === "FW" ? i : -1)).filter((i) => i >= 0);
  assert(fwSlots.some((i) => next.slots[i] === "f1") && fwSlots.some((i) => next.slots[i] === "f2"), "forwards land in the front three");
}

console.log("— sanitize");
{
  const valid = new Set(["a", "b"]);
  assert(sanitizeLineup({ formation: "999", slots: [] }, valid) === null, "unknown formation rejected");
  const s = sanitizeLineup({ formation: "433", slots: ["a", "ghost", "b", "a"] }, valid)!;
  assert(s.slots[0] === "a" && s.slots[1] === null && s.slots[2] === "b", "unknown keys dropped");
  assert(s.slots[3] === null, "duplicate keys dropped");
  assert(s.slots.length === 11, "padded to formation size");
}

console.log("— backups (substitute hierarchy)");
{
  let l = emptyLineup("433");
  assert(l.subs.length === 11 && l.subs.every((a) => a.length === 0), "empty lineup has 11 empty backup lists");
  l = placeInSlot(l, 0, "gk1");
  l = addBackup(l, 0, "gk2");
  l = addBackup(l, 0, "gk3");
  assert(l.subs[0].join(",") === "gk2,gk3", "backups append in order");
  assert(lineupCount(l) === 1, "backups do not count as starters");
  assert(l.slots[0] === "gk1", "starter unaffected by adding backups");

  // Promoting a backup to starter clears him from the backup list.
  l = placeInSlot(l, 0, "gk2");
  assert(l.slots[0] === "gk2" && !l.subs[0].includes("gk2"), "promoted backup becomes starter and leaves the backup list");
  assert(l.subs[0].join(",") === "gk3", "the other backup stays put");

  // A key is never in two places: re-add gk3 as a backup to another slot.
  l = placeInSlot(l, 9, "striker");
  l = addBackup(l, 9, "gk3");
  assert(!l.subs[0].includes("gk3") && l.subs[9].includes("gk3"), "adding a backup elsewhere removes the old registration");

  // addBackup on a current starter demotes him off the pitch.
  l = addBackup(l, 9, "gk2");
  assert(l.slots[0] === null && l.subs[9].includes("gk2"), "a starter added as a backup vacates his slot");

  l = removeMember(l, 9, "gk3");
  assert(!l.subs[9].includes("gk3"), "removeMember drops a backup");
  l = removeMember(l, 9, "striker");
  assert(l.slots[9] === null, "removeMember clears a starter");

  const keys = assignedKeys(l);
  assert(keys.has("gk2") && !keys.has("gk3"), "assignedKeys spans backups, excludes removed players");
}

console.log("— reshape carries backups");
{
  let l = emptyLineup("442");
  const pos: Record<string, "GK" | "DF" | "MF" | "FW"> = { g: "GK", gsub: "GK", f: "FW", fsub: "FW" };
  l = placeInSlot(l, 0, "g");
  l = addBackup(l, 0, "gsub");
  l = placeInSlot(l, 9, "f");
  l = addBackup(l, 9, "fsub");
  const next = reshapeLineup(l, "433", (k) => pos[k]);
  const gkIdx = next.slots.indexOf("g");
  assert(gkIdx === 0 && next.subs[0].includes("gsub"), "GK backup travels with the keeper");
  const fIdx = next.slots.indexOf("f");
  assert(fIdx !== -1 && next.subs[fIdx].includes("fsub"), "striker backup travels with the striker");
}

console.log("— sanitize backups");
{
  const valid = new Set(["a", "b", "c", "d"]);
  const s = sanitizeLineup(
    { formation: "433", slots: ["a", null, "b"], subs: [["c", "ghost", "a"], [], ["b", "d"]] },
    valid,
  )!;
  assert(s.subs[0].join(",") === "c", "unknown + already-used keys dropped from backups (a is a starter)");
  assert(s.subs[2].join(",") === "d", "duplicate starter b dropped from its own backup list, d kept");
  assert(s.subs.length === 11, "backups padded to formation size");
  const legacy = sanitizeLineup({ formation: "433", slots: ["a"] }, valid)!;
  assert(legacy.subs.every((x) => x.length === 0), "legacy payload without subs yields empty backup lists");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
