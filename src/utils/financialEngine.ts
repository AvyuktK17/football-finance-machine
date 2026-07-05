/**
 * financialEngine.ts
 *
 * Pure, framework-agnostic Squad Cost Ratio (SCR) engine for the EPL Trade Machine.
 * NO React / Next.js imports — this file is the product's core and must remain
 * reusable unchanged in a future React Native / Expo mobile app.
 *
 * All monetary values here are in £ MILLIONS unless a field name says otherwise
 * (player weekly wages are absolute £ and converted at the boundary).
 *
 * Rules verified for the 2026/27 season (see CLAUDE.md for sources).
 */

// ---------------------------------------------------------------------------
// Constants (verified 2026/27 regulations)
// ---------------------------------------------------------------------------

export const RULES = {
  PL_GREEN_THRESHOLD: 0.85, // Premier League: compliant ceiling
  PL_RED_THRESHOLD: 1.15, // Premier League: sporting-sanction ceiling
  UEFA_THRESHOLD: 0.7, // UEFA squad cost rule (permanent from 2025/26)
  MAX_AMORTISATION_YEARS: 5, // Contract length cap for amortisation
  POINTS_BASE_DEDUCTION: 6, // Fixed points at Red Threshold breach
  POINTS_PER_MILLIONS_OVER: 6.5, // +1 point per £6.5m over Red Threshold
} as const;

/**
 * UEFA prorates the squad-cost-ratio disposal-profit term over 36 months
 * (Article 93.04(b)) — i.e. a rolling 3-season average.
 */
export const SCR_DISPOSAL_WINDOW_YEARS = 3;

export type RegulatoryTrack = "UEFA" | "PL_DOMESTIC" | "LALIGA_DOMESTIC" | "SERIEA_DOMESTIC" | "BUNDESLIGA_DOMESTIC" | "LIGUE1_DOMESTIC";
export type Zone = "GREEN" | "YELLOW" | "RED";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClubState {
  /** £m — total football revenue */
  estimatedRevenue: number;
  /** £m — current total player + head-coach wages */
  annualWages: number;
  /** £m — current annual transfer amortisation */
  annualAmortisation: number;
  /** £m — agent / intermediary fees */
  agentFees: number;
  /** £m — net profit on player sales already booked this cycle (can be negative) */
  netPlayerTradingProfit?: number;
  /**
   * £m — net profit on player disposals for the seasons IMMEDIATELY BEFORE this
   * one, most-recent-first (e.g. [T-1, T-2]). Used ONLY on the UEFA track, where
   * Article 93.04 prorates the disposal term over 36 months (a 3-year average).
   * The numerator, revenue, and (on the PL track) the disposal term all remain
   * single-season. Omit / empty ⇒ single-season disposal profit is used.
   */
  priorNetPlayerTradingProfits?: number[];
  /**
   * The club's CURRENT Premier League red threshold (ratio, e.g. 1.15). Under the
   * 2026/27 PL rules the red threshold is a rolling "multi-year allowance": it
   * starts at 115% and erodes with prior-season overage above the 85% green line
   * (replenishing with underspend), bounded to [green, 115%]. Omit ⇒ static 115%.
   * Ignored on the UEFA track. See rollPlRedThreshold / foldPlRedThreshold.
   */
  plRedThreshold?: number;
  /** Whether the club is in UEFA competition (bound by the 70% rule) */
  isPlayingInEurope: boolean;
  /** The club's domestic league */
  league?: string;
}

export interface IncomingTransfer {
  /** £m — transfer fee paid */
  fee: number;
  /** absolute £ — new player's weekly wage */
  weeklyWage: number;
  /** years — contract length (amortised over min(this, 5)) */
  contractLength: number;
  /** £m — signing bonus / agent fee for this deal (optional) */
  agentFee?: number;
}

export interface OutgoingTransfer {
  /** £m — sale fee received */
  saleFee: number;
  /** absolute £ — weekly wage removed from the books */
  shedWeeklyWage: number;
  /** £m — remaining book value of the player being sold */
  remainingBookValue: number;
  /** If true, book value is treated as £0 and the full fee is pure profit */
  isAcademy?: boolean;
  /** £m — annual amortisation removed by this sale (optional; defaults derived) */
  annualAmortisationRemoved?: number;
}

