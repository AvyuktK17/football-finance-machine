/**
 * forwardPlanner.test.ts — run with: npx tsx src/utils/forwardPlanner.test.ts
 */
import {
  projectPlan,
  solveMaxBid,
  memberAnnualAmortisation,
  memberBookValue,
  encodeScenario,
  decodeScenario,
  normalizeEuropeTier,
  squadMarketValueAfter,
  windowSeason,
  windowFirstSeasonWeight,
  windowYearOffset,
  EUROPE_TIER_REVENUE,
  WINDOWS,
  type ForwardInputs,
  type SquadMember,
} from "./forwardPlanner";
import { RULES, weeklyWageToAnnualMillions, computeScr } from "./financialEngine";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error("  ✗ FAIL:", msg); }
}
function approx(a: number, b: number, eps = 1e-6) { return Math.abs(a - b) < eps; }

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const base = {
  estimatedRevenue: 600,
  annualWages: 300,
  annualAmortisation: 150,
  agentFees: 20,
  netPlayerTradingProfit: 999, // must be ignored by the planner
  isPlayingInEurope: false,
};

// £50m fee over 2021→2027 (6y life) → £8.333m/yr; expires after season 0.
const expiring: SquadMember = {
  name: "Expiring", weeklyWage: 100_000, fee: 50, signedYear: 2021, contractEndYear: 2027, isAcademy: false,
};
// £60m over 2024→2030 (6y) → £10m/yr; runs the whole horizon.
const longDeal: SquadMember = {
  name: "LongDeal", weeklyWage: 200_000, fee: 60, signedYear: 2024, contractEndYear: 2030, isAcademy: false,
};
const academy: SquadMember = {
  name: "Academy", weeklyWage: 50_000, fee: 0, signedYear: 2020, contractEndYear: 2029, isAcademy: true,
};

const inputs: ForwardInputs = {
  base, asOfYear: 2026,
  squad: [expiring, longDeal, academy],
  signings: [], sales: [],
  revenueGrowth: 0, europeBySeason: ["NONE", "NONE", "NONE"],
  track: "PL_DOMESTIC",
};

// ---------------------------------------------------------------------------
console.log("— window geometry (6 windows)");
assert(WINDOWS.length === 6, "six windows W1..W6");
assert(windowSeason("W1") === 0 && windowSeason("W2") === 0, "W1/W2 → season 0");
assert(windowSeason("W3") === 1 && windowSeason("W4") === 1, "W3/W4 → season 1");
assert(windowSeason("W5") === 2 && windowSeason("W6") === 2, "W5/W6 → season 2");
assert(windowFirstSeasonWeight("W4") === 0.5 && windowFirstSeasonWeight("W6") === 0.5, "January windows half-weight");
assert(windowFirstSeasonWeight("W5") === 1, "summer windows full weight");
assert(windowYearOffset("W4") === 1.5 && windowYearOffset("W5") === 2 && windowYearOffset("W6") === 2.5, "book-value year offsets");

// ---------------------------------------------------------------------------
console.log("— derivations");
assert(approx(memberAnnualAmortisation(expiring), 50 / 6), "annual amort = fee/life");
assert(memberAnnualAmortisation(academy) === 0, "academy has no amortisation");
// Book value at as-of 2026: 1 remaining year of 6 → 50/6 ≈ 8.3
assert(approx(memberBookValue(expiring, 2026, 0), 8.3, 0.05), "book value at as-of");
// Half a year later, half a year's amort gone.
assert(approx(memberBookValue(expiring, 2026, 0.5), 8.3 - 50 / 12, 0.1), "mid-season book value");
assert(memberBookValue(expiring, 2026, 1) === 0, "book value floors at 0 after expiry");

