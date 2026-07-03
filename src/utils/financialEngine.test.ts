/**
 * financialEngine.test.ts
 *
 * Lightweight, dependency-free test runner. Run with:
 *   npx tsx src/utils/financialEngine.test.ts
 *
 * Verifies the core SCR math and the tricky edge cases (academy pure profit,
 * 5-year amortisation cap, negative net trading profit) BEFORE the UI relies on it.
 */

import {
  applyTransfers,
  computeScr,
  annualAmortisation,
  weeklyWageToAnnualMillions,
  simulate,
  applyScenario,
  simulateScenario,
  uefaProratedDisposalProfit,
  rollPlRedThreshold,
  foldPlRedThreshold,
  type ClubState,
} from "./financialEngine";

let passed = 0;
let failed = 0;

function approx(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}

// A simple club: £500m revenue, squad costs 340+120+20 = 480 => SCR 96%.
const baseClub: ClubState = {
  estimatedRevenue: 500,
  annualWages: 340,
  annualAmortisation: 120,
  agentFees: 20,
  netPlayerTradingProfit: 0,
  isPlayingInEurope: false,
};

console.log("\nfinancialEngine test suite\n");

// --- Unit helpers ---------------------------------------------------------
console.log("helpers:");
check(
  "weekly wage £300k -> £15.6m/yr",
  approx(weeklyWageToAnnualMillions(300_000), 15.6),
);
check(
  "amortisation caps at 5 years (£100m / 7yr contract => £20m)",
  approx(annualAmortisation(100, 7), 20),
);
check(
  "amortisation uses actual length when < 5 (£30m / 3yr => £10m)",
  approx(annualAmortisation(30, 3), 10),
);

// --- Base SCR --------------------------------------------------------------
console.log("\nbase SCR:");
const base = computeScr(baseClub, "PL_DOMESTIC");
check("base SCR = 96%", approx(base.scr, 0.96), `got ${base.scr}`);
check("base zone YELLOW (85–115%)", base.zone === "YELLOW", base.zone);
check("base no points deduction", base.pointsDeduction === 0);

// --- GREEN case ------------------------------------------------------------
console.log("\ngreen case:");
const greenClub: ClubState = { ...baseClub, annualWages: 220 }; // costs 360 => 72%
const green = computeScr(greenClub, "PL_DOMESTIC");
check("SCR = 72%", approx(green.scr, 0.72), `got ${green.scr}`);
check("zone GREEN", green.zone === "GREEN", green.zone);

// --- UEFA track is stricter -----------------------------------------------
console.log("\nUEFA track:");
const uefa = computeScr(greenClub, "UEFA"); // 72% > 70% => RED on UEFA
check("72% breaches UEFA 70%", uefa.zone === "RED", uefa.zone);
check("UEFA breach carries no points", uefa.pointsDeduction === 0);

// --- RED + points deduction ------------------------------------------------
console.log("\nred case (points deduction):");
// costs = 600, denom = 500 => SCR 120% > 115%. Red threshold costs = 575.
// excess = 25 => extra points = floor(25/6.5) = 3 => total 6 + 3 = 9.
const redClub: ClubState = { ...baseClub, annualWages: 460 }; // costs 600
const red = computeScr(redClub, "PL_DOMESTIC");
check("SCR = 120%", approx(red.scr, 1.2), `got ${red.scr}`);
check("zone RED", red.zone === "RED", red.zone);
check("points deduction = 9", red.pointsDeduction === 9, `got ${red.pointsDeduction}`);

// --- Academy pure profit ---------------------------------------------------
console.log("\nacademy pure profit sale:");
const acad = applyTransfers(baseClub, {
  outgoing: {
    saleFee: 60,
    shedWeeklyWage: 100_000, // -> £5.2m off wages
    remainingBookValue: 40, // ignored because academy
    isAcademy: true,
  },
});
check(
  "academy sale => full £60m to net profit",
  approx(acad.netPlayerTradingProfit ?? 0, 60),
  `got ${acad.netPlayerTradingProfit}`,
);
check(
  "wages reduced by £5.2m",
  approx(acad.annualWages, 340 - 5.2),
  `got ${acad.annualWages}`,
);

