# EPL Trade Machine — Handoff

Snapshot for resuming in a new chat. Date of this handoff: 2 Jul 2026.

## What this is
A consumer web app (later mobile) that simulates Premier League transfers against
football's **Squad Cost Ratio (SCR)** regulations — a "trade machine" for football
finance. Build fans a sandbox: pick a club, plan signings + sales, watch the
projected SCR move against the compliance thresholds.

## Where it lives / how to run
- Project root: `Football Finance Machine/epl-trade-machine/`
- Stack: Next.js 16 (App Router), React 19, Tailwind v4, TypeScript.
- Run: `cd "…/Football Finance Machine/epl-trade-machine" && npm install && npm run dev` → http://localhost:3000
  (Reinstall deps on a new machine — node_modules was installed in a Linux sandbox; you're on macOS.)
- Engine tests: `npx tsx src/utils/financialEngine.test.ts` and `…/clearingHouse.test.ts`
- Typecheck: `npx tsc --noEmit`

## Verified rules (2026/27) — in `CLAUDE.md`
- **SCR = (wages + amortisation + agent fees) / (revenue + net profit on player sales)**
- **Premier League**: green ≤ 85%, red ≥ 115% (between = luxury levy, no points).
  Red breach = **−6 points + 1 per £6.5m over red**. 30% multi-year buffer exists.
- **UEFA**: hard **70%** ceiling (binding for clubs in Europe). Breach = fine.
- Amortisation = fee ÷ contract length (max 5 yrs). Academy players: £0 book value,
  sale = 100% pure profit.

## Architecture (keep this discipline)
- `src/utils/financialEngine.ts` — PURE, framework-agnostic SCR math. No React.
  Key exports: `computeScr`, `applyTransfers`, `applyScenario`, `simulateScenario`,
  `classify`, `RULES`. Handles multi-transfer plans + negative-denominator guard.
- `src/utils/clearingHouse.ts` — PURE knapsack solver: which players to sell to get
  under the limit. Exact brute-force over subsets. Plan-aware.
- These two files must stay React-free so they port unchanged to a future
  React Native / Expo mobile app.
- `src/data/clubs.ts` — provenance-first dataset (see below).
- `src/app/page.tsx` — dashboard UI (client component).
- `DATA_SOURCES.md` — full sourcing methodology + reliability tiers.

## Data model (`src/data/clubs.ts`)
- Every club figure is a `Sourced` value: `{ value, reliability, source, sourceUrl?, note? }`.
- Reliability tiers: `primary` (audited accounts), `derived` (computed from published
  inputs), `estimate` (Transfermarkt/Capology), `placeholder` (unverified).
- Players stored by **contract facts** (`fee`, `signedYear`, `contractEndYear`); book
  value is DERIVED at a stated season via `bookValueAt(player, year)`. This is why the
  "which year?" question always has an answer and sets up multi-season planning.
- Each club has `years[]` (e.g. FY24/25 audited + FY25/26 estimate), `squadAsOf` stamp,
  `players[]`, `playersProvenance`.

## Current state — DONE
Features:
- SCR engine + tests (39 tests total across both suites, all passing).
- Dashboard: club sidebar, regulatory-track toggle (Auto/UEFA/PL), big colour-coded
  SCR bar with 70/85/115 markers, points-deduction banner.
- **Multiple incoming signings** (add/remove) + **outgoing sales** (toggle from squad).
- **Full scrollable squad list** with per-player wage / derived book value / market value
  and a season "as-of" stamp.
- **Clearing House** feature ("Simulate Clearing the Books"), plan-aware.
- Per-figure provenance panel with clickable sources + reliability badges.

Data — all 6 clubs have VERIFIED FY24/25 financials + FY25/26 estimates:
| Club | FY24/25 SCR | Squad status |
|------|-------------|--------------|
| Tottenham | 67.8% (green, UEFA) | ✅ full Transfermarkt roster (37) |
| Chelsea | 108.7% | ✅ full Transfermarkt roster (39) |
| Man City | 78.0% | ⚠ placeholder sample (5) |
| Arsenal | 71.9% | ⚠ placeholder sample (5) |
| Liverpool | 76.7% | ⚠ placeholder sample (5) |
| Man United | 75.6% | ⚠ placeholder sample (5) |

Verified FY24/25 club aggregates (£m), all from audited accounts / official releases
(cross-checked with Swiss Ramble); agent fees from the FA:
- **Tottenham**: rev 565.3, wages 256, amort 142, sales 53, agents 21.3
- **Chelsea**: rev 490.9, wages 312.8, amort+impair 224, sales 58, agents 60
- **Man City**: rev 694, wages 408, amort 170, sales 95.2, agents 37.4
- **Arsenal**: rev 691, wages 346.8, amort+impair 176.6, sales 82, agents 32.1
- **Liverpool**: rev 703, wages 428, amort 117, sales 52, agents 33.8
- **Man United**: rev 666.5, wages 313, amort 196, sales 48.7, agents 31.7

## NEXT STEPS (in priority order)
1. **Full Transfermarkt rosters for Man City, Arsenal, Liverpool, Man United** — same
   process used for Spurs/Chelsea (details below). Promotes their squads from
   placeholder to derived.
2. **Forward planning (parked feature)**: plan across the next 3 transfer windows with
   incomings/outgoings per window, and project club financials under 3 European
   scenarios (Champions League / Europa-Conference / no Europe), user-selectable per
   season. The `bookValueAt(player, year)` model + per-year `ClubYear` structure is
   already built to support this — book values roll down automatically each season.
3. Optional: live FX instead of fixed €/£ = 1.16; Capology license for real wages.

## How to pull a Transfermarkt roster (repeatable recipe)
- Apify actor: `jungle_synthesizer/transfermarkt-global-football-player-scraper`
  (the `solidcode/...` club-squad actor FAILED on club pages — don't use it).
- Call with `{ clubIds: ["<id>"], maxItems: 45 }`. Club IDs: Man City 281,
  Arsenal 11, Liverpool 31, Man Utd 985. (Spurs 148, Chelsea 631 already done.)
- Fetch fields: `display_name, position, contract_until, market_value_eur, career_history`.
- Parse: the acquisition into the club = the career_history entry `X -> <Club> | date | €fee`
  (skip loan round-trips and own-U21 rows). fee €→£ at /1.16. signedYear = year of that
  date; contractEndYear = year of `contract_until`; academy = joined via club's own youth
  (fee 0). Wages aren't in TM — use estimates (there's a wage heuristic + override map in
  the generator approach).
- Then splice into the club's `players: [...]` in `src/data/clubs.ts` and flip
  `squadAsOf.reliability` to `derived`.
- Sanity check: Σ derived book values should roughly match the club's disclosed
  intangible-asset NBV (Spurs ~£494m, Chelsea ~£816m validated this way).

## Gotchas / environment notes
- The mounted (FUSE) folder can't delete Next's `.next` temp files → `npm run build`
  errors there. Build a copy in `/tmp` OR just rely on `tsc --noEmit` + tests. On the
  user's real machine `npm run build` works fine.
- Sandbox occasionally can't reach `registry.npmjs.org` during `next build` (transient);
  `tsc --noEmit` needs no network and is the reliable verifier here.
- Default `create-next-app` uses `next/font/google` (Geist) which fails offline —
  already swapped for a system font stack in `src/app/layout.tsx`. Keep it.

## Key sourcing lessons (accuracy is the project's north star)
- Don't trust the ChatGPT-drafted `Tottenham_..._Simulator.xlsx` numbers — template only.
- Secondary summaries conflate figures (e.g. a search returned Spurs "staff £403m" =
  total GROUP staff, vs £256m football wage bill; SCR wants players+coach only). Always
  read the audited note / a reliable analyst (Swiss Ramble) not a headline.
- Player wages & per-player book values are NOT disclosed by any club — always estimates.
- No cheap licensed feed covers both wages + values. Transfermarkt has no official API
  (used via Apify); Capology has a quote-based salaries API (best future route for wages).

## Persistent memory
Two memory files already capture this (auto-loaded if same workspace):
`epl-trade-machine-project.md` and `epl-data-sourcing-method.md`. If the new chat is a
fresh space, point it at this HANDOFF.md.
