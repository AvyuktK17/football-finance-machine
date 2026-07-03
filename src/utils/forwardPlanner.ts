/**
 * forwardPlanner.ts
 *
 * Pure, framework-agnostic 3-window forward planner for the EPL Trade Machine.
 * NO React / Next.js imports — same portability rule as financialEngine.ts.
 *
 * Windows planned (six — three full years of business):
 *   W1 — Summer 2026   (season 0 fully)          W2 — January 2027 (season 0 half)
 *   W3 — Summer 2027   (season 1 fully)          W4 — January 2028 (season 1 half)
 *   W5 — Summer 2028   (season 2 fully)          W6 — January 2029 (season 2 half)
 *
 * Seasons projected: index 0 = 2026/27, 1 = 2027/28, 2 = 2028/29.
 *
 * European participation is a per-season TIER — NONE / UCL / UEL_UECL. Any
 * UEFA competition (Champions, Europa, or Conference League) binds the club to
 * the 70% squad-cost rule; the tier also shifts projected revenue RELATIVE to
 * the base year's own tier (documented estimates, see EUROPE_TIER_REVENUE).
 *
 * Modelling assumptions (documented, deliberately conservative):
 * - Base wages: two user-selectable policies (`wagePolicy`).
 *   "renew" (default) — wages persist across seasons (clubs typically renew or
 *   replace like-for-like). "expire" — a player's wage drops off in the first
 *   season AFTER his contract ends (no renewal, no replacement). Either way,
 *   base amortisation ROLLS OFF as existing contracts end — an accounting fact
 *   we can derive from per-player fee / signedYear / contractEndYear.
 * - January arrivals/departures book half a season of wages & amortisation in
 *   the season of the move, full weight thereafter.
 * - Sale profit = fee − book value AT THE MOMENT OF SALE (book value keeps
 *   amortising down, so waiting to sell shrinks the profit).
 * - Net player-trading profit in projected seasons comes ONLY from planned
 *   sales (the base year's booked profit belongs to the prior fiscal year).
 * - Revenue grows at a user-set rate per season; European participation is a
 *   per-season toggle that switches the binding limit (70% vs 85%).
 * - PL multi-year allowance: 30 percentage-points of cumulative overage above
 *   the 85% green threshold before the luxury levy applies.
 */

import {
  RULES,
  computeScr,
  rollPlRedThreshold,
  weeklyWageToAnnualMillions,
  annualAmortisation,
  type ClubState,
  type RegulatoryTrack,
  type ScrResult,
} from "./financialEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindowId = "W1" | "W2" | "W3" | "W4" | "W5" | "W6";

export const WINDOWS: { id: WindowId; label: string; short: string }[] = [
  { id: "W1", label: "Summer 2026", short: "Sum 26" },
  { id: "W2", label: "January 2027", short: "Jan 27" },
  { id: "W3", label: "Summer 2027", short: "Sum 27" },
  { id: "W4", label: "January 2028", short: "Jan 28" },
  { id: "W5", label: "Summer 2028", short: "Sum 28" },
  { id: "W6", label: "January 2029", short: "Jan 29" },
];

export const SEASON_LABELS = ["2026/27", "2027/28", "2028/29"] as const;
export const N_SEASONS = 3;

/** 0-based window index: W1→0 … W6→5 (odd indices are January windows). */
function windowIndex(w: WindowId): number {
  return Number(w.slice(1)) - 1;
}
/** True for January (mid-season) windows: W2, W4, W6. */
export function isJanuaryWindow(w: WindowId): boolean {
  return windowIndex(w) % 2 === 1;
}
/** Season index in which a window's business first lands. */
export function windowSeason(w: WindowId): number {
  return Math.floor(windowIndex(w) / 2);
}
/** Weight of the window's first season (January deals are half-season). */
export function windowFirstSeasonWeight(w: WindowId): number {
  return isJanuaryWindow(w) ? 0.5 : 1;
}
/** Years elapsed from the squad "as of" date to the window (for book values). */
export function windowYearOffset(w: WindowId): number {
  return windowIndex(w) / 2;
}

// ---------------------------------------------------------------------------
// European participation tiers
// ---------------------------------------------------------------------------

export type EuropeTier = "NONE" | "UCL" | "UEL_UECL";

