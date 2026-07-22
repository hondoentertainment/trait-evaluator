import { available, getJson } from "./_lib/githubStore.js";

function cleanId(id) {
  return String(id || "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
}

function isBot(ua) {
  return /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|linkedinbot|discordbot|slackbot|whatsapp|telegram|preview/i.test(
    ua || ""
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stats(items) {
  let running = 0;
  (items || []).forEach((it) => {
    const c = Number(it.count);
    running += Number.isFinite(c) ? c : 0;
  });
  const n = (items || []).length || 1;
  const tc = running / Math.max(n / 5, 0.5);
  return { running, tc, n: (items || []).length };
}

function wordFromTc(tc) {
  if (tc >= 0.5) return "HIT";
  if (tc > -1.5) return "STAND";
  return "BUST";
}

export default async function handler(req, res) {
  const id = cleanId(req.query.id);
  if (!id) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  const dest = `/crosswalk?sid=${encodeURIComponent(id)}`;
  const ua = req.headers["user-agent"] || "";

  // Humans: fast redirect. Crawlers: HTML with dynamic OG.
  if (!isBot(ua)) {
    res.writeHead(302, { Location: dest });
    return res.end();
  }

  let title = "Profile Read — shared shoe";
  let description = "Deal dating-profile traits like a blackjack shoe.";
  let ogImage = `/api/og?sid=${encodeURIComponent(id)}`;
  let statusNote = "";

  if (await available()) {
    try {
      const deal = await getJson(`shares/${id}.json`);
      if (!deal || deal.revokedAt || (deal.expiresAt && Date.now() > deal.expiresAt)) {
        title = "Profile Read — share gone";
        description = "This short link expired or was revoked.";
        statusNote = "expired";
      } else {
        const { running, tc, n } = stats(deal.items);
        const word = deal.verdict?.word || wordFromTc(tc);
        const tcLabel = (tc >= 0 ? "+" : "") + tc.toFixed(1);
        const runLabel = running > 0 ? "+" + running : String(running);
        title = `${word} · TC ${tcLabel} · Profile Read`;
        description = `${n} cards · running ${runLabel} · true count ${tcLabel}. HIT, STAND, or BUST.`;
      }
    } catch {
      /* default meta */
    }
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = host ? `${proto}://${host}` : "";
  const absImage = origin ? origin + ogImage : ogImage;
  const absUrl = origin ? `${origin}/s/${id}` : `/s/${id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(absImage)}">
<meta property="og:url" content="${escapeHtml(absUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(absImage)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(dest)}">
</head>
<body>
<p>${statusNote === "expired" ? "Share expired." : "Opening shoe…"} <a href="${escapeHtml(dest)}">Continue</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).send(html);
}
