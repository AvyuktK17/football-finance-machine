# Feature Backlog

## ✅ Shipped 3 Jul 2026
- **Club accent colours** — `src/data/clubColors.ts`; strip on club cards,
  header gradient + club dot, result-card top strip. Accents live only on
  non-semantic chrome; compliance zones keep green/amber/red exclusively.
- **Club selection upgrades** — search box, sort (Best SCR / Headroom / A–Z),
  headroom on cards, and a **League table view** (sortable compliance table,
  click a row to start planning).
- **Zone-crossing feedback** — toast + one-shot pulse on the SCR meter when
  the plan (not a club/season switch) moves projected SCR across a line.
- **Sale-price guardrails** — "mkt £Xm" hint on every sale row; fee > 2×
  market value turns the input amber with a bidding-war caveat. Shared
  `MoneyInput` gives every typed money field one consistent style.
- **Shareable result card** — compliance headline is now a screenshot-ready
  card: club colour strip + name, SCR before→after, zone, headroom, squad
  value, key-move chips (top 5), branding footer.
- **Wage policy (renew vs expire)** — engine-level `wagePolicy` in
  `forwardPlanner.ts`: "renew" (default, wages persist) or "expire" (wage
  drops off the season after contract end; no double-count with sales or
  executed loan-out buys). UI toggle in assumptions; round-trips through
  share links & saves. +8 engine tests (241 total).
- Stepper `reached` guard fixed (compliance needs ≥1 move); 9px labels → 10px.

## Parked (waiting on data)
- **Player picker for signings** — pick real transfer targets from our own
  dataset (prefill fee/position/wage). Parked until the database covers the
  big-5 European leagues + Eredivisie, Liga NOS, Scottish PL and a couple of
  South American leagues; with EPL-only data — and real fees diverging widely
  from Transfermarkt values — free-text entry stays primary.

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
