"use client";

import { useEffect, useState } from "react";

// Bump the version suffix to re-show the walkthrough to everyone after a big update.
const SEEN_KEY = "eplTradeMachine.onboardingSeen.v1";

interface Slide {
  badge: string;
  title: string;
  body: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    badge: "Welcome",
    title: "This is a transfer sandbox with an accountant built in",
    body: (
      <>
        <p>
          Build any Premier League transfer window you like — signings, sales, loans — and instantly see
          whether it&apos;s <em>legal</em> under the cost-control rules that actually govern the game.
        </p>
        <p className="mt-3">
          The one number that matters is <strong className="text-emerald-400">SCR</strong> — your Squad Cost
          Ratio:
        </p>
        <p className="mt-2 rounded-lg bg-neutral-800/70 px-3 py-2 text-center text-sm text-neutral-200">
          SCR = squad costs ÷ (football revenue + profit on player sales)
        </p>
        <p className="mt-3 text-sm text-neutral-400">
          Squad costs = wages + transfer amortisation + agent fees. Keep the ratio under the limit and
          you&apos;re compliant. Blow past it and you&apos;re risking points.
        </p>
      </>
    ),
  },
  {
    badge: "Step 1 · Club",
    title: "Pick your club",
    body: (
      <>
        <p>
          The landing grid shows all 13 clubs ranked by their current SCR. The coloured dot tells you where
          they stand right now:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> <span className="text-neutral-300"><strong>Green</strong> — compliant, room to spend</span></li>
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> <span className="text-neutral-300"><strong>Amber</strong> — squeezed, in the luxury-tax zone</span></li>
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-600" /> <span className="text-neutral-300"><strong>Red</strong> — breach risk, spend and you get punished</span></li>
        </ul>
        <p className="mt-3 text-sm text-neutral-400">
          Badges show whether a club&apos;s figures are <strong>audited actuals</strong> or a
          model-derived <strong>estimate</strong>. The original six clubs are built on verified accounts.
          Click any card to start planning.
        </p>
      </>
    ),
  },
  {
    badge: "Step 2 · Transfers",
    title: "Build the window",
    body: (
      <>
        <p>Three tools, one plan:</p>
        <ul className="mt-3 space-y-2 text-sm text-neutral-300">
          <li><strong className="text-emerald-400">+ Add signing</strong> — set fee, wage, contract length. Amortisation is spread across the contract automatically (capped at 5 years, per the rules).</li>
          <li><strong className="text-emerald-400">Sell</strong> — open the squad list and sell a player. You&apos;ll see the profit-on-sale, which <em>helps</em> your SCR.</li>
          <li><strong className="text-emerald-400">Loan</strong> — loan players out or in, with wage splits and option/obligation-to-buy clauses booked the way regulators treat them.</li>
        </ul>
        <p className="mt-3 text-sm text-neutral-400">
          Plan across <strong>six windows and three seasons</strong> (Summer &apos;26 → Jan &apos;29). January deals
          only book half a season of costs — the tool handles that for you.
        </p>
      </>
    ),
  },
  {
    badge: "Step 2 · Assumptions",
    title: "Set the context",
    body: (
      <>
        <ul className="space-y-2 text-sm text-neutral-300">
          <li><strong className="text-emerald-400">Regulatory track</strong> — Auto picks the binding rule for you: <strong>UEFA 70%</strong> if the club is in Europe, else the <strong>Premier League 85%</strong> limit. You can force either.</li>
          <li><strong className="text-emerald-400">European competition</strong> — set Champions League / Europa / none per season. This changes both the revenue you earn and the limit you&apos;re held to.</li>
          <li><strong className="text-emerald-400">Revenue growth</strong> — nudge projected income up or down year on year.</li>
        </ul>
        <p className="mt-3 text-sm text-neutral-400">
          These drive the projection, so it&apos;s worth setting them before you read the result.
        </p>
      </>
    ),
  },
  {
    badge: "Step 3 · Compliance",
    title: "Read the verdict",
    body: (
      <>
        <p>
          The compliance screen is the payoff. The bar shows your projected SCR against the limit,
          season by season:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-neutral-300">
          <li>The <strong>headroom</strong> figure = how much more you could spend (or how far over you are).</li>
          <li>Compare <strong>before vs after</strong> your plan to see exactly what your business did.</li>
          <li>Red means a projected breach — and the tool shows the regulatory consequence.</li>
        </ul>
        <p className="mt-3 text-sm text-neutral-400">
          Two power tools live here:
          <br />• <strong className="text-emerald-300">Max Bid</strong> — the most you can spend on a target before the rules bite.
          <br />• <strong className="text-emerald-300">Clearing House</strong> — who to sell to get back into the green.
        </p>
      </>
    ),
  },
  {
    badge: "Step 4 · Lineup",
    title: "Then build the XI",
    body: (
      <>
        <p>
          Once the money works, drop your squad onto the pitch. An EA FC–style builder with six formations,
          drag-and-drop, and an auto-fill best XI — including the players you just signed.
        </p>
        <p className="mt-3 text-sm text-neutral-400">
          It carries your compliance status alongside, so you never forget the team you&apos;re admiring is the
          one you can actually afford.
        </p>
      </>
    ),
  },
  {
    badge: "Save & share",
    title: "Keep it, send it, settle the debate",
    body: (
      <>
        <ul className="space-y-2 text-sm text-neutral-300">
          <li><strong className="text-emerald-400">🔗 Share</strong> — copies a link that rebuilds your entire scenario. Perfect for the group chat.</li>
          <li><strong className="text-emerald-400">💾 Plans</strong> — save named plans in this browser and reload them anytime.</li>
        </ul>
        <p className="mt-4 text-sm text-neutral-400">
          That&apos;s the whole tour. Go break your rivals&apos; budgets — and reopen this guide anytime from the
          <span className="mx-1 inline-flex items-center justify-center rounded-full border border-neutral-600 px-1.5 text-xs">?</span>
          button, bottom-right.
        </p>
      </>
    ),
  },
];