export interface ScrResult {
  /** The SCR as a ratio (0.85 === 85%) */
  scr: number;
  /** Squad Costs numerator (£m) */
  squadCosts: number;
  /** Denominator: revenue + net trading profit (£m) */
  denominator: number;
  /** Net player trading profit for THIS season alone (£m, raw, can be negative) */
  netPlayerTradingProfit: number;
  /**
   * £m — the disposal-profit term actually used in the denominator. Equals
   * netPlayerTradingProfit on the PL track; on the UEFA track it is the 3-year
   * (36-month prorated) average when prior seasons were supplied.
   */
  disposalProfitUsed: number;
  /** True if the UEFA 3-year disposal averaging was applied (≥1 prior season). */
  disposalAveragingApplied: boolean;
  /** True if the denominator was <= 0 / near-zero and had to be clamped */
  denominatorWarning: boolean;
  /** The track evaluated */
  track: RegulatoryTrack;
  /** The GREEN/compliant limit for that track (0.70 UEFA / 0.85 PL) */
  limit: number;
  /** The PL red threshold applied (dynamic, [0.85, 1.15]); 0 on the UEFA track. */
  redLimit: number;
  /** GREEN / YELLOW / RED */
  zone: Zone;
  /** Points deduction if RED on the PL track (0 otherwise) */
  pointsDeduction: number;
  /** Human-readable status headline */
  headline: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKS_PER_YEAR = 52;

/** Convert an absolute weekly wage (£) to annual wages in £ millions. */
export function weeklyWageToAnnualMillions(weeklyWage: number): number {
  return (weeklyWage * WEEKS_PER_YEAR) / 1_000_000;
}

/** Annual amortisation (£m) for a fee spread over a capped contract length. */
export function annualAmortisation(fee: number, contractLength: number): number {
  const years = Math.max(
    1,
    Math.min(contractLength, RULES.MAX_AMORTISATION_YEARS),
  );
  return fee / years;
}

// A tiny positive floor so a zero/negative denominator never produces Infinity
// or a nonsensical negative ratio.
const DENOMINATOR_FLOOR = 0.001;

// ---------------------------------------------------------------------------
// Core: apply transfers and compute the resulting state
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  incoming?: IncomingTransfer;
  outgoing?: OutgoingTransfer;
}

/**
 * Apply an optional incoming and/or outgoing transfer to a club state and
 * return the new aggregate financials. Pure — does not mutate the input.
 */
export function applyTransfers(
  club: ClubState,
  { incoming, outgoing }: ApplyOptions,
): ClubState {
  let wages = club.annualWages;
  let amortisation = club.annualAmortisation;
  let agentFees = club.agentFees;
  let netProfit = club.netPlayerTradingProfit ?? 0;

  if (incoming) {
    wages += weeklyWageToAnnualMillions(incoming.weeklyWage);
    amortisation += annualAmortisation(incoming.fee, incoming.contractLength);
    if (incoming.agentFee) agentFees += incoming.agentFee;
  }

  if (outgoing) {
    // Remove the departing player's wages.
    wages = Math.max(0, wages - weeklyWageToAnnualMillions(outgoing.shedWeeklyWage));
    // Remove the remaining book value: profit = fee - bookValue (academy => 0).
    const bookValue = outgoing.isAcademy ? 0 : outgoing.remainingBookValue;
    netProfit += outgoing.saleFee - bookValue;
    // Selling also stops the player's future amortisation, if provided.
    if (outgoing.annualAmortisationRemoved) {
      amortisation = Math.max(0, amortisation - outgoing.annualAmortisationRemoved);
    }
  }

  return {
    ...club,
    annualWages: wages,
    annualAmortisation: amortisation,
    agentFees,
    netPlayerTradingProfit: netProfit,
  };
}

// ---------------------------------------------------------------------------
// Core: compute SCR + regulatory zone for a given state
// ---------------------------------------------------------------------------

/**
 * Compute the Squad Cost Ratio and regulatory classification for a club state.
 * `track` defaults to the binding constraint (UEFA 70% if in Europe, else PL 85%).
 */
/**
 * UEFA disposal-profit term (Annex K element v / Art. 93.04): the 36-month
 * aggregate prorated to 12 months — i.e. the average annual net disposal profit
 * over a rolling window (default 3 seasons). Smooths out lumpy player sales so a
 * one-off star sale does not flatter a single year's ratio.
 *
 * `current` is this season's disposal profit; `priors` are the preceding
 * seasons' figures (most-recent-first). Fewer than (windowYears−1) priors ⇒ the
 * average is taken over the seasons actually available (a faithful proration
 * when a club has not existed / reported for the full window).
 */
export function uefaProratedDisposalProfit(
  current: number,
  priors: number[] = [],
  windowYears: number = SCR_DISPOSAL_WINDOW_YEARS,
): number {
  const window = [current, ...priors].slice(0, Math.max(1, windowYears));
  const sum = window.reduce((a, b) => a + b, 0);
  return sum / window.length;
}

