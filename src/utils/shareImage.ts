/**
 * shareImage.ts
 *
 * Pure, framework-agnostic canvas renderers that turn a finished plan into
 * three portrait, mobile-first PNG cards for social sharing:
 *   1. Starting XI on the pitch
 *   2. Transfer deal sheet (In / Out / Net aggregates)
 *   3. Before -> After Squad Cost Ratio (compliance)
 *
 * NO React / Next.js imports — all geometry and drawing live here so the logic
 * ports unchanged to the mobile app. The UI layer only assembles `ShareData`
 * and handles download / Web Share.
 *
 * Every card is drawn at a fixed 1080 x 1350 (Instagram-portrait 4:5), which
 * renders crisply on phones and in feeds without any device-pixel-ratio math.
 */

export type SharePlayerRole = "GK" | "DF" | "MF" | "FW";

export interface SharePlayer {
  /** Surname/last token is what gets drawn under the disc. */
  name: string;
  /** Slot label drawn inside the disc, e.g. "ST", "LCB". */
  label: string;
  role: SharePlayerRole;
  /** Percent of pitch, 0..100 (vertical pitch: y 0 = opponent goal). */
  x: number;
  y: number;
  /** Cosmetic tag so signings/loan-ins can be flagged. */
  tag?: "squad" | "signing" | "loan-in";
}

export interface ShareDeal {
  /** Window label, e.g. "Summer 2025". */
  window: string;
  /** Human text, e.g. "Player X" or "Sold: Player Y". */
  text: string;
  /**
   * Money direction, matching the app's deal sheet:
   *  - "out" = cash out (a signing / loan-in) -> red, badge "IN"
   *  - "in"  = cash in  (a sale / loan-out)   -> green, badge "OUT"
   */
  dir: "in" | "out";
  amount: number; // £m
}

export type ShareZone = "GREEN" | "YELLOW" | "RED";

export interface ShareData {
  clubName: string;
  accentPrimary: string; // hex kit colour
  accentText: string;    // hex text-safe tint
  seasonLabel: string;   // e.g. "2025/26"
  trackLabel: string;    // e.g. "Premier League 85% track"

  // --- Compliance (SCR) ---
  beforeScr: number; // 0..~1.5
  afterScr: number;
  limit: number;     // binding limit, 0..1
  zone: ShareZone;
  headroom: number;  // £m (+ clear / − over)
  squadValue: number; // £m

  // --- Deal sheet ---
  deals: ShareDeal[];
  dealSpend: number;
  dealIncome: number;
  netSpend: number; // spend − income (+ = net spend, − = net income)

  // --- Lineup ---
  formationName: string; // "4-3-3"
  players: SharePlayer[]; // may be empty (no lineup built)
}

export type ShareCardId = "lineup" | "dealsheet" | "scr";

// --------------------------------------------------------------------------
// Palette (explicit hex only — no Tailwind/oklch, which canvas can't resolve)
// --------------------------------------------------------------------------

const W = 1080;
const H = 1350;

const C = {
  bg: "#0a0a0a",
  bgSoft: "#141414",
  panel: "#171717",
  panelLine: "#262626",
  text: "#fafafa",
  muted: "#a3a3a3",
  dim: "#737373",
  faint: "#525252",
  red: "#f87171",
  green: "#34d399",
};

const ZONE: Record<ShareZone, { color: string; soft: string; label: string }> = {
  GREEN: { color: "#10b981", soft: "#0b3b2e", label: "Compliant" },
  YELLOW: { color: "#f59e0b", soft: "#3d2f08", label: "Luxury levy zone" },
  RED: { color: "#ef4444", soft: "#3d1414", label: "Regulatory breach risk" },
};

const ROLE_COLOR: Record<SharePlayerRole, string> = {
  GK: "#3b82f6",
  DF: "#06b6d4",
  MF: "#10b981",
  FW: "#ef4444",
};

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

const fmtPct = (x: number) => (x * 100).toFixed(1) + "%";
const fmtM = (x: number) => `£${Math.round(x)}m`;
const surname = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
};

// --------------------------------------------------------------------------
// Low-level canvas helpers
// --------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, weight: number | "bold" | "black", size: number) {
  const w = weight === "black" ? 800 : weight === "bold" ? 700 : weight;
  ctx.font = `${w} ${size}px ${FONT}`;
}