// ---------------------------------------------------------------------------
console.log("— baseline projection (no transfers)");
{
  const plan = projectPlan(inputs);
  assert(plan.seasons.length === 3, "3 seasons projected");
  const s0 = plan.seasons[0], s1 = plan.seasons[1];
  assert(s0.state.netPlayerTradingProfit === 0, "base trading profit ignored in projections");
  assert(approx(s0.state.annualAmortisation, 150), "season 0 amort = base");
  // Season 1: Expiring's contract (ends 2027) has rolled off.
  assert(approx(s1.state.annualAmortisation, 150 - 50 / 6), "season 1 amort rolls off expiring contract");
  assert(approx(s1.amortisationRolledOff, 50 / 6), "roll-off reported");
  assert(approx(s0.state.annualWages, 300) && approx(s1.state.annualWages, 300), "wages persist (renewal assumption)");
  // Sanity: matches a direct computeScr of the same state.
  assert(approx(s0.result.scr, computeScr(s0.state, "PL_DOMESTIC").scr), "scr consistent with engine");
}

// ---------------------------------------------------------------------------
console.log("— revenue growth");
{
  const plan = projectPlan({ ...inputs, revenueGrowth: 0.1 });
  assert(approx(plan.seasons[1].state.estimatedRevenue, 660), "revenue grows 10%");
  assert(approx(plan.seasons[2].state.estimatedRevenue, 726), "compounds");
}

// ---------------------------------------------------------------------------
console.log("— W1 signing");
{
  const plan = projectPlan({
    ...inputs,
    signings: [{ window: "W1", fee: 100, weeklyWage: 260_000, contractLength: 5 }],
  });
  const wAnnual = weeklyWageToAnnualMillions(260_000);
  for (const s of [0, 1, 2]) {
    assert(approx(plan.seasons[s].state.annualWages, 300 + wAnnual), `W1 wages full in season ${s}`);
  }
  assert(approx(plan.seasons[0].state.annualAmortisation, 150 + 20), "W1 amort +£20m in season 0");
}

// ---------------------------------------------------------------------------
console.log("— January (W2) pro-rating");
{
  const plan = projectPlan({
    ...inputs,
    signings: [{ window: "W2", fee: 60, weeklyWage: 104_000, contractLength: 3 }],
  });
  const wAnnual = weeklyWageToAnnualMillions(104_000);
  assert(approx(plan.seasons[0].state.annualWages, 300 + wAnnual * 0.5), "half-season wages in season 0");
  assert(approx(plan.seasons[1].state.annualWages, 300 + wAnnual), "full wages in season 1");
  assert(approx(plan.seasons[0].state.annualAmortisation, 150 + 10), "half-year amort (£20m/yr → £10m)");
  // 3y contract from Jan 2027 runs into 2029/30 — all horizon seasons covered.
  assert(approx(plan.seasons[2].state.annualAmortisation, 150 - 50 / 6 + 20), "amort continues season 2");
}

// ---------------------------------------------------------------------------
console.log("— 1-year W1 contract expires inside horizon");
{
  const plan = projectPlan({
    ...inputs,
    signings: [{ window: "W1", fee: 10, weeklyWage: 52_000, contractLength: 1 }],
  });
  assert(approx(plan.seasons[0].state.annualAmortisation, 160), "amort in season 0");
  assert(approx(plan.seasons[1].state.annualAmortisation, 150 - 50 / 6), "gone by season 1");
  assert(approx(plan.seasons[1].state.annualWages, 300), "wages gone by season 1");
}

