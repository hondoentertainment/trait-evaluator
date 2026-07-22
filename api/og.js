import { available, getJson } from "./_lib/githubStore.js";

function cleanId(id) {
  return String(id || "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function computeStats(items) {
  let running = 0;
  (items || []).forEach((it) => {
    const c = Number(it.count);
    running += Number.isFinite(c) ? c : 0;
  });
  const n = (items || []).length || 1;
  const decks = Math.max(n / 5, 0.5);
  const tc = running / decks;
  return { running, tc, n: (items || []).length };
}

function verdictWord(tc) {
  if (tc >= 0.5) return "HIT";
  if (tc > -1.5) return "STAND";
  return "BUST";
}

function accent(word) {
  if (word === "HIT") return "#c3e600";
  if (word === "BUST") return "#ff5c49";
  return "#f6efe4";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const sid = cleanId(req.query.sid || req.query.id);
  let word = "HIT";
  let tcLabel = "+0.0";
  let runLabel = "0";
  let n = 0;
  let sub = "Profile Read · dating profile shoe";

  if (sid && (await available())) {
    try {
      const deal = await getJson(`shares/${sid}.json`);
      if (deal && !deal.revokedAt && !(deal.expiresAt && Date.now() > deal.expiresAt)) {
        const { running, tc, n: cards } = computeStats(deal.items);
        word = deal.verdict?.word || verdictWord(tc);
        tcLabel = (tc >= 0 ? "+" : "") + tc.toFixed(1);
        runLabel = running > 0 ? "+" + running : String(running);
        n = cards;
        sub = `${n} cards · running ${runLabel} · true ${tcLabel}`;
      } else if (deal) {
        word = "GONE";
        sub = "Share expired or revoked";
      }
    } catch {
      /* fallback art */
    }
  } else if (req.query.word) {
    word = String(req.query.word).slice(0, 8).toUpperCase();
    tcLabel = String(req.query.tc || "+0.0").slice(0, 8);
    sub = String(req.query.sub || sub).slice(0, 80);
  }

  const color = accent(word);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6efe4"/>
      <stop offset="100%" stop-color="#e8dcc8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="48" y="48" width="1104" height="534" fill="#171310" rx="0"/>
  <text x="96" y="140" fill="#b6ab99" font-family="Georgia, serif" font-size="28" letter-spacing="6">PROFILE READ</text>
  <text x="96" y="280" fill="${color}" font-family="Georgia, serif" font-weight="700" font-size="140">${escapeXml(word)}</text>
  <text x="96" y="380" fill="#f6efe4" font-family="ui-monospace, monospace" font-size="36">True count ${escapeXml(tcLabel)}</text>
  <text x="96" y="450" fill="#b6ab99" font-family="ui-monospace, monospace" font-size="26">${escapeXml(sub)}</text>
  <rect x="96" y="500" width="180" height="8" fill="${color}"/>
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  return res.status(200).send(svg);
}