function setTracking(ctx: Ctx, px: number) {
  // letterSpacing is widely supported in modern Chromium/Safari; guard anyway.
  try {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
  } catch {
    /* no-op */
  }
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Truncate a string with an ellipsis so it fits `maxW` at the current font. */
function ellipsize(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function background(ctx: Ctx, d: ShareData) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // Club-colour top strip.
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, d.accentPrimary);
  grad.addColorStop(0.85, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 12);
}

/** Shared header: club dot + name, and a right-aligned subtitle. */
function header(ctx: Ctx, d: ShareData, title: string, subtitle: string) {
  const y = 78;
  ctx.textBaseline = "middle";
  // Club dot.
  ctx.beginPath();
  ctx.arc(58, y, 12, 0, Math.PI * 2);
  ctx.fillStyle = d.accentPrimary;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.stroke();
  // Club name.
  ctx.textAlign = "left";
  font(ctx, "black", 40);
  ctx.fillStyle = d.accentText;
  ctx.fillText(ellipsize(ctx, d.clubName, 520), 84, y + 1);
  // Title kicker (left, below name handled by caller sections). Subtitle right.
  ctx.textAlign = "right";
  font(ctx, 600, 22);
  ctx.fillStyle = C.dim;
  ctx.fillText(subtitle, W - 56, y - 10);
  font(ctx, "bold", 24);
  ctx.fillStyle = C.muted;
  setTracking(ctx, 2);
  ctx.fillText(title.toUpperCase(), W - 56, y + 18);
  setTracking(ctx, 0);
  ctx.textAlign = "left";
}

function footer(ctx: Ctx) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 22);
  setTracking(ctx, 3);
  ctx.fillStyle = C.faint;
  ctx.fillText("FOOTBALL FINANCE MACHINE", W / 2, H - 66);
  setTracking(ctx, 2);
  font(ctx, 600, 18);
  ctx.fillStyle = "#3f3f3f";
  ctx.fillText("SQUAD COST RATIO SIMULATOR", W / 2, H - 40);
  setTracking(ctx, 0);
  ctx.textAlign = "left";
}

// --------------------------------------------------------------------------
// Card 1 — Lineup
// --------------------------------------------------------------------------

function drawPitch(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 28);
  ctx.clip();
  // Grass gradient + stripes.
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#166534");
  g.addColorStop(1, "#14532d");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const stripes = 8;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let i = 0; i < stripes; i += 2) ctx.fillRect(x, y + (h / stripes) * i, w, h / stripes);

  const line = "rgba(255,255,255,0.55)";
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  const m = 22; // inner margin
  const ix = x + m, iy = y + m, iw = w - m * 2, ih = h - m * 2;
  ctx.strokeRect(ix, iy, iw, ih);
  // Halfway line + centre circle.
  const midY = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(ix, midY);
  ctx.lineTo(ix + iw, midY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, midY, 66, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, midY, 5, 0, Math.PI * 2);
  ctx.fillStyle = line;
  ctx.fill();
  // Penalty boxes (top = opponent goal, bottom = our goal).
  const boxW = iw * 0.5, boxH = ih * 0.16, sixW = iw * 0.24, sixH = ih * 0.07;
  const cx = x + w / 2;
  ctx.strokeRect(cx - boxW / 2, iy, boxW, boxH);
  ctx.strokeRect(cx - sixW / 2, iy, sixW, sixH);
  ctx.strokeRect(cx - boxW / 2, iy + ih - boxH, boxW, boxH);
  ctx.strokeRect(cx - sixW / 2, iy + ih - sixH, sixW, sixH);
  ctx.restore();
}

