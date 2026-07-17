/**
 * clubs.ts — provenance-first club dataset.
 *
 * Every club-level figure carries its own value, reliability tag, and source
 * so nothing appears in the UI without traceable provenance.
 *
 * Reliability tiers (see DATA_SOURCES.md):
 *   primary     — audited annual report / official club release.
 *   derived     — computed from published inputs (fee ÷ contract length).
 *   estimate    — reputable third-party estimate (Transfermarkt / Capology).
 *   placeholder — provisional, NOT verified. Do not trust.
 *
 * Player book values are DERIVED from contract facts (fee, signed year,
 * contract-end year) as of a stated season — so the "which year is this?"
 * question always has an answer, and values roll down correctly across future
 * seasons for multi-window planning.
 */

import type { ClubState } from "@/utils/financialEngine";
import type { SellablePlayer } from "@/utils/clearingHouse";
import type { EuropeTier } from "@/utils/forwardPlanner";
import { CLUBS_BUNDESLIGA } from "./clubs_bundesliga";
import { CLUBS_LALIGA } from "./clubs_laliga";
import { CLUBS_LIGUE1 } from "./clubs_ligue1";
import { CLUBS_SERIEA } from "./clubs_seriea";

export type Reliability = "primary" | "derived" | "estimate" | "placeholder";
export type VerificationStatus = "verified" | "estimate" | "provisional";
export type Position = "GK" | "DF" | "MF" | "FW";

export interface Sourced {
  value: number; // £m unless noted
  reliability: Reliability;
  source: string;
  sourceUrl?: string;
  note?: string;
}

export interface ClubYear {
  id: string;
  label: string;
  status: VerificationStatus;
  revenue: Sourced;
  netPlayerTradingProfit: Sourced;
  /**
   * Net player-disposal profit for the PRIOR seasons (most-recent-first, e.g.
   * [T-1, T-2], £m). Feeds the UEFA 3-year (36-month prorated) disposal average
   * — see Article 93.04(b). Only consumed when the club is in Europe that year;
   * omit for clubs never in Europe or where prior figures aren't reliably known.
   */
  priorNetTradingProfits?: number[];
  wages: Sourced;
  amortisation: Sourced;
  agentFees: Sourced;
  isPlayingInEurope: boolean;
  /** Which UEFA competition this year's revenue already reflects. */
  europeTier?: EuropeTier;
  /**
   * Final PREMIER LEAGUE position this fiscal year's revenue reflects (1–20).
   * Anchors the position-based prize-money delta in the forward planner.
   * Omit for non-EPL seasons (e.g. a promoted club's Championship year).
   */
  leaguePosition?: number;
}

/** The European tier a ClubYear's revenue already includes (safe default). */
export function yearEuropeTier(y: ClubYear): EuropeTier {
  return y.europeTier ?? (y.isPlayingInEurope ? "UCL" : "NONE");
}

/**
 * A player stored by contract facts. Book value is derived, not stored, so it
 * is always tied to a specific "as of" season.
 */
export interface Player {
  name: string;
  position: Position;
  /** absolute £/week — Capology-style estimate */
  weeklyWage: number;
  /** £m — Transfermarkt-style market/sale value estimate */
  marketValue: number;
  /** £m — reported transfer fee (0 for academy/free) */
  fee: number;
  /** fiscal year the player was signed (Jun year-end) */
  signedYear: number;
  /** fiscal year the current contract ends */
  contractEndYear: number;
  isAcademy: boolean;
}

