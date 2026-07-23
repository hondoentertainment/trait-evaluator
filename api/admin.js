import { available, getJson } from "./_lib/githubStore.js";

function authorized(req) {
  const secret = (process.env.ADMIN_SECRET || "").replace(/[\r\n]/g, "").trim();
  if (!secret) return false;
  const q = String(req.query.key || "").replace(/[\r\n]/g, "").trim();
  const h = String(req.headers["x-admin-key"] || "").replace(/[\r\n]/g, "").trim();
  return q === secret || h === secret;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  if (!authorized(req)) {
    return res.status(401).json({
      error: {
        message: process.env.ADMIN_SECRET
          ? "Unauthorized"
          : "ADMIN_SECRET not configured",
      },
    });
  }

  if (!(await available())) {
    return res.status(503).json({ error: { message: "Data store unavailable" } });
  }

  const day = new Date().toISOString().slice(0, 10);
  const dayData = (await getJson(`telemetry/${day}.json`)) || {
    events: [],
    counts: {},
  };
  const agg = (await getJson("telemetry/aggregate.json")) || {
    bands: { high: 70, low: 35 },
    thumbsUp: 0,
    thumbsDown: 0,
    ocrFail: 0,
    deals: 0,
    verdicts: {},
  };

  return res.status(200).json({
    day,
    today: dayData.counts || {},
    eventsSample: (dayData.events || []).slice(-40),
    aggregate: agg,
    generatedAt: Date.now(),
  });
}
