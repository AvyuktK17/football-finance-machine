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
  /** Ordered backup names for this position (primary first). */
  subs?: string[];
}

export interface ShareLeftover {
  name: string;
  role: SharePlayerRole;
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
  /** Squad players not starting and not a backup anywhere — listed under the pitch. */
  leftovers?: ShareLeftover[];
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

const ZONE: Record<ShareZone, { color: string; light: string; soft: string; label: string }> = {
  GREEN: { color: "#10b981", light: "#34d399", soft: "#0b3b2e", label: "Compliant" },
  YELLOW: { color: "#f59e0b", light: "#fbbf24", soft: "#3d2f08", label: "Luxury levy zone" },
  RED: { color: "#ef4444", light: "#f87171", soft: "#3d1414", label: "Regulatory breach risk" },
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

// Compact player-node footprint (keeps vertical stacks from colliding).
const NODE_R = 26;              // disc radius
const NAME_H = 30;             // surname plate height
const PILL_H = 24;            // backup pill height
const NAME_GAP = 3, PILL_GAP = 3;

function drawPlayer(ctx: Ctx, p: SharePlayer, px: number, py: number) {
  const r = NODE_R;
  // Shadow + fill.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 12;
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
  font(ctx, "black", 16);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(p.label, px, py + 1);
  // Tag dot (signing / loan-in).
  if (p.tag === "signing" || p.tag === "loan-in") {
    ctx.beginPath();
    ctx.arc(px + r - 3, py - r + 3, 7, 0, Math.PI * 2);
    ctx.fillStyle = p.tag === "signing" ? C.green : "#38bdf8";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0a0a0a";
    ctx.stroke();
  }
  // Surname plate.
  const label = surname(p.name);
  font(ctx, "bold", 23);
  const tw = Math.min(ctx.measureText(label).width, 170);
  const plateW = tw + 18;
  const plateY = py + r + NAME_GAP;
  ctx.fillStyle = "rgba(8,10,14,0.82)";
  roundRect(ctx, px - plateW / 2, plateY, plateW, NAME_H, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(ellipsize(ctx, label, 170), px, plateY + NAME_H / 2 + 1);

  // Primary backup pill.
  const subs = p.subs ?? [];
  if (subs.length > 0) {
    const sub = surname(subs[0]);
    const extra = subs.length > 1 ? ` +${subs.length - 1}` : "";
    font(ctx, "bold", 17);
    const textW = Math.min(ctx.measureText(sub + extra).width, 140);
    const pad = 10, dotR = 4, gap = 7;
    const pillW = pad + dotR * 2 + gap + textW + pad;
    const pillX = px - pillW / 2;
    const pillY = plateY + NAME_H + PILL_GAP;
    ctx.fillStyle = "rgba(56,189,248,0.18)";
    roundRect(ctx, pillX, pillY, pillW, PILL_H, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(56,189,248,0.55)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, pillX, pillY, pillW, PILL_H, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pillX + pad + dotR, pillY + PILL_H / 2, dotR, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
    ctx.fillStyle = "#bae6fd";
    ctx.textAlign = "left";
    ctx.fillText(ellipsize(ctx, sub + extra, 140), pillX + pad + dotR * 2 + gap, pillY + PILL_H / 2 + 1);
  }
  ctx.textAlign = "left";
}

// Leftover-chip geometry, shared by the measure + draw passes.
const CHIP_H = 38, CHIP_GAP = 11, CHIP_ROW_GAP = 11, CHIP_PAD = 13, CHIP_DOT = 5, CHIP_DGAP = 8;
const LEFTOVER_LABEL_H = 30;

function chipWidth(ctx: Ctx, name: string): number {
  font(ctx, 600, 21);
  const tw = Math.min(ctx.measureText(surname(name)).width, 180);
  return CHIP_PAD + CHIP_DOT * 2 + CHIP_DGAP + tw + CHIP_PAD;
}

/** Rows the leftover chips would occupy in width `w` (uncapped). */
function leftoverRowCount(ctx: Ctx, items: ShareLeftover[], w: number): number {
  let rows = 1, cx = 0;
  for (const it of items) {
    const cw = chipWidth(ctx, it.name);
    if (cx > 0 && cx + cw > w) { rows++; cx = 0; }
    cx += cw + CHIP_GAP;
  }
  return items.length ? rows : 0;
}

/** Total height of the leftover strip for `rows` rows. */
function leftoverHeight(rows: number): number {
  return LEFTOVER_LABEL_H + rows * CHIP_H + (rows - 1) * CHIP_ROW_GAP;
}

/** Wrapped chips of leftover players under the pitch. `topY` is the strip's top. */
function drawLeftovers(ctx: Ctx, items: ShareLeftover[], x: number, topY: number, w: number, maxRows: number) {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 21);
  setTracking(ctx, 2);
  ctx.fillStyle = C.dim;
  ctx.fillText(`OTHER SQUAD PLAYERS · ${items.length}`, x, topY + 12);
  setTracking(ctx, 0);

  let cx = x, cy = topY + LEFTOVER_LABEL_H, row = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const cw = chipWidth(ctx, it.name);
    if (cx > x && cx + cw > x + w) {
      row++;
      if (row >= maxRows) {
        const remaining = items.length - i;
        if (remaining > 0) {
          ctx.fillStyle = C.dim;
          font(ctx, "bold", 21);
          ctx.fillText(`+${remaining} more`, cx, cy + CHIP_H / 2);
        }
        return;
      }
      cx = x;
      cy += CHIP_H + CHIP_ROW_GAP;
    }
    ctx.fillStyle = C.panel;
    roundRect(ctx, cx, cy, cw, CHIP_H, 10);
    ctx.fill();
    ctx.strokeStyle = C.panelLine;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx, cy, cw, CHIP_H, 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + CHIP_PAD + CHIP_DOT, cy + CHIP_H / 2, CHIP_DOT, 0, Math.PI * 2);
    ctx.fillStyle = ROLE_COLOR[it.role];
    ctx.fill();
    ctx.fillStyle = C.text;
    font(ctx, 600, 21);
    ctx.fillText(ellipsize(ctx, surname(it.name), 180), cx + CHIP_PAD + CHIP_DOT * 2 + CHIP_DGAP, cy + CHIP_H / 2 + 1);
    cx += cw + CHIP_GAP;
  }
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

  const leftovers = d.leftovers ?? [];
  const hasBench = leftovers.length > 0;
  const px = 40, py = 150;
  const pw = W - 80;
  const benchBottom = 1234;      // bench sits just above the footer
  const maxBenchRows = 2;

  // Bench height is measured, not fixed — so the pitch reclaims every spare
  // pixel and players spread out enough to avoid overlaps.
  const benchRows = hasBench ? Math.min(maxBenchRows, leftoverRowCount(ctx, leftovers, pw - 32)) : 0;
  const benchH = hasBench ? leftoverHeight(benchRows) : 0;
  const benchTop = benchBottom - benchH;
  const pitchBottom = hasBench ? benchTop - 22 : benchBottom;
  const ph = pitchBottom - py;
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

  // Inner play area. Top inset clears the highest disc; bottom inset leaves room
  // for the GK's name + sub pill inside the touchline.
  const topInset = 42, bottomInset = 78, sideInset = 46;
  const fieldX = px + sideInset, fieldY = py + topInset;
  const fieldW = pw - sideInset * 2, fieldH = ph - topInset - bottomInset;
  // Draw upper rows first so lower discs overlap the pills above them cleanly.
  const ordered = [...d.players].sort((a, b) => a.y - b.y);
  for (const p of ordered) {
    const cx = fieldX + (p.x / 100) * fieldW;
    const cy = fieldY + (p.y / 100) * fieldH;
    drawPlayer(ctx, p, cx, cy);
  }

  if (hasBench) drawLeftovers(ctx, leftovers, px + 16, benchTop, pw - 32, maxBenchRows);
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

/**
 * One deal-sheet column. Deals arrive pre-sorted (largest fee first); we fit as
 * many as the panel height allows and summarise the rest as "+N more".
 */
function dealPanel(
  ctx: Ctx,
  title: string,
  titleColor: string,
  deals: ShareDeal[],
  x: number,
  y: number,
  w: number,
  h: number,
  amtColor: string,
  sign: string,
) {
  ctx.fillStyle = C.bgSoft;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = C.panelLine;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 16);
  ctx.stroke();

  const pad = 18;
  ctx.textBaseline = "middle";
  // Title + count.
  ctx.textAlign = "left";
  font(ctx, "black", 23);
  setTracking(ctx, 1);
  ctx.fillStyle = titleColor;
  ctx.fillText(title, x + pad, y + 34);
  setTracking(ctx, 0);
  font(ctx, "bold", 22);
  ctx.fillStyle = C.dim;
  ctx.textAlign = "right";
  ctx.fillText(String(deals.length), x + w - pad, y + 34);
  ctx.textAlign = "left";
  // Divider.
  ctx.strokeStyle = C.panelLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + pad, y + 60);
  ctx.lineTo(x + w - pad, y + 60);
  ctx.stroke();

