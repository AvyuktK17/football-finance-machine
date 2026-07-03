# Feature Backlog

## ✅ Shipped 2 Jul 2026
- **Loans in/out** — loan fee, wage split with parent club, option/obligation
  to buy (options can be "assumed exercised"), 1- or 2-season loans, January
  pro-rating. Accounting: loan-out fee = denominator income spread over the
  loan; loaned-out player's amortisation stays on our books; executed buys
  book a sale at book-value-at-that-date in the season after the loan.
  Loan-in fee = squad cost; we pay our wage share; executed buys start a
  normal amortised signing. See `forwardPlanner.ts` (LoanOut/LoanIn).
- **Squad market value tracking** — `squadMarketValueAfter()`; UI shows
  now → after active window → end of plan. Signings carry a user-entered
  market value (defaults to fee). Loanees stay ours until bought.
- **Draft lineup builder** — EA FC-inspired: vertical striped pitch, tiered
  cards (gold ≥£60m / silver ≥£25m / bronze), 6 formations (4-3-3, 4-4-2,
  4-2-3-1, 3-5-2, 3-4-3, 5-3-2), drag-and-drop + click-to-place, auto-fill
  best XI, GK hard-validation, out-of-position warnings, XI value. Pure math
  in `src/utils/lineups.ts`; UI in `src/components/LineupBuilder.tsx`.
  Lineup persists in saved plans and share links.

## Ideas / next up
- Multiple named lineups per plan (currently one).
- Real player photos/kits on cards; club-coloured card frames.
- Per-window squad-value chips directly on the window tabs.
- Loan-in market value used in a "value gained vs money spent" efficiency stat.
- Depreciation/appreciation curves for market values by age (needs age data).

## Notes
- Market values are Transfermarkt-style **estimates** — keep the reliability
  badge convention when surfacing totals.