export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  // Auto-open on first ever visit.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      /* private mode — just don't auto-open */
    }
  }, []);

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
  function close() {
    markSeen();
    setOpen(false);
  }
  function openTour() {
    setI(0);
    setOpen(true);
  }

  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <>
      {/* Floating help button — always available */}
      <button
        onClick={openTour}
        aria-label="How to use this app"
        className="fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full border border-neutral-700 bg-neutral-900/90 text-lg font-bold text-neutral-200 shadow-lg backdrop-blur transition hover:border-emerald-500 hover:text-emerald-400"
        title="How to use the Trade Machine"
      >
        ?
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
          onClick={close}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
              <span className="rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                {slide.badge}
              </span>
              <button onClick={close} className="text-sm text-neutral-500 hover:text-neutral-200" aria-label="Close">
                Skip ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-5">
              <h2 className="text-lg font-black leading-tight text-neutral-100">{slide.title}</h2>
              <div className="mt-3 text-sm leading-relaxed text-neutral-300">{slide.body}</div>
            </div>

            {/* Footer / nav */}
            <div className="flex items-center justify-between gap-3 border-t border-neutral-800 px-5 py-3">
              <div className="flex gap-1.5">
                {SLIDES.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setI(idx)}
                    aria-label={`Go to step ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-emerald-500" : "w-1.5 bg-neutral-700 hover:bg-neutral-500"}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {i > 0 && (
                  <button
                    onClick={() => setI((n) => Math.max(0, n - 1))}
                    className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-500"
                  >
                    Back
                  </button>
                )}
                {last ? (
                  <button
                    onClick={close}
                    className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
                  >
                    Start planning →
                  </button>
                ) : (
                  <button
                    onClick={() => setI((n) => Math.min(SLIDES.length - 1, n + 1))}
                    className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
