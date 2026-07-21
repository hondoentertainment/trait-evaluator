import { available, getJson, putJson } from "./_lib/githubStore.js";

const DEFAULT_BANDS = { high: 70, low: 35 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!(await available())) {
      if (req.method === "GET") {
        return res.status(200).json({ bands: DEFAULT_BANDS, events: 0, offline: {} });
      }
      return res.status(204).end();
    }

    const day = new Date().toISOString().slice(0, 10);
    const path = `telemetry/${day}.json`;

    if (req.method === "GET") {
      const dayData = (await getJson(path)) || { events: [], counts: {} };
      const agg = (await getJson("telemetry/aggregate.json")) || {
        bands: DEFAULT_BANDS,
        thumbsUp: 0,
        thumbsDown: 0,
        ocrFail: 0,
        deals: 0,
        verdicts: {},
      };
      // Suggest band tweaks from thumbs
      let { high, low } = agg.bands || DEFAULT_BANDS;
      const up = agg.thumbsUp || 0;
      const down = agg.thumbsDown || 0;
      if (down > up + 20) {
        high = Math.min(85, high + 1);
        low = Math.max(15, low - 1);
      } else if (up > down + 40) {
        high = Math.max(55, high - 0.5);
        low = Math.min(45, low + 0.5);
      }
      return res.status(200).json({
        bands: { high, low },
        events: dayData.events?.length || 0,
        aggregate: agg,
        today: dayData.counts || {},
      });
    }

    if (req.method === "POST") {
      const event = req.body || {};
      const type = String(event.type || "unknown").slice(0, 40);
      const dayData = (await getJson(path)) || { events: [], counts: {} };
      dayData.counts[type] = (dayData.counts[type] || 0) + 1;
      dayData.events.push({
        type,
        t: Date.now(),
        meta: event.meta || null,
      });
      if (dayData.events.length > 500) dayData.events = dayData.events.slice(-500);
      await putJson(path, dayData, `telemetry ${day} ${type}`);

      const agg = (await getJson("telemetry/aggregate.json")) || {
        bands: DEFAULT_BANDS,
        thumbsUp: 0,
        thumbsDown: 0,
        ocrFail: 0,
        deals: 0,
        verdicts: {},
      };
      if (type === "thumb_up") agg.thumbsUp++;
      if (type === "thumb_down") agg.thumbsDown++;
      if (type === "ocr_fail") agg.ocrFail++;
      if (type === "deal") {
        agg.deals++;
        const w = event.meta?.verdict || "UNKNOWN";
        agg.verdicts[w] = (agg.verdicts[w] || 0) + 1;
      }
      await putJson("telemetry/aggregate.json", agg, "telemetry aggregate");
      return res.status(204).end();
    }

    return res.status(405).json({ error: { message: "Method not allowed" } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Telemetry error" } });
  }
}