// ---------------------------------------------------------------------------
console.log("— sales");
{
  // Sell LongDeal in W1 at £40m: bv at 2026 = 60*(4/6)=40 → profit 0.
  const plan = projectPlan({
    ...inputs,
    sales: [{ window: "W1", name: "LongDeal", saleFee: 40 }],
  });
  assert(approx(plan.seasons[0].tradingProfit, 0, 0.11), "profit = fee − book value");
  const wAnnual = weeklyWageToAnnualMillions(200_000);
  assert(approx(plan.seasons[0].state.annualWages, 300 - wAnnual), "wages removed");
  assert(approx(plan.seasons[0].state.annualAmortisation, 140), "amort removed");
  assert(plan.seasons[1].tradingProfit === 0, "profit books once");
  assert(approx(plan.seasons[1].state.annualAmortisation, 140 - 50 / 6), "no double count with roll-off");
}
{
  // Selling LATER shrinks profit: W3 sale, bv = 60*(4/6) − 10 = 30.
  const plan = projectPlan({
    ...inputs,
    sales: [{ window: "W3", name: "LongDeal", saleFee: 40 }],
  });
  assert(plan.seasons[0].tradingProfit === 0, "no profit before the sale window");
  assert(approx(plan.seasons[1].tradingProfit, 10, 0.11), "later sale → lower book value → +£10m");
  assert(approx(plan.seasons[0].state.annualWages, 300), "wages stay until sold");
}
{
  // Academy sale: 100% pure profit.
  const plan = projectPlan({
    ...inputs,
    sales: [{ window: "W1", name: "Academy", saleFee: 25 }],
  });
  assert(approx(plan.seasons[0].tradingProfit, 25), "academy sale is pure profit");
}
{
  // January sale: half-season wage relief, half-year extra amortisation charged.
  const plan = projectPlan({
    ...inputs,
    sales: [{ window: "W2", name: "LongDeal", saleFee: 40 }],
  });
  const wAnnual = weeklyWageToAnnualMillions(200_000);
  assert(approx(plan.seasons[0].state.annualWages, 300 - wAnnual * 0.5), "January sale: half-season wages");
  assert(approx(plan.seasons[0].state.annualAmortisation, 150 - 5), "January sale: half-year amort saved");
  assert(approx(plan.seasons[0].tradingProfit, 40 - 35, 0.11), "January book value (40 − ½yr amort)");
}

// ---------------------------------------------------------------------------
console.log("— multi-year buffer (rolling PL red threshold)");
{
  // Push SCR far above 85% every season: huge signing. The rolling red
  // threshold should erode to the 85% floor => buffer fully exhausted.
  const plan = projectPlan({
    ...inputs,
    signings: [{ window: "W1", fee: 500, weeklyWage: 1_000_000, contractLength: 5 }],
  });
  assert(approx(plan.buffer.budget, 0.3, 1e-6), "budget is the 30pp band");
  assert(approx(plan.buffer.used, plan.buffer.budget, 1e-6), "huge overspend exhausts the buffer");
  assert(plan.buffer.exhausted === true, "buffer flagged exhausted");
  // Each later season's red threshold must be <= the prior season's (monotonic erosion).
  const reds = plan.seasons.map((s) => s.state.plRedThreshold ?? 1.15);
  assert(reds[1] <= reds[0] && reds[2] <= reds[1], "red threshold erodes across seasons");
}

// ---------------------------------------------------------------------------
console.log("— max bid");
{
  const q = { window: "W1" as const, weeklyWage: 150_000, contractLength: 5 };
  const { maxFee, wageBreaksLimit } = solveMaxBid(inputs, q);
  assert(maxFee > 0 && !wageBreaksLimit, "affordable bid exists");
  // Applying the max bid keeps every season ≤ limit…
  const at = projectPlan({ ...inputs, signings: [{ window: "W1", fee: maxFee, weeklyWage: q.weeklyWage, contractLength: 5 }] });
  assert(at.seasons.every((s) => s.result.scr <= s.result.limit + 1e-9), "max bid is compliant in all seasons");
  // …and £5m more breaks at least one.
  const over = projectPlan({ ...inputs, signings: [{ window: "W1", fee: maxFee + 5, weeklyWage: q.weeklyWage, contractLength: 5 }] });
  assert(over.seasons.some((s) => s.result.scr > s.result.limit), "max bid + £5m breaches");
}
{
  // Wage so big that £0 fee already breaks the limit.
  const tight: ForwardInputs = {
    ...inputs,
    base: { ...base, annualWages: 480, annualAmortisation: 150 }, // scr ≈ 1.083 > 0.85 pre-deal? costs=650/600
  };
  const r = solveMaxBid(tight, { window: "W1", weeklyWage: 500_000, contractLength: 5 });
  assert(r.maxFee === 0 && r.wageBreaksLimit, "wage alone breaks the limit → £0");
}
{
  // UEFA season tier binds tighter (even with the UCL revenue uplift).
  const withEurope = solveMaxBid({ ...inputs, europeBySeason: ["UCL", "UCL", "UCL"], track: undefined }, { window: "W1", weeklyWage: 150_000, contractLength: 5 });
  const domestic = solveMaxBid(inputs, { window: "W1", weeklyWage: 150_000, contractLength: 5 });
  assert(withEurope.maxFee < domestic.maxFee, "70% UEFA limit lowers the max bid");
}