// Non-academy comparison: profit = fee - bookValue = 60 - 40 = 20.
const nonAcad = applyTransfers(baseClub, {
  outgoing: { saleFee: 60, shedWeeklyWage: 0, remainingBookValue: 40 },
});
check(
  "non-academy sale => profit = fee - book value = £20m",
  approx(nonAcad.netPlayerTradingProfit ?? 0, 20),
  `got ${nonAcad.netPlayerTradingProfit}`,
);

// --- Incoming transfer + amortisation cap ----------------------------------
console.log("\nincoming transfer:");
const inbound = applyTransfers(baseClub, {
  incoming: { fee: 100, weeklyWage: 300_000, contractLength: 6 }, // amort capped 5y => 20/yr
});
check(
  "amortisation +£20m (5yr cap on 6yr deal)",
  approx(inbound.annualAmortisation, 140),
  `got ${inbound.annualAmortisation}`,
);
check(
  "wages +£15.6m",
  approx(inbound.annualWages, 355.6),
  `got ${inbound.annualWages}`,
);

// --- Negative denominator guard --------------------------------------------
console.log("\nnegative net-trading-profit guard:");
const brokeClub: ClubState = {
  ...baseClub,
  estimatedRevenue: 50,
  netPlayerTradingProfit: -60, // denom = -10 => must be clamped
};
const broke = computeScr(brokeClub, "PL_DOMESTIC");
check("denominatorWarning flagged", broke.denominatorWarning === true);
check("SCR finite (not Infinity/NaN)", Number.isFinite(broke.scr), `got ${broke.scr}`);
check("SCR positive", broke.scr > 0);

// --- simulate() wrapper ----------------------------------------------------
console.log("\nsimulate() before/after:");
const sim = simulate(
  baseClub,
  { incoming: { fee: 50, weeklyWage: 200_000, contractLength: 5 } },
  "PL_DOMESTIC",
);
check("after SCR > before SCR (spending rose)", sim.after.scr > sim.before.scr);

// --- Scenario: multiple incomings + outgoings ------------------------------
console.log("\nscenario (multiple in + out):");
const scenarioState = applyScenario(baseClub, {
  incomings: [
    { fee: 100, weeklyWage: 300_000, contractLength: 5 }, // +20 amort, +15.6 wages
    { fee: 50, weeklyWage: 100_000, contractLength: 5 }, // +10 amort, +5.2 wages
  ],
  outgoings: [
    { saleFee: 40, shedWeeklyWage: 150_000, remainingBookValue: 10 }, // +30 profit, -7.8 wages
  ],
});
check(
  "two signings add £30m amortisation",
  approx(scenarioState.annualAmortisation, 120 + 30),
  `got ${scenarioState.annualAmortisation}`,
);
check(
  "net wage change = +15.6 +5.2 -7.8 = +13",
  approx(scenarioState.annualWages, 340 + 13),
  `got ${scenarioState.annualWages}`,
);
check(
  "sale books £30m trading profit",
  approx(scenarioState.netPlayerTradingProfit ?? 0, 30),
  `got ${scenarioState.netPlayerTradingProfit}`,
);
const simScenario = simulateScenario(baseClub, {
  incomings: [{ fee: 200, weeklyWage: 500_000, contractLength: 5 }],
}, "PL_DOMESTIC");
check("simulateScenario raises SCR", simScenario.after.scr > simScenario.before.scr);
check(
  "order independence (in then out == folded)",
  approx(
    applyScenario(baseClub, {
      incomings: [{ fee: 60, weeklyWage: 0, contractLength: 5 }],
      outgoings: [{ saleFee: 20, shedWeeklyWage: 0, remainingBookValue: 5 }],
    }).annualAmortisation,
    120 + 12,
  ),
);

// --- UEFA 3-year disposal averaging (Art. 93.04) ---------------------------
console.log("\nUEFA disposal proration (36 months / 3):");
check(
  "3-year average of [30, 60, 90] = 60",
  approx(uefaProratedDisposalProfit(30, [60, 90]), 60),
  `got ${uefaProratedDisposalProfit(30, [60, 90])}`,
);
check(
  "window caps at 3 seasons (ignores the 4th)",
  approx(uefaProratedDisposalProfit(30, [60, 90, 999]), 60),
);
check(
  "fewer than 3 seasons ⇒ average of what exists ([40,20] => 30)",
  approx(uefaProratedDisposalProfit(40, [20]), 30),
);
check(
  "no priors ⇒ single-season value unchanged",
  approx(uefaProratedDisposalProfit(50, []), 50),
);

