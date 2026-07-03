"use client";

/**
 * ShareExport.tsx
 *
 * A modal that turns a finished plan into three portrait, mobile-first PNG
 * cards (Starting XI, Deal Sheet, Compliance/SCR) for social sharing.
 *
 * Rendering is fully client-side and dependency-free — all drawing lives in
 * `@/utils/shareImage`. This component only orchestrates preview, download and
 * the Web Share API (native share sheet on mobile, PNG download on desktop).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  renderCard,
  canvasToBlob,
  cardFileName,
  CARD_META,
  SHARE_CARD_ORDER,
  type ShareCardId,
  type ShareData,
} from "@/utils/shareImage";

interface Rendered {
  card: ShareCardId;
  url: string; // object URL for the <img> preview
  blob: Blob;
  file: File;
}

/** True when the browser can share these files via the OS share sheet. */
function canShareFiles(files: File[]): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files })
    );
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ShareExport({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const [rendered, setRendered] = useState<Rendered[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  // Render all three cards once on mount (and whenever the plan data changes).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out: Rendered[] = [];
        for (const card of SHARE_CARD_ORDER) {
          const canvas = renderCard(card, data);
          const blob = await canvasToBlob(canvas);
          const file = new File([blob], cardFileName(card, data.clubName), { type: "image/png" });
          out.push({ card, url: URL.createObjectURL(blob), blob, file });
        }
        if (cancelled) {
          out.forEach((r) => URL.revokeObjectURL(r.url));
          return;
        }
        urlsRef.current = out.map((r) => r.url);
        setError(null);
        setRendered(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not generate images.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Revoke object URLs on unmount.
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const shareOne = async (r: Rendered) => {
    if (canShareFiles([r.file])) {
      try {
        await navigator.share({
          files: [r.file],
          title: `${data.clubName} — ${CARD_META[r.card].title}`,
          text: `My ${data.clubName} plan · Football Finance Machine`,
        });
        return;
      } catch (e) {
        // AbortError = user dismissed the sheet; anything else falls back.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    downloadBlob(r.blob, cardFileName(r.card, data.clubName));
    flashToast("Image downloaded");
  };

  const shareAll = async () => {
    setBusy(true);
    try {
      const files = rendered.map((r) => r.file);
      if (canShareFiles(files)) {
        try {
          await navigator.share({
            files,
            title: `${data.clubName} plan`,
            text: `My ${data.clubName} plan · Football Finance Machine`,
          });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      rendered.forEach((r) => downloadBlob(r.blob, cardFileName(r.card, data.clubName)));
      flashToast("All images downloaded");
    } finally {
      setBusy(false);
    }
  };

  const multiShareSupported = useMemo(
    () => rendered.length > 0 && canShareFiles(rendered.map((r) => r.file)),
    [rendered],
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-5 border-b border-neutral-800">
          <div
            className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
            style={{ background: `linear-gradient(90deg, ${data.accentPrimary}, transparent 85%)` }}
            aria-hidden
          />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">Share your plan</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Three ready-to-post images — your XI, the deal sheet, and the before/after SCR. Optimised for
                phones (Instagram, X, Reddit).
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-md px-2.5 py-1 text-sm text-neutral-400 hover:text-white transition"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {error && (
            <p className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {!error && rendered.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SHARE_CARD_ORDER.map((c) => (
                <div key={c} className="aspect-[4/5] rounded-xl border border-neutral-800 bg-neutral-900/60 animate-pulse" />
              ))}
            </div>
          )}

          {rendered.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {rendered.map((r) => (
                <div key={r.card} className="flex flex-col">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1.5">
                    {CARD_META[r.card].title}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.url}
                    alt={`${CARD_META[r.card].title} card`}
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-900"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => shareOne(r)}
                      className="flex-1 rounded-lg px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition"
                    >
                      Share
                    </button>
                    <button
                      onClick={() => {
                        downloadBlob(r.blob, cardFileName(r.card, data.clubName));
                        flashToast("Image downloaded");
                      }}
                      className="rounded-lg px-3 py-2 text-xs font-medium border border-neutral-700 text-neutral-300 hover:border-neutral-500 transition"
                      aria-label={`Download ${CARD_META[r.card].title}`}
                    >
                      ⬇
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-neutral-800 flex flex-wrap gap-2 justify-end bg-neutral-950 sticky bottom-0">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium border border-neutral-700 text-neutral-300 hover:border-neutral-500 transition"
          >
            Done
          </button>
          <button
            onClick={shareAll}
            disabled={rendered.length === 0 || busy}
            className="rounded-lg px-4 py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition"
          >
            {multiShareSupported ? "Share all 3" : "Download all 3"}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-8 z-[90] flex justify-center pointer-events-none px-4">
          <div className="rounded-full border border-neutral-700 bg-neutral-900/95 px-4 py-2 text-sm font-semibold text-neutral-200 shadow-2xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
