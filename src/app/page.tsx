"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CLUBS,
  getYear,
  toClubState,
  bookValueAt,
  toSellable,
  yearEuropeTier,
  type Player,
  type Sourced,
  type Reliability,
  type VerificationStatus,
} from "@/data/clubs";
import { RULES, computeScr, type RegulatoryTrack, type Zone } from "@/utils/financialEngine";
import {
  projectPlan,
  solveMaxBid,
  encodeScenario,
  decodeScenario,
  WINDOWS,
  SEASON_LABELS,
  windowYearOffset,
  windowSeason,
  isJanuaryWindow,
  normalizeEuropeTier,
  squadMarketValueAfter,
  type EuropeTier,
  type WindowId,
  type PlannedSigning,
  type PlannedSale,
  type LoanOut,
  type LoanIn,
  type BuyClause,
  type ForwardInputs,
  type SharedScenario,
} from "@/utils/forwardPlanner";
import { solveClearingHouse, type ClearingResult, type ClearingSolution } from "@/utils/clearingHouse";
import LineupBuilder, { type RosterEntry } from "@/components/LineupBuilder";
import Onboarding from "@/components/Onboarding";
import type { Lineup } from "@/utils/lineups";

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const ZONE_STYLES: Record<Zone, { bar: string; text: string; ring: string; dot: string; border: string; soft: string }> = {
  GREEN: { bar: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/40", dot: "bg-emerald-500", border: "border-emerald-700/50", soft: "bg-emerald-950/30" },
  YELLOW: { bar: "bg-amber-500", text: "text-amber-400", ring: "ring-amber-500/40", dot: "bg-amber-500", border: "border-amber-700/50", soft: "bg-amber-950/30" },
  RED: { bar: "bg-red-600", text: "text-red-500", ring: "ring-red-500/50", dot: "bg-red-600", border: "border-red-700/50", soft: "bg-red-950/30" },
};
const RELIABILITY_STYLES: Record<Reliability, string> = {
  primary: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  derived: "bg-sky-900/60 text-sky-300 border-sky-700/50",
  estimate: "bg-amber-900/60 text-amber-300 border-amber-700/50",
  placeholder: "bg-red-900/50 text-red-300 border-red-700/50",
};
const STATUS_STYLES: Record<VerificationStatus, { label: string; cls: string }> = {
  verified: { label: "✓ Audited actuals", cls: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50" },
  estimate: { label: "≈ Forecast / model-derived", cls: "bg-amber-900/60 text-amber-300 border-amber-700/50" },
  provisional: { label: "⚠ Unverified placeholder", cls: "bg-red-900/50 text-red-300 border-red-700/50" },
};
const WINDOW_BADGE: Record<WindowId, string> = {
  W1: "bg-sky-900/60 text-sky-300 border-sky-700/50",
  W2: "bg-violet-900/60 text-violet-300 border-violet-700/50",
  W3: "bg-teal-900/60 text-teal-300 border-teal-700/50",
  W4: "bg-fuchsia-900/60 text-fuchsia-300 border-fuchsia-700/50",
  W5: "bg-cyan-900/60 text-cyan-300 border-cyan-700/50",
  W6: "bg-rose-900/60 text-rose-300 border-rose-700/50",
};

/** Cycle order + look for the per-season European tier pill. */
const TIER_CYCLE: EuropeTier[] = ["NONE", "UCL", "UEL_UECL"];
const TIER_PILL: Record<EuropeTier, { label: string; cls: string }> = {
  NONE: { label: "No Europe", cls: "border-neutral-700 text-neutral-500 hover:text-neutral-300" },
  UCL: { label: "⭐ Champions Lg", cls: "border-indigo-600/60 text-indigo-300 bg-indigo-950/40" },
  UEL_UECL: { label: "🟠 Europa/Conf", cls: "border-orange-700/60 text-orange-300 bg-orange-950/40" },
};

const fmtPct = (x: number) => (x * 100).toFixed(1) + "%";
const fmtM = (x: number) => `£${Math.round(x)}m`;
const windowShort = (w: WindowId) => WINDOWS.find((x) => x.id === w)!.short;

/** Compliance label + colour for a zone (no "points deduction" as primary UI). */
const ZONE_STATUS: Record<Zone, { label: string; tone: string }> = {
  GREEN: { label: "Compliant", tone: "text-emerald-400" },
  YELLOW: { label: "Luxury levy zone", tone: "text-amber-400" },
  RED: { label: "Regulatory breach risk", tone: "text-red-500" },
};

// ---------------------------------------------------------------------------
// Guided-flow steps
// ---------------------------------------------------------------------------

type Step = "club" | "transfers" | "compliance" | "lineup";
const STEP_ORDER: { key: Step; label: string }[] = [
  { key: "club", label: "Club" },
  { key: "transfers", label: "Transfers" },
  { key: "compliance", label: "Compliance" },
  { key: "lineup", label: "Lineup" },
];

// ---------------------------------------------------------------------------
// Local rows
// ---------------------------------------------------------------------------

type Pos = "GK" | "DF" | "MF" | "FW";
const POSITIONS: Pos[] = ["GK", "DF", "MF", "FW"];

interface IncomingRow {
  id: number;
  window: WindowId;
  fee: number;
  weeklyWage: number;
  contractLength: number;
  isFree: boolean;
  /** £m — user-entered market value (defaults to fee) */
  marketValue?: number;
  position: Pos;
  label: string;
}
interface SaleRow {
  name: string;
  window: WindowId;
  saleFee: number;
}
type BuyType = "none" | "option" | "obligation";
interface LoanOutRow {
  name: string;
  window: WindowId;
  loanFee: number;
  wageCoveredPct: number; // 0..1
  lengthSeasons: 1 | 2;
  buyType: BuyType;
  buyPrice: number;
  assumeExercised: boolean;
}
interface LoanInRow {
  id: number;
  window: WindowId;
  weeklyWage: number;
  wageSharePct: number; // 0..1
  loanFee: number;
  lengthSeasons: 1 | 2;
  buyType: BuyType;
  buyPrice: number;
  buyContract: number;
  assumeExercised: boolean;
  marketValue?: number;
  position: Pos;
  label: string;
}

function rowBuyClause(r: { buyType: BuyType; buyPrice: number; assumeExercised: boolean; buyContract?: number }): BuyClause | undefined {
  if (r.buyType === "none") return undefined;
  return { type: r.buyType, price: r.buyPrice, assumeExercised: r.assumeExercised, contractLength: r.buyContract };
}
function clauseToRow(c?: BuyClause): { buyType: BuyType; buyPrice: number; assumeExercised: boolean; buyContract: number } {
  if (!c) return { buyType: "none", buyPrice: 0, assumeExercised: false, buyContract: 4 };
  return { buyType: c.type, buyPrice: c.price, assumeExercised: !!c.assumeExercised, buyContract: c.contractLength ?? 4 };
}
interface SavedPlan {
  name: string;
  ts: number;
  payload: SharedScenario;
}

let INCOMING_ID = 1;
const SAVES_KEY = "eplTradeMachine.saves.v1";

// ---------------------------------------------------------------------------

export default function Home() {
  const [step, setStep] = useState<Step>("club");
  const [clubId, setClubId] = useState(CLUBS[0].id);
  const club = useMemo(() => CLUBS.find((c) => c.id === clubId)!, [clubId]);

  const [yearId, setYearId] = useState(club.defaultYearId);
  const [track, setTrack] = useState<RegulatoryTrack | "AUTO">("AUTO");
  const [incomings, setIncomings] = useState<IncomingRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loansOut, setLoansOut] = useState<LoanOutRow[]>([]);
  const [loansIn, setLoansIn] = useState<LoanInRow[]>([]);
  const [lineup, setLineup] = useState<Lineup | null>(null);
  const [showLineups, setShowLineups] = useState(false);
  const [activeWindow, setActiveWindow] = useState<WindowId>("W1");
  const [selectedSeason, setSelectedSeason] = useState(0);
  const [revenueGrowth, setRevenueGrowth] = useState(0.03);
  const [europeBySeason, setEuropeBySeason] = useState<EuropeTier[]>(() => {
    const t = yearEuropeTier(getYear(CLUBS[0], CLUBS[0].defaultYearId));
    return [t, t, t];
  });
  const [showSources, setShowSources] = useState(false);
  const [showCalculation, setShowCalculation] = useState(false);
  const [showSquad, setShowSquad] = useState(false);
  const [showMaxBid, setShowMaxBid] = useState(false);
  const [clearing, setClearing] = useState<ClearingResult | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [saves, setSaves] = useState<SavedPlan[]>([]);
  const [saveName, setSaveName] = useState("");
  const [showSaves, setShowSaves] = useState(false);
  // Max Bid controls
  const [mbWindow, setMbWindow] = useState<WindowId>("W1");
  const [mbWage, setMbWage] = useState(150_000);
  const [mbContract, setMbContract] = useState(5);

  const year = getYear(club, yearId);
  const asOf = club.squadAsOf.year;

  // Reset when the club changes.
  const [lastClub, setLastClub] = useState(clubId);
  if (clubId !== lastClub) {
    setLastClub(clubId);
    setYearId(club.defaultYearId);
    setIncomings([]);
    setSales([]);
    setLoansOut([]);
    setLoansIn([]);
    setLineup(null);
    setClearing(null);
    setActiveWindow("W1");
    setSelectedSeason(0);
    const t = yearEuropeTier(year);
    setEuropeBySeason([t, t, t]);
  }

  // Keep Europe defaults in sync when the base year changes.
  const [lastYear, setLastYear] = useState(yearId);
  if (yearId !== lastYear) {
    setLastYear(yearId);
    const t = yearEuropeTier(year);
    setEuropeBySeason([t, t, t]);
  }

  // ---- Restore from share link / load saves (mount only) ------------------
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSaves(JSON.parse(raw));
    } catch { /* ignore */ }
    const p = new URLSearchParams(window.location.search).get("p");
    if (p) {
      const s = decodeScenario(p);
      if (s) applyScenarioPayload(s);
    }
  }, []);

  function applyScenarioPayload(s: SharedScenario) {
    const c = CLUBS.find((x) => x.id === s.clubId);
    if (!c) return;
    const names = new Set(c.players.map((p) => p.name));
    setClubId(c.id);
    setLastClub(c.id);
    const y = c.years.some((x) => x.id === s.yearId) ? s.yearId : c.defaultYearId;
    setYearId(y);
    setLastYear(y);
    setTrack(s.track === "UEFA" || s.track === "PL_DOMESTIC" ? s.track : "AUTO");
    setRevenueGrowth(typeof s.revenueGrowth === "number" ? s.revenueGrowth : 0.03);
    if (Array.isArray(s.europeBySeason) && s.europeBySeason.length === 3) {
      setEuropeBySeason(s.europeBySeason.map(normalizeEuropeTier));
    }
    setIncomings(
      (s.signings ?? []).map((g, i) => ({
        id: INCOMING_ID++,
        window: g.window,
        fee: g.fee,
        weeklyWage: g.weeklyWage,
        contractLength: g.contractLength,
        isFree: !!g.isFree,
        marketValue: g.marketValue,
        position: (g.position as Pos) ?? "MF",
        label: g.label ?? `Signing ${i + 1}`,
      })),
    );
    setSales((s.sales ?? []).filter((x) => names.has(x.name)).map((x) => ({ name: x.name, window: x.window, saleFee: x.saleFee })));
    setLoansOut(
      (s.loansOut ?? []).filter((l) => names.has(l.name)).map((l) => ({
        name: l.name, window: l.window, loanFee: l.loanFee,
        wageCoveredPct: l.wageCoveredPct, lengthSeasons: l.lengthSeasons,
        ...clauseToRow(l.buyClause),
      })),
    );
    setLoansIn(
      (s.loansIn ?? []).map((l, i) => ({
        id: INCOMING_ID++, window: l.window, weeklyWage: l.weeklyWage,
        wageSharePct: l.wageSharePct, loanFee: l.loanFee, lengthSeasons: l.lengthSeasons,
        marketValue: l.marketValue, position: (l.position as Pos) ?? "MF",
        label: l.label ?? `Loan-in ${i + 1}`,
        ...clauseToRow(l.buyClause),
      })),
    );
    setLineup(
      s.lineup
        ? {
            formation: s.lineup.formation as Lineup["formation"],
            slots: s.lineup.slots,
            subs: s.lineup.subs ?? s.lineup.slots.map(() => []),
          }
        : null,
    );
    setClearing(null);
    setSelectedSeason(0);
    // A shared/loaded plan lands on the compliance result so the outcome is visible.
    setStep("compliance");
  }

  function currentPayload(): SharedScenario {
    return {
      clubId, yearId, track, revenueGrowth, europeBySeason,
      signings: incomings.map(({ window: w, fee, weeklyWage, contractLength, isFree, marketValue, position, label }) => ({
        window: w, fee, weeklyWage, contractLength, isFree, marketValue, position, label,
      })),
      sales: sales.map(({ window: w, name, saleFee }) => ({ window: w, name, saleFee })),
      loansOut: loansOut.map((l) => ({
        window: l.window, name: l.name, loanFee: l.loanFee,
        wageCoveredPct: l.wageCoveredPct, lengthSeasons: l.lengthSeasons,
        buyClause: rowBuyClause(l),
      })),
      loansIn: loansIn.map((l) => ({
        window: l.window, weeklyWage: l.weeklyWage, wageSharePct: l.wageSharePct,
        loanFee: l.loanFee, lengthSeasons: l.lengthSeasons,
        buyClause: rowBuyClause(l), marketValue: l.marketValue, position: l.position, label: l.label,
      })),
      lineup: lineup ?? undefined,
    };
  }

  async function copyShareLink() {
    const url = `${window.location.origin}${window.location.pathname}?p=${encodeScenario(currentPayload())}`;
    window.history.replaceState(null, "", url);
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1600);
  }

  function persistSaves(next: SavedPlan[]) {
    setSaves(next);
    try { localStorage.setItem(SAVES_KEY, JSON.stringify(next)); } catch { /* full */ }
  }
  function savePlan() {
    const name = saveName.trim() || `${club.shortName} plan ${new Date().toLocaleDateString()}`;
    persistSaves([{ name, ts: Date.now(), payload: currentPayload() }, ...saves.filter((s) => s.name !== name)]);
    setSaveName("");
  }

  /** Reset the whole plan and return to club selection. */
  function startOver() {
    setIncomings([]);
    setSales([]);
    setLoansOut([]);
    setLoansIn([]);
    setLineup(null);
    setClearing(null);
    setActiveWindow("W1");
    setSelectedSeason(0);
    setStep("club");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  // ---- Forward projection ---------------------------------------------------
  const baseState = toClubState(year);
  const resolvedTrack: RegulatoryTrack | undefined = track === "AUTO" ? undefined : track;

  const planSignings: PlannedSigning[] = useMemo(
    () => incomings.map((i) => ({
      window: i.window, fee: i.isFree ? 0 : i.fee, weeklyWage: i.weeklyWage,
      contractLength: i.contractLength, isFree: i.isFree,
      marketValue: i.marketValue, position: i.position, label: i.label,
    })),
    [incomings],
  );
  const planSales: PlannedSale[] = useMemo(
    () => sales.map((s) => ({ window: s.window, name: s.name, saleFee: s.saleFee })),
    [sales],
  );
  const planLoansOut: LoanOut[] = useMemo(
    () => loansOut.map((l) => ({
      window: l.window, name: l.name, loanFee: l.loanFee,
      wageCoveredPct: l.wageCoveredPct, lengthSeasons: l.lengthSeasons,
      buyClause: rowBuyClause(l),
    })),
    [loansOut],
  );
  const planLoansIn: LoanIn[] = useMemo(
    () => loansIn.map((l) => ({
      window: l.window, weeklyWage: l.weeklyWage, wageSharePct: l.wageSharePct,
      loanFee: l.loanFee, lengthSeasons: l.lengthSeasons,
      buyClause: rowBuyClause(l), marketValue: l.marketValue,
    })),
    [loansIn],
  );

  const forwardInputs: ForwardInputs = useMemo(
    () => ({
      base: baseState,
      asOfYear: asOf,
      squad: club.players,
      signings: planSignings,
      sales: planSales,
      loansOut: planLoansOut,
      loansIn: planLoansIn,
      revenueGrowth,
      europeBySeason,
      baseEuropeTier: yearEuropeTier(year),
      track: resolvedTrack,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId, yearId, planSignings, planSales, planLoansOut, planLoansIn, revenueGrowth, europeBySeason, resolvedTrack],
  );

  const plan = useMemo(() => projectPlan(forwardInputs), [forwardInputs]);
  const baseline = useMemo(
    () => projectPlan({ ...forwardInputs, signings: [], sales: [] }),
    [forwardInputs],
  );
  const maxBid = useMemo(
    () => solveMaxBid(forwardInputs, { window: mbWindow, weeklyWage: mbWage, contractLength: mbContract }),
    [forwardInputs, mbWindow, mbWage, mbContract],
  );

  const season = plan.seasons[selectedSeason];
  const baseSeason = baseline.seasons[selectedSeason];
  const after = season.result;
  const before = baseSeason.result;
  const style = ZONE_STYLES[after.zone];
  const barMax = 1.3;
  const pct = (v: number) => Math.min(100, (v / barMax) * 100);
  const afterHeadroom = after.limit * after.denominator - after.squadCosts;
  const beforeHeadroom = before.limit * before.denominator - before.squadCosts;

  const soldNames = useMemo(() => new Set(sales.map((s) => s.name)), [sales]);
  const loanedOutNames = useMemo(() => new Set(loansOut.map((l) => l.name)), [loansOut]);
  const totalMoves = incomings.length + sales.length + loansOut.length + loansIn.length;

  // ---- Squad market value (Transfermarkt-style estimates) -------------------
  const mvNow = useMemo(() => squadMarketValueAfter(club.players, [], []), [club]);
  const mvEndOfPlan = useMemo(
    () => squadMarketValueAfter(club.players, planSignings, planSales, planLoansOut, planLoansIn, "W6"),
    [club, planSignings, planSales, planLoansOut, planLoansIn],
  );

  // Read-only compliance context for the lineup builder (no recomputation).
  const lineupFinance = {
    scr: after.scr,
    limit: after.limit,
    zone: after.zone,
    squadValue: mvEndOfPlan,
    trackLabel: after.track === "UEFA" ? "UEFA 70%" : "PL 85%",
  };

  // ---- Roster for the lineup builder (post-plan, owned & available) --------
  const lineupRoster: RosterEntry[] = useMemo(() => [
    ...club.players
      .filter((p) => !soldNames.has(p.name) && !loanedOutNames.has(p.name))
      .map((p) => ({ key: p.name, name: p.name, position: p.position, marketValue: p.marketValue, tag: "squad" as const })),
    ...incomings.map((i, idx) => ({
      key: `sig:${idx}`,
      name: i.label || `Signing ${idx + 1}`,
      position: i.position,
      marketValue: i.marketValue ?? (i.isFree ? 0 : i.fee),
      tag: "signing" as const,
    })),
    ...loansIn.map((l, idx) => ({
      key: `loanin:${idx}`,
      name: l.label || `Loan-in ${idx + 1}`,
      position: l.position,
      marketValue: l.marketValue ?? l.buyPrice ?? 10,
      tag: "loan-in" as const,
    })),
  ], [club, soldNames, loanedOutNames, incomings, loansIn]);

  // Reset stale clearing result when the scenario changes.
  const scenarioKey = JSON.stringify(forwardInputs);
  const [lastKey, setLastKey] = useState(scenarioKey);
  if (scenarioKey !== lastKey) {
    setLastKey(scenarioKey);
    if (clearing) setClearing(null);
  }

  // ---- Mutators ------------------------------------------------------------
  function addIncoming(preset?: Partial<IncomingRow>) {
    setIncomings((xs) => [
      ...xs,
      {
        id: INCOMING_ID++, window: activeWindow, fee: 60, weeklyWage: 150_000,
        contractLength: 5, isFree: false, position: "MF" as Pos, label: `Signing ${xs.length + 1}`,
        ...preset,
      },
    ]);
  }
  function updateIncoming(id: number, patch: Partial<IncomingRow>) {
    setIncomings((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeIncoming(id: number) {
    setIncomings((xs) => xs.filter((x) => x.id !== id));
  }
  function toggleSale(p: Player) {
    setLoansOut((xs) => xs.filter((l) => l.name !== p.name)); // sale replaces a loan
    setSales((xs) =>
      xs.some((s) => s.name === p.name)
        ? xs.filter((s) => s.name !== p.name)
        : [...xs, { name: p.name, window: activeWindow, saleFee: p.marketValue }],
    );
  }
  function updateSale(name: string, patch: Partial<SaleRow>) {
    setSales((xs) => xs.map((s) => (s.name === name ? { ...s, ...patch } : s)));
  }
  function toggleLoanOut(p: Player) {
    setSales((xs) => xs.filter((s) => s.name !== p.name)); // loan replaces a sale
    setLoansOut((xs) =>
      xs.some((l) => l.name === p.name)
        ? xs.filter((l) => l.name !== p.name)
        : [...xs, {
            name: p.name, window: activeWindow, loanFee: Math.max(1, Math.round(p.marketValue * 0.08)),
            wageCoveredPct: 1, lengthSeasons: 1, buyType: "none", buyPrice: p.marketValue, assumeExercised: false,
          }],
    );
  }
  function updateLoanOut(name: string, patch: Partial<LoanOutRow>) {
    setLoansOut((xs) => xs.map((l) => (l.name === name ? { ...l, ...patch } : l)));
  }
  function addLoanIn() {
    setLoansIn((xs) => [...xs, {
      id: INCOMING_ID++, window: activeWindow, weeklyWage: 100_000, wageSharePct: 1,
      loanFee: 3, lengthSeasons: 1, buyType: "none", buyPrice: 30, buyContract: 4,
      assumeExercised: false, position: "MF", label: `Loan-in ${loansIn.length + 1}`,
    }]);
  }
  function updateLoanIn(id: number, patch: Partial<LoanInRow>) {
    setLoansIn((xs) => xs.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function removeLoanIn(id: number) {
    setLoansIn((xs) => xs.filter((l) => l.id !== id));
  }
  function cycleEuropeTier(seasonIndex: number) {
    setEuropeBySeason((xs) =>
      xs.map((t, i) =>
        i === seasonIndex ? TIER_CYCLE[(TIER_CYCLE.indexOf(t) + 1) % TIER_CYCLE.length] : t,
      ),
    );
  }

  function runClearingHouse() {
    const baseAfterPlan = plan.seasons[0].state;
    const remaining = club.players
      .filter((p) => !soldNames.has(p.name) && !loanedOutNames.has(p.name))
      .map((p) => toSellable(p, asOf));
    setClearing(solveClearingHouse(baseAfterPlan, remaining, undefined, resolvedTrack));
  }

  const sortedPlayers = useMemo(
    () => [...club.players].sort((a, b) => "GK DF MF FW".indexOf(a.position) - "GK DF MF FW".indexOf(b.position)),
    [club],
  );

  const activeWindowLabel = WINDOWS.find((w) => w.id === activeWindow)!.label;
  const incomingsInWindow = incomings.filter((i) => i.window === activeWindow);

  // Per-club baseline SCR (default year, no plan) for the club-selection cards.
  const leagueRows = useMemo(
    () =>
      CLUBS.map((c) => {
        const y = getYear(c, c.defaultYearId);
        const r = computeScr(toClubState(y));
        return { club: c, year: y, result: r };
      }).sort((a, b) => a.result.scr - b.result.scr),
    [],
  );

  function chooseClub(id: string) {
    setClubId(id);
    setStep("transfers");
  }

  // =========================================================================
  // STEP 1 — CLUB SELECTION
  // =========================================================================
  if (step === "club") {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <Onboarding />
        <div className="max-w-6xl mx-auto px-6 py-14 sm:py-20">
          <div className="text-center mb-12">
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Squad Cost Ratio simulator · 2026/27</p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Football Finance Machine</h1>
            <p className="mt-4 text-neutral-400 max-w-xl mx-auto">
              Build a transfer plan. Test it against UEFA and Premier League cost rules.
            </p>
            <p className="mt-6 text-sm font-medium text-neutral-300">Choose your club to begin →</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leagueRows.map((row) => {
              const z = ZONE_STYLES[row.result.zone];
              const stat = ZONE_STATUS[row.result.zone];
              const dataStatus = STATUS_STYLES[row.year.status];
              return (
                <button
                  key={row.club.id}
                  onClick={() => chooseClub(row.club.id)}
                  className="group text-left rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 transition hover:border-neutral-600 hover:bg-neutral-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold leading-tight truncate">{row.club.shortName}</h2>
                      <p className="text-[11px] text-neutral-500 truncate">{row.club.name}</p>
                    </div>
                    <span className={`shrink-0 h-2.5 w-2.5 rounded-full mt-1.5 ${z.dot}`} />
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className={`text-3xl font-black tabular-nums ${z.text}`}>{fmtPct(row.result.scr)}</span>
                    <span className="text-[11px] text-neutral-500">SCR · limit {fmtPct(row.result.limit)}</span>
                  </div>
                  <p className={`mt-1 text-xs font-semibold ${stat.tone}`}>{stat.label}</p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${dataStatus.cls}`}>{dataStatus.label}</span>
                    <ReliabilityBadge r={row.club.squadAsOf.reliability} />
                  </div>

                  <p className="mt-4 text-xs font-medium text-neutral-500 group-hover:text-emerald-400 transition">
                    Plan transfers →
                  </p>
                </button>
              );
            })}
          </div>

          <p className="mt-10 text-center text-[11px] text-neutral-600 max-w-2xl mx-auto">
            Player-level wages, market values, book values, and amortisation are estimates unless marked otherwise.
            SCR = squad costs ÷ (football revenue + net profit on player sales).
          </p>
        </div>
      </div>
    );
  }

  // Header shared by steps 2–4
  const flowHeader = (
    <><Onboarding /><header className="border-b border-neutral-800 px-4 sm:px-6 py-3 sticky top-0 z-20 bg-neutral-950/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={startOver} className="text-sm font-bold tracking-tight hover:text-emerald-400 transition mr-1">
          Football Finance Machine
        </button>
        <span className="text-neutral-700 hidden sm:inline">·</span>
        <span className="text-sm text-neutral-300 font-medium">{club.shortName}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowSaves((v) => !v)} className={`text-xs rounded-md px-3 py-1.5 border transition ${showSaves ? "border-emerald-600 text-emerald-300 bg-emerald-950/40" : "border-neutral-700 text-neutral-300 hover:border-neutral-500"}`}>
            💾 Plans {saves.length > 0 && <span className="text-neutral-500">({saves.length})</span>}
          </button>
          <button onClick={copyShareLink} className="text-xs rounded-md px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition">
            {shareCopied ? "✓ Link copied" : "🔗 Share"}
          </button>
        </div>
      </div>
      <div className="mt-3">
        <Stepper current={step} onNavigate={(s) => setStep(s)} reached={{ transfers: true, compliance: totalMoves >= 0, lineup: true }} />
      </div>
      {showSaves && (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          <div className="max-w-xl space-y-3">
            <div className="flex gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={`Name this plan (e.g. "${club.shortName} rebuild")`}
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600"
              />
              <button onClick={savePlan} className="text-xs rounded-md px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium">Save current</button>
            </div>
            {saves.length === 0 ? (
              <p className="text-xs text-neutral-600">No saved plans yet. Plans are stored in this browser.</p>
            ) : (
              <ul className="space-y-1">
                {saves.map((s) => (
                  <li key={s.name} className="flex items-center gap-2 text-sm bg-neutral-900 border border-neutral-800 rounded-md px-3 py-1.5">
                    <span className="flex-1 truncate text-neutral-200">{s.name}</span>
                    <span className="text-[10px] text-neutral-600">{new Date(s.ts).toLocaleDateString()}</span>
                    <button onClick={() => { applyScenarioPayload(s.payload); setShowSaves(false); }} className="text-xs text-emerald-400 hover:text-emerald-300">load</button>
                    <button onClick={() => persistSaves(saves.filter((x) => x.name !== s.name))} className="text-xs text-red-400 hover:text-red-300">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </header></>
  );

  // =========================================================================
  // STEP 2 — TRANSFER WINDOW BUILDER
  // =========================================================================
  if (step === "transfers") {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        {flowHeader}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0">
          {/* -------- Builder -------- */}
          <section className="p-4 sm:p-6 space-y-5 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Build your transfer window</h2>
                <p className="text-xs text-neutral-500 mt-0.5">{club.name} · add signings, sales and loans across the next 3 seasons.</p>
              </div>
              <button onClick={() => setStep("club")} className="text-xs rounded-md px-3 py-1.5 border border-neutral-700 text-neutral-300 hover:border-neutral-500">
                ← Change club
              </button>
            </div>

            {/* Controls: season/window, track, assumptions */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Window being planned</p>
                <div className="rounded-lg bg-neutral-900 p-1 border border-neutral-800 space-y-1">
                  {[0, 1, 2].map((r) => (
                    <div key={r} className="grid grid-cols-[44px_1fr_1fr] gap-1 items-stretch">
                      <span className="flex items-center justify-center text-[9px] uppercase tracking-wide text-neutral-600">{SEASON_LABELS[r].slice(2)}</span>
                      {WINDOWS.slice(r * 2, r * 2 + 2).map((w) => {
                        const n = incomings.filter((i) => i.window === w.id).length + sales.filter((s) => s.window === w.id).length + loansOut.filter((l) => l.window === w.id).length + loansIn.filter((l) => l.window === w.id).length;
                        return (
                          <button key={w.id} onClick={() => setActiveWindow(w.id)} className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${activeWindow === w.id ? "bg-neutral-700 text-white shadow" : "text-neutral-400 hover:text-neutral-200"}`}>
                            {w.label}{n > 0 && <span className="ml-1 text-[10px] text-emerald-400">{n}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-neutral-600 mt-1.5">
                  {isJanuaryWindow(activeWindow)
                    ? `${activeWindowLabel} deals book half a season of wages & amortisation in ${SEASON_LABELS[windowSeason(activeWindow)]}, full weight after.`
                    : `${activeWindowLabel} business hits ${SEASON_LABELS[windowSeason(activeWindow)]} in full.`}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Regulatory track</p>
                  <div className="flex gap-1">
                    {(["AUTO", "UEFA", "PL_DOMESTIC"] as const).map((t) => (
                      <button key={t} onClick={() => setTrack(t)} className={`flex-1 px-2 py-1.5 rounded-md text-[11px] transition ${track === t ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"}`}>
                        {t === "AUTO" ? "Auto" : t === "UEFA" ? "UEFA 70%" : "PL 85%"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Slider label="Revenue growth" value={Math.round(revenueGrowth * 100)} min={-10} max={15} step={1} display={`${revenueGrowth >= 0 ? "+" : ""}${Math.round(revenueGrowth * 100)}%/yr`} onChange={(v) => setRevenueGrowth(v / 100)} />
                  <p className="text-[10px] text-neutral-600 mt-1">Base wages persist (renewals assumed); amortisation rolls off as contracts end.</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">European competition per season <span className="normal-case text-neutral-600">(sets the 70% UEFA limit &amp; revenue)</span></p>
                <div className="grid grid-cols-3 gap-2">
                  {plan.seasons.map((s) => (
                    <button
                      key={s.seasonIndex}
                      onClick={() => cycleEuropeTier(s.seasonIndex)}
                      className={`rounded-md border px-2 py-1.5 text-center text-[10px] transition ${TIER_PILL[europeBySeason[s.seasonIndex] ?? "NONE"].cls}`}
                      title={`Click to cycle European competition for ${s.label}.`}
                    >
                      <span className="block text-neutral-500 mb-0.5">{s.label.slice(2)}</span>
                      {TIER_PILL[europeBySeason[s.seasonIndex] ?? "NONE"].label}
                      {s.europeRevenueDelta !== 0 && (
                        <span className="ml-1 opacity-80">{s.europeRevenueDelta > 0 ? "+" : "−"}£{Math.abs(s.europeRevenueDelta)}m</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {club.years.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500">Base year</span>
                  {club.years.map((y) => (
                    <button key={y.id} onClick={() => setYearId(y.id)} className={`px-2 py-0.5 rounded text-[11px] transition ${y.id === year.id ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"}`}>{y.label}</button>
                  ))}
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[year.status].cls}`}>{STATUS_STYLES[year.status].label}</span>
                </div>
              )}
            </div>

            {/* Signings */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-300">
                  Signings · {windowShort(activeWindow)}{incomingsInWindow.length > 0 && <span className="text-neutral-500"> ({incomingsInWindow.length})</span>}
                </h3>
                <button onClick={() => addIncoming()} className="text-xs rounded bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-white">+ Add signing</button>
              </div>
              {incomingsInWindow.length === 0 && <p className="text-xs text-neutral-600">No {activeWindowLabel} signings yet. Add one, or sell/loan players below.</p>}
              <div className="space-y-3">
                {incomingsInWindow.map((inc) => (
                  <div key={inc.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${WINDOW_BADGE[inc.window]}`}>{windowShort(inc.window)}</span>
                      <div className="flex items-center gap-2">
                        <select value={inc.window} onChange={(e) => updateIncoming(inc.id, { window: e.target.value as WindowId })} className="bg-neutral-800 border border-neutral-700 rounded text-[10px] px-1 py-0.5 text-neutral-300">
                          {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.short}</option>)}
                        </select>
                        <button onClick={() => removeIncoming(inc.id)} className="text-xs text-red-400 hover:text-red-300">remove</button>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex gap-1.5">
                        <input value={inc.label} onChange={(e) => updateIncoming(inc.id, { label: e.target.value })} placeholder="Name (optional)" className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600" />
                        <select value={inc.position} onChange={(e) => updateIncoming(inc.id, { position: e.target.value as Pos })} className="bg-neutral-800 border border-neutral-700 rounded text-xs px-1 py-1 text-neutral-300">
                          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <Slider label="Fee" value={inc.fee} min={0} max={250} step={5} disabled={inc.isFree} display={`£${inc.fee}m`} onChange={(v) => updateIncoming(inc.id, { fee: v })} />
                      <Slider label="Wage" value={inc.weeklyWage} min={0} max={600_000} step={5_000} display={`£${(inc.weeklyWage / 1000).toFixed(0)}k/wk`} onChange={(v) => updateIncoming(inc.id, { weeklyWage: v })} />
                      <Slider label="Contract" value={inc.contractLength} min={1} max={7} step={1} display={`${inc.contractLength}y${inc.contractLength > 5 ? " (cap 5)" : ""}`} onChange={(v) => updateIncoming(inc.id, { contractLength: v })} />
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                          <input type="checkbox" checked={inc.isFree} onChange={(e) => updateIncoming(inc.id, { isFree: e.target.checked })} className="h-3.5 w-3.5 accent-emerald-500" />
                          Free / academy (no fee)
                        </label>
                        <label className="flex items-center gap-1 text-xs text-neutral-500" title="Market value of the target (your estimate) — feeds the squad-value tracker">
                          MV £<input type="number" value={inc.marketValue ?? (inc.isFree ? 0 : inc.fee)} min={0} onChange={(e) => updateIncoming(inc.id, { marketValue: Number(e.target.value) })} className="w-14 bg-neutral-800 rounded px-1 py-0.5 text-neutral-200 text-right border border-neutral-700" />m
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sales */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <h3 className="text-sm font-semibold text-neutral-300 mb-3">Sales {sales.length > 0 && <span className="text-neutral-500">({sales.length})</span>}</h3>
              {sales.length === 0 ? (
                <p className="text-xs text-neutral-600">Open the squad below and hit “Sell” on any player → it lands in the active window.</p>
              ) : (
                <div className="space-y-2">
                  {sales.map((s) => {
                    const p = club.players.find((pl) => pl.name === s.name)!;
                    const yearsAfter = windowYearOffset(s.window);
                    const bv = p.isAcademy ? 0 : Math.max(0, bookValueAt(p, asOf) - (p.fee > 0 ? (p.fee / Math.max(1, p.contractEndYear - p.signedYear)) * yearsAfter : 0));
                    const profit = s.saleFee - bv;
                    return (
                      <div key={s.name} className="flex items-center gap-2 text-xs bg-neutral-900 rounded px-2 py-1.5 border border-neutral-800">
                        <select value={s.window} onChange={(e) => updateSale(s.name, { window: e.target.value as WindowId })} className={`border rounded text-[10px] px-1 py-0.5 ${WINDOW_BADGE[s.window]} bg-transparent`}>
                          {WINDOWS.map((w) => <option key={w.id} value={w.id} className="bg-neutral-900 text-neutral-200">{w.short}</option>)}
                        </select>
                        <span className="text-neutral-300 flex-1 truncate">{s.name}</span>
                        <label className="flex items-center gap-1 text-neutral-500">£<input type="number" value={s.saleFee} min={0} onChange={(e) => updateSale(s.name, { saleFee: Number(e.target.value) })} className="w-14 bg-neutral-800 rounded px-1 py-0.5 text-neutral-200 text-right" />m</label>
                        <span className={profit >= 0 ? "text-emerald-400 w-16 text-right tabular-nums" : "text-red-400 w-16 text-right tabular-nums"}>{profit >= 0 ? "+" : ""}£{profit.toFixed(0)}m</span>
                        <button onClick={() => toggleSale(p)} className="text-red-400 hover:text-red-300">✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Loans out */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <h3 className="text-sm font-semibold text-neutral-300 mb-3">Loans out {loansOut.length > 0 && <span className="text-neutral-500">({loansOut.length})</span>}</h3>
              {loansOut.length === 0 ? (
                <p className="text-xs text-neutral-600">Open the squad below and hit “Loan” on any player → he leaves on loan in the active window.</p>
              ) : (
                <div className="space-y-3">
                  {loansOut.map((l) => {
                    const p = club.players.find((pl) => pl.name === l.name)!;
                    return (
                      <div key={l.name} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-neutral-200 truncate">{l.name}</span>
                          <div className="flex items-center gap-2">
                            <select value={l.window} onChange={(e) => updateLoanOut(l.name, { window: e.target.value as WindowId })} className={`border rounded text-[10px] px-1 py-0.5 ${WINDOW_BADGE[l.window]} bg-transparent`}>
                              {WINDOWS.map((w) => <option key={w.id} value={w.id} className="bg-neutral-900 text-neutral-200">{w.short}</option>)}
                            </select>
                            <select value={l.lengthSeasons} onChange={(e) => updateLoanOut(l.name, { lengthSeasons: Number(e.target.value) as 1 | 2 })} className="bg-neutral-800 border border-neutral-700 rounded text-[10px] px-1 py-0.5 text-neutral-300">
                              <option value={1}>1 season</option>
                              <option value={2}>2 seasons</option>
                            </select>
                            <button onClick={() => toggleLoanOut(p)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1 text-xs text-neutral-500">Loan fee £<input type="number" value={l.loanFee} min={0} onChange={(e) => updateLoanOut(l.name, { loanFee: Number(e.target.value) })} className="w-12 bg-neutral-800 rounded px-1 py-0.5 text-neutral-200 text-right border border-neutral-700" />m</label>
                          <div className="flex-1"><Slider label="Wage covered by borrower" value={Math.round(l.wageCoveredPct * 100)} min={0} max={100} step={5} display={`${Math.round(l.wageCoveredPct * 100)}%`} onChange={(v) => updateLoanOut(l.name, { wageCoveredPct: v / 100 })} /></div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <select value={l.buyType} onChange={(e) => updateLoanOut(l.name, { buyType: e.target.value as BuyType })} className="bg-neutral-800 border border-neutral-700 rounded text-[10px] px-1 py-0.5 text-neutral-300">
                            <option value="none">No buy clause</option>
                            <option value="option">Option to buy</option>
                            <option value="obligation">Obligation to buy</option>
                          </select>
                          {l.buyType !== "none" && (
                            <>
                              <label className="flex items-center gap-1 text-neutral-500">£<input type="number" value={l.buyPrice} min={0} onChange={(e) => updateLoanOut(l.name, { buyPrice: Number(e.target.value) })} className="w-14 bg-neutral-800 rounded px-1 py-0.5 text-neutral-200 text-right border border-neutral-700" />m</label>
                              {l.buyType === "option" && (
                                <label className="flex items-center gap-1 text-neutral-400 cursor-pointer">
                                  <input type="checkbox" checked={l.assumeExercised} onChange={(e) => updateLoanOut(l.name, { assumeExercised: e.target.checked })} className="h-3 w-3 accent-emerald-500" />
                                  assume exercised
                                </label>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Loans in */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-300">Loans in {loansIn.length > 0 && <span className="text-neutral-500">({loansIn.length})</span>}</h3>
                <button onClick={addLoanIn} className="text-xs rounded bg-sky-700 hover:bg-sky-600 px-2.5 py-1 text-white">+ Loan a player in</button>
              </div>
              {loansIn.length === 0 && <p className="text-xs text-neutral-600">Borrow a player: pay a loan fee (a squad cost) and your share of his wage.</p>}
              <div className="space-y-3">
                {loansIn.map((l) => (
                  <div key={l.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <input value={l.label} onChange={(e) => updateLoanIn(l.id, { label: e.target.value })} placeholder="Name (optional)" className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600" />
                      <select value={l.position} onChange={(e) => updateLoanIn(l.id, { position: e.target.value as Pos })} className="bg-neutral-800 border border-neutral-700 rounded text-xs px-1 py-1 text-neutral-300">
                        {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select value={l.window} onChange={(e) => updateLoanIn(l.id, { window: e.target.value as WindowId })} className={`border rounded text-[10px] px-1 py-0.5 ${WINDOW_BADGE[l.window]} bg-transparent`}>
                        {WINDOWS.map((w) => <option key={w.id} value={w.id} className="bg-neutral-900 text-neutral-200">{w.short}</option>)}
                      </select>
                      <select value={l.lengthSeasons} onChange={(e) => updateLoanIn(l.id, { lengthSeasons: Number(e.target.value) as 1 | 2 })} className="bg-neutral-800 border border-neutral-700 rounded text-[10px] px-1 py-0.5 text-neutral-300">
                        <option value={1}>1 season</option>
                        <option value={2}>2 seasons</option>
                      </select>
                      <button onClick={() => removeLoanIn(l.id)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    </div>
                    <Slider label="Player wage" value={l.weeklyWage} min={0} max={600_000} step={5_000} display={`£${(l.weeklyWage / 1000).toFixed(0)}k/wk`} onChange={(v) => updateLoanIn(l.id, { weeklyWage: v })} />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-neutral-500">Loan fee £<input type="number" value={l.loanFee} min={0} onChange={(e) => updateLoanIn(l.id, { loanFee: Number(e.target.value) })} className="w-12 bg-neutral-800 rounded px-1 py-0.5 text-neutral-200 text-right border border-neutral-700" />m</label>
                      <div className="flex-1"><Slider label="Wage share we pay" value={Math.round(l.wageSharePct * 100)} min={0} max={100} step={5} display={`${Math.round(l.wageSharePct * 100)}%`} onChange={(v) => updateLoanIn(l.id, { wageSharePct: v / 100 })} /></div>
                    </div>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <select value={l.buyType} onChange={(e) => updateLoanIn(l.id, { buyType: e.target.value as BuyType })} className="bg-neutral-800 border border-neutral-700 rounded text-[10px] px-1 py-0.5 text-neutral-300">
                        <option value="none">No buy clause</option>
                        <option value="option">Option to buy</option>
                        <option value="obligation">Obligation to buy</option>
                      </select>
                      {l.buyType !== "none" && (
                        <>
                          <label className="flex items-center gap-1 text-neutral-500">£<input type="number" value={l.buyPrice} min={0} onChange={(e) => updateLoanIn(l.id, { buyPrice: Number(e.target.value) })} className="w-14 bg-neutral-800 rounded px-1 py-0.5 text-neutral-200 text-right border border-neutral-700" />m</label>
                          <label className="flex items-center gap-1 text-neutral-500"><input type="number" value={l.buyContract} min={1} max={7} onChange={(e) => updateLoanIn(l.id, { buyContract: Number(e.target.value) })} className="w-10 bg-neutral-800 rounded px-1 py-0.5 text-neutral-200 text-right border border-neutral-700" />y deal</label>
                          {l.buyType === "option" && (
                            <label className="flex items-center gap-1 text-neutral-400 cursor-pointer">
                              <input type="checkbox" checked={l.assumeExercised} onChange={(e) => updateLoanIn(l.id, { assumeExercised: e.target.checked })} className="h-3 w-3 accent-emerald-500" />
                              assume exercised
                            </label>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Progressive disclosure — squad table */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50">
              <button onClick={() => setShowSquad((v) => !v)} className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-neutral-300 hover:text-white transition">
                <span>Manage squad — sell / loan players <span className="text-neutral-500 font-normal">({club.players.length} players)</span></span>
                <span className="text-neutral-500 text-xs">{showSquad ? "Hide −" : "Show +"}</span>
              </button>
              {showSquad && (
                <div className="px-4 pb-4">
                  <p className="text-[11px] text-neutral-500 mb-2">{club.squadAsOf.label} · “Sell” books into <span className={`px-1 rounded border ${WINDOW_BADGE[activeWindow]}`}>{activeWindowLabel}</span></p>
                  <div className="overflow-hidden rounded-lg border border-neutral-800">
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-900 text-neutral-500 text-xs uppercase sticky top-0 z-10">
                          <tr>
                            <th className="text-left px-3 py-2">Pos</th>
                            <th className="text-left px-3 py-2">Player</th>
                            <th className="text-right px-3 py-2">Wage</th>
                            <th className="text-right px-3 py-2">Book</th>
                            <th className="text-right px-3 py-2">Market</th>
                            <th className="text-right px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPlayers.map((p) => {
                            const sale = sales.find((s) => s.name === p.name);
                            const loan = loansOut.find((l) => l.name === p.name);
                            const bv = bookValueAt(p, asOf);
                            return (
                              <tr key={p.name} className={`border-t border-neutral-800 ${sale ? "bg-red-950/20" : loan ? "bg-sky-950/20" : ""}`}>
                                <td className="px-3 py-2 text-neutral-500 text-xs">{p.position}</td>
                                <td className="px-3 py-2">
                                  {p.name}
                                  {p.isAcademy && <span className="text-emerald-500 text-xs ml-2">academy</span>}
                                  {sale && <span className={`text-[10px] ml-2 px-1 rounded border ${WINDOW_BADGE[sale.window]}`}>{windowShort(sale.window)}</span>}
                                  {loan && <span className={`text-[10px] ml-2 px-1 rounded border ${WINDOW_BADGE[loan.window]}`}>loan · {windowShort(loan.window)}</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">£{(p.weeklyWage / 1000).toFixed(0)}k</td>
                                <td className="px-3 py-2 text-right tabular-nums">£{bv}m</td>
                                <td className="px-3 py-2 text-right tabular-nums">£{p.marketValue}m</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <button onClick={() => toggleSale(p)} className={`text-xs rounded px-2 py-0.5 border transition ${sale ? "border-red-600 text-red-300 bg-red-950/40" : "border-neutral-700 text-neutral-400 hover:border-neutral-500"}`}>{sale ? "Selling" : "Sell"}</button>
                                  <button onClick={() => toggleLoanOut(p)} className={`ml-1 text-xs rounded px-2 py-0.5 border transition ${loan ? "border-sky-600 text-sky-300 bg-sky-950/40" : "border-neutral-700 text-neutral-400 hover:border-neutral-500"}`}>{loan ? "On loan" : "Loan"}</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-600 mt-2">{club.squadAsOf.note}</p>
                  <button onClick={runClearingHouse} className="mt-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition">💸 Simulate Clearing the Books (2026/27)</button>
                  {clearing && <ClearingPanel result={clearing} clubName={club.shortName} />}
                </div>
              )}
            </div>

            {/* Progressive disclosure — max bid helper */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50">
              <button onClick={() => setShowMaxBid((v) => !v)} className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-neutral-300 hover:text-white transition">
                <span>🎯 Max Bid helper <span className="text-neutral-500 font-normal">— biggest signing that stays compliant</span></span>
                <span className="text-neutral-500 text-xs">{showMaxBid ? "Hide −" : "Show +"}</span>
              </button>
              {showMaxBid && (
                <div className="px-4 pb-4">
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap gap-1">
                        {WINDOWS.map((w) => (
                          <button key={w.id} onClick={() => setMbWindow(w.id)} className={`px-2.5 py-1 rounded text-xs transition ${mbWindow === w.id ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"}`}>{w.short}</button>
                        ))}
                      </div>
                      <Slider label="Wage" value={mbWage} min={0} max={600_000} step={5_000} display={`£${(mbWage / 1000).toFixed(0)}k/wk`} onChange={setMbWage} />
                      <Slider label="Contract" value={mbContract} min={1} max={7} step={1} display={`${mbContract}y${mbContract > 5 ? " (cap 5)" : ""}`} onChange={setMbContract} />
                    </div>
                    <div className="flex flex-col items-end justify-center min-w-[170px]">
                      {maxBid.wageBreaksLimit ? (
                        <>
                          <p className="text-3xl font-black text-red-500 tabular-nums">£0m</p>
                          <p className="text-[11px] text-red-400 text-right mt-1">That wage alone breaks the {SEASON_LABELS[maxBid.bindingSeason]} limit.</p>
                        </>
                      ) : (
                        <>
                          <p className="text-4xl font-black text-emerald-400 tabular-nums">£{maxBid.maxFee.toFixed(0)}m</p>
                          <p className="text-[11px] text-neutral-500 text-right mt-1">binding season: {SEASON_LABELS[maxBid.bindingSeason]}</p>
                          <button onClick={() => { addIncoming({ window: mbWindow, fee: Math.floor(maxBid.maxFee), weeklyWage: mbWage, contractLength: mbContract }); setActiveWindow(mbWindow); }} disabled={maxBid.maxFee <= 0} className="mt-2 text-xs rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-3 py-1.5 text-white font-medium">+ Add at £{Math.floor(maxBid.maxFee)}m</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* -------- Live impact summary (sticky) -------- */}
          <aside className="border-t lg:border-t-0 lg:border-l border-neutral-800 p-4 sm:p-6">
            <div className="lg:sticky lg:top-24 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Live financial impact</p>
                <div className="flex gap-1">
                  {plan.seasons.map((s) => {
                    const z = ZONE_STYLES[s.result.zone];
                    return (
                      <button key={s.seasonIndex} onClick={() => setSelectedSeason(s.seasonIndex)} className={`flex-1 rounded-md border px-2 py-1.5 text-center transition ${s.seasonIndex === selectedSeason ? "border-neutral-500 bg-neutral-900" : "border-neutral-800 bg-neutral-900/40 hover:border-neutral-600"}`}>
                        <span className="block text-[9px] text-neutral-500">{s.label.slice(2)}</span>
                        <span className={`block text-sm font-bold tabular-nums ${z.text}`}>{fmtPct(s.result.scr)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`rounded-xl border ${style.border} ${style.soft} p-4`}>
                <p className="text-[10px] uppercase tracking-wide text-neutral-500">Projected SCR — {season.label}</p>
                <p className={`text-5xl font-black tabular-nums ${style.text}`}>{fmtPct(after.scr)}</p>
                <p className={`text-sm font-semibold mt-1 ${ZONE_STATUS[after.zone].tone}`}>{ZONE_STATUS[after.zone].label}</p>
                <div className="relative mt-4 h-3 rounded bg-neutral-800 overflow-hidden">
                  <div className={`h-full ${style.bar}`} style={{ width: `${pct(after.scr)}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                  <span>0%</span><span>limit {fmtPct(after.limit)}</span><span>130%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Headroom" value={afterHeadroom >= 0 ? fmtM(afterHeadroom) : `−${fmtM(Math.abs(afterHeadroom))}`} tone={afterHeadroom >= 0 ? "text-emerald-400" : "text-red-400"} />
                <MiniStat label="vs baseline" value={`${after.scr >= before.scr ? "+" : ""}${((after.scr - before.scr) * 100).toFixed(1)}pp`} />
                <MiniStat label="Squad costs" value={fmtM(after.squadCosts)} />
                <MiniStat label="Rev + trading" value={fmtM(after.denominator)} />
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Squad market value</p>
                <div className="flex items-baseline gap-2 tabular-nums text-sm">
                  <span className="text-neutral-300">{fmtM(mvNow)}</span>
                  <span className="text-neutral-600">→</span>
                  <span className={`font-bold ${mvEndOfPlan >= mvNow ? "text-emerald-400" : "text-red-400"}`}>{fmtM(mvEndOfPlan)}</span>
                  <span className="text-[10px] text-neutral-500">end of plan</span>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500">PL multi-year allowance</span>
                  <span className={`text-[10px] font-semibold tabular-nums ${plan.buffer.exhausted ? "text-red-400" : plan.buffer.usedPct > 0.66 ? "text-amber-400" : "text-emerald-400"}`}>{(plan.buffer.used * 100).toFixed(1)}pp / 30pp</span>
                </div>
                <div className="h-1.5 rounded bg-neutral-800 overflow-hidden">
                  <div className={`h-full ${plan.buffer.exhausted ? "bg-red-600" : plan.buffer.usedPct > 0.66 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, plan.buffer.usedPct * 100)}%` }} />
                </div>
              </div>

              {after.denominatorWarning && (
                <p className="text-xs text-red-400">Net player-trading losses have wiped out the revenue base — sell before you buy.</p>
              )}

              <button onClick={() => setStep("compliance")} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition">
                Review Compliance →
              </button>
              <p className="text-[10px] text-neutral-600 text-center">{totalMoves} move{totalMoves === 1 ? "" : "s"} planned</p>
            </div>
          </aside>
        </div>
        {showLineups && (
          <LineupBuilder roster={lineupRoster} initial={lineup} clubName={club.shortName} finance={lineupFinance} onSave={(l) => setLineup(l)} onClose={() => setShowLineups(false)} />
        )}
      </div>
    );
  }

  // =========================================================================
  // STEP 3 — COMPLIANCE RESULTS
  // =========================================================================
  if (step === "compliance") {
    const stat = ZONE_STATUS[after.zone];
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        {flowHeader}
        <main className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold">Compliance result</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Your plan for {club.name}, evaluated against the {after.track === "UEFA" ? "UEFA 70%" : "Premier League 85%/115%"} track.</p>
          </div>

          {/* Season selector */}
          <div className="grid grid-cols-3 gap-3">
            {plan.seasons.map((s) => {
              const z = ZONE_STYLES[s.result.zone];
              const isSel = s.seasonIndex === selectedSeason;
              return (
                <button key={s.seasonIndex} onClick={() => setSelectedSeason(s.seasonIndex)} className={`rounded-xl border p-3 text-left transition ${isSel ? `border-neutral-500 bg-neutral-900 ring-1 ${z.ring}` : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-600"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">{s.label}</span>
                    <span className={`h-2 w-2 rounded-full ${z.dot}`} />
                  </div>
                  <p className={`text-2xl font-black tabular-nums mt-1 ${z.text}`}>{fmtPct(s.result.scr)}</p>
                  <span className="text-[10px] text-neutral-500">limit {fmtPct(s.result.limit)}</span>
                </button>
              );
            })}
          </div>

          {/* Headline result */}
          <div className={`rounded-2xl border ${style.border} ${style.soft} p-6`}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">Projected SCR — {season.label}</p>
                <p className={`text-6xl font-black tabular-nums ${style.text}`}>{fmtPct(after.scr)}</p>
                <p className={`text-lg font-bold mt-1 ${stat.tone}`}>{after.zone === "GREEN" ? "✓ " : "⚠ "}{stat.label}</p>
              </div>
              <div className="text-right text-sm text-neutral-400 space-y-0.5">
                <p>Baseline (no plan): <span className="tabular-nums text-neutral-200">{fmtPct(before.scr)}</span></p>
                <p>Limit ({after.track === "UEFA" ? "UEFA" : "PL"}): <span className="tabular-nums text-neutral-200">{fmtPct(after.limit)}</span></p>
                <p>Headroom: <span className={`tabular-nums font-semibold ${afterHeadroom >= 0 ? "text-emerald-400" : "text-red-400"}`}>{afterHeadroom >= 0 ? fmtM(afterHeadroom) : `−${fmtM(Math.abs(afterHeadroom))} over`}</span></p>
              </div>
            </div>
            <div className="relative mt-6 h-12 rounded-lg bg-neutral-800 overflow-hidden ring-1 ring-neutral-700">
              <div className={`h-full ${style.bar} transition-all duration-300`} style={{ width: `${pct(after.scr)}%` }} />
              <Marker left={pct(RULES.UEFA_THRESHOLD)} label="70% UEFA" />
              <Marker left={pct(RULES.PL_GREEN_THRESHOLD)} label="85% PL" />
              <Marker left={pct(RULES.PL_RED_THRESHOLD)} label="115% Red" />
            </div>
            {after.zone === "RED" && (
              <p className="text-sm text-neutral-300 mt-4">
                SCR is above the selected limit. This plan likely requires sales, cost reduction, allowance use, levy/settlement, or other mitigation.
                {after.pointsDeduction > 0 && <span className="block text-[10px] text-neutral-500 mt-1 italic">* Illustrative sporting sanction if unmitigated: −{after.pointsDeduction} points.</span>}
              </p>
            )}
            {after.denominatorWarning && <p className="text-sm text-red-400 mt-3">Net player trading losses have wiped out the revenue base — sell before you buy.</p>}
          </div>

          {/* Before vs After comparison */}
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Before plan vs after plan — {season.label}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <CompareCard title="Before Plan" subtitle="No transactions" tone="neutral" rows={[
                { label: "SCR", value: fmtPct(before.scr) },
                { label: "Squad costs", value: fmtM(before.squadCosts) },
                { label: "Revenue + trading", value: fmtM(before.denominator) },
                { label: "Wage bill", value: fmtM(baseSeason.state.annualWages) },
                { label: "Amortisation", value: fmtM(baseSeason.state.annualAmortisation) },
                { label: "Squad market value", value: fmtM(mvNow) },
                { label: "Headroom vs limit", value: beforeHeadroom >= 0 ? fmtM(beforeHeadroom) : `−${fmtM(Math.abs(beforeHeadroom))}` },
              ]} />
              <CompareCard title="After Plan" subtitle={`${totalMoves} move${totalMoves === 1 ? "" : "s"}`} tone={after.zone} rows={[
                { label: "SCR", value: fmtPct(after.scr), delta: ((after.scr - before.scr) * 100).toFixed(1) + "pp", deltaGood: after.scr <= before.scr },
                { label: "Squad costs", value: fmtM(after.squadCosts), delta: fmtDeltaM(after.squadCosts - before.squadCosts), deltaGood: after.squadCosts <= before.squadCosts },
                { label: "Revenue + trading", value: fmtM(after.denominator), delta: fmtDeltaM(after.denominator - before.denominator), deltaGood: after.denominator >= before.denominator },
                { label: "Wage bill", value: fmtM(season.state.annualWages), delta: fmtDeltaM(season.state.annualWages - baseSeason.state.annualWages), deltaGood: season.state.annualWages <= baseSeason.state.annualWages },
                { label: "Amortisation", value: fmtM(season.state.annualAmortisation), delta: fmtDeltaM(season.state.annualAmortisation - baseSeason.state.annualAmortisation), deltaGood: season.state.annualAmortisation <= baseSeason.state.annualAmortisation },
                { label: "Squad market value", value: fmtM(mvEndOfPlan), delta: fmtDeltaM(mvEndOfPlan - mvNow), deltaGood: mvEndOfPlan >= mvNow },
                { label: "Headroom vs limit", value: afterHeadroom >= 0 ? fmtM(afterHeadroom) : `−${fmtM(Math.abs(afterHeadroom))}`, delta: fmtDeltaM(afterHeadroom - beforeHeadroom), deltaGood: afterHeadroom >= beforeHeadroom },
              ]} />
            </div>
          </div>

          {/* Calculation breakdown (progressive disclosure) */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <button onClick={() => setShowCalculation(!showCalculation)} className="flex items-center justify-between w-full text-xs font-semibold text-neutral-400 hover:text-white transition">
              <span>📊 SCR calculation breakdown</span>
              <span className="text-neutral-500">{showCalculation ? "Collapse −" : "Expand +"}</span>
            </button>
            {showCalculation && (
              <div className="mt-3 space-y-3 text-xs border-t border-neutral-800/60 pt-3 text-neutral-300">
                <div>
                  <p className="text-neutral-500 uppercase tracking-wider text-[10px] font-bold mb-1">Formula</p>
                  <code className="text-emerald-400 bg-black/40 px-2 py-1 rounded block font-mono text-[11px]">SCR = Squad costs / (Revenue + net player trading profit)</code>
                </div>
                <div>
                  <p className="text-neutral-500 uppercase tracking-wider text-[10px] font-bold mb-1">Current season calculation</p>
                  <div className="font-mono text-sm font-bold text-white bg-neutral-950/40 p-2 rounded flex items-center justify-between">
                    <span>£{(season.state.annualWages + season.state.annualAmortisation + season.state.agentFees).toFixed(1)}m / £{season.result.denominator.toFixed(1)}m</span>
                    <span className="text-emerald-400">= {fmtPct(after.scr)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-neutral-500 uppercase tracking-wider text-[10px] font-bold mb-1.5">Numerator: Squad Costs (£{season.result.squadCosts.toFixed(1)}m)</p>
                    <ul className="space-y-1 font-mono text-neutral-400">
                      <li className="flex justify-between"><span>• Wages:</span> <span className="text-white">£{season.state.annualWages.toFixed(1)}m</span></li>
                      <li className="flex justify-between"><span>• Amortisation:</span> <span className="text-white">£{season.state.annualAmortisation.toFixed(1)}m</span></li>
                      <li className="flex justify-between"><span>• Agent fees:</span> <span className="text-white">£{season.state.agentFees.toFixed(1)}m</span></li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-neutral-500 uppercase tracking-wider text-[10px] font-bold mb-1.5">Denominator: Revenue + Trading (£{season.result.denominator.toFixed(1)}m)</p>
                    <ul className="space-y-1 font-mono text-neutral-400">
                      <li className="flex justify-between font-mono"><span>• Revenue:</span> <span className="text-white">£{season.state.estimatedRevenue.toFixed(1)}m</span></li>
                      <li className="flex justify-between font-mono"><span>• Disposal profit:</span> <span className="text-white">£{season.result.disposalProfitUsed.toFixed(1)}m</span></li>
                    </ul>
                    {season.result.disposalAveragingApplied && (
                      <p className="text-[10px] text-amber-500 italic mt-1 leading-normal">* Averaging applied: UEFA 3-year average of prior seasons instead of single-season £{(season.state.netPlayerTradingProfit ?? 0).toFixed(1)}m.</p>
                    )}
                  </div>
                </div>
                {after.track === "PL_DOMESTIC" && after.redLimit < RULES.PL_RED_THRESHOLD - 1e-9 && (
                  <p className="text-[10px] text-neutral-600">Premier League red threshold this season: {fmtPct(after.redLimit)} (down from 115%) — prior-season overage has eroded the multi-year allowance.</p>
                )}
              </div>
            )}
            {/* Financials & sources */}
            <div className="mt-4 border-t border-neutral-800 pt-3">
              <button onClick={() => setShowSources((s) => !s)} className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500 hover:text-white transition">
                <span>Club financials &amp; sources</span><span>{showSources ? "−" : "+"}</span>
              </button>
              <div className="space-y-2 mt-2">
                <SourcedRow label="Revenue" s={year.revenue} showDetail={showSources} />
                <SourcedRow label="Football wages" s={year.wages} showDetail={showSources} />
                <SourcedRow label="Amortisation" s={year.amortisation} showDetail={showSources} />
                <SourcedRow label="Agent fees" s={year.agentFees} showDetail={showSources} />
                <SourcedRow label="Net player-trading profit" s={year.netPlayerTradingProfit} showDetail={showSources} />
              </div>
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 italic">
            * Player-level wages, market values, book values, and amortisation are estimates unless marked otherwise.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 border-t border-neutral-800 pt-6">
            <button onClick={() => setStep("transfers")} className="rounded-lg px-5 py-2.5 text-sm font-medium border border-neutral-700 text-neutral-200 hover:border-neutral-500 transition">← Edit transfers</button>
            <button onClick={() => setStep("lineup")} className="rounded-lg px-5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition">Build lineup →</button>
            <button onClick={savePlan} className="rounded-lg px-5 py-2.5 text-sm font-medium border border-neutral-700 text-neutral-200 hover:border-neutral-500 transition">💾 Save plan</button>
            <button onClick={copyShareLink} className="rounded-lg px-5 py-2.5 text-sm font-medium border border-neutral-700 text-neutral-200 hover:border-neutral-500 transition">{shareCopied ? "✓ Link copied" : "🔗 Share plan"}</button>
            <button onClick={startOver} className="ml-auto rounded-lg px-5 py-2.5 text-sm font-medium text-neutral-400 hover:text-neutral-200 transition">Start over ↻</button>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // STEP 4 — LINEUP
  // =========================================================================
  const availableCount = lineupRoster.length;
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {flowHeader}
      <main className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
          <p className="text-4xl mb-3">⚽</p>
          <h2 className="text-2xl font-bold">Build your lineup from this squad?</h2>
          <p className="mt-2 text-sm text-neutral-400 max-w-md mx-auto">
            Your post-transfer roster is ready — sold and loaned-out players removed, signings and loan-ins added.
            {" "}<span className="text-neutral-300 font-medium">{availableCount} players available.</span>
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button onClick={() => setShowLineups(true)} className="rounded-lg px-6 py-3 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition">Open Lineup Builder</button>
            <button onClick={() => setStep("compliance")} className="rounded-lg px-5 py-3 text-sm font-medium border border-neutral-700 text-neutral-200 hover:border-neutral-500 transition">← Back to compliance</button>
          </div>
          {lineup && <p className="mt-4 text-xs text-emerald-400">✓ A lineup is saved with this plan ({lineup.formation}).</p>}
        </div>

        {/* Roster preview */}
        <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Post-transfer roster ({availableCount})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {lineupRoster.map((r) => (
              <div key={r.key} className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs">
                <span className="truncate">
                  <span className="text-neutral-500 mr-1.5">{r.position}</span>{r.name}
                </span>
                {r.tag === "signing" && <span className="text-[9px] text-emerald-400 ml-1 shrink-0">NEW</span>}
                {r.tag === "loan-in" && <span className="text-[9px] text-sky-400 ml-1 shrink-0">LOAN</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={copyShareLink} className="rounded-lg px-5 py-2.5 text-sm font-medium border border-neutral-700 text-neutral-200 hover:border-neutral-500 transition">{shareCopied ? "✓ Link copied" : "🔗 Share plan"}</button>
          <button onClick={savePlan} className="rounded-lg px-5 py-2.5 text-sm font-medium border border-neutral-700 text-neutral-200 hover:border-neutral-500 transition">💾 Save plan</button>
          <button onClick={startOver} className="ml-auto rounded-lg px-5 py-2.5 text-sm font-medium text-neutral-400 hover:text-neutral-200 transition">Start over ↻</button>
        </div>
      </main>

      {showLineups && (
        <LineupBuilder roster={lineupRoster} initial={lineup} clubName={club.shortName} onSave={(l) => setLineup(l)} onClose={() => setShowLineups(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function Stepper({ current, onNavigate, reached }: { current: Step; onNavigate: (s: Step) => void; reached: Partial<Record<Step, boolean>> }) {
  const currentIdx = STEP_ORDER.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-1 text-[11px]">
      {STEP_ORDER.map((s, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        const canNav = isDone || isCurrent || reached[s.key];
        return (
          <li key={s.key} className="flex items-center gap-1">
            <button
              onClick={() => canNav && onNavigate(s.key)}
              disabled={!canNav}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
                isCurrent ? "bg-neutral-800 text-white" : isDone ? "text-emerald-400 hover:text-emerald-300" : "text-neutral-600"
              } ${canNav ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className={`h-4 w-4 rounded-full grid place-items-center text-[9px] font-bold ${isCurrent ? "bg-emerald-600 text-white" : isDone ? "bg-emerald-900 text-emerald-300" : "bg-neutral-800 text-neutral-600"}`}>
                {isDone ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEP_ORDER.length - 1 && <span className={`w-4 h-px ${i < currentIdx ? "bg-emerald-800" : "bg-neutral-800"}`} />}
          </li>
        );
      })}
      <li className="flex items-center gap-1">
        <span className={`w-4 h-px ${current === "compliance" || current === "lineup" ? "bg-emerald-800" : "bg-neutral-800"}`} />
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${current === "compliance" || current === "lineup" ? "text-neutral-300" : "text-neutral-600"}`}>
          <span className="h-4 w-4 rounded-full grid place-items-center text-[9px] font-bold bg-neutral-800 text-neutral-500">5</span>
          <span className="hidden sm:inline">Share</span>
        </span>
      </li>
    </ol>
  );
}

const fmtDeltaM = (x: number) => `${x >= 0 ? "+" : "−"}£${Math.abs(Math.round(x))}m`;

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
      <p className="text-[10px] text-neutral-500">{label}</p>
      <p className={`text-base font-bold tabular-nums ${tone ?? "text-neutral-100"}`}>{value}</p>
    </div>
  );
}

function CompareCard({ title, subtitle, tone, rows }: {
  title: string; subtitle: string; tone: Zone | "neutral";
  rows: { label: string; value: string; delta?: string; deltaGood?: boolean }[];
}) {
  const border = tone === "neutral" ? "border-neutral-800" : ZONE_STYLES[tone].border;
  const soft = tone === "neutral" ? "bg-neutral-900/40" : ZONE_STYLES[tone].soft;
  return (
    <div className={`rounded-xl border ${border} ${soft} p-4`}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-bold text-neutral-200">{title}</h3>
        <span className="text-[10px] text-neutral-500">{subtitle}</span>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-sm border-b border-neutral-800/60 pb-2 last:border-0 last:pb-0">
            <span className="text-neutral-400 text-xs">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums font-semibold text-neutral-100">{r.value}</span>
              {r.delta && <span className={`text-[10px] tabular-nums ${r.deltaGood ? "text-emerald-400" : "text-red-400"}`}>{r.delta}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcedRow({ label, s, showDetail }: { label: string; s: Sourced; showDetail: boolean }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between items-center">
        <span className="text-neutral-400">{label}</span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-neutral-200">£{s.value}m</span>
          <ReliabilityBadge r={s.reliability} />
        </span>
      </div>
      {showDetail && (
        <div className="mt-1 mb-2 pl-2 border-l border-neutral-800 text-[11px] text-neutral-500">
          <p>{s.source}</p>
          {s.note && <p className="mt-0.5 text-neutral-600">{s.note}</p>}
          {s.sourceUrl && (
            <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline break-all">source ↗</a>
          )}
        </div>
      )}
    </div>
  );
}

function ReliabilityBadge({ r }: { r: Reliability }) {
  const displayMap: Record<Reliability, string> = {
    primary: "Audited / Primary source",
    derived: "Model-derived",
    estimate: "Estimated",
    placeholder: "Estimated placeholder",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${RELIABILITY_STYLES[r]}`}>{displayMap[r] || r}</span>;
}

function Slider({
  label, value, min, max, step, display, disabled, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; display: string; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-400">{label}</span>
        <span className="text-neutral-400 tabular-nums">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-emerald-500" />
    </div>
  );
}

function Marker({ left, label }: { left: number; label: string }) {
  return (
    <div className="absolute top-0 h-full border-l border-dashed border-neutral-300/60" style={{ left: `${left}%` }}>
      <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-neutral-400 whitespace-nowrap">{label}</span>
    </div>
  );
}

function SolutionCard({ solution, highlight, label }: { solution: ClearingSolution; highlight?: boolean; label?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-emerald-600/60 bg-emerald-950/30" : "border-neutral-800 bg-neutral-900"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-neutral-200">
          {label ?? (solution.count === 0 ? "No sales needed" : `Sell ${solution.count} player${solution.count > 1 ? "s" : ""}`)}
        </span>
        <span className={`text-sm font-bold tabular-nums ${solution.compliant ? "text-emerald-400" : "text-red-400"}`}>
          → {(solution.resultingScr * 100).toFixed(1)}%
        </span>
      </div>
      {solution.players.length > 0 ? (
        <ul className="space-y-1">
          {solution.players.map((p) => (
            <li key={p.name} className="flex justify-between text-sm text-neutral-300">
              <span>{p.name}{p.isAcademy && <span className="text-emerald-500 text-xs ml-2">academy · pure profit</span>}</span>
              <span className="tabular-nums text-neutral-400">£{p.marketValue}m</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">The plan already fits under the limit.</p>
      )}
      {solution.count > 0 && (
        <div className="mt-3 flex gap-6 text-xs text-neutral-500 border-t border-neutral-800 pt-2">
          <span>Raised: <span className="text-neutral-300 tabular-nums">£{solution.proceeds}m</span></span>
          <span>Booked profit: <span className="text-neutral-300 tabular-nums">£{solution.tradingProfit}m</span></span>
        </div>
      )}
    </div>
  );
}

function ClearingPanel({ result, clubName }: { result: ClearingResult; clubName: string }) {
  const limitPct = (result.limit * 100).toFixed(0);
  const trackLabel = result.track === "UEFA" ? "UEFA 70%" : "PL 85%";
  return (
    <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-neutral-200">Clearing House · target {trackLabel}</h4>
        <span className="text-xs text-neutral-500 tabular-nums">SCR after current plan {(result.baselineScr * 100).toFixed(1)}%</span>
      </div>
      {result.achievable && result.best ? (
        <div className="space-y-4">
          {result.best.count === 0 ? (
            <p className="text-sm text-emerald-400 font-medium">✓ {clubName}&apos;s current plan already fits under {limitPct}%. No further sales needed.</p>
          ) : (
            <p className="text-sm text-neutral-300">To get under {limitPct}%, the cheapest further sales are:</p>
          )}
          <SolutionCard solution={result.best} highlight label="Recommended" />
          {result.alternatives.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Other options</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.alternatives.map((alt, i) => (
                  <SolutionCard key={i} solution={alt} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-red-400 font-medium">✗ Even selling every remaining player can&apos;t get {clubName} under {limitPct}%.</p>
          {result.bestEffort && <SolutionCard solution={result.bestEffort} label="Closest you can get" />}
        </div>
      )}
    </div>
  );
}