export interface SquadAsOf {
  year: number; // fiscal year-end the book values are computed at
  label: string;
  reliability: Reliability;
  note: string;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  league: string;
  years: ClubYear[];
  defaultYearId: string;
  squadAsOf: SquadAsOf;
  players: Player[];
  playersProvenance: { source: string; sourceUrl?: string; note: string };
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/** Straight-line accounting book value at a given fiscal year-end. */
export function bookValueAt(p: Player, asOfYear: number): number {
  if (p.isAcademy || p.fee <= 0) return 0;
  const life = Math.max(1, p.contractEndYear - p.signedYear);
  const remaining = Math.max(0, Math.min(life, p.contractEndYear - asOfYear));
  return Math.round((p.fee * remaining) / life * 10) / 10;
}

/** Map a Player to the Clearing-House SellablePlayer at a given season. */
export function toSellable(p: Player, asOfYear: number): SellablePlayer {
  return {
    name: p.name,
    weeklyWage: p.weeklyWage,
    remainingBookValue: bookValueAt(p, asOfYear),
    marketValue: p.marketValue,
    isAcademy: p.isAcademy,
  };
}

// ---------------------------------------------------------------------------
// Tottenham Hotspur — VERIFIED gold standard
// ---------------------------------------------------------------------------

const TOTTENHAM: Club = {
  league: "EPL",
  id: "tottenham",
  name: "Tottenham Hotspur",
  shortName: "Tottenham",
  defaultYearId: "fy2425",
  squadAsOf: {
    year: 2026,
    label: "Squad as of 30 Jun 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. First-team wages sourced from Spotrac 2025/26 gross weekly salaries (Jul 2026; mirror Capology); fringe/academy & departed-player wages remain rough estimates. Departed players (e.g. Bissouma, Veliz) excluded; incoming summer-2026 signings (van Hecke, Senesi, Robertson) included.",
  },
  years: [
    {
      id: "fy2425",
      leaguePosition: 17,
      label: "FY2024/25 (audited)",
      status: "verified",
      isPlayingInEurope: true,
      europeTier: "UEL_UECL", // Europa League 2024/25 (won it)
      // FY23/24 £82m, FY22/23 £16m — feeds UEFA 3-year disposal average.
      priorNetTradingProfits: [82, 16],
      revenue: {
        value: 565.3,
        reliability: "primary",
        source: "THFC official results, year ended 30 Jun 2025 (revenue + other income)",
        sourceUrl: "https://www.tottenhamhotspur.com/news/1018039/financial-results-year-ended-30-june-2025",
      },
      netPlayerTradingProfit: {
        value: 53,
        reliability: "primary",
        source: "Profit on disposal of player registrations, FY25 accounts (Skipp, Emerson Royal, Rodon, Højbjerg)",
        sourceUrl: "https://swissramble.substack.com/p/tottenham-hotspur-finances-202425",
      },
      wages: {
        value: 256,
        reliability: "primary",
        source: "Football wage bill, FY25 accounts (up from £222m)",
        sourceUrl: "https://swissramble.substack.com/p/tottenham-hotspur-finances-202425",
        note: "Football wage bill as disclosed. Total GROUP staff cost was £402m (incl. stadium/hospitality/retail); SCR wants players+head coach only — £256m is the closest published figure.",
      },
      amortisation: {
        value: 142,
        reliability: "primary",
        source: "Player amortisation, FY25 accounts (up from £136m); impairment negligible",
        sourceUrl: "https://swissramble.substack.com/p/tottenham-hotspur-finances-202425",
      },
      agentFees: {
        value: 18.4,
        reliability: "primary",
        source: "FA published intermediary fees, 2 Feb 2024 – 3 Feb 2025 (period-matched to FY24/25)",
        sourceUrl: "https://www.thefa.com/news/2025/apr/14/payments-and-transactions-140425",
        note: "Actual 2024/25 FA window (£18,429,639). Feb–Feb window ≠ 30-Jun fiscal year.",
      },
    },
    {
      id: "fy2526e",
      leaguePosition: 17,
      label: "FY2025/26 (estimate)",
      status: "estimate",
      isPlayingInEurope: true,
      europeTier: "UCL", // Champions League 2025/26 (revenue estimate includes it)
      // FY24/25 £53m, FY23/24 £82m — feeds UEFA 3-year disposal average.
      priorNetTradingProfits: [53, 82],
      revenue: {
        value: 650,
        reliability: "estimate",
        source: "Projection: FY25 £565m + Champions League uplift (prize €84m ≈ £72m vs £34.7m Europa, plus CL matchday & commercial halo)",
        sourceUrl: "https://swissramble.substack.com/p/uefa-competitions-revenue-202526",
        note: "Estimate; audited FY26 accounts not yet published (~early 2027).",
      },
      netPlayerTradingProfit: {
        value: 20,
        reliability: "estimate",
        source: "Projection: FY26 sales raised c.£36.5m gross; modest book profit vs FY25's £53m",
      },
      wages: {
        value: 300,
        reliability: "estimate",
        source: "Projection: FY25 £256m + Champions League bonuses + Simons/Kudus/Palhinha/Kolo Muani wages",
      },
      amortisation: {
        value: 165,
        reliability: "estimate",
        source: "Projection: FY25 £142m + amortisation on 2025 signings net of roll-off",
      },
      agentFees: {
        value: 21.4,
        reliability: "estimate",
        source: "FA intermediary fees Feb 2025–Feb 2026 (£21,384,701; covers windows falling in FY26)",
        sourceUrl: "https://www.thefa.com/news/2026/apr/01/agent-fees-and-transactions",
      },
    },
  ],
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/tottenham-hotspur/transfers/verein/148/saison_id/2025",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
    { name: "Guglielmo Vicario", position: "GK", weeklyWage: 75000, marketValue: 15.5, fee: 15.9, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Antonin Kinsky", position: "GK", weeklyWage: 30000, marketValue: 12.9, fee: 14.2, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
    { name: "Martin Dubravka", position: "GK", weeklyWage: 25000, marketValue: 0.4, fee: 0, signedYear: 2026, contractEndYear: 2028, isAcademy: false },
    { name: "Brandon Austin", position: "GK", weeklyWage: 15000, marketValue: 0.4, fee: 0, signedYear: 2021, contractEndYear: 2029, isAcademy: true },
    { name: "Luka Vuskovic", position: "DF", weeklyWage: 105000, marketValue: 51.7, fee: 9.5, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Micky van de Ven", position: "DF", weeklyWage: 90000, marketValue: 43.1, fee: 34.5, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
    { name: "Jan Paul van Hecke", position: "DF", weeklyWage: 85000, marketValue: 38.8, fee: 51.7, signedYear: 2026, contractEndYear: 2032, isAcademy: false },
    { name: "Cristian Romero", position: "DF", weeklyWage: 195000, marketValue: 38.8, fee: 46.4, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
    { name: "Marcos Senesi", position: "DF", weeklyWage: 55000, marketValue: 21.6, fee: 0, signedYear: 2026, contractEndYear: 2029, isAcademy: false },
    { name: "Kevin Danso", position: "DF", weeklyWage: 65000, marketValue: 17.2, fee: 21.6, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Radu Dragusin", position: "DF", weeklyWage: 85000, marketValue: 13.8, fee: 24.1, signedYear: 2024, contractEndYear: 2030, isAcademy: false },
    { name: "Ashley Phillips", position: "DF", weeklyWage: 5000, marketValue: 6, fee: 2, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Kota Takai", position: "DF", weeklyWage: 25000, marketValue: 4.3, fee: 5, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Ben Davies", position: "DF", weeklyWage: 80000, marketValue: 2.6, fee: 10.9, signedYear: 2014, contractEndYear: 2027, isAcademy: false },
    { name: "Destiny Udogie", position: "DF", weeklyWage: 75000, marketValue: 25.9, fee: 15.5, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
    { name: "Djed Spence", position: "DF", weeklyWage: 40000, marketValue: 25.9, fee: 12.7, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
    { name: "Joao Victor", position: "DF", weeklyWage: 25000, marketValue: 10.3, fee: 12.9, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
    { name: "Andrew Robertson", position: "DF", weeklyWage: 35000, marketValue: 6, fee: 0, signedYear: 2026, contractEndYear: 2027, isAcademy: false },
    { name: "Pedro Porro", position: "DF", weeklyWage: 85000, marketValue: 30.2, fee: 34.5, signedYear: 2023, contractEndYear: 2031, isAcademy: false },
    { name: "Rodrigo Bentancur", position: "MF", weeklyWage: 75000, marketValue: 17.2, fee: 16.4, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
    { name: "Archie Gray", position: "MF", weeklyWage: 75000, marketValue: 30.2, fee: 35.6, signedYear: 2024, contractEndYear: 2030, isAcademy: false },
    { name: "Lucas Bergvall", position: "MF", weeklyWage: 60000, marketValue: 30.2, fee: 17.2, signedYear: 2024, contractEndYear: 2031, isAcademy: false },
    { name: "Conor Gallagher", position: "MF", weeklyWage: 160000, marketValue: 27.6, fee: 34.5, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
    { name: "Pape Matar Sarr", position: "MF", weeklyWage: 70000, marketValue: 25.9, fee: 14.6, signedYear: 2022, contractEndYear: 2030, isAcademy: false },
    { name: "Xavi Simons", position: "MF", weeklyWage: 195000, marketValue: 34.5, fee: 56, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "James Maddison", position: "MF", weeklyWage: 170000, marketValue: 17.2, fee: 39.9, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Dejan Kulusevski", position: "MF", weeklyWage: 110000, marketValue: 14.7, fee: 25.9, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Alfie Devine", position: "MF", weeklyWage: 6500, marketValue: 6.9, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: true },
    { name: "Mikey Moore", position: "FW", weeklyWage: 5000, marketValue: 15.5, fee: 0, signedYear: 2024, contractEndYear: 2030, isAcademy: true },
    { name: "Wilson Odobert", position: "FW", weeklyWage: 40000, marketValue: 15.5, fee: 25.3, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Manor Solomon", position: "FW", weeklyWage: 60000, marketValue: 6.9, fee: 0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Mohammed Kudus", position: "FW", weeklyWage: 150000, marketValue: 43.1, fee: 55, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
    { name: "Yang Min-hyeok", position: "FW", weeklyWage: 5000, marketValue: 2.6, fee: 3.4, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Dominic Solanke", position: "FW", weeklyWage: 140000, marketValue: 24.1, fee: 55.4, signedYear: 2024, contractEndYear: 2030, isAcademy: false },
    { name: "Richarlison", position: "FW", weeklyWage: 90000, marketValue: 21.6, fee: 50, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Mathys Tel", position: "FW", weeklyWage: 55000, marketValue: 19, fee: 30.2, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
    { name: "Dane Scarlett", position: "FW", weeklyWage: 15000, marketValue: 1.3, fee: 0, signedYear: 2023, contractEndYear: 2027, isAcademy: true },
  ],
};

// ---------------------------------------------------------------------------
// Chelsea — VERIFIED (the SCR poster child)
// ---------------------------------------------------------------------------

const CHELSEA: Club = {
  league: "EPL",
  id: "chelsea",
  name: "Chelsea",
  shortName: "Chelsea",
  defaultYearId: "fy2425",
  squadAsOf: {
    year: 2026,
    label: "Squad as of 30 Jun 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and fees are Transfermarkt figures (€→£ at 1.16); book values derived from fee ÷ contract length. Chelsea's long contracts (7–8 yrs) keep book values high — central to their SCR pressure. Reece James, Colwill, Chalobah are homegrown (£0 book, pure-profit sales). Cucurella (→ Real Madrid) excluded as departed.",
  },
  years: [
    {
      id: "fy2425",
      leaguePosition: 4,
      label: "FY2024/25 (audited)",
      status: "verified",
      isPlayingInEurope: true,
      europeTier: "UEL_UECL", // Conference League 2024/25 (won it)
      revenue: {
        value: 490.9,
        reliability: "primary",
        source: "Chelsea FC Holdings official results, year ended 30 Jun 2025",
        sourceUrl: "https://www.chelseafc.com/en/news/article/financial-results-for-2024-25",
        note: "Second-highest CFC revenue on record. Swiss Ramble confirms £491m.",
      },
      netPlayerTradingProfit: {
        value: 58,
        reliability: "primary",
        source: "Profit on player sales, FY25 accounts",
        sourceUrl: "https://swissramble.substack.com/p/chelsea-finances-202425",
        note: "FY25's £262m pre-tax loss also reflects the ABSENCE of FY24's one-off £198.7m women's-team sale to parent BlueCo — a related-party PSR mechanism, not player trading.",
      },
      wages: {
        value: 312.8,
        reliability: "primary",
        source: "CFC wage bill, FY25 official release (up from £294.6m)",
        sourceUrl: "https://www.chelseafc.com/en/news/article/financial-results-for-2024-25",
        note: "Official 'wage bill' (wages & salaries). Swiss Ramble's £359m is total staff cost incl. employer social security/pensions. £312.8m is the narrower published figure, consistent with Tottenham's treatment.",
      },
      amortisation: {
        value: 224,
        reliability: "primary",
        source: "Player amortisation £212m + impairment £12m, FY25 accounts",
        sourceUrl: "https://swissramble.substack.com/p/chelsea-finances-202425",
        note: "SCR squad costs include both amortisation and impairment.",
      },
      agentFees: {
        value: 60.4,
        reliability: "primary",
        source: "FA published intermediary fees, 2 Feb 2024 – 3 Feb 2025 (£60,384,449; Chelsea highest in PL)",
        sourceUrl: "https://www.thefa.com/news/2025/apr/14/payments-and-transactions-140425",
        note: "Actual 2024/25 FA window. Feb–Feb window ≠ 30-Jun fiscal year.",
      },
    },
    {
      id: "fy2526e",
      leaguePosition: 10,
      label: "FY2025/26 (estimate)",
      status: "estimate",
      isPlayingInEurope: true,
      europeTier: "UCL", // Champions League 2025/26 (revenue estimate includes it)
      revenue: {
        value: 640,
        reliability: "estimate",
        source: "Projection: FY25 £490.9m + Champions League + FIFA Club World Cup 2025 winnings (Chelsea won it, ~£90m largely recognised in FY26)",
        note: "Estimate; audited FY26 accounts expected ~early 2027.",
      },
      netPlayerTradingProfit: {
        value: 120,
        reliability: "estimate",
        source: "Projection: record PL player sales summer 2025, many high-margin academy/pure-profit disposals",
      },
      wages: {
        value: 340,
        reliability: "estimate",
        source: "Projection: continued squad investment + Champions League bonuses",
      },
      amortisation: {
        value: 240,
        reliability: "estimate",
        source: "Projection: intangibles £1.05bn with £305m new acquisitions in FY25; amortisation rising",
      },
      agentFees: {
        value: 65.1,
        reliability: "estimate",
        source: "FA intermediary fees Feb 2025–Feb 2026 (Chelsea highest in PL at £65.1m)",
        sourceUrl: "https://www.thefa.com/news/2026/apr/01/agent-fees-and-transactions",
      },
    },
  ],
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.co.uk/fc-chelsea/kader/verein/631",
    note: "Estimates. Chelsea's long amortisation periods keep per-player book values high — central to their SCR pressure.",
  },
  players: [
    { name: "Mike Penders", position: "GK", weeklyWage: 10000, marketValue: 21.6, fee: 17.2, signedYear: 2024, contractEndYear: 2032, isAcademy: false },
    { name: "Robert Sanchez", position: "GK", weeklyWage: 60000, marketValue: 19, fee: 19.8, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
    { name: "Filip Jorgensen", position: "GK", weeklyWage: 50000, marketValue: 12.9, fee: 21.1, signedYear: 2024, contractEndYear: 2031, isAcademy: false },
    { name: "Gabriel Slonina", position: "GK", weeklyWage: 40000, marketValue: 2.6, fee: 7.8, signedYear: 2022, contractEndYear: 2028, isAcademy: false },
    { name: "Teddy Sharman-Lowe", position: "GK", weeklyWage: 25000, marketValue: 0.4, fee: 0, signedYear: 2020, contractEndYear: 2028, isAcademy: true },
    { name: "Levi Colwill", position: "DF", weeklyWage: 100000, marketValue: 43.1, fee: 0, signedYear: 2022, contractEndYear: 2029, isAcademy: true },
    { name: "Trevoh Chalobah", position: "DF", weeklyWage: 50000, marketValue: 34.5, fee: 0, signedYear: 2021, contractEndYear: 2028, isAcademy: true },
    { name: "Wesley Fofana", position: "DF", weeklyWage: 200000, marketValue: 24.1, fee: 69.3, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
    { name: "Mamadou Sarr", position: "DF", weeklyWage: 35000, marketValue: 19, fee: 12.1, signedYear: 2025, contractEndYear: 2033, isAcademy: false },
    { name: "Tosin Adarabioyo", position: "DF", weeklyWage: 120000, marketValue: 13.8, fee: 0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Axel Disasi", position: "DF", weeklyWage: 80000, marketValue: 12.9, fee: 38.8, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
    { name: "Benoit Badiashile", position: "DF", weeklyWage: 90000, marketValue: 12.9, fee: 32.8, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
    { name: "Aaron Anselmino", position: "DF", weeklyWage: 15000, marketValue: 8.6, fee: 14.2, signedYear: 2024, contractEndYear: 2031, isAcademy: false },
    { name: "Jorrel Hato", position: "DF", weeklyWage: 120000, marketValue: 34.5, fee: 38.1, signedYear: 2025, contractEndYear: 2032, isAcademy: false },
    { name: "Caleb Wiley", position: "DF", weeklyWage: 12000, marketValue: 6.9, fee: 8.7, signedYear: 2024, contractEndYear: 2030, isAcademy: false },
    { name: "Denner", position: "DF", weeklyWage: 35000, marketValue: 7.4, fee: 8.6, signedYear: 2026, contractEndYear: 2032, isAcademy: false },
    { name: "Reece James", position: "DF", weeklyWage: 200000, marketValue: 51.7, fee: 0, signedYear: 2019, contractEndYear: 2032, isAcademy: true },
    { name: "Marco Palestra", position: "DF", weeklyWage: 70000, marketValue: 30.2, fee: 49.1, signedYear: 2026, contractEndYear: 2033, isAcademy: false },
    { name: "Malo Gusto", position: "DF", weeklyWage: 45000, marketValue: 30.2, fee: 25.9, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
    { name: "Josh Acheampong", position: "DF", weeklyWage: 5000, marketValue: 21.6, fee: 0, signedYear: 2024, contractEndYear: 2029, isAcademy: true },
    { name: "Moises Caicedo", position: "MF", weeklyWage: 150000, marketValue: 86.2, fee: 100, signedYear: 2023, contractEndYear: 2033, isAcademy: false },
    { name: "Romeo Lavia", position: "MF", weeklyWage: 45000, marketValue: 19, fee: 53.5, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
    { name: "Dario Essugo", position: "MF", weeklyWage: 40000, marketValue: 12.9, fee: 19.2, signedYear: 2025, contractEndYear: 2033, isAcademy: false },
    { name: "Enzo Fernandez", position: "MF", weeklyWage: 180000, marketValue: 77.6, fee: 104.3, signedYear: 2023, contractEndYear: 2032, isAcademy: false },
    { name: "Andrey Santos", position: "MF", weeklyWage: 35000, marketValue: 34.5, fee: 10.8, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
    { name: "Cole Palmer", position: "MF", weeklyWage: 130000, marketValue: 86.2, fee: 40.5, signedYear: 2023, contractEndYear: 2033, isAcademy: false },
    { name: "Jamie Gittens", position: "FW", weeklyWage: 108000, marketValue: 25.9, fee: 48.3, signedYear: 2025, contractEndYear: 2032, isAcademy: false },
    { name: "Alejandro Garnacho", position: "FW", weeklyWage: 110000, marketValue: 24.1, fee: 39.8, signedYear: 2025, contractEndYear: 2032, isAcademy: false },
    { name: "Tyrique George", position: "FW", weeklyWage: 7500, marketValue: 17.2, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: true },
    { name: "Mykhaylo Mudryk", position: "FW", weeklyWage: 100000, marketValue: 0, fee: 60.3, signedYear: 2023, contractEndYear: 2031, isAcademy: false },
    { name: "Estevao", position: "FW", weeklyWage: 60000, marketValue: 69, fee: 38.8, signedYear: 2025, contractEndYear: 2033, isAcademy: false },
    { name: "Pedro Neto", position: "FW", weeklyWage: 160000, marketValue: 51.7, fee: 51.7, signedYear: 2024, contractEndYear: 2031, isAcademy: false },
    { name: "Geovany Quenda", position: "FW", weeklyWage: 80000, marketValue: 36.2, fee: 43.7, signedYear: 2026, contractEndYear: 2032, isAcademy: false },
    { name: "Joao Pedro", position: "FW", weeklyWage: 125000, marketValue: 69, fee: 54.9, signedYear: 2025, contractEndYear: 2033, isAcademy: false },
    { name: "Nicolas Jackson", position: "FW", weeklyWage: 100000, marketValue: 34.5, fee: 31.9, signedYear: 2023, contractEndYear: 2033, isAcademy: false },
    { name: "Liam Delap", position: "FW", weeklyWage: 100000, marketValue: 24.1, fee: 30.6, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
    { name: "Emmanuel Emegha", position: "FW", weeklyWage: 55000, marketValue: 21.6, fee: 21.6, signedYear: 2026, contractEndYear: 2033, isAcademy: false },
    { name: "Marc Guiu", position: "FW", weeklyWage: 50000, marketValue: 10.3, fee: 5.2, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "David Datro Fofana", position: "FW", weeklyWage: 15000, marketValue: 3.4, fee: 10.3, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
  ],
};

// ---------------------------------------------------------------------------
// Verified financials for the remaining clubs (squads still pending TM pull).
// ---------------------------------------------------------------------------

/** Compact ClubYear builder. Accounts fields share one source; agent fees another. */
function yr(o: {
  id: string; label: string; status: VerificationStatus; euro: boolean;
  /** UEFA competition the year's revenue reflects; defaults to UCL when euro. */
  tier?: EuropeTier;
  /** Final PL position that season (omit for non-EPL seasons). */
  pos?: number;
  rev: number; net: number; wages: number; amort: number; agent: number;
  priors?: number[];
  src: string; url?: string; agentSrc: string; agentUrl?: string;
  notes?: Partial<Record<"revenue" | "net" | "wages" | "amort" | "agent", string>>;
}): ClubYear {
  const rel: Reliability = o.status === "verified" ? "primary" : "estimate";
  const s = (value: number, note?: string): Sourced => ({ value, reliability: rel, source: o.src, sourceUrl: o.url, note });
  return {
    id: o.id, label: o.label, status: o.status, isPlayingInEurope: o.euro,
    europeTier: o.tier ?? (o.euro ? "UCL" : "NONE"),
    leaguePosition: o.pos,
    priorNetTradingProfits: o.priors,
    revenue: s(o.rev, o.notes?.revenue),
    netPlayerTradingProfit: s(o.net, o.notes?.net),
    wages: s(o.wages, o.notes?.wages),
    amortisation: s(o.amort, o.notes?.amort),
    agentFees: { value: o.agent, reliability: rel, source: o.agentSrc, sourceUrl: o.agentUrl, note: o.notes?.agent },
  };
}

const FA_URL = "https://www.thefa.com/news/2026/apr/01/agent-fees-and-transactions";

const MAN_CITY: Club = {
  league: "EPL",
  id: "man-city", name: "Manchester City", shortName: "Man City", defaultYearId: "fy2425",
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are estimates (Haaland, Rodri, Foden, Gvardiol, Saliba-style known figures hardcoded; rest formulaic from market value). Departed players (e.g. Savinho, Bernardo Silva, Akanji, Stones) excluded; incoming 2026 signings (Donnarumma, Guéhi, Elliot Anderson, Cherki) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/manchester-city/startseite/verein/281",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: true, pos: 3,
      rev: 694, net: 95.2, wages: 408, amort: 170, agent: 52.1, priors: [139, 122],
      src: "Man City FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble)", url: "https://swissramble.substack.com/p/manchester-city-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Broadcast £279m + commercial £340m + matchday £75m. Pre-tax loss £10m.", net: "Álvarez, Cancelo, Harwood-Bellis, Couto sales.", agent: "FA Feb–Feb window ≠ 30-Jun fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: true, pos: 2,
      rev: 710, net: 55, wages: 415, amort: 175, agent: 37.4, priors: [95.2, 139],
      src: "Projection from FY25 base + Champions League participation", agentSrc: "FA 2025/26 (£37.4m)", agentUrl: FA_URL }),
  ],
  players: [
  { name: "Gianluigi Donnarumma", position: "GK", weeklyWage: 250000, marketValue: 38.8, fee: 25.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "James Trafford", position: "GK", weeklyWage: 50000, marketValue: 21.6, fee: 26.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Marcus Bettinelli", position: "GK", weeklyWage: 35000, marketValue: 0.3, fee: 2.1, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Marc Guéhi", position: "DF", weeklyWage: 250000, marketValue: 60.3, fee: 19.8, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Josko Gvardiol", position: "DF", weeklyWage: 200000, marketValue: 60.3, fee: 77.6, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Rúben Dias", position: "DF", weeklyWage: 250000, marketValue: 47.4, fee: 61.7, signedYear: 2020, contractEndYear: 2029, isAcademy: false },
  { name: "Abdukodir Khusanov", position: "DF", weeklyWage: 50000, marketValue: 43.1, fee: 34.5, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Vitor Reis", position: "DF", weeklyWage: 40000, marketValue: 25.9, fee: 31.9, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Nathan Aké", position: "DF", weeklyWage: 160000, marketValue: 10.3, fee: 39.1, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
  { name: "Juma Bah", position: "DF", weeklyWage: 55000, marketValue: 8.6, fee: 5.2, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
  { name: "Max Alleyne", position: "DF", weeklyWage: 2500, marketValue: 6.9, fee: 1.6, signedYear: 2021, contractEndYear: 2030, isAcademy: false },
  { name: "Nico O'Reilly", position: "DF", weeklyWage: 30000, marketValue: 60.3, fee: 0, signedYear: 2024, contractEndYear: 2030, isAcademy: true },
  { name: "Rayan Aït-Nouri", position: "DF", weeklyWage: 120000, marketValue: 34.5, fee: 31.7, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Josh Wilson-Esbrand", position: "DF", weeklyWage: 7000, marketValue: 2.2, fee: 0, signedYear: 2023, contractEndYear: 2027, isAcademy: true },
  { name: "Matheus Nunes", position: "DF", weeklyWage: 130000, marketValue: 43.1, fee: 53.4, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Rico Lewis", position: "DF", weeklyWage: 25000, marketValue: 24.1, fee: 0, signedYear: 2022, contractEndYear: 2030, isAcademy: true },
  { name: "Issa Kaboré", position: "DF", weeklyWage: 10000, marketValue: 3.4, fee: 3.9, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
  { name: "Rodri", position: "MF", weeklyWage: 220000, marketValue: 43.1, fee: 60.3, signedYear: 2019, contractEndYear: 2027, isAcademy: false },
  { name: "Nico González", position: "MF", weeklyWage: 75000, marketValue: 34.5, fee: 51.7, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Kalvin Phillips", position: "MF", weeklyWage: 150000, marketValue: 2.2, fee: 42.2, signedYear: 2022, contractEndYear: 2028, isAcademy: false },
  { name: "Elliot Anderson", position: "MF", weeklyWage: 125000, marketValue: 64.7, fee: 116.4, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Tijjani Reijnders", position: "MF", weeklyWage: 230000, marketValue: 43.1, fee: 47.3, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Sverre Nypan", position: "MF", weeklyWage: 10000, marketValue: 11.2, fee: 12.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Mateo Kovacic", position: "MF", weeklyWage: 150000, marketValue: 8.6, fee: 25.1, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Rayan Cherki", position: "MF", weeklyWage: 180000, marketValue: 77.6, fee: 31.5, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Phil Foden", position: "MF", weeklyWage: 225000, marketValue: 60.3, fee: 0, signedYear: 2017, contractEndYear: 2027, isAcademy: true },
  { name: "Claudio Echeverri", position: "MF", weeklyWage: 15000, marketValue: 12.9, fee: 15.9, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Jérémy Doku", position: "FW", weeklyWage: 50000, marketValue: 64.7, fee: 51.7, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Sávio", position: "FW", weeklyWage: 80000, marketValue: 30.2, fee: 21.6, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Jack Grealish", position: "FW", weeklyWage: 75000, marketValue: 17.2, fee: 101.3, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Antoine Semenyo", position: "FW", weeklyWage: 150000, marketValue: 69, fee: 62.1, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Erling Haaland", position: "FW", weeklyWage: 525000, marketValue: 172.4, fee: 51.7, signedYear: 2022, contractEndYear: 2034, isAcademy: false },
  { name: "Omar Marmoush", position: "FW", weeklyWage: 295000, marketValue: 43.1, fee: 64.7, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  ],
};

const ARSENAL: Club = {
  league: "EPL",
  id: "arsenal", name: "Arsenal", shortName: "Arsenal", defaultYearId: "fy2425",
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are estimates (Saka, Rice, Ødegaard, Saliba, Havertz known figures hardcoded; rest formulaic from market value). Departed players (e.g. Kiwior, Karl Hein) excluded; incoming 2025/26 signings (Zubimendi, Gyökeres, Eze, Madueke) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/fc-arsenal/startseite/verein/11",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: true, pos: 2,
      rev: 691, net: 82, wages: 346.8, amort: 176.6, agent: 22.8, priors: [51, 11],
      src: "Arsenal FY25 official results, year ended 31 May 2025", url: "https://www.arsenal.com/news/financial-results-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Record £691.0m (2024: £616.6m). Loss just £1.4m.", wages: "£346.8m (2024: £327.8m).", amort: "Amortisation + impairment £176.6m (incl. £15.2m impairment).", net: "£82m — Smith Rowe, Nketiah, Ramsdale.", agent: "FA Feb–Feb window ≠ 30-Jun fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: true, pos: 1,
      rev: 730, net: 45, wages: 365, amort: 185, agent: 32.1, priors: [82, 51],
      src: "Projection from FY25 base + deep Champions League run", agentSrc: "FA 2025/26 (£32.1m)", agentUrl: FA_URL }),
  ],
  players: [
  { name: "David Raya", position: "GK", weeklyWage: 100000, marketValue: 25.9, fee: 27.5, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Kepa Arrizabalaga", position: "GK", weeklyWage: 60000, marketValue: 4.3, fee: 5, signedYear: 2025, contractEndYear: 2028, isAcademy: false },
  { name: "William Saliba", position: "DF", weeklyWage: 250000, marketValue: 86.2, fee: 25.9, signedYear: 2019, contractEndYear: 2030, isAcademy: false },
  { name: "Gabriel Magalhães", position: "DF", weeklyWage: 150000, marketValue: 64.7, fee: 22.4, signedYear: 2020, contractEndYear: 2029, isAcademy: false },
  { name: "Piero Hincapié", position: "DF", weeklyWage: 65000, marketValue: 43.1, fee: 44.8, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Cristhian Mosquera", position: "DF", weeklyWage: 55000, marketValue: 34.5, fee: 12.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Riccardo Calafiori", position: "DF", weeklyWage: 120000, marketValue: 47.4, fee: 37.7, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Jurriën Timber", position: "DF", weeklyWage: 90000, marketValue: 60.3, fee: 34.5, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Ben White", position: "DF", weeklyWage: 150000, marketValue: 25.9, fee: 50.4, signedYear: 2021, contractEndYear: 2028, isAcademy: false },
  { name: "Martín Zubimendi", position: "MF", weeklyWage: 75000, marketValue: 64.7, fee: 60.3, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Christian Nørgaard", position: "MF", weeklyWage: 65000, marketValue: 4.3, fee: 10, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Declan Rice", position: "MF", weeklyWage: 240000, marketValue: 103.4, fee: 100.5, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Myles Lewis-Skelly", position: "MF", weeklyWage: 45000, marketValue: 38.8, fee: 0, signedYear: 2024, contractEndYear: 2030, isAcademy: true },
  { name: "Mikel Merino", position: "MF", weeklyWage: 130000, marketValue: 21.6, fee: 27.6, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Martin Ødegaard", position: "MF", weeklyWage: 240000, marketValue: 56, fee: 30.2, signedYear: 2021, contractEndYear: 2028, isAcademy: false },
  { name: "Eberechi Eze", position: "MF", weeklyWage: 180000, marketValue: 56, fee: 59.7, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Ethan Nwaneri", position: "MF", weeklyWage: 80000, marketValue: 30.2, fee: 0, signedYear: 2024, contractEndYear: 2030, isAcademy: true },
  { name: "Fábio Vieira", position: "MF", weeklyWage: 45000, marketValue: 15.5, fee: 30.2, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Gabriel Martinelli", position: "FW", weeklyWage: 180000, marketValue: 38.8, fee: 6.1, signedYear: 2019, contractEndYear: 2027, isAcademy: false },
  { name: "Leandro Trossard", position: "FW", weeklyWage: 90000, marketValue: 15.5, fee: 20.7, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Reiss Nelson", position: "FW", weeklyWage: 30000, marketValue: 6.9, fee: 0, signedYear: 2019, contractEndYear: 2027, isAcademy: true },
  { name: "Bukayo Saka", position: "FW", weeklyWage: 195000, marketValue: 94.8, fee: 0, signedYear: 2019, contractEndYear: 2030, isAcademy: true },
  { name: "Noni Madueke", position: "FW", weeklyWage: 150000, marketValue: 43.1, fee: 48.3, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Max Dowman", position: "FW", weeklyWage: 35000, marketValue: 25.9, fee: 0, signedYear: 2025, contractEndYear: 2030, isAcademy: true },
  { name: "Viktor Gyökeres", position: "FW", weeklyWage: 200000, marketValue: 56, fee: 57.7, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Kai Havertz", position: "FW", weeklyWage: 280000, marketValue: 47.4, fee: 64.7, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Gabriel Jesus", position: "FW", weeklyWage: 265000, marketValue: 14.7, fee: 44.8, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  ],
};

const LIVERPOOL: Club = {
  league: "EPL",
  id: "liverpool", name: "Liverpool", shortName: "Liverpool", defaultYearId: "fy2425",
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are estimates (van Dijk, Wirtz, Mac Allister known figures hardcoded; rest formulaic from market value). Departed players (Salah, Alexander-Arnold, Konaté, Robertson — all moved on by summer 2026) excluded; incoming 2025/26 signings (Wirtz, Isak, Ekitiké, Kerkez, Frimpong) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/fc-liverpool/startseite/verein/31",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: true, pos: 1,
      rev: 703, net: 52, wages: 428, amort: 117, agent: 20.8, priors: [22, 34],
      src: "Liverpool FY25 accounts, year ended 31 May 2025 (Swiss Ramble)", url: "https://swissramble.substack.com/p/liverpool-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Record £703m after PL title + CL return. Pre-tax profit £15m.", wages: "£428m — club record (title bonuses).", amort: "Only £117m — modest despite title win.", net: "£52m from player sales.", agent: "FA Feb–Feb window ≠ 30-Jun fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: true, pos: 5,
      rev: 720, net: 100, wages: 460, amort: 190, agent: 33.9, priors: [52, 22],
      src: "Projection: record summer-2025 spend (Wirtz, Isak, Ekitike) sharply raises wages & amortisation; big sales offset", agentSrc: "FA 2025/26 (£33.9m)", agentUrl: FA_URL,
      notes: { amort: "Jumps on £116m Wirtz + Isak + Ekitike etc.", net: "Elevated by major outgoings (Núñez, Díaz)." } }),
  ],
  players: [
  { name: "Giorgi Mamardashvili", position: "GK", weeklyWage: 85000, marketValue: 24.1, fee: 25.9, signedYear: 2024, contractEndYear: 2031, isAcademy: false },
  { name: "Alisson", position: "GK", weeklyWage: 150000, marketValue: 12.9, fee: 62.5, signedYear: 2018, contractEndYear: 2027, isAcademy: false },
  { name: "Vitezslav Jaros", position: "GK", weeklyWage: 45000, marketValue: 4.3, fee: 0, signedYear: 2022, contractEndYear: 2028, isAcademy: true },
  { name: "Freddie Woodman", position: "GK", weeklyWage: 25000, marketValue: 2.6, fee: 0, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Harvey Davies", position: "GK", weeklyWage: 25000, marketValue: 0.4, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: true },
  { name: "Jérémy Jacquet", position: "DF", weeklyWage: 110000, marketValue: 47.4, fee: 54.8, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Giovanni Leoni", position: "DF", weeklyWage: 55000, marketValue: 21.6, fee: 25.4, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
  { name: "Virgil van Dijk", position: "DF", weeklyWage: 350000, marketValue: 12.9, fee: 73, signedYear: 2017, contractEndYear: 2027, isAcademy: false },
  { name: "Joe Gomez", position: "DF", weeklyWage: 85000, marketValue: 11.2, fee: 4.2, signedYear: 2015, contractEndYear: 2027, isAcademy: false },
  { name: "Milos Kerkez", position: "DF", weeklyWage: 75000, marketValue: 30.2, fee: 40.4, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Konstantinos Tsimikas", position: "DF", weeklyWage: 75000, marketValue: 3.9, fee: 11.2, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
  { name: "Jeremie Frimpong", position: "DF", weeklyWage: 100000, marketValue: 30.2, fee: 34.5, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Conor Bradley", position: "DF", weeklyWage: 75000, marketValue: 21.6, fee: 0.1, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
  { name: "Calvin Ramsay", position: "DF", weeklyWage: 15000, marketValue: 1.3, fee: 4.2, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Ryan Gravenberch", position: "MF", weeklyWage: 150000, marketValue: 69, fee: 34.5, signedYear: 2023, contractEndYear: 2032, isAcademy: false },
  { name: "Wataru Endo", position: "MF", weeklyWage: 50000, marketValue: 3.4, fee: 17.2, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Stefan Bajcetic", position: "MF", weeklyWage: 40000, marketValue: 3.4, fee: 0.2, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Alexis Mac Allister", position: "MF", weeklyWage: 150000, marketValue: 60.3, fee: 36.2, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Curtis Jones", position: "MF", weeklyWage: 15000, marketValue: 30.2, fee: 0, signedYear: 2020, contractEndYear: 2027, isAcademy: true },
  { name: "Trey Nyoni", position: "MF", weeklyWage: 25000, marketValue: 6.9, fee: 0, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Florian Wirtz", position: "MF", weeklyWage: 200000, marketValue: 86.2, fee: 107.8, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Dominik Szoboszlai", position: "MF", weeklyWage: 120000, marketValue: 86.2, fee: 60.3, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Harvey Elliott", position: "MF", weeklyWage: 65000, marketValue: 17.2, fee: 1.5, signedYear: 2019, contractEndYear: 2027, isAcademy: false },
  { name: "Cody Gakpo", position: "FW", weeklyWage: 200000, marketValue: 51.7, fee: 36.2, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
  { name: "Víctor Muñoz", position: "FW", weeklyWage: 85000, marketValue: 25.9, fee: 34.5, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Rio Ngumoha", position: "FW", weeklyWage: 25000, marketValue: 25.9, fee: 2.8, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Federico Chiesa", position: "FW", weeklyWage: 150000, marketValue: 11.2, fee: 10.3, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Alexander Isak", position: "FW", weeklyWage: 280000, marketValue: 73.3, fee: 125, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
  { name: "Hugo Ekitiké", position: "FW", weeklyWage: 200000, marketValue: 69, fee: 81.9, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
  ],
};

const MAN_UTD: Club = {
  league: "EPL",
  id: "man-utd", name: "Manchester United", shortName: "Man United", defaultYearId: "fy2425",
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are estimates (Bruno Fernandes, de Ligt, Mainoo known figures hardcoded; rest formulaic from market value). Departed players (Højlund, Sancho, Casemiro, Malacia, Garnacho — all moved on) excluded; incoming 2025/26 signings (Cunha, Mbeumo, Sesko, Ugarte) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/manchester-united/startseite/verein/985",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: true, pos: 15, tier: "UEL_UECL", // Europa League 2024/25 (runners-up)
      rev: 666.5, net: 48.7, wages: 313, amort: 196, agent: 33.0, priors: [37],
      src: "Man Utd Plc FY25 results, year ended 30 Jun 2025", url: "https://www.si.com/soccer/man-utd-financial-accounts-key-takeaways-2024-25-report",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Record £666.5m. Pre-tax loss £39.7m.", wages: "£313m (down from £365m — no CL bonuses, leaner staff).", net: "£48.7m — best in 16 yrs; McTominay & Greenwood (academy pure profit).", agent: "FA Feb–Feb window ≠ 30-Jun fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 3,
      rev: 620, net: 40, wages: 300, amort: 205, agent: 31.8,
      src: "Projection: NO European football in 25/26 cuts revenue; PL 85% becomes the binding limit", agentSrc: "FA 2025/26 (£31.8m)", agentUrl: FA_URL,
      notes: { revenue: "Down on loss of European matchday/prize income." } }),
  ],
  players: [
  { name: "Senne Lammens", position: "GK", weeklyWage: 60000, marketValue: 30.2, fee: 18.1, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "André Onana", position: "GK", weeklyWage: 120000, marketValue: 8.6, fee: 43.3, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Altay Bayındır", position: "GK", weeklyWage: 35000, marketValue: 4.3, fee: 4.3, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Tom Heaton", position: "GK", weeklyWage: 45000, marketValue: 0.1, fee: 0, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Leny Yoro", position: "DF", weeklyWage: 115000, marketValue: 43.1, fee: 53.4, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Lisandro Martínez", position: "DF", weeklyWage: 120000, marketValue: 34.5, fee: 49.5, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Matthijs de Ligt", position: "DF", weeklyWage: 195000, marketValue: 25.9, fee: 38.8, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Ayden Heaven", position: "DF", weeklyWage: 25000, marketValue: 25.9, fee: 1.6, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Harry Maguire", position: "DF", weeklyWage: 190000, marketValue: 6.9, fee: 75, signedYear: 2019, contractEndYear: 2027, isAcademy: false },
  { name: "Tyler Fredricson", position: "DF", weeklyWage: 25000, marketValue: 2.6, fee: 0, signedYear: 2026, contractEndYear: 2028, isAcademy: true },
  { name: "Luke Shaw", position: "DF", weeklyWage: 150000, marketValue: 6.9, fee: 32.3, signedYear: 2014, contractEndYear: 2027, isAcademy: false },
  { name: "Harry Amass", position: "DF", weeklyWage: 5000, marketValue: 6, fee: 0, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Diego León", position: "DF", weeklyWage: 25000, marketValue: 3.4, fee: 3.4, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Diogo Dalot", position: "DF", weeklyWage: 85000, marketValue: 25.9, fee: 19, signedYear: 2018, contractEndYear: 2028, isAcademy: false },
  { name: "Noussair Mazraoui", position: "DF", weeklyWage: 135000, marketValue: 15.5, fee: 12.9, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Manuel Ugarte", position: "MF", weeklyWage: 120000, marketValue: 21.6, fee: 43.1, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Toby Collyer", position: "MF", weeklyWage: 5000, marketValue: 4.3, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: false },
  { name: "Kobbie Mainoo", position: "MF", weeklyWage: 25000, marketValue: 60.3, fee: 0, signedYear: 2023, contractEndYear: 2031, isAcademy: true },
  { name: "Tyler Fletcher", position: "MF", weeklyWage: 30000, marketValue: 1.3, fee: 0.6, signedYear: 2023, contractEndYear: 2030, isAcademy: false },
  { name: "Dan Gore", position: "MF", weeklyWage: 3000, marketValue: 0.9, fee: 0, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Bruno Fernandes", position: "MF", weeklyWage: 300000, marketValue: 30.2, fee: 56, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
  { name: "Mason Mount", position: "MF", weeklyWage: 150000, marketValue: 21.6, fee: 58.4, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Jack Fletcher", position: "MF", weeklyWage: 30000, marketValue: 1.3, fee: 0.6, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
  { name: "Marcus Rashford", position: "FW", weeklyWage: 300000, marketValue: 34.5, fee: 0, signedYear: 2016, contractEndYear: 2028, isAcademy: true },
  { name: "Patrick Dorgu", position: "FW", weeklyWage: 40000, marketValue: 30.2, fee: 25.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Bryan Mbeumo", position: "FW", weeklyWage: 150000, marketValue: 64.7, fee: 64.7, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Amad Diallo", position: "FW", weeklyWage: 120000, marketValue: 38.8, fee: 23.5, signedYear: 2021, contractEndYear: 2030, isAcademy: false },
  { name: "Matheus Cunha", position: "FW", weeklyWage: 180000, marketValue: 64.7, fee: 64, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Benjamin Sesko", position: "FW", weeklyWage: 160000, marketValue: 64.7, fee: 65.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Joshua Zirkzee", position: "FW", weeklyWage: 105000, marketValue: 17.2, fee: 36.6, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Chido Obi", position: "FW", weeklyWage: 15000, marketValue: 4.3, fee: 0, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Ethan Wheatley", position: "FW", weeklyWage: 5000, marketValue: 0.2, fee: 0, signedYear: 2025, contractEndYear: 2028, isAcademy: true },
  ],
};

// ---------------------------------------------------------------------------
// Newly added clubs — squads fully Transfermarkt-verified (scraped 2 Jul 2026);
// club-level FY2024/25 financials now researched from audited accounts (via
// Swiss Ramble analysis) + FA 2025/26 agent-fee window. FY2025/26 = estimate.
// ---------------------------------------------------------------------------

const NEWCASTLE: Club = {
  league: "EPL",
  id: "newcastle", name: "Newcastle United", shortName: "Newcastle", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 5,
      rev: 335, net: 19.9, wages: 243, amort: 100, agent: 24.4,
      src: "Newcastle United FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", url: "https://swissramble.substack.com/p/newcastle-united-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Club-record £335m (2024: £320m): commercial +£37m to £123m, offsetting broadcasting −£23m to £161m after dropping out of the Champions League. £35m pre-tax profit flattered by a £133m gain on the sale of St James' Park to a group company — strip that out and the underlying loss was ~£98m.", net: "Profit on player sales fell £50m to £19.9m (Almirón, Lloyd Kelly).", wages: "Total wage bill £243m (wage/revenue 72.6%); football-only wages not separately disclosed.", amort: "Player amortisation £100m.", agent: "No European football in 2024/25 (out of Europe after the 2023/24 CL run). FA Feb–Feb window ≠ fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: true, pos: 12,
      rev: 400, net: 35, wages: 262, amort: 112, agent: 20.3, priors: [19.9, 70],
      src: "Projection from FY25 base + return to the Champions League (5th in 2024/25)", agentSrc: "FA 2025/26 (£20.3m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are formulaic estimates from market value (no per-player hardcodes for this club yet). Departed players (Anthony Gordon → Barcelona) excluded; incoming 2025/26 signings (Woltemade, Elanga, Wissa, Ramsey) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/newcastle-united/startseite/verein/762",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
  { name: "Ewen Jaouen", position: "GK", weeklyWage: 60000, marketValue: 10.3, fee: 18.5, signedYear: 2026, contractEndYear: 2030, isAcademy: false },
  { name: "Nick Pope", position: "GK", weeklyWage: 60000, marketValue: 4.3, fee: 9.9, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Mark Gillespie", position: "GK", weeklyWage: 15000, marketValue: 0.1, fee: 0, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
  { name: "Malick Thiaw", position: "DF", weeklyWage: 75000, marketValue: 38.8, fee: 30.2, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Sven Botman", position: "DF", weeklyWage: 140000, marketValue: 30.2, fee: 31.9, signedYear: 2022, contractEndYear: 2030, isAcademy: false },
  { name: "Fabian Schär", position: "DF", weeklyWage: 70000, marketValue: 3.4, fee: 3.4, signedYear: 2018, contractEndYear: 2027, isAcademy: false },
  { name: "Dan Burn", position: "DF", weeklyWage: 70000, marketValue: 3.4, fee: 12.9, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Lewis Hall", position: "DF", weeklyWage: 45000, marketValue: 34.5, fee: 28.4, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Alex Murphy", position: "DF", weeklyWage: 8000, marketValue: 1.3, fee: 0.1, signedYear: 2022, contractEndYear: 2028, isAcademy: false },
  { name: "Tino Livramento", position: "DF", weeklyWage: 50000, marketValue: 38.8, fee: 32.1, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Harrison Ashby", position: "DF", weeklyWage: 15000, marketValue: 1, fee: 2.9, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Sandro Tonali", position: "MF", weeklyWage: 120000, marketValue: 69, fee: 52.4, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Bruno Guimarães", position: "MF", weeklyWage: 160000, marketValue: 60.3, fee: 36.3, signedYear: 2022, contractEndYear: 2028, isAcademy: false },
  { name: "Jacob Ramsey", position: "MF", weeklyWage: 120000, marketValue: 30.2, fee: 38.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Joelinton", position: "MF", weeklyWage: 150000, marketValue: 21.6, fee: 37.5, signedYear: 2019, contractEndYear: 2028, isAcademy: false },
  { name: "Lewis Miley", position: "MF", weeklyWage: 30000, marketValue: 21.6, fee: 0, signedYear: 2023, contractEndYear: 2032, isAcademy: true },
  { name: "Joe Willock", position: "MF", weeklyWage: 80000, marketValue: 12.1, fee: 25.3, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Joe White", position: "MF", weeklyWage: 1500, marketValue: 0.2, fee: 0, signedYear: 2023, contractEndYear: 2027, isAcademy: true },
  { name: "Harvey Barnes", position: "FW", weeklyWage: 80000, marketValue: 27.6, fee: 37.9, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Antoñito Cordero", position: "FW", weeklyWage: 35000, marketValue: 1.7, fee: 0, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Anthony Elanga", position: "FW", weeklyWage: 100000, marketValue: 27.6, fee: 52.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Jacob Murphy", position: "FW", weeklyWage: 35000, marketValue: 10.3, fee: 9.7, signedYear: 2017, contractEndYear: 2027, isAcademy: false },
  { name: "Nick Woltemade", position: "FW", weeklyWage: 132500, marketValue: 47.4, fee: 64.7, signedYear: 2025, contractEndYear: 2031, isAcademy: false },
  { name: "William Osula", position: "FW", weeklyWage: 25000, marketValue: 24.1, fee: 10, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Yoane Wissa", position: "FW", weeklyWage: 140000, marketValue: 21.6, fee: 49.7, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  ],
};

const ASTON_VILLA: Club = {
  league: "EPL",
  id: "aston-villa", name: "Aston Villa", shortName: "Aston Villa", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: true, pos: 6,
      rev: 378, net: 52, wages: 273, amort: 99, agent: 25.1, priors: [65, 39],
      src: "Aston Villa FY25 accounts, year ended 31 May 2025 (Swiss Ramble analysis)", url: "https://swissramble.substack.com/p/aston-villa-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Revenue up £102m to £378m on a first Champions League campaign. Headline £17m profit driven almost entirely by a £114m one-off gain from selling the women's team and Warehouse rights to a group company — underlying loss ~£97m.", net: "Profit on player sales £52m (down from £65m); Douglas Luiz to Juventus the marquee deal.", wages: "Football wages £273m; total staff cost £380m ≈ 100% of revenue — highest outside the big six.", amort: "Player amortisation £99m plus a £6.4m impairment charge.", agent: "In the Champions League in 2024/25. FA Feb–Feb window ≠ fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: true, pos: 4, tier: "UEL_UECL",
      rev: 340, net: 55, wages: 275, amort: 100, agent: 38.4, priors: [52, 65],
      src: "Projection from FY25 base + Europa League (6th in 2024/25, dropped from the CL to the Europa League)", agentSrc: "FA 2025/26 (£38.4m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are formulaic estimates from market value. Departed players (Donyell Malen, Enzo Barrenechea → moved on) excluded; incoming 2026 signings (Cissé, Tammy Abraham) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/aston-villa/startseite/verein/405",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
  { name: "Emiliano Martínez", position: "GK", weeklyWage: 150000, marketValue: 10.3, fee: 15, signedYear: 2020, contractEndYear: 2029, isAcademy: false },
  { name: "Oliwier Zych", position: "GK", weeklyWage: 35000, marketValue: 1.7, fee: 0, signedYear: 2025, contractEndYear: 2027, isAcademy: true },
  { name: "Marco Bizot", position: "GK", weeklyWage: 45000, marketValue: 1.3, fee: 0.4, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Joe Gauci", position: "GK", weeklyWage: 5000, marketValue: 1, fee: 1.3, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Ezri Konsa", position: "DF", weeklyWage: 75000, marketValue: 34.5, fee: 11.5, signedYear: 2019, contractEndYear: 2028, isAcademy: false },
  { name: "Pau Torres", position: "DF", weeklyWage: 100000, marketValue: 17.2, fee: 28.4, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Modou Kéba Cissé", position: "DF", weeklyWage: 45000, marketValue: 5.2, fee: 4.7, signedYear: 2026, contractEndYear: 2029, isAcademy: false },
  { name: "Victor Lindelöf", position: "DF", weeklyWage: 120000, marketValue: 4.3, fee: 0, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Tyrone Mings", position: "DF", weeklyWage: 100000, marketValue: 2.6, fee: 19.2, signedYear: 2019, contractEndYear: 2027, isAcademy: false },
  { name: "Ian Maatsen", position: "DF", weeklyWage: 100000, marketValue: 25.9, fee: 38.4, signedYear: 2024, contractEndYear: 2030, isAcademy: false },
  { name: "Lucas Digne", position: "DF", weeklyWage: 135000, marketValue: 5.2, fee: 25.9, signedYear: 2022, contractEndYear: 2028, isAcademy: false },
  { name: "Matty Cash", position: "DF", weeklyWage: 100000, marketValue: 19, fee: 13.6, signedYear: 2020, contractEndYear: 2029, isAcademy: false },
  { name: "Kosta Nedeljkovic", position: "DF", weeklyWage: 45000, marketValue: 5.2, fee: 6.6, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Andrés García", position: "DF", weeklyWage: 15000, marketValue: 5.2, fee: 6, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Amadou Onana", position: "MF", weeklyWage: 140000, marketValue: 38.8, fee: 51.2, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Boubacar Kamara", position: "MF", weeklyWage: 150000, marketValue: 34.5, fee: 0, signedYear: 2022, contractEndYear: 2030, isAcademy: false },
  { name: "Lamare Bogarde", position: "MF", weeklyWage: 30000, marketValue: 15.5, fee: 0.5, signedYear: 2020, contractEndYear: 2028, isAcademy: false },
  { name: "Youri Tielemans", position: "MF", weeklyWage: 150000, marketValue: 25.9, fee: 0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "John McGinn", position: "MF", weeklyWage: 120000, marketValue: 11.2, fee: 2.7, signedYear: 2018, contractEndYear: 2028, isAcademy: false },
  { name: "Ross Barkley", position: "MF", weeklyWage: 61731, marketValue: 3.4, fee: 5.1, signedYear: 2024, contractEndYear: 2027, isAcademy: false },
  { name: "Samuel Iling-Junior", position: "MF", weeklyWage: 15000, marketValue: 5.6, fee: 12.1, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Morgan Rogers", position: "MF", weeklyWage: 75000, marketValue: 77.6, fee: 8.1, signedYear: 2024, contractEndYear: 2031, isAcademy: false },
  { name: "Emiliano Buendía", position: "FW", weeklyWage: 75000, marketValue: 13.8, fee: 33.1, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Lewis Dobbin", position: "FW", weeklyWage: 7500, marketValue: 6, fee: 10.2, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Evann Guessand", position: "FW", weeklyWage: 75000, marketValue: 21.6, fee: 25.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Leon Bailey", position: "FW", weeklyWage: 120000, marketValue: 12.1, fee: 27.6, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Alysson", position: "FW", weeklyWage: 20000, marketValue: 8.6, fee: 8.6, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Ollie Watkins", position: "FW", weeklyWage: 130000, marketValue: 21.6, fee: 29.3, signedYear: 2020, contractEndYear: 2028, isAcademy: false },
  { name: "Tammy Abraham", position: "FW", weeklyWage: 140000, marketValue: 15.5, fee: 18.1, signedYear: 2026, contractEndYear: 2030, isAcademy: false },
  ],
};

const EVERTON: Club = {
  league: "EPL",
  id: "everton", name: "Everton", shortName: "Everton", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 13,
      rev: 196.7, net: 31.3, wages: 152.1, amort: 50.9, agent: 9.2,
      src: "Everton FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", url: "https://swissramble.substack.com/p/everton-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Club-record £196.7m (+£9.8m), led by commercial growth. Reduced loss of £8.6m (from £53.2m), though an internal asset sale flatters it — underlying operating loss ~£57.8m. Friedkin Group bought out Moshiri in Dec 2024.", net: "Profit on player trading £31.3m.", wages: "Wage bill fell £4.5m to £152.1m; wage/turnover improved to 74% after outsourcing retail & catering.", amort: "Player amortisation cut £13.7m to £50.9m.", agent: "No European football. FA Feb–Feb window ≠ fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 13,
      rev: 230, net: 20, wages: 160, amort: 55, agent: 10.0,
      src: "Projection from FY25 base + first full season at the new Hill Dickinson Stadium (higher matchday)", agentSrc: "FA 2025/26 (£10.0m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are formulaic estimates from market value. Departed players (Gueye, Onyango, Coleman — released/without club) excluded.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/fc-everton/startseite/verein/29",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
  { name: "Jordan Pickford", position: "GK", weeklyWage: 150000, marketValue: 11.2, fee: 24.6, signedYear: 2017, contractEndYear: 2029, isAcademy: false },
  { name: "Mark Travers", position: "GK", weeklyWage: 25000, marketValue: 2.6, fee: 4, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Tom King", position: "GK", weeklyWage: 15000, marketValue: 0.1, fee: 0, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Jarrad Branthwaite", position: "DF", weeklyWage: 120000, marketValue: 34.5, fee: 0.9, signedYear: 2020, contractEndYear: 2030, isAcademy: false },
  { name: "James Tarkowski", position: "DF", weeklyWage: 120000, marketValue: 4.3, fee: 0, signedYear: 2022, contractEndYear: 2028, isAcademy: false },
  { name: "Michael Keane", position: "DF", weeklyWage: 80000, marketValue: 2.6, fee: 24.6, signedYear: 2017, contractEndYear: 2027, isAcademy: false },
  { name: "Vitaliy Mykolenko", position: "DF", weeklyWage: 58000, marketValue: 21.6, fee: 20.3, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
  { name: "Adam Aznou", position: "DF", weeklyWage: 25000, marketValue: 5.2, fee: 7.8, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Jake O'Brien", position: "DF", weeklyWage: 35000, marketValue: 15.5, fee: 16.8, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Nathan Patterson", position: "DF", weeklyWage: 28000, marketValue: 8.6, fee: 12.1, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "James Garner", position: "MF", weeklyWage: 80000, marketValue: 38.8, fee: 9, signedYear: 2022, contractEndYear: 2030, isAcademy: false },
  { name: "Hayden Hackney", position: "MF", weeklyWage: 85000, marketValue: 27.6, fee: 16.6, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Kiernan Dewsbury-Hall", position: "MF", weeklyWage: 90000, marketValue: 30.2, fee: 24.7, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Tim Iroegbunam", position: "MF", weeklyWage: 20000, marketValue: 15.5, fee: 9.2, signedYear: 2024, contractEndYear: 2027, isAcademy: false },
  { name: "Carlos Alcaraz", position: "MF", weeklyWage: 20000, marketValue: 12.9, fee: 12.9, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Harrison Armstrong", position: "MF", weeklyWage: 1200, marketValue: 10.3, fee: 0, signedYear: 2024, contractEndYear: 2028, isAcademy: true },
  { name: "Merlin Röhl", position: "MF", weeklyWage: 15500, marketValue: 13.8, fee: 21.6, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Dwight McNeil", position: "FW", weeklyWage: 25000, marketValue: 15.5, fee: 14.7, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Iliman Ndiaye", position: "FW", weeklyWage: 45000, marketValue: 47.4, fee: 15.5, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Tyler Dibling", position: "FW", weeklyWage: 40000, marketValue: 14.7, fee: 34.9, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Thierno Barry", position: "FW", weeklyWage: 45000, marketValue: 25.9, fee: 25.9, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Norberto Bercique Gomes Betuncal", position: "FW", weeklyWage: 60000, marketValue: 15.5, fee: 21.6, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  ],
};

const BOURNEMOUTH: Club = {
  league: "EPL",
  id: "bournemouth", name: "AFC Bournemouth", shortName: "Bournemouth", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 9,
      rev: 182, net: 91, wages: 158, amort: 69, agent: 16.4,
      src: "AFC Bournemouth FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", url: "https://swissramble.substack.com/p/bournemouth-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Club-record £182m (+£21m). One of only two PL clubs in profit (~£15m underlying), a model entirely reliant on player trading.", net: "Profit on player sales soared from £0.3m to £91m (Solanke, Huijsen, Kerkez).", wages: "Wages £158m; total staff cost before player sales ~125% of revenue — likely the league's highest.", amort: "Player amortisation £69m after >£300m of squad investment.", agent: "No European football. FA Feb–Feb window ≠ fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 6,
      rev: 190, net: 45, wages: 160, amort: 72, agent: 20.9,
      src: "Projection from FY25 base (9th in 2024/25, no European football)", agentSrc: "FA 2025/26 (£20.9m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are formulaic estimates from market value. Departed players (Senesi → Tottenham, Traoré, Sinisterra) excluded.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/afc-bournemouth/startseite/verein/989",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
  { name: "Djordje Petrovic", position: "GK", weeklyWage: 60000, marketValue: 24.1, fee: 24.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Alex Paulsen", position: "GK", weeklyWage: 25000, marketValue: 0.4, fee: 2, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Fraser Forster", position: "GK", weeklyWage: 40000, marketValue: 0.3, fee: 0, signedYear: 2026, contractEndYear: 2027, isAcademy: false },
  { name: "Will Dennis", position: "GK", weeklyWage: 9000, marketValue: 0.3, fee: 0, signedYear: 2021, contractEndYear: 2028, isAcademy: true },
  { name: "Bafodé Diakité", position: "DF", weeklyWage: 70000, marketValue: 21.6, fee: 30.2, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "James Hill", position: "DF", weeklyWage: 25000, marketValue: 19.8, fee: 1, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
  { name: "Veljko Milosavljevic", position: "DF", weeklyWage: 25000, marketValue: 17.2, fee: 12.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Matai Akinmboni", position: "DF", weeklyWage: 4000, marketValue: 0.9, fee: 1.3, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Adrien Truffert", position: "DF", weeklyWage: 35000, marketValue: 25.9, fee: 11.6, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Julio Soler", position: "DF", weeklyWage: 20000, marketValue: 6.9, fee: 6.9, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Álex Jiménez", position: "DF", weeklyWage: 18000, marketValue: 19, fee: 15.9, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Julián Araujo", position: "DF", weeklyWage: 25000, marketValue: 6.9, fee: 8.6, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Max Aarons", position: "DF", weeklyWage: 15000, marketValue: 2.2, fee: 7, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
  { name: "Adam Smith", position: "DF", weeklyWage: 40000, marketValue: 0.3, fee: 0, signedYear: 2014, contractEndYear: 2027, isAcademy: false },
  { name: "Tyler Adams", position: "MF", weeklyWage: 60000, marketValue: 21.6, fee: 23.2, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Ben Winterburn", position: "MF", weeklyWage: 25000, marketValue: 0.3, fee: 0, signedYear: 2025, contractEndYear: 2027, isAcademy: true },
  { name: "Alex Scott", position: "MF", weeklyWage: 40000, marketValue: 43.1, fee: 19.8, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Alex Tóth", position: "MF", weeklyWage: 40000, marketValue: 10.3, fee: 10.3, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Lewis Cook", position: "MF", weeklyWage: 60000, marketValue: 9.5, fee: 6, signedYear: 2016, contractEndYear: 2028, isAcademy: false },
  { name: "Ryan Christie", position: "MF", weeklyWage: 70000, marketValue: 6.9, fee: 2.5, signedYear: 2021, contractEndYear: 2029, isAcademy: false },
  { name: "Marcus Tavernier", position: "MF", weeklyWage: 65000, marketValue: 21.6, fee: 10.3, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
  { name: "Justin Kluivert", position: "MF", weeklyWage: 80000, marketValue: 21.6, fee: 9.3, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Romain Faivre", position: "MF", weeklyWage: 35000, marketValue: 3.4, fee: 12.9, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Amine Adli", position: "FW", weeklyWage: 60000, marketValue: 17.2, fee: 18.1, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Rayan Rocha", position: "FW", weeklyWage: 45000, marketValue: 51.7, fee: 24.6, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Ben Gannon-Doak", position: "FW", weeklyWage: 30000, marketValue: 12.9, fee: 20, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "David Brooks", position: "FW", weeklyWage: 50000, marketValue: 10.3, fee: 9.7, signedYear: 2018, contractEndYear: 2029, isAcademy: false },
  { name: "Junior Kroupi", position: "FW", weeklyWage: 20000, marketValue: 60.3, fee: 11.2, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Francisco Evanilson", position: "FW", weeklyWage: 85000, marketValue: 30.2, fee: 31.9, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Enes Ünal", position: "FW", weeklyWage: 15000, marketValue: 6, fee: 14.2, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Daniel Jebbison", position: "FW", weeklyWage: 5000, marketValue: 5.2, fee: 0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  ],
};

const BRIGHTON: Club = {
  league: "EPL",
  id: "brighton", name: "Brighton & Hove Albion", shortName: "Brighton", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 8,
      rev: 222, net: 57, wages: 165, amort: 82, agent: 16.6,
      src: "Brighton & Hove Albion FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", url: "https://swissramble.substack.com/p/brighton-and-hove-albion-finances-28d",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Revenue £222m, broadly flat: lost European income offset by a higher 8th-place finish and commercial growth to £43m. £56m loss.", net: "Profit on player sales £57m (down from £110m) — a ~£131m swing in profitability.", wages: "Wages up £19m to £165m after heavy recruitment (~£210m spent).", amort: "Player amortisation more than doubled, +£43m to £82m.", agent: "No European football in 2024/25. FA Feb–Feb window ≠ fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 8,
      rev: 230, net: 80, wages: 170, amort: 90, agent: 19.5,
      src: "Projection from FY25 base (8th in 2024/25, no European football)", agentSrc: "FA 2025/26 (£19.5m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are formulaic estimates from market value. Large, deep squad reflecting Brighton's trading model (many recent buys still carrying high book value).",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/brighton-amp-hove-albion/startseite/verein/1237",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
  { name: "Bart Verbruggen", position: "GK", weeklyWage: 35000, marketValue: 34.5, fee: 17.2, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Carl Rushworth", position: "GK", weeklyWage: 5000, marketValue: 13.8, fee: 0, signedYear: 2023, contractEndYear: 2027, isAcademy: true },
  { name: "James Beadle", position: "GK", weeklyWage: 5000, marketValue: 5.2, fee: 0, signedYear: 2025, contractEndYear: 2028, isAcademy: true },
  { name: "Jason Steele", position: "GK", weeklyWage: 20000, marketValue: 0.4, fee: 0, signedYear: 2018, contractEndYear: 2027, isAcademy: false },
  { name: "Tom McGill", position: "GK", weeklyWage: 15000, marketValue: 0.4, fee: 0, signedYear: 2022, contractEndYear: 2027, isAcademy: true },
  { name: "Pascal Struijk", position: "DF", weeklyWage: 75000, marketValue: 19, fee: 20, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Diego Coppola", position: "DF", weeklyWage: 25000, marketValue: 15.5, fee: 9.5, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Olivier Boscagli", position: "DF", weeklyWage: 60000, marketValue: 12.9, fee: 0, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Igor Julio", position: "DF", weeklyWage: 45000, marketValue: 8.6, fee: 14.2, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Eiran Cashin", position: "DF", weeklyWage: 15000, marketValue: 4.3, fee: 9.3, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Michael Svoboda", position: "DF", weeklyWage: 40000, marketValue: 3, fee: 4.3, signedYear: 2026, contractEndYear: 2030, isAcademy: false },
  { name: "Lewis Dunk", position: "DF", weeklyWage: 85000, marketValue: 3, fee: 0, signedYear: 2010, contractEndYear: 2027, isAcademy: true },
  { name: "Ferdi Kadıoğlu", position: "DF", weeklyWage: 87500, marketValue: 30.2, fee: 25.9, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Maxim De Cuyper", position: "DF", weeklyWage: 55000, marketValue: 19, fee: 17.2, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Mats Wieffer", position: "DF", weeklyWage: 60000, marketValue: 21.6, fee: 27.6, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "João Pedro", position: "DF", weeklyWage: 50000, marketValue: 6, fee: 10.9, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Carlos Baleba", position: "MF", weeklyWage: 12500, marketValue: 47.4, fee: 23.3, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Jack Hinshelwood", position: "MF", weeklyWage: 25000, marketValue: 24.1, fee: 0, signedYear: 2023, contractEndYear: 2029, isAcademy: true },
  { name: "Yasin Ayari", position: "MF", weeklyWage: 8000, marketValue: 30.2, fee: 3.4, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Diego Gómez", position: "MF", weeklyWage: 25000, marketValue: 21.6, fee: 11.2, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Matt O'Riley", position: "MF", weeklyWage: 50000, marketValue: 15.5, fee: 25.4, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Malick Yalcouyé", position: "MF", weeklyWage: 15000, marketValue: 10.3, fee: 6, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Pascal Groß", position: "MF", weeklyWage: 90000, marketValue: 2.2, fee: 1.7, signedYear: 2026, contractEndYear: 2027, isAcademy: false },
  { name: "Brajan Gruda", position: "MF", weeklyWage: 50000, marketValue: 24.1, fee: 27.2, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Facundo Buonanotte", position: "MF", weeklyWage: 25000, marketValue: 10.3, fee: 5.2, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Kaoru Mitoma", position: "FW", weeklyWage: 80000, marketValue: 19, fee: 2.6, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Ibrahim Osman", position: "FW", weeklyWage: 45000, marketValue: 6, fee: 16.8, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Tom Watson", position: "FW", weeklyWage: 20000, marketValue: 6, fee: 10.3, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Yankuba Minteh", position: "FW", weeklyWage: 40000, marketValue: 38.8, fee: 30.2, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Zadok Yohanna", position: "FW", weeklyWage: 70000, marketValue: 15.5, fee: 24.1, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Amario Cozier-Duberry", position: "FW", weeklyWage: 3000, marketValue: 4.3, fee: 0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Rodrigo Rêgo", position: "FW", weeklyWage: 30000, marketValue: 1.3, fee: 3, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Do-young Yoon", position: "FW", weeklyWage: 25000, marketValue: 0.6, fee: 1.7, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Georginio Rutter", position: "FW", weeklyWage: 75000, marketValue: 25.9, fee: 40.3, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Charalampos Kostoulas", position: "FW", weeklyWage: 40000, marketValue: 21.6, fee: 30.2, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Evan Ferguson", position: "FW", weeklyWage: 30000, marketValue: 17.2, fee: 0, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
  { name: "Stefanos Tzimas", position: "FW", weeklyWage: 20000, marketValue: 15.5, fee: 22.8, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Danny Welbeck", position: "FW", weeklyWage: 60000, marketValue: 2.6, fee: 0, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
  ],
};

const CRYSTAL_PALACE: Club = {
  league: "EPL",
  id: "crystal-palace", name: "Crystal Palace", shortName: "Crystal Palace", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 12,
      rev: 197, net: 66, wages: 148.3, amort: 54.1, agent: 12.0,
      src: "Crystal Palace FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", url: "https://swissramble.substack.com/p/crystal-palace-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Revenue £197m (+£6m). Net profit £5m — one of only four PL clubs in the black.", net: "Profit on player sales £66m (Olise, Andersen).", wages: "Wages up £14.6m to a record £148.3m.", amort: "Player amortisation up £8.1m to £54.1m.", agent: "No European football in 2024/25 (won the FA Cup in May 2025 → Europe in 2025/26). FA Feb–Feb window ≠ fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: true, pos: 15, tier: "UEL_UECL", // Conference League 2025/26 (demoted from UEL by UEFA multi-club ruling)
      rev: 210, net: 45, wages: 155, amort: 58, agent: 16.8, priors: [66, 0.3],
      src: "Projection from FY25 base + European football (2025/26 UEFA competition following the 2024/25 FA Cup win)", agentSrc: "FA 2025/26 (£16.8m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are formulaic estimates from market value. Departed players (Kamada — released) excluded; incoming 2025/26 signings (Strand Larsen, Pino, Johnson) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/crystal-palace/startseite/verein/873",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
  { name: "Dean Henderson", position: "GK", weeklyWage: 80000, marketValue: 24.1, fee: 15.1, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Walter Benítez", position: "GK", weeklyWage: 40000, marketValue: 3.4, fee: 0, signedYear: 2025, contractEndYear: 2028, isAcademy: false },
  { name: "Owen Goodman", position: "GK", weeklyWage: 25000, marketValue: 0.5, fee: 0, signedYear: 2025, contractEndYear: 2026, isAcademy: true },
  { name: "Remi Matthews", position: "GK", weeklyWage: 25000, marketValue: 0.2, fee: 0, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Maxence Lacroix", position: "DF", weeklyWage: 105000, marketValue: 43.1, fee: 15.5, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Jaydee Canvot", position: "DF", weeklyWage: 80000, marketValue: 24.1, fee: 19.8, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
  { name: "Chris Richards", position: "DF", weeklyWage: 80000, marketValue: 24.1, fee: 10.3, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Chadi Riad", position: "DF", weeklyWage: 65000, marketValue: 12.9, fee: 12.9, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Tyrick Mitchell", position: "DF", weeklyWage: 80000, marketValue: 21.6, fee: 0, signedYear: 2020, contractEndYear: 2027, isAcademy: true },
  { name: "Borna Sosa", position: "DF", weeklyWage: 35000, marketValue: 2.6, fee: 2, signedYear: 2025, contractEndYear: 2028, isAcademy: false },
  { name: "Rio Cardines", position: "DF", weeklyWage: 25000, marketValue: 0.3, fee: 0, signedYear: 2025, contractEndYear: 2028, isAcademy: true },
  { name: "Daniel Muñoz", position: "DF", weeklyWage: 75000, marketValue: 19, fee: 6.9, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Caleb Kporha", position: "DF", weeklyWage: 30000, marketValue: 0.9, fee: 0, signedYear: 2024, contractEndYear: 2029, isAcademy: true },
  { name: "Nathaniel Clyne", position: "DF", weeklyWage: 25000, marketValue: 0.3, fee: 0, signedYear: 2020, contractEndYear: 2026, isAcademy: false },
  { name: "Adam Wharton", position: "MF", weeklyWage: 120000, marketValue: 60.3, fee: 18.2, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Cheick Doucouré", position: "MF", weeklyWage: 55000, marketValue: 8.6, fee: 19.5, signedYear: 2022, contractEndYear: 2029, isAcademy: false },
  { name: "Jefferson Lerma", position: "MF", weeklyWage: 45000, marketValue: 5.2, fee: 0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "David Ozoh", position: "MF", weeklyWage: 35000, marketValue: 1.9, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: true },
  { name: "Will Hughes", position: "MF", weeklyWage: 45000, marketValue: 4.3, fee: 6, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
  { name: "Justin Devenny", position: "MF", weeklyWage: 60000, marketValue: 10.3, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: false },
  { name: "Matheus França", position: "MF", weeklyWage: 45000, marketValue: 5.2, fee: 17.2, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Ismaïla Sarr", position: "FW", weeklyWage: 95000, marketValue: 34.5, fee: 12.9, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Yéremy Pino", position: "FW", weeklyWage: 85000, marketValue: 25.9, fee: 25.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Brennan Johnson", position: "FW", weeklyWage: 85000, marketValue: 25.9, fee: 34.5, signedYear: 2026, contractEndYear: 2030, isAcademy: false },
  { name: "Romain Esse", position: "FW", weeklyWage: 55000, marketValue: 8.6, fee: 12.2, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Jesurun Rak-Sakyi", position: "FW", weeklyWage: 45000, marketValue: 5.2, fee: 0, signedYear: 2022, contractEndYear: 2027, isAcademy: true },
  { name: "Jørgen Strand Larsen", position: "FW", weeklyWage: 95000, marketValue: 34.5, fee: 42.8, signedYear: 2026, contractEndYear: 2030, isAcademy: false },
  { name: "Jean-Philippe Mateta", position: "FW", weeklyWage: 85000, marketValue: 25.9, fee: 9.5, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
  { name: "Eddie Nketiah", position: "FW", weeklyWage: 55000, marketValue: 8.6, fee: 25.6, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  ],
};

const BRENTFORD: Club = {
  league: "EPL",
  id: "brentford", name: "Brentford", shortName: "Brentford", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 10,
      rev: 173.1, net: 27.2, wages: 131, amort: 48, agent: 14.8,
      src: "Brentford FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", url: "https://swissramble.substack.com/p/brentford-finances-202425",
      agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Club-record £173.1m (+£6.6m) on a 10th-place finish. Pre-tax loss widened to £20.5m.", net: "Profit on player sales £27.2m (Toney to Al-Ahli). Excludes the summer-2025 Mbeumo/Wissa/Nørgaard sales, which land in FY2025/26.", wages: "Wages up £17m to £131m.", amort: "Player amortisation up to £48m.", agent: "No European football. FA Feb–Feb window ≠ fiscal year; value is the actual 2024/25 window (period-matched)." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 9,
      rev: 180, net: 100, wages: 130, amort: 50, agent: 12.7,
      src: "Projection: FY25 base + a large player-trading profit from the Mbeumo & Wissa sales (~£110m proceeds vs ~£16m book cost)", agentSrc: "FA 2025/26 (£12.7m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt (scraped 2 Jul 2026). Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); book values derived from that fee ÷ contract length. Wages are formulaic estimates from market value. Departed players (Frank Onyeka → Coventry, Ryan Trevitt) excluded; incoming 2025/26 signings (Ouattara, Kelleher, Henderson) included.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/brentford-fc/startseite/verein/1148",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
  { name: "Caoimhín Kelleher", position: "GK", weeklyWage: 55000, marketValue: 24.1, fee: 12.8, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Hákon Valdimarsson", position: "GK", weeklyWage: 10000, marketValue: 2.2, fee: 2.6, signedYear: 2024, contractEndYear: 2030, isAcademy: false },
  { name: "Matthew Cox", position: "GK", weeklyWage: 7000, marketValue: 0.6, fee: 0.4, signedYear: 2021, contractEndYear: 2028, isAcademy: false },
  { name: "Ellery Balcombe", position: "GK", weeklyWage: 10000, marketValue: 0.3, fee: 0, signedYear: 2018, contractEndYear: 2027, isAcademy: true },
  { name: "Julian Eyestone", position: "GK", weeklyWage: 8000, marketValue: 0, fee: 0, signedYear: 2024, contractEndYear: 2031, isAcademy: false },
  { name: "Sepp van den Berg", position: "DF", weeklyWage: 20000, marketValue: 27.6, fee: 20.3, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Nathan Collins", position: "DF", weeklyWage: 30000, marketValue: 25.9, fee: 23.1, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
  { name: "Jannik Schuster", position: "DF", weeklyWage: 70000, marketValue: 15.5, fee: 15.5, signedYear: 2026, contractEndYear: 2031, isAcademy: false },
  { name: "Kristoffer Ajer", position: "DF", weeklyWage: 50000, marketValue: 15.5, fee: 13.5, signedYear: 2021, contractEndYear: 2030, isAcademy: false },
  { name: "Ethan Pinnock", position: "DF", weeklyWage: 30000, marketValue: 2.6, fee: 2.9, signedYear: 2019, contractEndYear: 2027, isAcademy: false },
  { name: "Ji-soo Kim", position: "DF", weeklyWage: 5000, marketValue: 1.6, fee: 0.6, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
  { name: "Benjamin Arthur", position: "DF", weeklyWage: 8000, marketValue: 0.1, fee: 0.9, signedYear: 2023, contractEndYear: 2031, isAcademy: false },
  { name: "Rico Henry", position: "DF", weeklyWage: 35000, marketValue: 11.2, fee: 1.6, signedYear: 2016, contractEndYear: 2027, isAcademy: false },
  { name: "Jayden Meghoma", position: "DF", weeklyWage: 15000, marketValue: 1.7, fee: 5.1, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
  { name: "Michael Kayode", position: "DF", weeklyWage: 40000, marketValue: 34.5, fee: 15.1, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Aaron Hickey", position: "DF", weeklyWage: 70000, marketValue: 13.8, fee: 12.3, signedYear: 2022, contractEndYear: 2028, isAcademy: false },
  { name: "Vitaly Janelt", position: "MF", weeklyWage: 50000, marketValue: 13.8, fee: 0.5, signedYear: 2020, contractEndYear: 2030, isAcademy: false },
  { name: "Yunus Konak", position: "MF", weeklyWage: 15000, marketValue: 3, fee: 3.9, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Jordan Henderson", position: "MF", weeklyWage: 75000, marketValue: 1, fee: 0, signedYear: 2025, contractEndYear: 2027, isAcademy: false },
  { name: "Yegor Yarmolyuk", position: "MF", weeklyWage: 25000, marketValue: 27.6, fee: 1.3, signedYear: 2022, contractEndYear: 2031, isAcademy: false },
  { name: "Mathias Jensen", position: "MF", weeklyWage: 50000, marketValue: 8.6, fee: 3.3, signedYear: 2019, contractEndYear: 2027, isAcademy: false },
  { name: "Josh Dasilva", position: "MF", weeklyWage: 30000, marketValue: 1.3, fee: 0, signedYear: 2018, contractEndYear: 2027, isAcademy: false },
  { name: "Keane Lewis-Potter", position: "MF", weeklyWage: 50000, marketValue: 21.6, fee: 16.4, signedYear: 2022, contractEndYear: 2031, isAcademy: false },
  { name: "Mikkel Damsgaard", position: "MF", weeklyWage: 75000, marketValue: 25.9, fee: 12.9, signedYear: 2022, contractEndYear: 2030, isAcademy: false },
  { name: "Antoni Milambo", position: "MF", weeklyWage: 30000, marketValue: 12.9, fee: 17.2, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  { name: "Fábio Carvalho", position: "MF", weeklyWage: 40000, marketValue: 6.9, fee: 20.2, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
  { name: "Kevin Schade", position: "FW", weeklyWage: 10000, marketValue: 30.2, fee: 21.6, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
  { name: "Gustavo Nunes", position: "FW", weeklyWage: 25000, marketValue: 6.9, fee: 10.3, signedYear: 2024, contractEndYear: 2030, isAcademy: false },
  { name: "Dango Ouattara", position: "FW", weeklyWage: 65000, marketValue: 30.2, fee: 36.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
  ],
};

const NOTTINGHAM_FOREST: Club = {
  league: "EPL",
  id: "nottingham-forest", name: "Nottingham Forest", shortName: "Nott'm Forest", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 7,
      rev: 221.7, net: 7, wages: 167, amort: 68.9, agent: 18.5, priors: [100.5, 20],
      src: "Nottingham Forest FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Record revenue of £221.7m (+17%) following commercial and broadcast growth. Operating pre-tax loss of £78.9m.", net: "Profit on disposal of player registrations fell to £7m (down from £100.5m).", wages: "Total staff wage costs was £167m, representing 75% of revenue.", amort: "Player amortisation rose to £68.9m due to high historical acquisitions." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 16,
      rev: 225, net: 35, wages: 170, amort: 72, agent: 15.2, priors: [7, 100.5],
      src: "Projection: FY25 base + estimated player sales profit", agentSrc: "FA 2025/26 (£15.2m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt and Capology. Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); wages are Capology 2025/26 estimates.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/nottingham-forest/startseite/verein/703",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
    { name: "Matz Sels", position: "GK", weeklyWage: 40000, marketValue: 6.9, fee: 3.4, signedYear: 2024, contractEndYear: 2027, isAcademy: false },
    { name: "Carlos Miguel", position: "GK", weeklyWage: 30000, marketValue: 3.4, fee: 3.4, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Murillo", position: "DF", weeklyWage: 75000, marketValue: 34.5, fee: 11.2, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Nikola Milenković", position: "DF", weeklyWage: 105000, marketValue: 15.5, fee: 12.0, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Willy Boly", position: "DF", weeklyWage: 40000, marketValue: 1.3, fee: 2.1, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Neco Williams", position: "DF", weeklyWage: 65000, marketValue: 15.5, fee: 17.0, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Ola Aina", position: "DF", weeklyWage: 60000, marketValue: 8.6, fee: 0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Alex Moreno", position: "DF", weeklyWage: 60000, marketValue: 10.3, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: false },
    { name: "Morato", position: "DF", weeklyWage: 40000, marketValue: 12.9, fee: 12.9, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Andrew Omobamidele", position: "DF", weeklyWage: 30000, marketValue: 6.9, fee: 11.0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Harry Toffolo", position: "DF", weeklyWage: 25000, marketValue: 2.2, fee: 2.1, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Zach Abbott", position: "DF", weeklyWage: 12500, marketValue: 0.5, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: true },
    { name: "Morgan Gibbs-White", position: "MF", weeklyWage: 110000, marketValue: 43.1, fee: 42.5, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Ibrahim Sangaré", position: "MF", weeklyWage: 75000, marketValue: 21.6, fee: 30.0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Ryan Yates", position: "MF", weeklyWage: 50000, marketValue: 8.6, fee: 0, signedYear: 2018, contractEndYear: 2028, isAcademy: true },
    { name: "Nicolas Domínguez", position: "MF", weeklyWage: 35000, marketValue: 14.7, fee: 8.6, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Elliot Anderson", position: "MF", weeklyWage: 40000, marketValue: 17.2, fee: 35.0, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Danilo", position: "MF", weeklyWage: 45000, marketValue: 19.0, fee: 17.2, signedYear: 2023, contractEndYear: 2029, isAcademy: false },
    { name: "James Ward-Prowse", position: "MF", weeklyWage: 100000, marketValue: 18.1, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: false },
    { name: "Anthony Elanga", position: "FW", weeklyWage: 65000, marketValue: 21.6, fee: 15.0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Callum Hudson-Odoi", position: "FW", weeklyWage: 90000, marketValue: 18.1, fee: 3.0, signedYear: 2023, contractEndYear: 2026, isAcademy: false },
    { name: "Chris Wood", position: "FW", weeklyWage: 90000, marketValue: 6.9, fee: 15.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Taiwo Awoniyi", position: "FW", weeklyWage: 50000, marketValue: 24.1, fee: 17.2, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Ramón Sosa", position: "FW", weeklyWage: 35000, marketValue: 11.2, fee: 10.3, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Jota Silva", position: "FW", weeklyWage: 25000, marketValue: 10.3, fee: 6.0, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Emmanuel Dennis", position: "FW", weeklyWage: 40000, marketValue: 3.4, fee: 14.7, signedYear: 2022, contractEndYear: 2026, isAcademy: false },
  ],
};

const FULHAM: Club = {
  league: "EPL",
  id: "fulham", name: "Fulham", shortName: "Fulham", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false, pos: 11,
      rev: 194.8, net: 41, wages: 167, amort: 58, agent: 14.2, priors: [25, 20],
      src: "Fulham FY25 accounts, year ended 30 Jun 2025 (Swiss Ramble analysis)", agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Record revenue of £194.8m driven by improved 11th-place league finish and new Riverside Stand opening.", net: "Profit on player sales £41m, driven by Palhinha and Stansfield.", wages: "Total staff wage costs of £167m representing high operational commitment.", amort: "Player amortisation estimated at £58m." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 11,
      rev: 197, net: 30, wages: 170, amort: 62, agent: 12.4, priors: [41, 25],
      src: "Projection: FY25 base + moderate trading profit", agentSrc: "FA 2025/26 (£12.4m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt and Capology. Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); wages are Capology 2025/26 estimates.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/fulham-fc/startseite/verein/931",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
    { name: "Bernd Leno", position: "GK", weeklyWage: 130000, marketValue: 8.6, fee: 3.0, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Joachim Andersen", position: "DF", weeklyWage: 90000, marketValue: 27.6, fee: 30.0, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Calvin Bassey", position: "DF", weeklyWage: 45000, marketValue: 14.7, fee: 19.0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Antonee Robinson", position: "DF", weeklyWage: 60000, marketValue: 21.6, fee: 6.0, signedYear: 2020, contractEndYear: 2028, isAcademy: false },
    { name: "Timothy Castagne", position: "DF", weeklyWage: 65000, marketValue: 10.3, fee: 15.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Kenny Tete", position: "DF", weeklyWage: 65000, marketValue: 6.9, fee: 3.0, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
    { name: "Issa Diop", position: "DF", weeklyWage: 70000, marketValue: 12.9, fee: 15.0, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Jorge Cuenca", position: "DF", weeklyWage: 25000, marketValue: 5.2, fee: 5.8, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Ryan Sessegnon", position: "DF", weeklyWage: 45000, marketValue: 8.6, fee: 0, signedYear: 2024, contractEndYear: 2026, isAcademy: false },
    { name: "Luc de Fougerolles", position: "DF", weeklyWage: 5000, marketValue: 0.8, fee: 0, signedYear: 2023, contractEndYear: 2028, isAcademy: true },
    { name: "Sander Berge", position: "MF", weeklyWage: 55000, marketValue: 18.1, fee: 20.0, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Andreas Pereira", position: "MF", weeklyWage: 65000, marketValue: 15.5, fee: 10.0, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Emile Smith Rowe", position: "MF", weeklyWage: 70000, marketValue: 30.2, fee: 27.0, signedYear: 2024, contractEndYear: 2029, isAcademy: false },
    { name: "Alex Iwobi", position: "MF", weeklyWage: 80000, marketValue: 18.1, fee: 22.0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Harrison Reed", position: "MF", weeklyWage: 50000, marketValue: 8.6, fee: 6.0, signedYear: 2020, contractEndYear: 2027, isAcademy: false },
    { name: "Tom Cairney", position: "MF", weeklyWage: 35000, marketValue: 1.7, fee: 4.0, signedYear: 2015, contractEndYear: 2026, isAcademy: false },
    { name: "Saša Lukić", position: "MF", weeklyWage: 63000, marketValue: 8.6, fee: 8.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Josh King", position: "MF", weeklyWage: 20000, marketValue: 0.5, fee: 0, signedYear: 2024, contractEndYear: 2027, isAcademy: true },
    { name: "Harry Wilson", position: "FW", weeklyWage: 55000, marketValue: 10.3, fee: 12.0, signedYear: 2021, contractEndYear: 2026, isAcademy: false },
    { name: "Rodrigo Muniz", position: "FW", weeklyWage: 60000, marketValue: 14.7, fee: 7.0, signedYear: 2021, contractEndYear: 2028, isAcademy: false },
    { name: "Raúl Jiménez", position: "FW", weeklyWage: 100000, marketValue: 3.4, fee: 5.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Adama Traoré", position: "FW", weeklyWage: 35000, marketValue: 4.3, fee: 0, signedYear: 2023, contractEndYear: 2025, isAcademy: false },
    { name: "Reiss Nelson", position: "FW", weeklyWage: 75000, marketValue: 12.9, fee: 0, signedYear: 2024, contractEndYear: 2025, isAcademy: false },
    { name: "Steven Benda", position: "GK", weeklyWage: 10000, marketValue: 1.0, fee: 1.0, signedYear: 2023, contractEndYear: 2026, isAcademy: false },
    { name: "Carlos Vinícius", position: "FW", weeklyWage: 40000, marketValue: 3.4, fee: 4.3, signedYear: 2022, contractEndYear: 2026, isAcademy: false },
  ],
};

const LEEDS: Club = {
  league: "EPL",
  id: "leeds", name: "Leeds United", shortName: "Leeds", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false,
      rev: 137, net: 75, wages: 103, amort: 30, agent: 9.5, priors: [15, 10],
      src: "Leeds United FY25 accounts, Championship season (Kieran Maguire analysis)", agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Championship record revenue of £137m backed by high commercial and matchday metrics. Operating loss at £49.1m.", net: "Profit on player sales of £75m from Summerville, Gray, and Rutter departures.", wages: "Total staff wage cost was £103m, among the highest in Championship history.", amort: "Player amortisation estimated at £30m." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 14,
      rev: 145, net: 30, wages: 110, amort: 35, agent: 11.2, priors: [75, 15],
      src: "Projection: Championship promotion campaign & high trading profits", agentSrc: "FA 2025/26 (£11.2m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt and Capology. Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); wages are Capology 2025/26 estimates.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/leeds-united/startseite/verein/399",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
    { name: "Dominic Calvert-Lewin", position: "FW", weeklyWage: 100000, marketValue: 19.0, fee: 15.0, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Sean Longstaff", position: "MF", weeklyWage: 80000, marketValue: 21.6, fee: 10.0, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Daniel James", position: "FW", weeklyWage: 75000, marketValue: 12.9, fee: 25.0, signedYear: 2021, contractEndYear: 2026, isAcademy: false },
    { name: "Noah Okafor", position: "FW", weeklyWage: 72500, marketValue: 17.2, fee: 15.5, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Pascal Struijk", position: "DF", weeklyWage: 50000, marketValue: 8.6, fee: 3.0, signedYear: 2018, contractEndYear: 2027, isAcademy: false },
    { name: "Lucas Perri", position: "GK", weeklyWage: 50000, marketValue: 6.9, fee: 6.0, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Brenden Aaronson", position: "MF", weeklyWage: 45000, marketValue: 10.3, fee: 28.0, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Jaka Bijol", position: "DF", weeklyWage: 45000, marketValue: 12.9, fee: 11.2, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Sebastiaan Bornauw", position: "DF", weeklyWage: 45000, marketValue: 8.6, fee: 7.8, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Anton Stach", position: "MF", weeklyWage: 45000, marketValue: 12.9, fee: 10.3, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Ethan Ampadu", position: "MF", weeklyWage: 40000, marketValue: 12.9, fee: 7.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Joe Rodon", position: "DF", weeklyWage: 40000, marketValue: 12.9, fee: 10.0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Gabriel Gudmundsson", position: "DF", weeklyWage: 40000, marketValue: 8.6, fee: 6.9, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Wilfried Gnonto", position: "FW", weeklyWage: 40000, marketValue: 15.5, fee: 4.0, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Joel Piroe", position: "FW", weeklyWage: 40000, marketValue: 10.3, fee: 10.5, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Illan Meslier", position: "GK", weeklyWage: 30000, marketValue: 10.3, fee: 5.0, signedYear: 2020, contractEndYear: 2026, isAcademy: false },
    { name: "Junior Firpo", position: "DF", weeklyWage: 35000, marketValue: 5.2, fee: 13.0, signedYear: 2021, contractEndYear: 2027, isAcademy: false },
    { name: "Jayden Bogle", position: "DF", weeklyWage: 30000, marketValue: 6.9, fee: 5.0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Ilia Gruev", position: "MF", weeklyWage: 15000, marketValue: 6.9, fee: 4.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Ao Tanaka", position: "MF", weeklyWage: 25000, marketValue: 4.3, fee: 3.0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Largie Ramazani", position: "FW", weeklyWage: 17500, marketValue: 8.6, fee: 10.0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Mateo Joseph", position: "FW", weeklyWage: 15000, marketValue: 6.9, fee: 0, signedYear: 2022, contractEndYear: 2028, isAcademy: true },
    { name: "Patrick Bamford", position: "FW", weeklyWage: 40000, marketValue: 2.6, fee: 7.0, signedYear: 2018, contractEndYear: 2026, isAcademy: false },
    { name: "Max Wöber", position: "DF", weeklyWage: 35000, marketValue: 8.6, fee: 11.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Charlie Crew", position: "MF", weeklyWage: 1000, marketValue: 0.5, fee: 0, signedYear: 2024, contractEndYear: 2028, isAcademy: true },
  ],
};

const SUNDERLAND: Club = {
  league: "EPL",
  id: "sunderland", name: "Sunderland", shortName: "Sunderland", defaultYearId: "fy2425",
  years: [
    yr({ id: "fy2425", label: "FY2024/25 (audited)", status: "verified", euro: false,
      rev: 40.3, net: 45.8, wages: 52.9, amort: 5, agent: 4.8, priors: [5, 3],
      src: "Sunderland AFC FY25 accounts, Championship season (audited analysis)", agentSrc: "FA published intermediary fees, 2024/25 window (actual, period-matched to FY24/25)", agentUrl: FA_URL,
      notes: { revenue: "Championship turnover rose to £40.3m. Narrowed pre-tax loss to £0.3m due to player sales.", net: "Profit on player sales reached £45.8m, primarily Jack Clarke's transfer.", wages: "Staff costs rose significantly to £52.9m.", amort: "Player amortisation was £5m." } }),
    yr({ id: "fy2526e", label: "FY2025/26 (estimate)", status: "estimate", euro: false, pos: 7,
      rev: 95, net: 10, wages: 75, amort: 15, agent: 6.2, priors: [45.8, 5],
      src: "Projection: Championship promotion run & squad developments", agentSrc: "FA 2025/26 (£6.2m)", agentUrl: FA_URL }),
  ],
  squadAsOf: {
    year: 2026,
    label: "Squad as of 2 Jul 2026 (start of 2026/27)",
    reliability: "derived",
    note: "Full senior squad pulled from Transfermarkt and Capology. Market values and transfer fees are Transfermarkt figures (€ converted to £ at 1.16); wages are Capology 2025/26 estimates.",
  },
  playersProvenance: {
    source: "Wages: Spotrac 2025/26 gross weekly (est.). Market values: Transfermarkt. Book values: derived from reported fee ÷ contract length × years remaining.",
    sourceUrl: "https://www.transfermarkt.us/sunderland-afc/startseite/verein/289",
    note: "No club discloses per-player wages or book values — inherently estimates. Fees are publicly reported; contract-end years are best estimates.",
  },
  players: [
    { name: "Granit Xhaka", position: "MF", weeklyWage: 110000, marketValue: 17.2, fee: 12.9, signedYear: 2025, contractEndYear: 2028, isAcademy: false },
    { name: "Nordi Mukiele", position: "DF", weeklyWage: 100000, marketValue: 10.3, fee: 8.6, signedYear: 2025, contractEndYear: 2029, isAcademy: false },
    { name: "Lutsharel Geertruida", position: "DF", weeklyWage: 85000, marketValue: 27.6, fee: 21.6, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Brian Brobbey", position: "FW", weeklyWage: 60000, marketValue: 25.9, fee: 20.3, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Enzo Le Fée", position: "MF", weeklyWage: 75000, marketValue: 17.2, fee: 15.1, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Habib Diarra", position: "MF", weeklyWage: 50000, marketValue: 15.5, fee: 12.9, signedYear: 2025, contractEndYear: 2030, isAcademy: false },
    { name: "Daniel Ballard", position: "DF", weeklyWage: 35000, marketValue: 8.6, fee: 2.0, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Trai Hume", position: "DF", weeklyWage: 45000, marketValue: 5.2, fee: 0.2, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Chris Rigg", position: "MF", weeklyWage: 35000, marketValue: 6.9, fee: 0, signedYear: 2023, contractEndYear: 2027, isAcademy: true },
    { name: "Wilson Isidor", position: "FW", weeklyWage: 25000, marketValue: 3.4, fee: 2.6, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Luke O'Nien", position: "DF", weeklyWage: 20000, marketValue: 1.7, fee: 0.1, signedYear: 2018, contractEndYear: 2026, isAcademy: false },
    { name: "Anthony Patterson", position: "GK", weeklyWage: 20000, marketValue: 6.9, fee: 0, signedYear: 2018, contractEndYear: 2028, isAcademy: true },
    { name: "Dennis Cirkin", position: "DF", weeklyWage: 20000, marketValue: 4.3, fee: 1.0, signedYear: 2021, contractEndYear: 2026, isAcademy: false },
    { name: "Dan Neil", position: "MF", weeklyWage: 15000, marketValue: 8.6, fee: 0, signedYear: 2020, contractEndYear: 2027, isAcademy: true },
    { name: "Jobe Bellingham", position: "MF", weeklyWage: 35000, marketValue: 12.9, fee: 3.0, signedYear: 2023, contractEndYear: 2028, isAcademy: false },
    { name: "Alan Browne", position: "MF", weeklyWage: 15000, marketValue: 3.4, fee: 0, signedYear: 2024, contractEndYear: 2026, isAcademy: false },
    { name: "Patrick Roberts", position: "FW", weeklyWage: 12500, marketValue: 4.3, fee: 0, signedYear: 2022, contractEndYear: 2026, isAcademy: false },
    { name: "Romaine Mundle", position: "FW", weeklyWage: 10000, marketValue: 3.4, fee: 2.0, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Eliezer Mayenda", position: "FW", weeklyWage: 30000, marketValue: 2.6, fee: 1.0, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Nazariy Rusyn", position: "FW", weeklyWage: 4500, marketValue: 2.2, fee: 2.5, signedYear: 2023, contractEndYear: 2027, isAcademy: false },
    { name: "Adil Aouchiche", position: "MF", weeklyWage: 7000, marketValue: 3.4, fee: 0, signedYear: 2023, contractEndYear: 2026, isAcademy: false },
    { name: "Leo Hjelde", position: "DF", weeklyWage: 10000, marketValue: 2.2, fee: 1.5, signedYear: 2024, contractEndYear: 2028, isAcademy: false },
    { name: "Simon Moore", position: "GK", weeklyWage: 15000, marketValue: 0.2, fee: 0, signedYear: 2024, contractEndYear: 2026, isAcademy: false },
    { name: "Aji Alese", position: "DF", weeklyWage: 15000, marketValue: 1.5, fee: 0.5, signedYear: 2022, contractEndYear: 2027, isAcademy: false },
    { name: "Tommy Watson", position: "FW", weeklyWage: 5000, marketValue: 0.8, fee: 0, signedYear: 2024, contractEndYear: 2028, isAcademy: true },
  ],
};

export const CLUBS: Club[] = [
  ...CLUBS_LALIGA,
  ...CLUBS_BUNDESLIGA,
  ...CLUBS_SERIEA,
  ...CLUBS_LIGUE1,
  TOTTENHAM, CHELSEA, MAN_CITY, ARSENAL, LIVERPOOL, MAN_UTD,
  NEWCASTLE, ASTON_VILLA, EVERTON, BOURNEMOUTH, BRIGHTON, CRYSTAL_PALACE, BRENTFORD,
  NOTTINGHAM_FOREST, FULHAM, LEEDS, SUNDERLAND,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getYear(club: Club, yearId: string): ClubYear {
  return (
    club.years.find((y) => y.id === yearId) ??
    club.years.find((y) => y.id === club.defaultYearId) ??
    club.years[0]
  );
}

export function toClubState(year: ClubYear, league?: string): ClubState {
  return {
    estimatedRevenue: year.revenue.value,
    annualWages: year.wages.value,
    annualAmortisation: year.amortisation.value,
    agentFees: year.agentFees.value,
    netPlayerTradingProfit: year.netPlayerTradingProfit.value,
    priorNetPlayerTradingProfits: year.priorNetTradingProfits,
    isPlayingInEurope: year.isPlayingInEurope,
    league,
  };
}

export const RELIABILITY_LABELS: Record<Reliability, string> = {
  primary: "Primary source",
  derived: "Derived",
  estimate: "Estimate",
  placeholder: "Unverified",
};
