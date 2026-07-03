"use client";

/**
 * LineupBuilder — premium three-panel squad screen (design inspired by the
 * in-repo PremiumLineupBuilder reference), rebuilt to be fully props-driven:
 *
 *   • Left rail  — real, read-only compliance gauge (numbers come from the
 *     financial engine via the optional `finance` prop; NO math is done here)
 *     plus tactical board controls (formation, auto-fill, clear).
 *   • Centre     — the pitch: circular avatar nodes with a backup pill; drag a
 *     card on, or click a node to open its slot configurator.
 *   • Right rail — searchable / role-filterable squad pool.
 *   • Modal      — per-slot starter + ordered backup (substitute) hierarchy.
 *
 * All geometry, formation data and validation live in the pure lineups module.
 * Ratings / flags / gradients are DERIVED from the club's own market values and
 * names — no external player data is introduced.
 */

import { useEffect, useMemo, useState } from "react";
import {
  FORMATIONS,
  FORMATION_IDS,
  emptyLineup,
  placeInSlot,
  addBackup,
  removeMember,
  reshapeLineup,
  sanitizeLineup,
  slotFit,
  lineupCount,
  type FormationId,
  type Lineup,
  type PlayerPosition,
} from "@/utils/lineups";

export interface RosterEntry {
  key: string;
  name: string;
  position: PlayerPosition;
  /** £m */
  marketValue: number;
  tag: "squad" | "signing" | "loan-in";
}

/** Read-only compliance context, straight from the engine (no recomputation). */
export interface LineupFinance {
  scr: number;         // 0..~1.5
  limit: number;       // binding limit, 0..1
  zone: "GREEN" | "YELLOW" | "RED";
  squadValue: number;  // £m, end-of-plan squad market value
  trackLabel: string;  // e.g. "UEFA 70%" / "PL 85%"
}

// --- Derivation helpers (consistent, deterministic, club-data only) ----------