// ---------------------------------------------------------------------------
console.log("— Europe tiers & revenue deltas");
{
  // Base year had no Europe: UCL season adds +85, UEL/UECL +35, NONE +0.
  const plan = projectPlan({ ...inputs, europeBySeason: ["UCL", "UEL_UECL", "NONE"], baseEuropeTier: "NONE" });
  assert(approx(plan.seasons[0].state.estimatedRevenue, 600 + EUROPE_TIER_REVENUE.UCL), "UCL uplift vs no-Europe base");
  assert(approx(plan.seasons[1].state.estimatedRevenue, 600 + EUROPE_TIER_REVENUE.UEL_UECL), "UEL/UECL uplift");
  assert(approx(plan.seasons[2].state.estimatedRevenue, 600), "no Europe → base revenue");
  assert(plan.seasons[0].state.isPlayingInEurope && plan.seasons[1].state.isPlayingInEurope, "both UEFA tiers bind 70% rule");
  assert(!plan.seasons[2].state.isPlayingInEurope, "NONE → domestic");
  assert(plan.seasons[0].europeTier === "UCL" && approx(plan.seasons[0].europeRevenueDelta, 85), "delta reported");
}
{
  // Base year ALREADY includes UCL money: staying in UCL adds nothing;
  // dropping to Europa costs −50; dropping out entirely costs −85.
  const plan = projectPlan({ ...inputs, europeBySeason: ["UCL", "UEL_UECL", "NONE"], baseEuropeTier: "UCL" });
  assert(approx(plan.seasons[0].state.estimatedRevenue, 600), "same tier as base → no double count");
  assert(approx(plan.seasons[1].state.estimatedRevenue, 600 - 50), "UCL→UEL drop costs the difference");
  assert(approx(plan.seasons[2].state.estimatedRevenue, 600 - 85), "losing Europe removes the full uplift");
}
{
  // Missing Europe next season must WORSEN the SCR when the base was UCL.
  const stay = projectPlan({ ...inputs, europeBySeason: ["UCL", "UCL", "UCL"], baseEuropeTier: "UCL", track: "PL_DOMESTIC" });
  const drop = projectPlan({ ...inputs, europeBySeason: ["UCL", "NONE", "NONE"], baseEuropeTier: "UCL", track: "PL_DOMESTIC" });
  assert(drop.seasons[1].result.scr > stay.seasons[1].result.scr, "dropping out of Europe raises SCR");
}
{
  assert(normalizeEuropeTier(true) === "UCL" && normalizeEuropeTier(false) === "NONE", "legacy booleans normalize");
  assert(normalizeEuropeTier("UEL_UECL") === "UEL_UECL" && normalizeEuropeTier("junk") === "NONE", "strings normalize");
}