// A club that sold a star THIS year (lumpy) but little before: averaging bites.
const lumpyUefa: ClubState = {
  estimatedRevenue: 300,
  annualWages: 190,
  annualAmortisation: 40,
  agentFees: 10,
  netPlayerTradingProfit: 120, // one-off star sale
  priorNetPlayerTradingProfits: [0, 0], // nothing the prior two years
  isPlayingInEurope: true,
};
const lumpySingle = computeScr({ ...lumpyUefa, priorNetPlayerTradingProfits: undefined }, "UEFA");
const lumpyAvg = computeScr(lumpyUefa, "UEFA");
check(
  "UEFA disposal averaging applied flag set",
  lumpyAvg.disposalAveragingApplied === true,
);
check(
  "averaged disposal = 120/3 = 40",
  approx(lumpyAvg.disposalProfitUsed, 40),
  `got ${lumpyAvg.disposalProfitUsed}`,
);
check(
  "averaging shrinks the denominator ⇒ HIGHER SCR than single-year",
  lumpyAvg.scr > lumpySingle.scr,
  `avg ${lumpyAvg.scr} vs single ${lumpySingle.scr}`,
);
check(
  "single-year denom = 300+120 = 420 ⇒ SCR 240/420",
  approx(lumpySingle.scr, 240 / 420),
  `got ${lumpySingle.scr}`,
);
check(
  "averaged denom = 300+40 = 340 ⇒ SCR 240/340",
  approx(lumpyAvg.scr, 240 / 340),
  `got ${lumpyAvg.scr}`,
);
check(
  "PL track ignores averaging (single-season disposal)",
  approx(computeScr(lumpyUefa, "PL_DOMESTIC").disposalProfitUsed, 120),
);

// --- PL rolling red threshold (multi-year allowance) -----------------------
console.log("\nPL rolling red threshold:");
check(
  "10pp overage erodes red 115% -> 105%",
  approx(rollPlRedThreshold(0.95, 1.15), 1.05),
  `got ${rollPlRedThreshold(0.95, 1.15)}`,
);
check(
  "5pp underspend replenishes red 105% -> 110%",
  approx(rollPlRedThreshold(0.8, 1.05), 1.1),
  `got ${rollPlRedThreshold(0.8, 1.05)}`,
);
check(
  "red threshold never rises above the 115% ceiling",
  approx(rollPlRedThreshold(0.5, 1.15), 1.15),
);
check(
  "red threshold floors at the 85% green line",
  approx(rollPlRedThreshold(1.6, 1.0), 0.85),
);
check(
  "fold two overspends: 115 -10 -10 = 95%",
  approx(foldPlRedThreshold([0.95, 0.95]), 0.95),
  `got ${foldPlRedThreshold([0.95, 0.95])}`,
);

// A club at 100% SCR: fine under a fresh 115% red, but sanctioned once the
// rolling red has eroded below 100%.
const yellowClub: ClubState = { ...baseClub, annualWages: 340 }; // 96% base... push to 100%
const at100: ClubState = { ...baseClub, annualWages: 360 }; // costs 500 => 100%
check("club sits at 100% SCR", approx(computeScr(at100, "PL_DOMESTIC").scr, 1.0));
check(
  "100% is YELLOW under a fresh 115% red",
  computeScr(at100, "PL_DOMESTIC").zone === "YELLOW",
);
check(
  "100% is RED once rolling red has fallen to 95%",
  computeScr({ ...at100, plRedThreshold: 0.95 }, "PL_DOMESTIC").zone === "RED",
);
check(
  "dynamic red is reported in the result",
  approx(computeScr({ ...at100, plRedThreshold: 0.95 }, "PL_DOMESTIC").redLimit, 0.95),
);
void yellowClub;

// --- Summary ---------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
