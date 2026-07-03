# EPL Trade Machine — Project System Prompt

A consumer-facing "trade machine" for English Premier League football finance.
Fans configure hypothetical transfers and instantly see whether a club stays
compliant with squad-spending regulations, mirroring how NBA fans use a salary
trade machine — but built on football's Squad Cost Ratio (SCR) mechanics.

## Technology Stack
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript
- **State Management:** React local state (`useState`) for the MVP
- **Data:** Static mock JSON (`src/data/clubs.json`) — no backend yet

## Architecture Principle (important for the future mobile app)
- The financial engine (`src/utils/financialEngine.ts`) MUST be **pure,
  framework-agnostic TypeScript** with no React/Next imports. This is the
  product's core and must be reusable unchanged in a future React Native / Expo
  mobile app. Keep all UI concerns out of it.

## Core Football Financial Rules (verified, 2026/27 season)
Sources: Premier League (approved 21 Nov 2025, live from 2026/27) and UEFA
Club Licensing & Financial Sustainability Regulations 2025 (Article 94).

### Squad Cost Ratio (SCR) formula
`SCR = Squad Costs / (Football Revenue + Net Profit on Player Sales)`
- **Squad Costs** = Player & head-coach wages + transfer amortisation/impairment
  + agent/intermediary fees.
- **Excluded from Squad Costs:** academy players, women's team, non-playing
  staff, assistant coaches.

### Thresholds
- **Premier League domestic track:** Green Threshold **85%**. Red Threshold
  **115%**. Between 85–115% = "luxury levy" zone (financial surcharge, no
  sporting sanction). Above 115% = sporting sanction.
- **UEFA / European track:** strict **70%** ceiling (permanent from 2025/26,
  phased 90% → 80% → 70%). Breach = fine proportional to the overage. A club in
  Europe is bound by BOTH the UEFA 70% and PL 85% limits — the 70% is the
  stricter, binding constraint.

### Assessment period & multi-year mechanics (verified — get these exact)
- **UEFA disposal averaging (Art. 93.04):** the numerator (wages + amortisation
  + agent fees) and revenue are single 12-month figures, but the **net player-
  disposal-profit term in the denominator is the 36-month aggregate prorated to
  12 months — i.e. a rolling 3-season average.** This smooths lumpy player sales.
  Implemented in `uefaProratedDisposalProfit()`; data supplies prior-year
  disposals via `ClubYear.priorNetTradingProfits` / `ClubState.priorNetPlayer
  TradingProfits`. Fewer than 3 seasons ⇒ average of what exists.
- **PL rolling red threshold (2026/27 multi-year allowance):** the SCR ratio is
  single-season, but the **red threshold is dynamic**: it starts at 115% and each
  season's prior overage above the 85% green line erodes it (underspend below
  green replenishes it), bounded to [85%, 115%]. Implemented in
  `rollPlRedThreshold()` / `foldPlRedThreshold()`; the forward planner threads it
  across the three projected seasons and reports erosion via `BufferStatus`.
- **Agent fees are period-matched:** each fiscal year uses the FA intermediary-
  fee window that overlaps it (FY24/25 → 2024/25 Feb–Feb window; FY25/26 → the
  2025/26 window). The FA window (Feb–Feb) still ≠ the 30-Jun fiscal year.

### Sanction model (PL Red Threshold breach)
- Fixed **−6 points**, **+1 additional point for every £6.5m** spent above the
  Red Threshold.

### Amortisation rule
- Annual amortisation = Transfer Fee / Contract Length, with contract length
  **capped at a maximum of 5 years** for amortisation purposes.

### Academy / pure-profit rule
- Academy (homegrown) players carry ~£0 remaining book value, and their wages
  are excluded from the numerator. A sale is therefore ~100% "pure profit"
  added directly to Net Profit on Player Sales.