// ---------------------------------------------------------------------------
console.log("— far windows (W4–W6)");
{
  // W4 (Jan 2028): half in season 1, full in season 2; nothing in season 0.
  const plan = projectPlan({ ...inputs, signings: [{ window: "W4", fee: 60, weeklyWage: 104_000, contractLength: 3 }] });
  const wAnnual = weeklyWageToAnnualMillions(104_000);
  assert(approx(plan.seasons[0].state.annualWages, 300), "W4: no effect in season 0");
  assert(approx(plan.seasons[1].state.annualWages, 300 + wAnnual * 0.5), "W4: half wages in season 1");
  assert(approx(plan.seasons[2].state.annualWages, 300 + wAnnual), "W4: full wages in season 2");
  assert(approx(plan.seasons[1].state.annualAmortisation, 150 - 50 / 6 + 10), "W4: half-year amort in season 1");
}
{
  // W6 (Jan 2029) sale: LongDeal bv = 40 − 2.5yr×10 = 15 → profit 25 in season 2.
  const plan = projectPlan({ ...inputs, sales: [{ window: "W6", name: "LongDeal", saleFee: 40 }] });
  assert(plan.seasons[0].tradingProfit === 0 && plan.seasons[1].tradingProfit === 0, "W6: profit only in season 2");
  assert(approx(plan.seasons[2].tradingProfit, 25, 0.11), "W6: 2.5yrs more amortisation → £25m profit");
  const wAnnual = weeklyWageToAnnualMillions(200_000);
  assert(approx(plan.seasons[2].state.annualWages, 300 - wAnnual * 0.5), "W6: half-season wage relief");
  assert(approx(plan.seasons[1].state.annualWages, 300), "W6: wages intact through season 1");
}
{
  // W5 (Summer 2028) signing only touches season 2 in this horizon.
  const plan = projectPlan({ ...inputs, signings: [{ window: "W5", fee: 100, weeklyWage: 260_000, contractLength: 5 }] });
  assert(approx(plan.seasons[1].state.annualAmortisation, 150 - 50 / 6), "W5: season 1 untouched");
  assert(approx(plan.seasons[2].state.annualAmortisation, 150 - 50 / 6 + 20), "W5: +£20m amort in season 2");
}
{
  // Max bid via a far window: binding season must be ≥ the landing season.
  const r = solveMaxBid(inputs, { window: "W5", weeklyWage: 150_000, contractLength: 5 });
  assert(r.maxFee > 0 && r.bindingSeason === 2, "W5 max bid binds in season 2");
}