function drawPlayer(ctx: Ctx, p: SharePlayer, px: number, py: number) {
  const r = 30;
  // Shadow.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = ROLE_COLOR[p.role];
  ctx.fill();
  ctx.restore();
  // Ring.
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.stroke();
  // Slot label inside.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, "black", 18);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(p.label, px, py + 1);
  // Tag dot (signing / loan-in).
  if (p.tag === "signing" || p.tag === "loan-in") {
    ctx.beginPath();
    ctx.arc(px + r - 4, py - r + 4, 8, 0, Math.PI * 2);
    ctx.fillStyle = p.tag === "signing" ? C.green : "#38bdf8";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0a0a0a";
    ctx.stroke();
  }
  // Surname below, with a dark plate for legibility.
  const label = surname(p.name);
  font(ctx, "bold", 25);
  const tw = Math.min(ctx.measureText(label).width, 180);
  const plateW = tw + 20;
  ctx.fillStyle = "rgba(10,10,10,0.72)";
  roundRect(ctx, px - plateW / 2, py + r + 6, plateW, 34, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(ellipsize(ctx, label, 180), px, py + r + 24);
  ctx.textAlign = "left";
}

function renderLineup(ctx: Ctx, d: ShareData) {
  background(ctx, d);
  header(ctx, d, "Starting XI", d.seasonLabel);

  // Section kicker under the club name.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  font(ctx, 600, 22);
  ctx.fillStyle = C.dim;
  setTracking(ctx, 1);
  ctx.fillText(`FORMATION · ${d.formationName}`, 84, 120);
  setTracking(ctx, 0);

  const px = 40, py = 150, pw = W - 80, ph = 1010;
  drawPitch(ctx, px, py, pw, ph);

  if (d.players.length === 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    font(ctx, "bold", 34);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("No lineup built yet", W / 2, py + ph / 2);
    ctx.textAlign = "left";
    footer(ctx);
    return;
  }

  // Inner pitch play area (inside the margin) for player placement.
  const m = 22;
  const fieldX = px + m + 24, fieldY = py + m + 30;
  const fieldW = pw - (m + 24) * 2, fieldH = ph - (m + 30) * 2;
  for (const p of d.players) {
    const cx = fieldX + (p.x / 100) * fieldW;
    const cy = fieldY + (p.y / 100) * fieldH;
    drawPlayer(ctx, p, cx, cy);
  }
  footer(ctx);
}

// --------------------------------------------------------------------------
// Card 2 — Deal sheet
// --------------------------------------------------------------------------

function statBox(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  color: string,
) {
  ctx.fillStyle = C.panel;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = C.panelLine;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 16);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 20);
  setTracking(ctx, 1);
  ctx.fillStyle = C.dim;
  ctx.fillText(label.toUpperCase(), x + w / 2, y + 30);
  setTracking(ctx, 0);
  font(ctx, "black", 46);
  ctx.fillStyle = color;
  ctx.fillText(value, x + w / 2, y + h - 34);
  ctx.textAlign = "left";
}