### Engineering guardrails
- **Net Profit on Player Sales can be negative** (a club that buys more than it
  sells). The denominator `Revenue + NetTradingProfit` can therefore shrink.
  The engine must guard against divide-by-zero / near-zero denominators and
  flag the condition rather than returning an absurd ratio.
- All monetary values inside the engine are in **£ millions**. Player weekly
  wages in the data are in absolute £ and converted at the boundary.

## Build & Test Commands
- Install deps: `npm install`
- Run dev server: `npm run dev`
- Build project: `npm run build`
- Run engine tests: `npx tsx src/utils/financialEngine.test.ts`
- Forward planner tests: `npx tsx src/utils/forwardPlanner.test.ts`

## Forward Planner (src/utils/forwardPlanner.ts — pure TS)
Six windows — W1 Sum 26, W2 Jan 27, W3 Sum 27, W4 Jan 28, W5 Sum 28,
W6 Jan 29 (odd = summer, even = January; helpers windowSeason /
isJanuaryWindow / windowYearOffset are index-derived). Seasons projected:
2026/27, 2027/28, 2028/29. Modelling assumptions:
- January deals book HALF a season of wages & amortisation in their first
  season, full weight thereafter. W3 business first hits 2027/28.
- Base wages persist across seasons (renewal assumption); base amortisation
  ROLLS OFF as existing contracts end (derived from per-player contract facts).
- Sale profit = fee − book value at the moment of sale (book value keeps
  amortising, so later sales book less profit). Profit books once, in the
  sale's landing season. Projected seasons use PLAN-ONLY trading profit — the
  base year's booked profit stays in its own fiscal year.
- Revenue grows at a user-set % per season. European participation is a
  per-season TIER (NONE / UCL / UEL_UECL): any UEFA tier binds the 70% rule;
  revenue shifts by EUROPE_TIER_REVENUE[tier] − [base year's tier] (UCL £85m,
  UEL/UECL £35m — flagged estimates, never double-counting the base year).
  ClubYear.europeTier records which competition each base year's revenue
  already includes (yearEuropeTier() derives a safe default).
- PL multi-year allowance modelled as 30pp of cumulative overage above 85%.
- `solveMaxBid` inverts the SCR (linear in fee) for the largest compliant fee
  across ALL projected seasons; `encodeScenario`/`decodeScenario` is the
  base64url share-link codec (also used by localStorage saved plans).

## Loans (forwardPlanner.ts — LoanOut / LoanIn)
- Loan OUT: borrower covers `wageCoveredPct` of the wage; loan fee received is
  DENOMINATOR income spread over the loan's seasons (not disposal profit);
  amortisation stays on our books during the loan. Executed buy clause
  (obligation, or option with assumeExercised) books a sale at
  book-value-at-that-date in the season AFTER the loan (loanBuySeason).
- Loan IN: we pay `wageSharePct` of the wage; loan fee paid is a squad cost
  (booked within amortisation, spread over the loan). Executed buy starts a
  normal signing (price amortised over min(contract, 5)).
- 1- or 2-season loans; January loans carry 0.5 first-season weight
  (loanSeasonWeights). A player in `sales` can't also be loaned (sale wins).

## Squad value & lineups
- `squadMarketValueAfter()` (forwardPlanner.ts): owned-squad market value
  through a window; signings join at user-entered MV (default fee), loanees
  stay ours until an executed buy. Static estimates, no aging curve.
- `src/utils/lineups.ts` (pure): 6 formations with %-coordinate slots,
  slotFit (GK hard, off-position soft), placeInSlot swap logic, reshape,
  sanitize. UI: `src/components/LineupBuilder.tsx` (EA FC-style pitch,
  drag-and-drop, tiered cards). Lineup is stored in SharedScenario.

## Deferred features
See `FEATURE_BACKLOG.md` for what's shipped and what's next (multiple
lineups, per-window value chips, aging curves). Keep all future
lineup/market-value math pure (mobile port).
