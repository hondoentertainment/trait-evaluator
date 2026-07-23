/** Render a deal crosswalk to a downloadable PNG (Stories-friendly). */

import { normalizeItem, fmtCount, trueCount, scoreColor } from "./hilo.js";

export async function exportCrosswalkPng(deal, { filename } = {}) {
  const items = (deal.items || []).map((it) => normalizeItem(it));
  const W = 1080;
  const rowH = 72;
  const headerH = 220;
  const H = headerH + Math.max(items.length, 1) * rowH + 120;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#f6efe4");
  g.addColorStop(1, "#e8dcc8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#171310";
  ctx.fillRect(48, 48, W - 96, H - 96);

  let running = 0;
  items.forEach((it) => (running += it.count));
  const tc = trueCount(running, items.length, items.length || 1);
  const word = deal.verdict?.word || (tc >= 0.5 ? "HIT" : tc > -1.5 ? "STAND" : "BUST");
  const name = deal.name || "Profile Read shoe";

  ctx.fillStyle = "#b6ab99";
  ctx.font = "22px ui-monospace, monospace";
  ctx.fillText("PROFILE READ", 96, 110);

  ctx.fillStyle = word === "BUST" ? "#ff5c49" : "#c3e600";
  ctx.font = "bold 96px Georgia, serif";
  ctx.fillText(word, 96, 210);

  ctx.fillStyle = "#f6efe4";
  ctx.font = "28px ui-monospace, monospace";
  const tcLabel = (tc >= 0 ? "+" : "") + tc.toFixed(1);
  ctx.fillText(
    `${name} · TC ${tcLabel} · run ${fmtCount(running)} · ${items.length} cards`,
    96,
    260
  );

  let y = headerH + 40;
  items.forEach((it, i) => {
    running = items.slice(0, i + 1).reduce((a, x) => a + x.count, 0);
    ctx.fillStyle = "#2a241f";
    ctx.fillRect(72, y, W - 144, rowH - 10);
    ctx.fillStyle = scoreColor(it.score);
    ctx.fillRect(72, y, 12, rowH - 10);
    ctx.fillStyle = "#f6efe4";
    ctx.font = "26px Georgia, serif";
    const trait = String(it.trait).slice(0, 36);
    ctx.fillText(trait, 100, y + 42);
    ctx.font = "22px ui-monospace, monospace";
    ctx.fillStyle = "#c3e600";
    ctx.fillText(fmtCount(it.count), W - 280, y + 42);
    ctx.fillStyle = "#b6ab99";
    ctx.fillText(String(it.score), W - 180, y + 42);
    y += rowH;
  });

  ctx.fillStyle = "#b6ab99";
  ctx.font = "20px ui-monospace, monospace";
  ctx.fillText("profileread · trait-evaluator.vercel.app", 96, H - 70);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `profile-read-${word.toLowerCase()}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { ok: true, width: W, height: H };
}