export const EUROPE_TIER_LABELS: Record<EuropeTier, string> = {
  NONE: "No Europe",
  UCL: "Champions League",
  UEL_UECL: "Europa / Conference",
};

/**
 * ESTIMATED annual revenue attributable to each European tier (£m), relative
 * to no European football. Used only as a DELTA vs the base year's own tier,
 * so a base season that already includes UCL money is never double-counted.
 *
 * Basis (Swiss Ramble, 2025/26 UEFA distributions): a mid-table UCL league-phase
 * campaign ≈ €84m ≈ £72m prize money plus matchday & commercial halo ⇒ ~£85m;
 * a Europa/Conference campaign ≈ £35m all-in. Flagged estimates — tune freely.
 */
export const EUROPE_TIER_REVENUE: Record<EuropeTier, number> = {
  NONE: 0,
  UCL: 85,
  UEL_UECL: 35,
};

/** Any UEFA competition binds the club to the 70% squad-cost rule. */
export function tierInEurope(t: EuropeTier): boolean {
  return t !== "NONE";
}

/** Coerce legacy boolean flags (old share links / saves) into tiers. */
export function normalizeEuropeTier(v: unknown): EuropeTier {
  if (v === "UCL" || v === "UEL_UECL" || v === "NONE") return v;
  if (v === true) return "UCL";
  return "NONE";
}