function renderDealSheet(ctx: Ctx, d: ShareData) {
  background(ctx, d);
  header(ctx, d, "Deal Sheet", d.seasonLabel);

  const left = 56;
  const right = W - 56;
  const width = right - left;
  let y = 168;

  // Group deals by window, preserving first-seen order.
  const order: string[] = [];
  const groups = new Map<string, ShareDeal[]>();
  for (const deal of d.deals) {
    if (!groups.has(deal.window)) {
      groups.set(deal.window, []);
      order.push(deal.window);
    }
    groups.get(deal.window)!.push(deal);
  }

  const rowH = 58;
  const rowGap = 10;
  const grpGap = 18;
  const aggH = 150;
  const bottomLimit = H - 120 - aggH; // leave room for aggregates + footer

  let shown = 0;
  const total = d.deals.length;
  let truncated = false;

  ctx.textBaseline = "middle";
  outer: for (const win of order) {
    // Window pill.
    if (y + 40 > bottomLimit) { truncated = true; break; }
    font(ctx, "bold", 22);
    const pillLabel = win.toUpperCase();
    const pw = ctx.measureText(pillLabel).width + 28;
    ctx.fillStyle = C.bgSoft;
    roundRect(ctx, left, y, pw, 34, 10);
    ctx.fill();
    ctx.strokeStyle = C.panelLine;
    ctx.lineWidth = 1.5;
    roundRect(ctx, left, y, pw, 34, 10);
    ctx.stroke();
    setTracking(ctx, 1);
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.fillText(pillLabel, left + 14, y + 18);
    setTracking(ctx, 0);
    y += 34 + 12;

    for (const deal of groups.get(win)!) {
      if (y + rowH > bottomLimit) { truncated = true; break outer; }
      // Row card.
      ctx.fillStyle = C.panel;
      roundRect(ctx, left, y, width, rowH, 12);
      ctx.fill();
      ctx.strokeStyle = C.panelLine;
      ctx.lineWidth = 1.5;
      roundRect(ctx, left, y, width, rowH, 12);
      ctx.stroke();

      const cy = y + rowH / 2;
      // IN / OUT badge (matches app: cash-out signing = "IN").
      const badge = deal.dir === "out" ? "IN" : "OUT";
      font(ctx, "black", 18);
      const bw = 58;
      ctx.fillStyle = C.bgSoft;
      roundRect(ctx, left + 14, cy - 16, bw, 32, 8);
      ctx.fill();
      ctx.fillStyle = deal.dir === "out" ? C.green : "#38bdf8";
      ctx.textAlign = "center";
      ctx.fillText(badge, left + 14 + bw / 2, cy + 1);
      // Name.
      ctx.textAlign = "left";
      font(ctx, 600, 26);
      ctx.fillStyle = C.text;
      const amountStr = `${deal.dir === "out" ? "−" : "+"}£${Math.round(deal.amount)}m`;
      font(ctx, "black", 28);
      const amtW = ctx.measureText(amountStr).width;
      font(ctx, 600, 26);
      const nameMax = width - (bw + 28) - amtW - 40;
      ctx.fillText(ellipsize(ctx, deal.text, nameMax), left + 14 + bw + 16, cy + 1);
      // Amount.
      font(ctx, "black", 28);
      ctx.fillStyle = deal.dir === "out" ? C.red : C.green;
      ctx.textAlign = "right";
      ctx.fillText(amountStr, right - 16, cy + 1);
      ctx.textAlign = "left";

      y += rowH + rowGap;
      shown++;
    }
    y += grpGap;
  }

  if (truncated && total > shown) {
    font(ctx, "bold", 22);
    ctx.fillStyle = C.dim;
    ctx.textAlign = "center";
    ctx.fillText(`+${total - shown} more move${total - shown === 1 ? "" : "s"}`, W / 2, y + 8);
    ctx.textAlign = "left";
  }

  if (total === 0) {
    ctx.textAlign = "center";
    font(ctx, "bold", 30);
    ctx.fillStyle = C.dim;
    ctx.fillText("No transfers in this plan", W / 2, 300);
    ctx.textAlign = "left";
  }

  // Aggregates row, anchored above the footer.
  const ay = H - 110 - aggH;
  const gap = 20;
  const bw2 = (width - gap * 2) / 3;
  statBox(ctx, left, ay, bw2, aggH, "Expenditure", fmtM(d.dealSpend), C.red);
  statBox(ctx, left + bw2 + gap, ay, bw2, aggH, "Income", fmtM(d.dealIncome), C.green);
  statBox(
    ctx,
    left + (bw2 + gap) * 2,
    ay,
    bw2,
    aggH,
    d.netSpend >= 0 ? "Net Spend" : "Net Income",
    fmtM(Math.abs(d.netSpend)),
    d.netSpend >= 0 ? C.red : C.green,
  );

  footer(ctx);
}

// --------------------------------------------------------------------------
// Card 3 — Before -> After SCR
// --------------------------------------------------------------------------