/**
 * Roll the PL red threshold forward by ONE season (2026/27 multi-year allowance).
 * Prior-season overage above the green line erodes the red threshold; underspend
 * below green replenishes it. Bounded to [green, ceiling].
 */
export function rollPlRedThreshold(
  priorSeasonScr: number,
  currentRed: number,
  green: number = RULES.PL_GREEN_THRESHOLD,
  ceiling: number = RULES.PL_RED_THRESHOLD,
): number {
  const delta = priorSeasonScr - green; // >0 overage (erodes), <0 underspend (replenishes)
  const next = currentRed - delta;
  return Math.min(ceiling, Math.max(green, next));
}

/**
 * Fold a sequence of prior-season SCRs (oldest-first) into the current red
 * threshold, starting from the ceiling (a promoted/clean club at 115%).
 */
export function foldPlRedThreshold(
  priorSeasonScrsOldestFirst: number[],
  green: number = RULES.PL_GREEN_THRESHOLD,
  ceiling: number = RULES.PL_RED_THRESHOLD,
): number {
  return priorSeasonScrsOldestFirst.reduce(
    (red, scr) => rollPlRedThreshold(scr, red, green, ceiling),
    ceiling,
  );
}

export function computeScr(
  club: ClubState,
  track?: RegulatoryTrack,
): ScrResult {
  const defaultTrack: RegulatoryTrack = club.isPlayingInEurope
    ? "UEFA"
    : club.league === "LALIGA"
    ? "LALIGA_DOMESTIC"
    : club.league === "BUNDESLIGA"
    ? "BUNDESLIGA_DOMESTIC"
    : club.league === "SERIEA"
    ? "SERIEA_DOMESTIC"
    : club.league === "LIGUE1"
    ? "LIGUE1_DOMESTIC"
    : "PL_DOMESTIC";

  const resolvedTrack: RegulatoryTrack = track ?? defaultTrack;

  const netProfit = club.netPlayerTradingProfit ?? 0;
  const squadCosts = club.annualWages + club.annualAmortisation + club.agentFees;

  // UEFA prorates the disposal term over 36 months (3-year average); the PL
  // ratio is single-season. Numerator and revenue are single-season on both.
  const priors = club.priorNetPlayerTradingProfits ?? [];
  const disposalAveragingApplied = resolvedTrack === "UEFA" && priors.length > 0;
  const disposalProfitUsed = disposalAveragingApplied
    ? uefaProratedDisposalProfit(netProfit, priors)
    : netProfit;

  const rawDenominator = club.estimatedRevenue + disposalProfitUsed;

  const denominatorWarning = rawDenominator <= DENOMINATOR_FLOOR;
  const denominator = Math.max(rawDenominator, DENOMINATOR_FLOOR);

  const scr = squadCosts / denominator;

  const limit =
    resolvedTrack === "UEFA"
      ? RULES.UEFA_THRESHOLD
      : resolvedTrack === "PL_DOMESTIC"
      ? RULES.PL_GREEN_THRESHOLD
      : 0.70; // 70% limit for La Liga, Serie A, Bundesliga, Ligue 1

  // Dynamic PL red threshold (multi-year allowance); irrelevant on UEFA track.
  const redLimit =
    resolvedTrack === "UEFA"
      ? 0
      : resolvedTrack === "PL_DOMESTIC"
      ? (club.plRedThreshold ?? RULES.PL_RED_THRESHOLD)
      : resolvedTrack === "LALIGA_DOMESTIC"
      ? 0.70
      : resolvedTrack === "BUNDESLIGA_DOMESTIC"
      ? 0.80
      : resolvedTrack === "SERIEA_DOMESTIC"
      ? 0.80
      : resolvedTrack === "LIGUE1_DOMESTIC"
      ? 0.80
      : RULES.PL_RED_THRESHOLD;

  const { zone, pointsDeduction } = classify(
    scr,
    resolvedTrack,
    squadCosts,
    denominator,
    redLimit,
  );

  return {
    scr,
    squadCosts,
    denominator,
    netPlayerTradingProfit: netProfit,
    disposalProfitUsed,
    disposalAveragingApplied,
    denominatorWarning,
    track: resolvedTrack,
    limit,
    redLimit,
    zone,
    pointsDeduction,
    headline: buildHeadline(zone, resolvedTrack, scr, pointsDeduction, denominatorWarning),
  };
}