export interface PlannedSigning {
  window: WindowId;
  /** £m */
  fee: number;
  /** absolute £/week */
  weeklyWage: number;
  /** years (amortised over min(len, 5)) */
  contractLength: number;
  /** free / academy — no fee, no amortisation */
  isFree?: boolean;
  /** £m — user-entered market value of the target (defaults to the fee) */
  marketValue?: number;
  /** for lineups / display only — ignored by the financial engine */
  position?: "GK" | "DF" | "MF" | "FW";
  /** optional user-given name for the target — display only */
  label?: string;
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export interface BuyClause {
  /** obligation always executes; an option executes only if assumeExercised */
  type: "option" | "obligation";
  /** £m — agreed purchase price / fee */
  price: number;
  /** for options: does the simulation assume it gets exercised? */
  assumeExercised?: boolean;
  /** years — contract signed on purchase (loan-ins only; default 4) */
  contractLength?: number;
}

/** Does a buy clause execute in this simulation? */
export function buyExecutes(c?: BuyClause): boolean {
  return !!c && (c.type === "obligation" || !!c.assumeExercised);
}

/**
 * A squad member loaned OUT to another club.
 * While on loan: the borrower covers `wageCoveredPct` of the wage (that share
 * leaves our squad costs); the player's amortisation STAYS on our books (he is
 * still our registration); the loan fee received lands in the denominator as
 * football income, spread over the loan's seasons. If the buy clause executes,
 * the permanent sale books in the season AFTER the loan ends, at book value
 * as of that date.
 */
export interface LoanOut {
  window: WindowId;
  /** must match a SquadMember name */
  name: string;
  /** £m — loan fee received for the whole loan */
  loanFee: number;
  /** 0..1 — share of the wage paid by the BORROWING club */
  wageCoveredPct: number;
  /** seasons the loan runs (1 = to the end of that season, 2 = a season more) */
  lengthSeasons: 1 | 2;
  buyClause?: BuyClause;
}

/**
 * A player loaned IN from another club.
 * While on loan: we pay `wageSharePct` of his wage; the loan fee paid is a
 * squad cost (UEFA counts temporary-transfer fees inside squad costs — booked
 * within amortisation, spread over the loan). No book value lands on our
 * balance sheet unless the buy clause executes — then a normal signing starts
 * in the season after the loan (fee amortised over min(contract, 5)).
 */
export interface LoanIn {
  window: WindowId;
  /** absolute £/week — the player's full wage */
  weeklyWage: number;
  /** 0..1 — share of the wage WE pay */
  wageSharePct: number;
  /** £m — loan fee paid for the whole loan */
  loanFee: number;
  /** seasons the loan runs */
  lengthSeasons: 1 | 2;
  buyClause?: BuyClause;
  /** £m — market value if bought (defaults to buy price); display/MV only */
  marketValue?: number;
  position?: "GK" | "DF" | "MF" | "FW";
  label?: string;
}

/**
 * Per-season coverage weights of a loan: its first season carries the window's
 * first-season weight (January ⇒ 0.5), each further season a full 1.
 * E.g. a January loan of 1 season ⇒ { [s]: 0.5 }; of 2 ⇒ { [s]: 0.5, [s+1]: 1 }.
 */
export function loanSeasonWeights(w: WindowId, lengthSeasons: number): Record<number, number> {
  const first = windowSeason(w);
  const wts: Record<number, number> = { [first]: windowFirstSeasonWeight(w) };
  for (let k = 1; k < lengthSeasons; k++) wts[first + k] = 1;
  return wts;
}

/** Season index in which a loan's buy clause (if executed) books the transfer. */
export function loanBuySeason(w: WindowId, lengthSeasons: number): number {
  return windowSeason(w) + lengthSeasons;
}

/** A squad member, described by contract facts (mirrors data-layer Player). */
export interface SquadMember {
  name: string;
  weeklyWage: number;
  /** £m — original transfer fee (0 → no amortisation) */
  fee: number;
  signedYear: number;
  contractEndYear: number;
  isAcademy: boolean;
}

export interface PlannedSale {
  window: WindowId;
  /** must match a SquadMember name */
  name: string;
  /** £m */
  saleFee: number;
}

export interface ForwardInputs {
  /** Base-season financials (netPlayerTradingProfit is ignored — see notes). */
  base: ClubState;
  /** Fiscal year the squad book values are stated at (e.g. 2026). */
  asOfYear: number;
  squad: SquadMember[];
  signings: PlannedSigning[];
  sales: PlannedSale[];
  loansOut?: LoanOut[];
  loansIn?: LoanIn[];
  /** Revenue growth per season, e.g. 0.03. */
  revenueGrowth: number;
  /** Per-season European participation tier (any UEFA tier ⇒ 70% limit). */
  europeBySeason: EuropeTier[];
  /**
   * Which tier the BASE year's revenue already includes. Season revenue is
   * adjusted by EUROPE_TIER_REVENUE[season tier] − EUROPE_TIER_REVENUE[base
   * tier], so the base year is never double-counted. Default "NONE".
   */
  baseEuropeTier?: EuropeTier;
  /** Force a track; undefined = auto per season. */
  track?: RegulatoryTrack;
  /**
   * What happens to a base-squad player's wage when his contract ends.
   * "renew" (default) — wage persists (renewal/like-for-like replacement).
   * "expire" — wage drops off from the first season after contract end.
   */
  wagePolicy?: WagePolicy;
}

export type WagePolicy = "renew" | "expire";

export interface SeasonProjection {
  seasonIndex: number;
  label: string;
  state: ClubState;
  result: ScrResult;
  /** European tier assumed for this season */
  europeTier: EuropeTier;
  /** £m revenue adjustment applied for the tier (vs the base year's tier) */
  europeRevenueDelta: number;
  /** £m of base amortisation that has rolled off by this season */
  amortisationRolledOff: number;
  /** £m trading profit booked this season from planned sales (incl. loan buys) */
  tradingProfit: number;
  /** £m loan-fee income received this season (adds to the denominator) */
  loanFeeIncome: number;
}

export interface BufferStatus {
  /** Σ max(0, scr − 85%) across projected seasons, in ratio points */
  used: number;
  /** 0.30 */
  budget: number;
  usedPct: number; // 0..1+ of the budget consumed
  exhausted: boolean;
}

export interface ForwardPlan {
  seasons: SeasonProjection[];
  buffer: BufferStatus;
}

// ---------------------------------------------------------------------------
// Per-player derivations
// ---------------------------------------------------------------------------

/** Annual accounting amortisation for an existing squad member (£m). */
export function memberAnnualAmortisation(p: SquadMember): number {
  if (p.isAcademy || p.fee <= 0) return 0;
  const life = Math.max(1, p.contractEndYear - p.signedYear);
  return p.fee / life;
}

/** Book value (£m) `yearsAfterAsOf` years past the as-of date (can be x.5). */
export function memberBookValue(
  p: SquadMember,
  asOfYear: number,
  yearsAfterAsOf: number,
): number {
  if (p.isAcademy || p.fee <= 0) return 0;
  const life = Math.max(1, p.contractEndYear - p.signedYear);
  const remainingAtAsOf = Math.max(
    0,
    Math.min(life, p.contractEndYear - asOfYear),
  );
  const bv = (p.fee * remainingAtAsOf) / life - memberAnnualAmortisation(p) * yearsAfterAsOf;
  return Math.max(0, Math.round(bv * 10) / 10);
}

/**
 * Is the member's contract (and thus base amortisation) still running during
 * season `s` (0-indexed from the as-of year)?
 */
function contractActiveInSeason(p: SquadMember, asOfYear: number, s: number): boolean {
  return p.contractEndYear > asOfYear + s;
}

// ---------------------------------------------------------------------------
// Core projection
// ---------------------------------------------------------------------------

/**
 * How much of a window-move's annual weight applies in season `s`.
 * 0 before the move; first-season weight in its landing season; 1 after.
 */
function seasonWeight(w: WindowId, s: number): number {
  const first = windowSeason(w);
  if (s < first) return 0;
  if (s === first) return windowFirstSeasonWeight(w);
  return 1;
}

/** Does a new signing's contract still run in season s? */
function signingActive(sig: PlannedSigning, s: number, capped: boolean): number {
  const first = windowSeason(sig.window);
  const len = capped
    ? Math.min(sig.contractLength, RULES.MAX_AMORTISATION_YEARS)
    : sig.contractLength;
  // Elapsed contract years at the START of season s (January deals start mid-season).
  const elapsed = s - first + (sig.window === "W2" ? -0.5 : 0);
  if (elapsed >= len) return 0; // contract (or amortisation schedule) expired
  return seasonWeight(sig.window, s);
}

export function projectPlan(inputs: ForwardInputs): ForwardPlan {
  const {
    base, asOfYear, squad, signings, sales, revenueGrowth, europeBySeason, track,
  } = inputs;
  const baseTier: EuropeTier = inputs.baseEuropeTier ?? "NONE";
  const wagePolicy: WagePolicy = inputs.wagePolicy ?? "renew";
  const squadByName = new Map(squad.map((p) => [p.name, p]));
  const soldNames = new Set(sales.map((x) => x.name));
  // A player can be sold OR loaned out, not both — sales win, loan is ignored.
  const loansOut = (inputs.loansOut ?? []).filter(
    (lo) => squadByName.has(lo.name) && !soldNames.has(lo.name),
  );
  const loansIn = inputs.loansIn ?? [];
  const loanOutByName = new Map(loansOut.map((lo) => [lo.name, lo]));

  const seasons: SeasonProjection[] = [];

  // Rolling cross-season state:
  //  • priorTradingProfits — plan-only disposal profits of earlier PROJECTED
  //    seasons (most-recent-first), feeding the UEFA 3-year disposal average.
  //  • plRed — the Premier League rolling red threshold (multi-year allowance),
  //    eroded/replenished each season by the prior season's SCR vs the 85% green.
  const priorTradingProfits: number[] = [];
  let plRed: number = RULES.PL_RED_THRESHOLD;

  for (let s = 0; s < N_SEASONS; s++) {
    let wages = base.annualWages;
    let amort = base.annualAmortisation;
    const agentFees = base.agentFees;
    let tradingProfit = 0;
    let rolledOff = 0;

    // --- Existing squad: amortisation roll-off + effects of planned sales.
    for (const p of squad) {
      const pAmort = memberAnnualAmortisation(p);
      const sale = sales.find((x) => x.name === p.name);

      if (sale) {
        const w = sale.window;
        const wt = seasonWeight(w, s); // 0 / 0.5 / 1
        // Wages leave from the sale window onward.
        wages -= weeklyWageToAnnualMillions(p.weeklyWage) * wt;
        // Amortisation stops from the sale window onward (never double-count
        // natural contract expiry: remove min(sale effect, still-active)).
        if (pAmort > 0) {
          const naturallyActive = contractActiveInSeason(p, asOfYear, s) ? 1 : 0;
          if (naturallyActive) {
            amort -= pAmort * wt;
          } else {
            rolledOff += pAmort; // expired anyway
            amort -= pAmort;
          }
        }
        // Profit books once, in the sale's landing season.
        if (windowSeason(w) === s) {
          const bv = p.isAcademy
            ? 0
            : memberBookValue(p, asOfYear, windowYearOffset(w));
          tradingProfit += sale.saleFee - bv;
        }
      } else {
        const expired = !contractActiveInSeason(p, asOfYear, s);
        if (pAmort > 0 && expired) {
          // Natural roll-off: contract ended, amortisation stops.
          amort -= pAmort;
          rolledOff += pAmort;
        }
        // Wage policy "expire": the wage drops off once the contract has
        // ended (under "renew" it persists — see file header).
        if (expired && wagePolicy === "expire") {
          const lo = loanOutByName.get(p.name);
          // If an executed loan-out buy has already taken his full wage off
          // the books this season, don't remove it twice.
          const goneViaBuy =
            lo && buyExecutes(lo.buyClause) && s >= loanBuySeason(lo.window, lo.lengthSeasons);
          if (!goneViaBuy) {
            // During a loan-out the borrower already covers a share of the
            // wage — only the residual share is still ours to drop.
            const loanShareCovered = lo
              ? (loanSeasonWeights(lo.window, lo.lengthSeasons)[s] ?? 0) * lo.wageCoveredPct
              : 0;
            wages -= weeklyWageToAnnualMillions(p.weeklyWage) * Math.max(0, 1 - loanShareCovered);
          }
        }
      }
    }

    // --- New signings.
    for (const sig of signings) {
      const wageWt = signingActive(sig, s, false);
      if (wageWt > 0) wages += weeklyWageToAnnualMillions(sig.weeklyWage) * wageWt;
      if (!sig.isFree && sig.fee > 0) {
        const amortWt = signingActive(sig, s, true);
        if (amortWt > 0) amort += annualAmortisation(sig.fee, sig.contractLength) * amortWt;
      }
    }

    // --- Loans OUT: borrower covers part of the wage; loan fee is income;
    //     amortisation stays with us; an executed buy clause books a sale in
    //     the season after the loan ends, at book value as of that date.
    let loanFeeIncome = 0;
    for (const lo of loansOut) {
      const p = squadByName.get(lo.name)!;
      const wts = loanSeasonWeights(lo.window, lo.lengthSeasons);
      const totalWt = Object.values(wts).reduce((a, b) => a + b, 0);
      const wt = wts[s] ?? 0;
      if (wt > 0) {
        wages -= weeklyWageToAnnualMillions(p.weeklyWage) * lo.wageCoveredPct * wt;
        loanFeeIncome += lo.loanFee * (wt / totalWt);
      }
      if (buyExecutes(lo.buyClause) && lo.buyClause) {
        const e = loanBuySeason(lo.window, lo.lengthSeasons);
        if (s >= e) {
          // Player permanently gone: full wage off the books…
          wages -= weeklyWageToAnnualMillions(p.weeklyWage);
          // …and his amortisation stops (guard against double-count with
          // natural contract expiry, which the squad loop already applied).
          const pAmort = memberAnnualAmortisation(p);
          if (pAmort > 0 && contractActiveInSeason(p, asOfYear, s)) amort -= pAmort;
        }
        if (s === e) {
          tradingProfit += lo.buyClause.price - memberBookValue(p, asOfYear, e);
        }
      }
    }

    // --- Loans IN: we pay our share of the wage; the loan fee paid is a squad
    //     cost (UEFA books temporary-transfer fees within amortisation); an
    //     executed buy clause starts a normal signing after the loan.
    for (const li of loansIn) {
      const wts = loanSeasonWeights(li.window, li.lengthSeasons);
      const totalWt = Object.values(wts).reduce((a, b) => a + b, 0);
      const wt = wts[s] ?? 0;
      if (wt > 0) {
        wages += weeklyWageToAnnualMillions(li.weeklyWage) * li.wageSharePct * wt;
        if (li.loanFee > 0) amort += li.loanFee * (wt / totalWt);
      }
      if (buyExecutes(li.buyClause) && li.buyClause) {
        const e = loanBuySeason(li.window, li.lengthSeasons);
        if (s >= e) {
          wages += weeklyWageToAnnualMillions(li.weeklyWage); // full wage now ours
          const cl = li.buyClause.contractLength ?? 4;
          const cappedLen = Math.max(1, Math.min(cl, RULES.MAX_AMORTISATION_YEARS));
          if (li.buyClause.price > 0 && s < e + cappedLen) {
            amort += annualAmortisation(li.buyClause.price, cl);
          }
        }
      }
    }

    const tier: EuropeTier =
      europeBySeason[s] ?? (base.isPlayingInEurope ? baseTier : "NONE");
    // Tier revenue is applied as a DELTA vs the base year's own tier, so a base
    // season that already includes European money is never double-counted.
    const europeRevenueDelta =
      EUROPE_TIER_REVENUE[tier] - EUROPE_TIER_REVENUE[baseTier];

    const state: ClubState = {
      // Loan fees received are football income (they land in the denominator,
      // not in disposal profit — they aren't profit on a registration sale).
      estimatedRevenue:
        base.estimatedRevenue * Math.pow(1 + revenueGrowth, s) +
        europeRevenueDelta +
        loanFeeIncome,
      annualWages: Math.max(0, wages),
      annualAmortisation: Math.max(0, amort),
      agentFees,
      netPlayerTradingProfit: tradingProfit,
      // UEFA 3-year disposal average across the plan's own projected seasons.
      priorNetPlayerTradingProfits: [...priorTradingProfits],
      // PL rolling red threshold as it stands entering this season.
      plRedThreshold: plRed,
      isPlayingInEurope: tierInEurope(tier),
    };

    const result = computeScr(state, track);
    seasons.push({
      seasonIndex: s,
      label: SEASON_LABELS[s],
      state,
      result,
      europeTier: tier,
      europeRevenueDelta,
      amortisationRolledOff: rolledOff,
      tradingProfit,
      loanFeeIncome,
    });

    // Advance rolling state for the NEXT season.
    priorTradingProfits.unshift(tradingProfit);
    plRed = rollPlRedThreshold(result.scr, plRed);
  }

  // --- PL multi-year allowance status: how much of the 30-point band between
  // the 115% ceiling and the 85% green line has been eroded by cumulative
  // overage (exact rolling-red-threshold rule, not a rough sum).
  const budget = RULES.PL_RED_THRESHOLD - RULES.PL_GREEN_THRESHOLD; // 0.30
  const used = Math.min(budget, Math.max(0, RULES.PL_RED_THRESHOLD - plRed));
  const buffer: BufferStatus = {
    used,
    budget,
    usedPct: used / budget,
    exhausted: plRed <= RULES.PL_GREEN_THRESHOLD,
  };

  return { seasons, buffer };
}

// ---------------------------------------------------------------------------
// Max Bid — inverse solver
// ---------------------------------------------------------------------------

export interface MaxBidQuery {
  window: WindowId;
  weeklyWage: number;
  contractLength: number;
}

export interface MaxBidResult {
  /** £m — largest fee that keeps EVERY projected season within its limit */
  maxFee: number;
  /** Which season index binds the answer */
  bindingSeason: number;
  /** True if even a £0 fee (wages alone) breaks a limit */
  wageBreaksLimit: boolean;
}

/**
 * Largest transfer fee for a hypothetical extra signing (on top of the current
 * plan) that keeps every projected season at or under its binding limit.
 *
 * SCR is linear in the fee (fee only adds amortisation to the numerator), so
 * per season:  fee ≤ (limit·D − C_withWage) · L / weight.
 */
export function solveMaxBid(inputs: ForwardInputs, q: MaxBidQuery): MaxBidResult {
  const baselinePlan = projectPlan(inputs);
  const L = Math.max(1, Math.min(q.contractLength, RULES.MAX_AMORTISATION_YEARS));
  const wageAnnual = weeklyWageToAnnualMillions(q.weeklyWage);

  let maxFee = Infinity;
  let bindingSeason = windowSeason(q.window);
  let wageBreaksLimit = false;

  for (const season of baselinePlan.seasons) {
    const s = season.seasonIndex;
    const wageWt = signingActive(
      { window: q.window, fee: 0, weeklyWage: q.weeklyWage, contractLength: q.contractLength },
      s,
      false,
    );
    const amortWt = signingActive(
      { window: q.window, fee: 1, weeklyWage: 0, contractLength: q.contractLength },
      s,
      true,
    );
    if (wageWt === 0 && amortWt === 0) continue;

    const { squadCosts, denominator, limit } = season.result;
    const costsWithWage = squadCosts + wageAnnual * wageWt;
    const headroom = limit * denominator - costsWithWage; // £m of numerator room

    if (amortWt === 0) {
      if (headroom < 0) { wageBreaksLimit = true; maxFee = 0; bindingSeason = s; }
      continue;
    }
    const feeCap = (headroom * L) / amortWt;
    if (feeCap < maxFee) {
      maxFee = feeCap;
      bindingSeason = s;
    }
    if (headroom < 0) wageBreaksLimit = true;
  }

  return {
    maxFee: Math.max(0, Math.floor((maxFee === Infinity ? 0 : maxFee) * 10) / 10),
    bindingSeason,
    wageBreaksLimit,
  };
}

// ---------------------------------------------------------------------------
// Squad market value timeline
// ---------------------------------------------------------------------------

/**
 * Total OWNED-squad market value (£m, Transfermarkt-style estimates) after all
 * business up to and including `throughWindow` (null ⇒ current squad, no plan).
 *
 * Semantics:
 * - Sold player leaves at his sale window (his market value, not the sale fee).
 * - Signing joins at its window at its user-entered market value (default fee).
 * - Loaned-OUT players remain OURS (no change) until an executed buy clause —
 *   then they leave at the summer window after the loan.
 * - Loaned-IN players are NOT owned; they only add value if the buy executes.
 * Values are static estimates — no appreciation/depreciation is modelled.
 */
export function squadMarketValueAfter(
  squad: { name: string; marketValue: number }[],
  signings: PlannedSigning[],
  sales: PlannedSale[],
  loansOut: LoanOut[] = [],
  loansIn: LoanIn[] = [],
  throughWindow: WindowId | null = null,
): number {
  let value = squad.reduce((a, p) => a + p.marketValue, 0);
  if (throughWindow === null) return Math.round(value * 10) / 10;
  const cutoff = windowIndex(throughWindow);
  const byName = new Map(squad.map((p) => [p.name, p]));

  for (const s of sales) {
    const p = byName.get(s.name);
    if (p && windowIndex(s.window) <= cutoff) value -= p.marketValue;
  }
  for (const g of signings) {
    if (windowIndex(g.window) <= cutoff) value += g.marketValue ?? (g.isFree ? 0 : g.fee);
  }
  for (const lo of loansOut) {
    const p = byName.get(lo.name);
    if (!p || !buyExecutes(lo.buyClause)) continue;
    const e = loanBuySeason(lo.window, lo.lengthSeasons);
    if (e < N_SEASONS && e * 2 <= cutoff) value -= p.marketValue; // leaves at summer of season e
  }
  for (const li of loansIn) {
    if (!buyExecutes(li.buyClause) || !li.buyClause) continue;
    const e = loanBuySeason(li.window, li.lengthSeasons);
    if (e < N_SEASONS && e * 2 <= cutoff) value += li.marketValue ?? li.buyClause.price;
  }
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Share-link codec (pure; UI passes the encoded string into the URL)
// ---------------------------------------------------------------------------

export interface SharedScenario {
  clubId: string;
  yearId: string;
  track: string; // "AUTO" | RegulatoryTrack
  revenueGrowth: number;
  /** absent in legacy payloads — treat as "renew" */
  wagePolicy?: WagePolicy;
  /** Tiers; legacy payloads may contain booleans — run through normalizeEuropeTier. */
  europeBySeason: readonly (EuropeTier | boolean)[];
  signings: PlannedSigning[];
  sales: PlannedSale[];
  /** absent in legacy payloads — treat as [] */
  loansOut?: LoanOut[];
  loansIn?: LoanIn[];
  /** saved draft lineup (see src/utils/lineups.ts); subs = backup hierarchy per slot */
  lineup?: { formation: string; slots: (string | null)[]; subs?: string[][] };
}

/** Compact, URL-safe (base64url) encoding of a scenario. */
export function encodeScenario(s: SharedScenario): string {
  const json = JSON.stringify(s);
  // btoa handles latin1; escape unicode first. Works in browser & node ≥16.
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeScenario(encoded: string): SharedScenario | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
    const s = JSON.parse(json) as SharedScenario;
    if (!s || typeof s.clubId !== "string" || !Array.isArray(s.signings) || !Array.isArray(s.sales)) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}