function getPlayerGradient(pos: PlayerPosition): string {
  switch (pos) {
    case "GK": return "from-blue-600 to-cyan-500";
    case "DF": return "from-cyan-600 to-sky-500";
    case "MF": return "from-emerald-500 to-teal-600";
    case "FW": return "from-red-600 to-amber-500";
    default: return "from-indigo-600 to-purple-500";
  }
}
/** Map market value to an EA-FC-style rating badge (purely cosmetic). */
function getPlayerRating(marketValue: number): number {
  return Math.min(99, Math.max(65, 72 + Math.round(marketValue / 3.5)));
}
/** Deterministic flag by hashing the name (cosmetic — no real nationality data). */
function getPlayerFlag(name: string): string {
  const flags = ["🇬🇧", "🇪🇸", "🇫🇷", "🇧🇷", "🇦🇷", "🇮🇹", "🇵🇹", "🇳🇱", "🇩🇪", "🇧🇪"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return flags[Math.abs(hash) % flags.length];
}
const TAG_BADGE: Record<RosterEntry["tag"], string | null> = { squad: null, signing: "NEW", "loan-in": "LOAN" };
const lastName = (name: string) => name.split(" ").pop() ?? name;
const ROLE_FILTERS: ("ALL" | PlayerPosition)[] = ["ALL", "GK", "DF", "MF", "FW"];

/**
 * Font size (px) that lets `name` fit on one line inside a circle of
 * `circlePx` diameter. Uppercase font-black chars are ≈0.62em wide; ~82% of
 * the diameter is usable at the circle's vertical middle.
 */
function fitNameSize(name: string, circlePx: number): number {
  const usable = circlePx * 0.82;
  const est = usable / (Math.max(1, name.length) * 0.62);
  return Math.max(6.5, Math.min(11, est));
}

/** SSR-safe media query (false on server + first client render). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export default function LineupBuilder({
  roster,
  initial,
  clubName,
  finance,
  onSave,
  onClose,
}: {
  roster: RosterEntry[];
  initial: { formation: string; slots: (string | null)[]; subs?: string[][] } | null;
  clubName: string;
  finance?: LineupFinance;
  onSave: (lineup: Lineup) => void;
  onClose: () => void;
}) {
  const byKey = useMemo(() => new Map(roster.map((r) => [r.key, r])), [roster]);
  const validKeys = useMemo(() => new Set(roster.map((r) => r.key)), [roster]);

  const [lineup, setLineup] = useState<Lineup>(() => sanitizeLineup(initial, validKeys) ?? emptyLineup("433"));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [configSlot, setConfigSlot] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | PlayerPosition>("ALL");
  // Below `sm` the pitch nodes are 64px (vs 80px) — used to fit name text.
  const isMobile = useMediaQuery("(max-width: 639px)");
  const circlePx = isMobile ? 64 : 80;

  const formation = FORMATIONS[lineup.formation];
  const starterKeys = useMemo(() => new Set(lineup.slots.filter(Boolean) as string[]), [lineup]);
  const subKeys = useMemo(() => new Set(lineup.subs.flat()), [lineup]);
  const xiValue = lineup.slots.reduce((a, k) => a + (k ? byKey.get(k)?.marketValue ?? 0 : 0), 0);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((r) => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q);
      const matchesRole = roleFilter === "ALL" || r.position === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [roster, search, roleFilter]);

  function assign(slotIndex: number, key: string | null) {
    setLineup((l) => placeInSlot(l, slotIndex, key));
    setSelectedKey(null);
  }
  function handleSlotActivate(slotIndex: number) {
    if (selectedKey) assign(slotIndex, selectedKey);
    else setConfigSlot(slotIndex);
  }
  function changeFormation(f: FormationId) {
    setLineup((l) => reshapeLineup(l, f, (k) => byKey.get(k)?.position));
  }
  function autoFill() {
    let l = lineup;
    const slots = FORMATIONS[l.formation].slots;
    for (let i = 0; i < slots.length; i++) {
      if (l.slots[i]) continue;
      const used = new Set(l.slots.filter(Boolean) as string[]);
      const candidates = roster.filter((r) => !used.has(r.key)).sort((a, b) => b.marketValue - a.marketValue);
      const pick =
        candidates.find((r) => slotFit(slots[i], r.position) === "ok") ??
        candidates.find((r) => slotFit(slots[i], r.position) === "soft");
      if (pick) l = placeInSlot(l, i, pick.key);
    }
    setLineup(l);
  }

  // ---- Finance gauge (read-only) -------------------------------------------
  const gaugeTone =
    finance?.zone === "GREEN" ? "text-emerald-400" : finance?.zone === "YELLOW" ? "text-amber-400" : "text-red-400";
  const gaugeBar =
    finance?.zone === "GREEN" ? "from-emerald-500 to-teal-400" : finance?.zone === "YELLOW" ? "from-amber-500 to-yellow-400" : "from-red-500 to-rose-600";
  const gaugeStatus =
    finance?.zone === "GREEN" ? "Fully compliant" : finance?.zone === "YELLOW" ? "Luxury levy zone" : "Regulatory breach risk";

  return (
    <div className="fixed inset-0 z-50 bg-[#090b11] text-white flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
      {/* ===================== LEFT RAIL ===================== */}
      <aside className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-[#1a1f2e] bg-[#0c0f17] flex flex-col lg:overflow-y-auto">
        <div className="p-5 border-b border-[#1a1f2e] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold leading-tight">⚽ {clubName} — Lineup</h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">Post-transfer squad builder</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-xs rounded-lg px-3 py-1.5 border border-neutral-700 text-neutral-300">✕</button>
        </div>

        {/* Compliance gauge (real numbers, read-only) */}
        {finance && (
          <div className="p-5 space-y-4 border-b border-[#1a1f2e] bg-[#0e121d]">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Compliance status <span className="text-neutral-600 normal-case">· from your plan</span></h3>
            <div>
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-xs text-neutral-400">Squad Cost Ratio</span>
                <span className={`text-lg font-bold tabular-nums ${gaugeTone}`}>{(finance.scr * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2.5 w-full bg-[#1b2234] rounded-full overflow-hidden relative">
                <div className={`h-full rounded-full bg-gradient-to-r ${gaugeBar}`} style={{ width: `${Math.min(100, finance.scr * 100)}%` }} />
                <div className="absolute top-0 bottom-0 left-[70%] w-0.5 bg-sky-500/50" title="UEFA 70%" />
                <div className="absolute top-0 bottom-0 left-[85%] w-0.5 bg-amber-500/50" title="PL 85%" />
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                <span>0%</span><span className="text-sky-400 font-semibold">70%</span><span className="text-amber-400 font-semibold">85%</span><span>100%</span>
              </div>
            </div>
            <div className={`p-3 rounded-xl border text-xs ${
              finance.zone === "GREEN" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300" :
              finance.zone === "YELLOW" ? "bg-amber-500/5 border-amber-500/20 text-amber-300" :
              "bg-red-500/5 border-red-500/20 text-red-300"
            }`}>
              <span className="font-bold block">{gaugeStatus}</span>
              <span className="opacity-80">Binding limit: {finance.trackLabel} · {(finance.limit * 100).toFixed(0)}%</span>
            </div>
            <p className="text-[10px] text-neutral-600">SCR is calculated across the whole squad in your plan — the XI you pick here doesn&apos;t change it.</p>
          </div>
        )}

        {/* Tactical board controls */}
        <div className="p-5 space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Tactical board</h3>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Starting XI value</span>
            <span className="text-emerald-400 font-bold tabular-nums">£{Math.round(xiValue)}m</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">Placed</span>
            <span className="text-neutral-200 font-bold tabular-nums">{lineupCount(lineup)} / 11</span>
          </div>
          {finance && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">Squad market value</span>
              <span className="text-neutral-200 font-bold tabular-nums">£{Math.round(finance.squadValue)}m</span>
            </div>
          )}

          <div className="space-y-2 pt-1">
            <label className="text-[11px] text-neutral-500">Formation</label>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMATION_IDS.map((f) => (
                <button
                  key={f}
                  onClick={() => changeFormation(f)}
                  className={`px-2 py-2 text-xs font-semibold rounded-lg border transition ${
                    lineup.formation === f
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-[#121622] border-[#1d2436] text-neutral-400 hover:text-white hover:bg-[#1a1f2e]"
                  }`}
                >
                  {FORMATIONS[f].name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={autoFill} className="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white rounded-lg transition">✨ Auto-fill Best XI</button>
            <button onClick={() => setLineup(emptyLineup(lineup.formation))} className="px-4 py-2 text-xs font-semibold bg-[#121622] border border-[#1d2436] hover:border-red-500/30 hover:text-red-400 rounded-lg transition">Clear</button>
          </div>
        </div>

        <div className="mt-auto p-5 border-t border-[#1a1f2e] flex gap-2">
          <button onClick={() => { onSave(lineup); onClose(); }} className="flex-1 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition">Save &amp; Close</button>
          <button onClick={onClose} className="hidden lg:block px-4 py-2.5 text-xs font-semibold border border-neutral-700 text-neutral-400 hover:text-white rounded-lg transition">✕</button>
        </div>
      </aside>

      {/* ===================== CENTRE: PITCH ===================== */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#0b0d15]">
        <div className="px-5 py-3 border-b border-[#1a1f2e]/60 flex items-center justify-between bg-[#0e111b]/70 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{clubName} — Interactive XI</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold uppercase tracking-wider">{formation.name}</span>
          </div>
          <span className="text-xs text-neutral-400">Tap a spot to set starter &amp; backups</span>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 lg:p-8 select-none">
          <div className="relative w-full max-w-[560px] aspect-[68/96] rounded-3xl overflow-hidden border border-emerald-500/20 shadow-2xl shadow-black/80 bg-gradient-to-b from-[#132220] via-[#0b1614] to-[#05090a]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
            <svg viewBox="0 0 68 96" className="absolute inset-0 h-full w-full opacity-35 pointer-events-none" fill="none" stroke="rgba(52,211,153,0.2)" strokeWidth="0.35">
              <rect x="1.5" y="1.5" width="65" height="93" rx="2" />
              <line x1="1.5" y1="48" x2="66.5" y2="48" />
              <circle cx="34" cy="48" r="7.3" />
              <circle cx="34" cy="48" r="0.6" fill="rgba(52,211,153,0.2)" />
              <rect x="14" y="79.5" width="40" height="15" />
              <rect x="24" y="89.5" width="20" height="5" />
              <path d="M 26.5 79.5 A 8 8 0 0 1 41.5 79.5" />
              <rect x="14" y="1.5" width="40" height="15" />
              <rect x="24" y="1.5" width="20" height="5" />
              <path d="M 26.5 16.5 A 8 8 0 0 0 41.5 16.5" />
            </svg>

            {formation.slots.map((slot, i) => {
              const key = lineup.slots[i];
              const entry = key ? byKey.get(key) : undefined;
              const warn = !!entry && slotFit(slot, entry.position) === "soft";
              const backups = lineup.subs[i] ?? [];
              const primaryBackup = backups[0] ? byKey.get(backups[0]) : undefined;
              const wouldReject =
                (selectedKey && slotFit(slot, byKey.get(selectedKey)?.position ?? "MF") === "hard") ||
                (dragKey && slotFit(slot, byKey.get(dragKey)?.position ?? "MF") === "hard");
              return (
                <div
                  key={slot.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  onDragOver={(e) => { if (!wouldReject) e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const k = e.dataTransfer.getData("text/plain") || dragKey;
                    if (k && slotFit(slot, byKey.get(k)?.position ?? "MF") !== "hard") assign(i, k);
                    setDragKey(null);
                  }}
                >
                  <div
                    onClick={() => { if (!(selectedKey && slotFit(slot, byKey.get(selectedKey)?.position ?? "MF") === "hard")) handleSlotActivate(i); }}
                    className="flex flex-col items-center group cursor-pointer"
                  >
                    <div
                      draggable={!!entry}
                      onDragStart={(e) => { if (entry) { e.dataTransfer.setData("text/plain", entry.key); setDragKey(entry.key); } }}
                      onDragEnd={() => setDragKey(null)}
                      className="relative"
                    >
                      <div className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 border text-[8px] font-extrabold tracking-wider z-20 whitespace-nowrap shadow-md ${warn ? "border-red-500/40 text-red-400" : "border-indigo-500/30 text-indigo-400"}`}>
                        {slot.label}{warn ? " ⚠" : ""}
                      </div>
                      <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full p-0.5 bg-gradient-to-b transition-transform duration-300 group-hover:scale-105 ${
                        entry ? (warn ? "from-red-400 to-rose-500 shadow-lg shadow-red-500/25" : "from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/25") : "from-gray-700/30 to-gray-800/10"
                      }`}>
                        <div className="w-full h-full rounded-full bg-[#0d121c] flex flex-col items-center justify-center overflow-hidden relative">
                          {entry ? (
                            <>
                              <div className={`absolute inset-0 bg-gradient-to-tr ${getPlayerGradient(entry.position)} opacity-20`} />
                              {/* Mobile: no rating badge (no room) — flag + name centred,
                                  name font auto-sized to fit the circle on one line. */}
                              <div className="z-10 mt-0.5 sm:mt-2.5 flex flex-col items-center">
                                <span className="text-xs leading-none">{getPlayerFlag(entry.name)}</span>
                                <span
                                  className="tracking-wide mt-0.5 font-black uppercase text-gray-200 whitespace-nowrap leading-tight"
                                  style={{ fontSize: `${fitNameSize(lastName(entry.name), circlePx)}px` }}
                                >
                                  {lastName(entry.name)}
                                </span>
                              </div>
                              <div className="hidden sm:block absolute bottom-1.5 text-[9px] font-bold text-emerald-400 bg-black/75 px-1 rounded z-20">★ {getPlayerRating(entry.marketValue)}</div>
                            </>
                          ) : (
                            <span className="text-lg text-gray-500 group-hover:text-gray-300 transition">＋</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mobile: the name lives inside the circle, so the duplicate
                        name pill and the "+ Add sub" hint are desktop-only; a
                        compact backup pill still shows when subs exist. */}
                    <div className="mt-1 sm:mt-1.5 flex flex-col items-center gap-1 w-24">
                      {entry && (
                        <div className="hidden sm:block px-2 py-0.5 bg-black/85 border border-[#232a3d] text-gray-200 text-[9px] font-medium rounded text-center truncate max-w-full">{lastName(entry.name)}</div>
                      )}
                      {entry && (
                        primaryBackup ? (
                          <div className="px-1.5 sm:px-2 py-0.5 bg-[#121622] border border-cyan-500/20 text-[8px] sm:text-[9px] text-cyan-300 rounded-full flex items-center gap-1 font-bold max-w-full">
                            <span className="shrink-0">⇄</span>
                            <span className="truncate max-w-[44px] sm:max-w-[55px]">{lastName(primaryBackup.name)}</span>
                            {backups.length > 1 && <span className="text-[8px] px-1 bg-cyan-900/40 text-cyan-200 rounded">+{backups.length - 1}</span>}
                          </div>
                        ) : (
                          <div className="hidden sm:flex px-2 py-0.5 bg-black/40 border border-[#1b2234] text-[8px] text-gray-500 rounded-full items-center gap-0.5">＋ Add sub</div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===================== RIGHT RAIL: SQUAD POOL ===================== */}
      <aside
        className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-[#1a1f2e] bg-[#0c0f17] flex flex-col lg:overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const k = e.dataTransfer.getData("text/plain") || dragKey;
          if (k) {
            const idx = lineup.slots.indexOf(k);
            if (idx !== -1) assign(idx, null);
          }
          setDragKey(null);
        }}
      >
        <div className="p-5 border-b border-[#1a1f2e] shrink-0">
          <h3 className="text-sm font-bold mb-3">{clubName} squad <span className="text-neutral-500 font-normal">({roster.length})</span></h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full px-3 py-2 text-xs bg-[#121622] border border-[#1d2436] focus:border-indigo-500 text-white placeholder-neutral-500 rounded-lg outline-none transition mb-3"
          />
          <div className="flex gap-1">
            {ROLE_FILTERS.map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1 text-[10px] font-bold rounded-full transition ${
                  roleFilter === role ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "bg-black/25 text-neutral-400 hover:text-white border border-transparent"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 lg:min-h-0">
          {filteredRoster.length === 0 && <p className="text-xs text-neutral-600 p-3">No players match.</p>}
          {filteredRoster.map((player) => {
            const isStarter = starterKeys.has(player.key);
            const isSub = subKeys.has(player.key);
            return (
              <div
                key={player.key}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", player.key); setDragKey(player.key); }}
                onDragEnd={() => setDragKey(null)}
                onClick={() => setSelectedKey((k) => (k === player.key ? null : player.key))}
                className={`p-2.5 rounded-xl border flex items-center justify-between transition cursor-grab active:cursor-grabbing ${
                  selectedKey === player.key ? "border-white/40 bg-white/5"
                  : isStarter ? "bg-emerald-950/10 border-emerald-500/20"
                  : isSub ? "bg-cyan-950/10 border-cyan-500/20"
                  : "bg-[#101420] border-[#1d2436]/60 hover:bg-[#141a2a] hover:border-[#2b3550]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-lg p-0.5 bg-gradient-to-b ${getPlayerGradient(player.position)} shrink-0`}>
                    <div className="w-full h-full rounded-[6px] bg-[#0c0f17] flex items-center justify-center text-sm">{getPlayerFlag(player.name)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-200 truncate flex items-center gap-1.5">
                      <span className="truncate">{player.name}</span>
                      {TAG_BADGE[player.tag] && <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 rounded font-black">{TAG_BADGE[player.tag]}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 mt-0.5">
                      <span className="font-bold text-indigo-400">{player.position}</span><span>•</span>
                      <span>★ {getPlayerRating(player.marketValue)}</span><span>•</span>
                      <span className="tabular-nums">£{Math.round(player.marketValue)}m</span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {isStarter ? (
                    <span className="px-2 py-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded">STARTER</span>
                  ) : isSub ? (
                    <span className="px-2 py-1 text-[9px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded">SUB</span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const slots = FORMATIONS[lineup.formation].slots;
                        const target = slots.findIndex((s) => s.role === player.position && !lineup.slots[slots.indexOf(s)]);
                        const idx = target !== -1 ? target : slots.findIndex((s, j) => !lineup.slots[j] && slotFit(s, player.position) !== "hard");
                        if (idx !== -1) assign(idx, player.key);
                      }}
                      className="px-2 py-1 rounded-lg bg-[#192033] hover:bg-indigo-600 border border-[#232c45] hover:border-indigo-500 text-neutral-300 hover:text-white text-[10px] font-bold transition"
                      title="Add to first open matching slot"
                    >
                      + Pitch
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {selectedKey && (
          <p className="p-3 text-[10px] text-emerald-400 font-bold border-t border-[#1a1f2e] shrink-0">👉 {byKey.get(selectedKey)?.name} selected — click a pitch spot to place him.</p>
        )}
      </aside>

      {/* ===================== SLOT CONFIG MODAL ===================== */}
      {configSlot !== null && (() => {
        const slot = formation.slots[configSlot];
        const starterKey = lineup.slots[configSlot];
        const starter = starterKey ? byKey.get(starterKey) : undefined;
        const backups = lineup.subs[configSlot] ?? [];
        const assignedHere = new Set([starterKey, ...backups].filter(Boolean) as string[]);
        const pool = roster.filter((r) => !assignedHere.has(r.key)).sort((a, b) => b.marketValue - a.marketValue);
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setConfigSlot(null)}>
            <div className="w-full max-w-lg bg-[#0e121d] rounded-2xl border border-[#232a3d] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-[#232a3d] flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-200">Configure position: <span className="text-indigo-400">{slot.label}</span></h3>
                  <p className="text-xs text-neutral-400">Set the starter and an ordered backup hierarchy.</p>
                </div>
                <button onClick={() => setConfigSlot(null)} className="p-1.5 rounded-lg bg-[#192033] hover:bg-[#232c45] text-neutral-400 hover:text-white transition">✕</button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Starter</h4>
                  {starter ? (
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{getPlayerFlag(starter.name)}</span>
                        <div>
                          <div className="text-xs font-bold text-gray-200">{starter.name}</div>
                          <div className="text-[10px] text-neutral-400">{starter.position} · ★ {getPlayerRating(starter.marketValue)} · £{Math.round(starter.marketValue)}m{slotFit(slot, starter.position) === "soft" ? " · ⚠ out of position" : ""}</div>
                        </div>
                      </div>
                      <button onClick={() => setLineup((l) => removeMember(l, configSlot, starter.key))} className="px-2 py-1 rounded-lg bg-red-950/20 hover:bg-red-900/40 text-red-400 border border-red-900/20 text-[10px] font-bold transition">Remove</button>
                    </div>
                  ) : (
                    <div className="p-4 bg-black/20 border border-dashed border-[#232a3d] rounded-xl text-center text-xs text-neutral-500">No starter assigned.</div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center justify-between">
                    <span>Backups</span><span className="text-[10px] text-neutral-500 normal-case">Top = first sub</span>
                  </h4>
                  {backups.length > 0 ? (
                    <div className="space-y-2">
                      {backups.map((subId, index) => {
                        const sub = byKey.get(subId);
                        if (!sub) return null;
                        return (
                          <div key={subId} className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/50 text-cyan-400 font-black border border-cyan-500/10">Sub {index + 1}</span>
                              <div>
                                <div className="text-xs font-bold text-gray-200">{sub.name}</div>
                                <div className="text-[10px] text-neutral-400">{sub.position} · ★ {getPlayerRating(sub.marketValue)} · £{Math.round(sub.marketValue)}m</div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setLineup((l) => placeInSlot(l, configSlot, sub.key))} className="px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-emerald-400 text-[10px] font-bold transition">Promote</button>
                              <button onClick={() => setLineup((l) => removeMember(l, configSlot, sub.key))} className="px-2 py-1 rounded bg-red-950/20 hover:bg-red-900/40 text-red-400 border border-red-900/20 text-[10px] font-bold transition">Remove</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 bg-black/20 border border-dashed border-[#232a3d] rounded-xl text-center text-xs text-neutral-500">No backups for this spot yet.</div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Assign from squad</h4>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {pool.map((player) => {
                      const fit = slotFit(slot, player.position);
                      return (
                        <div key={player.key} className="p-2.5 bg-[#121622] hover:bg-[#181d2e] border border-[#1d2436]/60 rounded-lg flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-200 truncate mr-2">
                            {player.name} <span className="text-indigo-400 text-[10px] ml-1">{player.position}</span>
                            {fit === "hard" && <span className="text-red-400 text-[9px] ml-1">✗ can&apos;t play here</span>}
                            {fit === "soft" && <span className="text-amber-400 text-[9px] ml-1">⚠ off-position</span>}
                          </span>
                          <div className="flex gap-1 shrink-0">
                            <button
                              disabled={fit === "hard"}
                              onClick={() => setLineup((l) => placeInSlot(l, configSlot, player.key))}
                              className="px-2 py-1 bg-emerald-600/20 border border-emerald-500/30 enabled:hover:bg-emerald-600 enabled:hover:text-white text-emerald-400 text-[10px] font-bold rounded disabled:opacity-30"
                            >
                              Starter
                            </button>
                            <button
                              onClick={() => setLineup((l) => addBackup(l, configSlot, player.key))}
                              className="px-2 py-1 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600 hover:text-white text-cyan-400 text-[10px] font-bold rounded"
                            >
                              Sub
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-[#0a0d15] border-t border-[#232a3d] flex justify-end">
                <button onClick={() => setConfigSlot(null)} className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition">Done</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
