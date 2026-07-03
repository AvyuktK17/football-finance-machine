/**
 * clearingHouse.ts
 *
 * "Simulate Clearing the Books" solver.
 *
 * Given a club, a desired incoming signing, and a regulatory track, work out
 * the minimal-sacrifice set of players a club must SELL to bring its projected
 * Squad Cost Ratio back under the limit — the signature EPL Trade Machine hook.
 *
 * Pure, framework-agnostic TypeScript (no React/Next imports) so it ports
 * straight into a future React Native / Expo app. Reuses financialEngine.ts.
 *
 * With a handful of sellable players per club, an exact brute-force over all
 * 2^n subsets is both fast and optimal, so we do that rather than an
 * approximate greedy knapsack.
 */

import {
  applyTransfers,
  computeScr,
  type ClubState,
  type IncomingTransfer,
  type OutgoingTransfer,
  type RegulatoryTrack,
  type Zone,
} from "./financialEngine";

export interface SellablePlayer {
  name: string;
  /** absolute £ — weekly wage removed on sale */
  weeklyWage: number;
  /** £m — remaining book value */
  remainingBookValue: number;
  /** £m — estimated sale fee the club would receive */
  marketValue: number;
  isAcademy: boolean;
}

export interface ClearingSolution {
  /** Players to sell */
  players: SellablePlayer[];
  /** How many players are sold */
  count: number;
  /** £m — total sale proceeds raised */
  proceeds: number;
  /** £m — total accounting profit booked (proceeds minus book values) */
  tradingProfit: number;
  /** Resulting SCR after the incoming signing AND these sales */
  resultingScr: number;
  /** Resulting regulatory zone */
  resultingZone: Zone;
  /** True if this subset gets the club at/under the limit */
  compliant: boolean;
}

export interface ClearingResult {
  /** The limit being targeted (0.70 UEFA / 0.85 PL) */
  limit: number;
  track: RegulatoryTrack;
  /** SCR after the signing but BEFORE any sales */
  baselineScr: number;
  /** True if any subset (including selling everyone) reaches the limit */
  achievable: boolean;
  /** Best compliant solution (fewest players, then least value sacrificed) */
  best: ClearingSolution | null;
  /** A few alternative compliant solutions, ranked */
  alternatives: ClearingSolution[];
  /** If not achievable: the subset that gets closest (lowest SCR) */
  bestEffort: ClearingSolution | null;
}

function playerToOutgoing(p: SellablePlayer): OutgoingTransfer {
  return {
    saleFee: p.marketValue,
    shedWeeklyWage: p.weeklyWage,
    remainingBookValue: p.remainingBookValue,
    isAcademy: p.isAcademy,
  };
}

/** Apply the incoming signing then a set of sales, returning the SCR result. */
function evaluate(
  club: ClubState,
  incoming: IncomingTransfer | undefined,
  sales: SellablePlayer[],
  track?: RegulatoryTrack,
) {
  let state: ClubState = incoming ? applyTransfers(club, { incoming }) : club;
  for (const p of sales) {
    state = applyTransfers(state, { outgoing: playerToOutgoing(p) });
  }
  return computeScr(state, track);
}

function buildSolution(
  sales: SellablePlayer[],
  scrResult: ReturnType<typeof computeScr>,
  limit: number,
): ClearingSolution {
  const proceeds = sales.reduce((s, p) => s + p.marketValue, 0);
  const tradingProfit = sales.reduce(
    (s, p) => s + p.marketValue - (p.isAcademy ? 0 : p.remainingBookValue),
    0,
  );
  return {
    players: sales,
    count: sales.length,
    proceeds,
    tradingProfit,
    resultingScr: scrResult.scr,
    resultingZone: scrResult.zone,
    compliant: scrResult.scr <= limit,
  };
}

/**
 * Solve the clearing-house problem by exact enumeration of all player subsets.
 */
export function solveClearingHouse(
  club: ClubState,
  players: SellablePlayer[],
  incoming: IncomingTransfer | undefined,
  track?: RegulatoryTrack,
): ClearingResult {
  const baseline = evaluate(club, incoming, [], track);
  const limit = baseline.limit;
  const resolvedTrack = baseline.track;

  const n = players.length;
  const compliant: ClearingSolution[] = [];
  let bestEffort: ClearingSolution | null = null;

  // Enumerate every subset (including the empty set = "no sales needed").
  for (let mask = 0; mask < 1 << n; mask++) {
    const sales: SellablePlayer[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) sales.push(players[i]);
    }
    const res = evaluate(club, incoming, sales, resolvedTrack);
    const sol = buildSolution(sales, res, limit);

    if (sol.compliant) {
      compliant.push(sol);
    }
    // Track the lowest-SCR subset as a fallback (prefer fewer players on ties).
    if (
      bestEffort === null ||
      sol.resultingScr < bestEffort.resultingScr - 1e-9 ||
      (Math.abs(sol.resultingScr - bestEffort.resultingScr) < 1e-9 &&
        sol.count < bestEffort.count)
    ) {
      bestEffort = sol;
    }
  }

  // Rank compliant solutions: fewest players, then least value sacrificed.
  compliant.sort(
    (a, b) => a.count - b.count || a.proceeds - b.proceeds,
  );

  return {
    limit,
    track: resolvedTrack,
    baselineScr: baseline.scr,
    achievable: compliant.length > 0,
    best: compliant[0] ?? null,
    alternatives: compliant.slice(1, 4),
    bestEffort: compliant.length > 0 ? null : bestEffort,
  };
}