  if (deals.length === 0) {
    font(ctx, 600, 23);
    ctx.fillStyle = C.faint;
    ctx.fillText("None", x + pad, y + 100);
    return;
  }

  const headerH = 78;
  const rowH = 48;
  const rowGap = 8;
  const perRow = rowH + rowGap;
  const maxRows = Math.max(0, Math.floor((h - headerH - pad) / perRow));
  const overflow = deals.length > maxRows;
  // Keep one slot for the "+N more" line when we can't show everything.
  const visible = overflow ? deals.slice(0, Math.max(0, maxRows - 1)) : deals;

  let ry = y + headerH;
  for (const deal of visible) {
    const cy = ry + rowH / 2;
    const amountStr = `${sign}£${Math.round(deal.amount)}m`;
    font(ctx, "black", 24);
    const amtW = ctx.measureText(amountStr).width;
    font(ctx, 600, 23);
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.fillText(ellipsize(ctx, deal.text, w - pad * 2 - amtW - 16), x + pad, cy);
    font(ctx, "black", 24);
    ctx.fillStyle = amtColor;
    ctx.textAlign = "right";
    ctx.fillText(amountStr, x + w - pad, cy);
    ctx.textAlign = "left";
    ry += perRow;
  }
  if (overflow) {
    font(ctx, "bold", 21);
    ctx.fillStyle = C.dim;
    ctx.fillText(`+${deals.length - visible.length} more`, x + pad, ry + rowH / 2);
  }
}