// ---------------------------------------------------------------------------
console.log("— loans out");
{
  // Season-long W1 loan of LongDeal: borrower covers 60% of the £200k wage,
  // £5m loan fee, no buy. Amortisation stays; fee is denominator income.
  const plan = projectPlan({
    ...inputs,
    loansOut: [{ window: "W1", name: "LongDeal", loanFee: 5, wageCoveredPct: 0.6, lengthSeasons: 1 }],
  });
  const wAnnual = weeklyWageToAnnualMillions(200_000);
  assert(approx(plan.seasons[0].state.annualWages, 300 - wAnnual * 0.6), "borrower covers 60% of wage");
  assert(approx(plan.seasons[0].state.annualAmortisation, 150), "amortisation stays on our books");
  assert(approx(plan.seasons[0].loanFeeIncome, 5), "loan fee booked as income");
  assert(approx(plan.seasons[0].state.estimatedRevenue, 605), "fee lands in the denominator");
  assert(plan.seasons[0].tradingProfit === 0, "no disposal profit from a straight loan");
  assert(approx(plan.seasons[1].state.annualWages, 300), "player back after the loan");
  assert(approx(plan.seasons[1].state.estimatedRevenue, 600), "income only during the loan");
}
{
  // W1 loan with OBLIGATION to buy at £40m after 1 season: sale books in
  // season 1 at book value then (60×4/6 − 10 = £30m) → +£10m profit.
  const plan = projectPlan({
    ...inputs,
    loansOut: [{ window: "W1", name: "LongDeal", loanFee: 5, wageCoveredPct: 1, lengthSeasons: 1, buyClause: { type: "obligation", price: 40 } }],
  });
  const wAnnual = weeklyWageToAnnualMillions(200_000);
  assert(approx(plan.seasons[0].state.annualWages, 300 - wAnnual), "borrower covers all wages during loan");
  assert(approx(plan.seasons[1].tradingProfit, 10, 0.11), "obligation books sale at season-1 book value");
  assert(approx(plan.seasons[1].state.annualWages, 300 - wAnnual), "wages gone after permanent move");
  assert(approx(plan.seasons[1].state.annualAmortisation, 140 - 50 / 6), "amortisation gone after buy");
  assert(plan.seasons[2].tradingProfit === 0, "profit books once");
}
{
  // OPTION not assumed exercised ⇒ player comes back; assumed ⇒ same as obligation.
  const not = projectPlan({ ...inputs, loansOut: [{ window: "W1", name: "LongDeal", loanFee: 0, wageCoveredPct: 1, lengthSeasons: 1, buyClause: { type: "option", price: 40 } }] });
  assert(not.seasons[1].tradingProfit === 0 && approx(not.seasons[1].state.annualWages, 300), "unexercised option → returns");
  const yes = projectPlan({ ...inputs, loansOut: [{ window: "W1", name: "LongDeal", loanFee: 0, wageCoveredPct: 1, lengthSeasons: 1, buyClause: { type: "option", price: 40, assumeExercised: true } }] });
  assert(approx(yes.seasons[1].tradingProfit, 10, 0.11), "exercised option behaves like obligation");
}
{
  // January (W2) loan-out, 1 season: half-season effects only.
  const plan = projectPlan({
    ...inputs,
    loansOut: [{ window: "W2", name: "LongDeal", loanFee: 4, wageCoveredPct: 0.5, lengthSeasons: 1 }],
  });
  const wAnnual = weeklyWageToAnnualMillions(200_000);
  assert(approx(plan.seasons[0].state.annualWages, 300 - wAnnual * 0.5 * 0.5), "half wage share × half season");
  assert(approx(plan.seasons[0].loanFeeIncome, 4), "whole fee booked in the loan's only (half) season");
}
{
  // 2-season loan spreads the fee by coverage weight.
  const plan = projectPlan({
    ...inputs,
    loansOut: [{ window: "W2", name: "LongDeal", loanFee: 9, wageCoveredPct: 1, lengthSeasons: 2 }],
  });
  assert(approx(plan.seasons[0].loanFeeIncome, 9 * (0.5 / 1.5)), "Jan loan season 0 gets 1/3 of fee");
  assert(approx(plan.seasons[1].loanFeeIncome, 9 * (1 / 1.5)), "season 1 gets 2/3");
  assert(approx(plan.seasons[2].loanFeeIncome, 0), "nothing after");
}
{
  // A player in `sales` cannot also be loaned out — the sale wins.
  const plan = projectPlan({
    ...inputs,
    sales: [{ window: "W1", name: "LongDeal", saleFee: 40 }],
    loansOut: [{ window: "W1", name: "LongDeal", loanFee: 5, wageCoveredPct: 1, lengthSeasons: 1 }],
  });
  assert(approx(plan.seasons[0].loanFeeIncome, 0), "conflicting loan ignored");
  assert(approx(plan.seasons[0].tradingProfit, 0, 0.11), "sale still books");
}

// ---------------------------------------------------------------------------
console.log("— loans in");
{
  // W1 loan-in: £3m fee, £150k/wk, we pay 70%, 1 season, no buy.
  const plan = projectPlan({
    ...inputs,
    loansIn: [{ window: "W1", weeklyWage: 150_000, wageSharePct: 0.7, loanFee: 3, lengthSeasons: 1 }],
  });
  const wAnnual = weeklyWageToAnnualMillions(150_000);
  assert(approx(plan.seasons[0].state.annualWages, 300 + wAnnual * 0.7), "we pay our wage share");
  assert(approx(plan.seasons[0].state.annualAmortisation, 150 + 3), "loan fee paid is a squad cost");
  assert(approx(plan.seasons[1].state.annualWages, 300), "gone after the loan");
  assert(approx(plan.seasons[1].state.annualAmortisation, 150 - 50 / 6), "no residual cost");
}
{
  // Loan-in with obligation: £30m on a 5y contract from season 1.
  const plan = projectPlan({
    ...inputs,
    loansIn: [{ window: "W1", weeklyWage: 150_000, wageSharePct: 0.5, loanFee: 2, lengthSeasons: 1, buyClause: { type: "obligation", price: 30, contractLength: 5 } }],
  });
  const wAnnual = weeklyWageToAnnualMillions(150_000);
  assert(approx(plan.seasons[1].state.annualWages, 300 + wAnnual), "full wage after permanent signing");
  assert(approx(plan.seasons[1].state.annualAmortisation, 150 - 50 / 6 + 6), "£30m/5y amortisation starts");
  assert(approx(plan.seasons[2].state.annualAmortisation, 150 - 50 / 6 + 6), "…and continues");
}