function renderScr(ctx: Ctx, d: ShareData) {
  background(ctx, d);
  header(ctx, d, "Compliance", d.seasonLabel);

  const z = ZONE[d.zone];
  const left = 56;
  const right = W - 56;
  const width = right - left;

  // Track subtitle under the club name.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  font(ctx, 600, 22);
  ctx.fillStyle = C.dim;
  ctx.fillText(d.trackLabel, 84, 120);

  // Hero panel.
  const hx = left, hy = 168, hw = width, hh = 470;
  ctx.fillStyle = z.soft;
  roundRect(ctx, hx, hy, hw, hh, 24);
  ctx.fill();
  ctx.strokeStyle = z.color;
  ctx.lineWidth = 2;
  roundRect(ctx, hx, hy, hw, hh, 24);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 24);
  setTracking(ctx, 2);
  ctx.fillStyle = C.muted;
  ctx.fillText("PROJECTED SQUAD COST RATIO", W / 2, hy + 52);
  setTracking(ctx, 0);

  // Before -> After row.
  const rowY = hy + 168;
  font(ctx, "bold", 66);
  const beforeStr = fmtPct(d.beforeScr);
  ctx.fillStyle = C.faint;
  const bx = W / 2 - 210;
  ctx.fillText(beforeStr, bx, rowY);
  // strikethrough
  const bw = ctx.measureText(beforeStr).width;
  ctx.strokeStyle = C.faint;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(bx - bw / 2, rowY);
  ctx.lineTo(bx + bw / 2, rowY);
  ctx.stroke();
  // arrow
  font(ctx, "bold", 54);
  ctx.fillStyle = C.dim;
  ctx.fillText("→", W / 2 - 20, rowY);
  // after (hero)
  font(ctx, "black", 130);
  ctx.fillStyle = z.color;
  ctx.fillText(fmtPct(d.afterScr), W / 2 + 130, rowY + 4);

  // Zone status.
  font(ctx, "black", 40);
  ctx.fillStyle = z.color;
  ctx.fillText(`${d.zone === "GREEN" ? "✓ " : "⚠ "}${z.label}`, W / 2, hy + 300);

  // SCR bar with threshold markers.
  const barX = hx + 40, barY = hy + 360, barW = hw - 80, barH = 40;
  const barMax = 1.3;
  ctx.fillStyle = "#262626";
  roundRect(ctx, barX, barY, barW, barH, 10);
  ctx.fill();
  const fillW = Math.max(0, Math.min(1, d.afterScr / barMax)) * barW;
  ctx.save();
  roundRect(ctx, barX, barY, barW, barH, 10);
  ctx.clip();
  ctx.fillStyle = z.color;
  ctx.fillRect(barX, barY, fillW, barH);
  ctx.restore();
  // markers
  const marks: [number, string][] = [[0.7, "70%"], [0.85, "85%"], [1.15, "115%"]];
  ctx.textAlign = "center";
  for (const [v, lbl] of marks) {
    const mx = barX + (v / barMax) * barW;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, barY - 4);
    ctx.lineTo(mx, barY + barH + 4);
    ctx.stroke();
    font(ctx, "bold", 18);
    ctx.fillStyle = C.dim;
    ctx.fillText(lbl, mx, barY + barH + 20);
  }
  ctx.textAlign = "left";

  // Metric tiles below the hero.
  const ty = hy + hh + 30;
  const th = 150;
  const gap = 20;
  const tw = (width - gap * 2) / 3;
  const headOver = d.headroom < 0;
  statBox(ctx, left, ty, tw, th, "Limit", fmtPct(d.limit), C.text);
  statBox(
    ctx,
    left + tw + gap,
    ty,
    tw,
    th,
    headOver ? "Over By" : "Headroom",
    fmtM(Math.abs(d.headroom)),
    headOver ? C.red : C.green,
  );
  statBox(ctx, left + (tw + gap) * 2, ty, tw, th, "Squad Value", fmtM(d.squadValue), C.text);

  // Moves summary strip.
  const inCount = d.deals.filter((x) => x.dir === "out").length;
  const outCount = d.deals.filter((x) => x.dir === "in").length;
  const sy = ty + th + 34;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 26);
  ctx.fillStyle = C.muted;
  ctx.fillText(
    `${inCount} in · ${outCount} out · net ${d.netSpend >= 0 ? fmtM(d.netSpend) + " spend" : fmtM(Math.abs(d.netSpend)) + " income"}`,
    W / 2,
    sy,
  );
  ctx.textAlign = "left";

  footer(ctx);
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

const RENDERERS: Record<ShareCardId, (ctx: Ctx, d: ShareData) => void> = {
  lineup: renderLineup,
  dealsheet: renderDealSheet,
  scr: renderScr,
};

export const CARD_META: Record<ShareCardId, { title: string; file: string }> = {
  lineup: { title: "Starting XI", file: "lineup" },
  dealsheet: { title: "Deal Sheet", file: "deal-sheet" },
  scr: { title: "Compliance (SCR)", file: "scr" },
};

/** Draw a single card onto a fresh 1080x1350 canvas and return it. */
export function renderCard(card: ShareCardId, data: ShareData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  RENDERERS[card](ctx, data);
  return canvas;
}

/** Convert a canvas to a PNG blob. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

/** Render a card straight to a PNG blob. */
export async function renderCardBlob(card: ShareCardId, data: ShareData): Promise<Blob> {
  return canvasToBlob(renderCard(card, data));
}

export function cardFileName(card: ShareCardId, clubName: string): string {
  const slug = clubName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "plan"}-${CARD_META[card].file}.png`;
}

export const SHARE_CARD_ORDER: ShareCardId[] = ["lineup", "dealsheet", "scr"];
export const SHARE_CANVAS_SIZE = { width: W, height: H };