function renderDealSheet(ctx: Ctx, d: ShareData) {
  background(ctx, d);
  header(ctx, d, "Deal Sheet", d.seasonLabel);

  const left = 56;
  const width = W - 112;
  const gap = 24;
  const panelW = (width - gap) / 2;
  const panelY = 176;
  const aggH = 150;
  const ay = H - 110 - aggH;
  const panelH = ay - 24 - panelY;

  // Incomings = cash out (signings / loan-ins); Outgoings = cash in (sales /
  // loan-outs). Largest fee first so the marquee deals always make the cut.
  const incomings = d.deals.filter((x) => x.dir === "out").sort((a, b) => b.amount - a.amount);
  const outgoings = d.deals.filter((x) => x.dir === "in").sort((a, b) => b.amount - a.amount);

  dealPanel(ctx, "INCOMINGS", C.red, incomings, left, panelY, panelW, panelH, C.red, "−");
  dealPanel(ctx, "OUTGOINGS", C.green, outgoings, left + panelW + gap, panelY, panelW, panelH, C.green, "+");

  // Aggregates row, anchored above the footer.
  const g2 = 20;
  const bw2 = (width - g2 * 2) / 3;
  statBox(ctx, left, ay, bw2, aggH, "Expenditure", fmtM(d.dealSpend), C.red);
  statBox(ctx, left + bw2 + g2, ay, bw2, aggH, "Income", fmtM(d.dealIncome), C.green);
  statBox(
    ctx,
    left + (bw2 + g2) * 2,
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

  const improved = d.afterScr <= d.beforeScr;
  const deltaPp = Math.abs((d.afterScr - d.beforeScr) * 100);

  // ---- Hero panel (zone-tinted, soft glow) ----
  const hx = left, hy = 158, hw = width, hh = 560;
  ctx.save();
  ctx.shadowColor = z.color + "66";
  ctx.shadowBlur = 34;
  ctx.fillStyle = z.soft;
  roundRect(ctx, hx, hy, hw, hh, 26);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = z.color;
  ctx.lineWidth = 2;
  roundRect(ctx, hx, hy, hw, hh, 26);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 23);
  setTracking(ctx, 3);
  ctx.fillStyle = C.muted;
  ctx.fillText("PROJECTED SQUAD COST RATIO", W / 2, hy + 46);
  setTracking(ctx, 0);

  // "was 83.6%" + delta badge, centred (no strikethrough overlap).
  const wasStr = `was ${fmtPct(d.beforeScr)}`;
  const deltaStr = `${improved ? "−" : "+"}${deltaPp.toFixed(1)}pp`;
  font(ctx, 600, 24);
  const wasW = ctx.measureText(wasStr).width;
  font(ctx, "black", 22);
  const dTextW = ctx.measureText(deltaStr).width;
  const badgeW = dTextW + 28;
  const groupGap = 16;
  const groupW = wasW + groupGap + badgeW;
  const gStart = W / 2 - groupW / 2;
  const rowWasY = hy + 96;
  ctx.textAlign = "left";
  font(ctx, 600, 24);
  ctx.fillStyle = C.dim;
  ctx.fillText(wasStr, gStart, rowWasY);
  const badgeX = gStart + wasW + groupGap;
  ctx.fillStyle = improved ? "rgba(52,211,153,0.16)" : "rgba(248,113,113,0.16)";
  roundRect(ctx, badgeX, rowWasY - 20, badgeW, 40, 12);
  ctx.fill();
  font(ctx, "black", 22);
  ctx.fillStyle = improved ? C.green : C.red;
  ctx.textAlign = "center";
  ctx.fillText(deltaStr, badgeX + badgeW / 2, rowWasY + 1);

  // Hero number.
  ctx.textAlign = "center";
  font(ctx, "black", 150);
  ctx.fillStyle = z.color;
  ctx.fillText(fmtPct(d.afterScr), W / 2, hy + 220);

  // Zone verdict.
  font(ctx, "black", 38);
  ctx.fillStyle = z.color;
  ctx.fillText(`${d.zone === "GREEN" ? "✓ " : "⚠ "}${z.label}`, W / 2, hy + 328);

  // ---- Premium threshold meter ----
  const barX = hx + 44, barW = hw - 88, barH = 46, barY = hy + 420;
  const barMax = 1.3;
  const clampFrac = (v: number) => Math.max(0, Math.min(1, v / barMax));
  // Track.
  ctx.fillStyle = "#20242e";
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();
  // Gradient fill (glowing).
  const fillW = Math.max(barH, clampFrac(d.afterScr) * barW);
  ctx.save();
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.clip();
  const g = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  g.addColorStop(0, z.light);
  g.addColorStop(1, z.color);
  ctx.shadowColor = z.color + "aa";
  ctx.shadowBlur = 22;
  ctx.fillStyle = g;
  roundRect(ctx, barX, barY, fillW, barH, barH / 2);
  ctx.fill();
  ctx.restore();
  // Threshold ticks + labels.
  const marks: [number, string][] = [[0.7, "70"], [0.85, "85"], [1.15, "115"]];
  ctx.textAlign = "center";
  for (const [v, lbl] of marks) {
    const mx = barX + clampFrac(v) * barW;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, barY - 6);
    ctx.lineTo(mx, barY + barH + 6);
    ctx.stroke();
    font(ctx, "bold", 18);
    ctx.fillStyle = C.dim;
    ctx.textBaseline = "top";
    ctx.fillText(`${lbl}%`, mx, barY + barH + 12);
    ctx.textBaseline = "middle";
  }
  // Current-position knob.
  const knobX = barX + clampFrac(d.afterScr) * barW;
  const knobR = barH / 2 + 5;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(knobX, barY + barH / 2, knobR, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(knobX, barY + barH / 2, knobR - 7, 0, Math.PI * 2);
  ctx.fillStyle = z.color;
  ctx.fill();
  ctx.textAlign = "left";

  // ---- Metric tiles ----
  const ty = hy + hh + 26;
  const th = 148;
  const gap = 20;
  const tw = (width - gap * 2) / 3;
  const headOver = d.headroom < 0;
  statBox(ctx, left, ty, tw, th, "Limit", fmtPct(d.limit), C.text);
  statBox(ctx, left + tw + gap, ty, tw, th, headOver ? "Over By" : "Headroom", fmtM(Math.abs(d.headroom)), headOver ? C.red : C.green);
  statBox(ctx, left + (tw + gap) * 2, ty, tw, th, "Squad Value", fmtM(d.squadValue), C.text);

  // ---- Before vs After comparison bars ----
  const cy = ty + th + 24;
  const chH = 236;
  ctx.fillStyle = C.panel;
  roundRect(ctx, left, cy, width, chH, 18);
  ctx.fill();
  ctx.strokeStyle = C.panelLine;
  ctx.lineWidth = 1.5;
  roundRect(ctx, left, cy, width, chH, 18);
  ctx.stroke();
  const pad = 24;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 20);
  setTracking(ctx, 2);
  ctx.fillStyle = C.dim;
  ctx.fillText("BEFORE vs AFTER PLAN", left + pad, cy + 30);
  setTracking(ctx, 0);

  const cbX = left + pad + 120;
  const cbW = width - pad * 2 - 120 - 130;
  const limitX = cbX + clampFrac(d.limit) * cbW;
  const drawCmp = (rowY: number, tag: string, val: number, color: string) => {
    font(ctx, "bold", 24);
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.fillText(tag, left + pad, rowY);
    // track
    ctx.fillStyle = "#20242e";
    roundRect(ctx, cbX, rowY - 16, cbW, 32, 16);
    ctx.fill();
    // fill
    ctx.save();
    roundRect(ctx, cbX, rowY - 16, cbW, 32, 16);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(cbX, rowY - 16, Math.max(32, clampFrac(val) * cbW), 32);
    ctx.restore();
    // value
    font(ctx, "black", 26);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.fillText(fmtPct(val), cbX + cbW + 20, rowY);
  };
  drawCmp(cy + 108, "Before", d.beforeScr, C.dim);
  drawCmp(cy + 172, "After", d.afterScr, z.color);
  // Limit reference line across both bars.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(limitX, cy + 78);
  ctx.lineTo(limitX, cy + 196);
  ctx.stroke();
  ctx.setLineDash([]);
  font(ctx, "bold", 16);
  ctx.fillStyle = C.dim;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`LIMIT ${fmtPct(d.limit)}`, limitX, cy + 74);

  // ---- Plan summary line ----
  const inCount = d.deals.filter((x) => x.dir === "out").length;
  const outCount = d.deals.filter((x) => x.dir === "in").length;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  font(ctx, "bold", 25);
  ctx.fillStyle = C.muted;
  ctx.fillText(
    `${inCount} in · ${outCount} out · net ${d.netSpend >= 0 ? fmtM(d.netSpend) + " spend" : fmtM(Math.abs(d.netSpend)) + " income"}`,
    W / 2,
    cy + chH + 40,
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