/**
 * Classify an SCR into a zone and (for PL Red breaches) a points deduction.
 *
 * UEFA track: GREEN <= 70%, otherwise RED (proportional fine, no buffer zone).
 * PL track:   GREEN <= 85%, YELLOW 85–115% (levy), RED > 115% (sporting sanction).
 */
export function classify(
  scr: number,
  track: RegulatoryTrack,
  squadCosts: number,
  denominator: number,
  redLimit: number = RULES.PL_RED_THRESHOLD,
): { zone: Zone; pointsDeduction: number } {
  if (track === "UEFA") {
    return {
      zone: scr <= RULES.UEFA_THRESHOLD ? "GREEN" : "RED",
      pointsDeduction: 0, // UEFA breach is a fine, not a points deduction
    };
  }

  if (track === "LALIGA_DOMESTIC") {
    return {
      zone: scr <= 0.70 ? "GREEN" : "RED",
      pointsDeduction: 0,
    };
  }

  // Domestic tracks for other leagues
  const greenLimit =
    track === "PL_DOMESTIC"
      ? RULES.PL_GREEN_THRESHOLD
      : 0.70;

  if (scr <= greenLimit) return { zone: "GREEN", pointsDeduction: 0 };
  if (scr <= redLimit) return { zone: "YELLOW", pointsDeduction: 0 };

  // Above the Red Threshold => sporting sanction (points deduction)
  if (track === "PL_DOMESTIC" || track === "BUNDESLIGA_DOMESTIC" || track === "SERIEA_DOMESTIC") {
    const redThresholdCosts = redLimit * denominator;
    const excessOverRed = Math.max(0, squadCosts - redThresholdCosts);
    const extraPoints = Math.floor(excessOverRed / RULES.POINTS_PER_MILLIONS_OVER);
    return {
      zone: "RED",
      pointsDeduction: RULES.POINTS_BASE_DEDUCTION + extraPoints,
    };
  }

  // Ligue 1 doesn't have automatic points deduction
  return {
    zone: "RED",
    pointsDeduction: 0,
  };
}

function buildHeadline(
  zone: Zone,
  track: RegulatoryTrack,
  scr: number,
  points: number,
  denomWarning: boolean,
): string {
  const pct = (scr * 100).toFixed(1) + "%";
  
  let label = "UEFA (70%)";
  if (track === "PL_DOMESTIC") label = "Premier League (85%)";
  else if (track === "LALIGA_DOMESTIC") label = "La Liga SCL (70%)";
  else if (track === "BUNDESLIGA_DOMESTIC") label = "Bundesliga (70%)";
  else if (track === "SERIEA_DOMESTIC") label = "Serie A (70%)";
  else if (track === "LIGUE1_DOMESTIC") label = "Ligue 1 DNCG (70%)";

  if (denomWarning)
    return `Revenue base collapsed — SCR unbounded (${label}). Sell before you buy.`;
  if (zone === "GREEN") return `Compliant — SCR ${pct} under ${label}.`;
  if (zone === "YELLOW")
    return `Luxury levy zone — SCR ${pct}. Surcharge applies, no points lost.`;
  return `Regulatory breach risk — SCR ${pct} over the ${label} limit.`;
}

// ---------------------------------------------------------------------------
// Convenience: one-shot "simulate a transfer scenario" entry point
// ---------------------------------------------------------------------------

export function simulate(
  club: ClubState,
  options: ApplyOptions,
  track?: RegulatoryTrack,
): { before: ScrResult; after: ScrResult; newState: ClubState } {
  const before = computeScr(club, track);
  const newState = applyTransfers(club, options);
  const after = computeScr(newState, track);
  return { before, after, newState };
}

// ---------------------------------------------------------------------------
// Scenario: apply MANY incoming + outgoing transfers at once (a transfer plan)
// ---------------------------------------------------------------------------

export interface ScenarioInput {
  incomings?: IncomingTransfer[];
  outgoings?: OutgoingTransfer[];
}

/** Fold a whole transfer plan onto a club state. Pure; order-independent. */
export function applyScenario(
  club: ClubState,
  scenario: ScenarioInput,
): ClubState {
  let state = club;
  for (const inc of scenario.incomings ?? []) {
    state = applyTransfers(state, { incoming: inc });
  }
  for (const out of scenario.outgoings ?? []) {
    state = applyTransfers(state, { outgoing: out });
  }
  return state;
}

export function simulateScenario(
  club: ClubState,
  scenario: ScenarioInput,
  track?: RegulatoryTrack,
): { before: ScrResult; after: ScrResult; newState: ClubState } {
  const before = computeScr(club, track);
  const newState = applyScenario(club, scenario);
  const after = computeScr(newState, track);
  return { before, after, newState };
}
