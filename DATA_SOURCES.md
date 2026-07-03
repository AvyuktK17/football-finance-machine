# Data sourcing methodology

Accuracy is the point of this project, so every number is tiered by how it was
obtained and carries its source in `src/data/clubs.ts`. This document explains
the method and its hard limits.

## Reliability tiers

| Tier | Meaning | Example fields |
|------|---------|----------------|
| **primary** | Read from an audited annual report or official club release | Revenue, player amortisation, profit on player sales |
| **derived** | Computed from published inputs | Per-player book value = fee ÷ contract length × years remaining |
| **estimate** | Reputable third-party estimate | Player wages (Capology), market values (Transfermarkt), forward-year projections |
| **placeholder** | Provisional, NOT verified — do not trust | The five non-Tottenham clubs, pending their verification pass |

## What is and isn't verifiable

**Verifiable to primary sources (club level):** total revenue, player
amortisation/impairment, profit on disposals, and the football wage bill are all
disclosed in audited accounts.

**Needs a documented adjustment:**
- *SCR playing wage.* The SCR numerator wants players + head coach only. Clubs
  disclose a football wage bill (broader) and a total group staff cost (broader
  still — stadium, hospitality, retail). We use the football wage bill as the
  closest published figure and flag the gap. (Tottenham FY24/25: football wage
  bill £256m; total group staff £402m.)
- *Agent fees.* The FA publishes per-club intermediary fees annually, but over a
  Feb–Feb window that does not align with clubs' fiscal years. Treated as a
  ±1-window approximation.

**Not verifiable anywhere (player level):** no club discloses per-player wages or
per-player book values — only aggregate registration value. So the Clearing
House player layer is inherently estimate-based for *every* club. We use
Capology (wages) + Transfermarkt (market values), and derive book values from
reported fees and contract lengths.

## Licensed-data feasibility (assessed)

- **Transfermarkt** has no official public API. Third-party scrapers exist
  (Apify ~$1/1k records, ScrapingBee from $49/mo) but scraping may breach ToS.
- **Capology** offers a documented salaries/finances API — the most viable
  licensed route for wages; commercial pricing is quote-based.
- **football-data.org / API-Football / Goalserve** cover fixtures/scores/stats,
  not salaries or valuations.
- **StatsBomb / Football Benchmark** are enterprise event/benchmarking feeds,
  opaque pricing, not per-player wage/value sources.

**Conclusion:** there is no cheap turnkey licensed feed covering both wages and
market values. Path forward: for the MVP, use Transfermarkt + Capology as
clearly-labelled estimates; if the project commercialises, license the Capology
API for wages and negotiate Transfermarkt for values.

## Gold-standard reference: Tottenham FY2024/25 (audited, year ended 30 Jun 2025)

| Figure | Value | Tier | Source |
|--------|-------|------|--------|
| Revenue + other income | £565.3m | primary | THFC official results |
| Football wage bill | £256m | primary | FY25 accounts (Swiss Ramble) |
| Player amortisation | £142m | primary | FY25 accounts (Swiss Ramble) |
| Profit on player sales | £53m | primary | FY25 accounts |
| Agent/intermediary fees | £21.3m | primary | FA (Feb25–Feb26 window) |

Resulting SCR ≈ (256 + 142 + 21.3) / (565.3 + 53) ≈ **68%** — compliant, but
close to the UEFA 70% ceiling, which is the binding constraint for a club in
Europe.

FY2025/26 is an **estimate** (audited accounts not published until ~2027),
projecting Champions League revenue uplift and the 2025 summer signings.

## Next steps for the other five clubs

Repeat the Tottenham pass: pull each club's latest audited accounts (revenue,
amortisation, wage bill, disposals) + FA agent fees, then a labelled FY25/26
estimate. Agent fees already public: Chelsea £65.1m, Aston Villa £38.4m, Man
City £37.4m, Liverpool £33.8m, Arsenal £32.1m, Man Utd £31.7m (FA, 2025/26).