// ---------------------------------------------------------------------------
console.log("— squad market value");
{
  const squadMV = [
    { name: "Expiring", marketValue: 10 },
    { name: "LongDeal", marketValue: 50 },
    { name: "Academy", marketValue: 30 },
  ];
  assert(approx(squadMarketValueAfter(squadMV, [], []), 90), "current squad value");
  // Sell LongDeal in W1 (+£40m fee is irrelevant to MV), sign £60m player (MV £75m) in W3.
  const signings = [{ window: "W3" as const, fee: 60, weeklyWage: 200_000, contractLength: 5, marketValue: 75 }];
  const sales = [{ window: "W1" as const, name: "LongDeal", saleFee: 40 }];
  assert(approx(squadMarketValueAfter(squadMV, signings, sales, [], [], "W1"), 40), "after W1: sale out");
  assert(approx(squadMarketValueAfter(squadMV, signings, sales, [], [], "W2"), 40), "W2 unchanged");
  assert(approx(squadMarketValueAfter(squadMV, signings, sales, [], [], "W3"), 115), "after W3: signing in at user MV");
  // Signing without explicit MV defaults to the fee.
  const sig2 = [{ window: "W1" as const, fee: 20, weeklyWage: 50_000, contractLength: 4 }];
  assert(approx(squadMarketValueAfter(squadMV, sig2, [], [], [], "W1"), 110), "MV defaults to fee");
  // Loan-out with executed buy after season 0 leaves at W3 (summer of season 1).
  const lo = [{ window: "W1" as const, name: "LongDeal", loanFee: 5, wageCoveredPct: 1, lengthSeasons: 1 as const, buyClause: { type: "obligation" as const, price: 40 } }];
  assert(approx(squadMarketValueAfter(squadMV, [], [], lo, [], "W2"), 90), "loaned player still ours in W2");
  assert(approx(squadMarketValueAfter(squadMV, [], [], lo, [], "W3"), 40), "leaves at the buy window");
  // Loan-in adds nothing unless bought.
  const li = [{ window: "W1" as const, weeklyWage: 100_000, wageSharePct: 1, loanFee: 2, lengthSeasons: 1 as const, buyClause: { type: "obligation" as const, price: 25, contractLength: 4 }, marketValue: 32 }];
  assert(approx(squadMarketValueAfter(squadMV, [], [], [], li, "W2"), 90), "loan-in not owned during loan");
  assert(approx(squadMarketValueAfter(squadMV, [], [], [], li, "W3"), 122), "joins at buy window at his MV");
}

// ---------------------------------------------------------------------------
console.log("— share codec");
{
  const scenario = {
    clubId: "tottenham", yearId: "fy2425", track: "AUTO", revenueGrowth: 0.03,
    europeBySeason: ["UCL", "NONE", "UEL_UECL"] as const,
    signings: [{ window: "W2" as const, fee: 60.5, weeklyWage: 155_000, contractLength: 4 }],
    sales: [{ window: "W1" as const, name: "José Ñoño", saleFee: 12.5 }], // unicode
  };
  const enc = encodeScenario(scenario);
  assert(/^[A-Za-z0-9\-_]+$/.test(enc), "URL-safe alphabet");
  const dec = decodeScenario(enc);
  assert(JSON.stringify(dec) === JSON.stringify(scenario), "roundtrip exact");
  assert(decodeScenario("!!!not-base64!!!") === null, "garbage → null");
  assert(decodeScenario(enc.slice(0, 5)) === null, "truncated → null");
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
