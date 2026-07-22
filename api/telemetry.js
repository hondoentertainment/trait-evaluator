import { available, getJson, putJson } from "./_lib/githubStore.js";

const DEFAULT_BANDS = { high: 70, low: 35 };

function suggestBands(agg) {
  let high = Number(agg.bands?.high ?? DEFAULT_BANDS.high);
  let low = Number(agg.bands?.low ?? DEFAULT_BANDS.low);
  const up = agg.thumbsUp || 0;
  const down = agg.thumbsDown || 0;
  // Only nudge when we have enough signal, and persist slowly.
  if (down >= up + 15 && down >= 20) {
    high = Math.min(85, high + 0.5);
    low = Math.max(15, low - 0.5);
  } else if (up >= down + 25 && up >= 30) {
    high = Math.max(55, high - 0.3);
    low = Math.min(45, low + 0.3);
  }
  if (low >= high - 10) low = high - 10;
  return {
    high: Math.round(high * 10) / 10,
    low: Math.round(low * 10) / 10,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!(await available())) {
      if (req.method === "GET") {
        return res.status(200).json({ bands: DEFAULT_BANDS, events: 0, today: {} });
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
      const bands = suggestBands(agg);
      // Persist suggestions when they drift from stored bands
      if (
        !agg.bands ||
        agg.bands.high !== bands.high ||
        agg.bands.low !== bands.low
      ) {
        agg.bands = bands;
        agg.bandsUpdatedAt = Date.now();
        await putJson("telemetry/aggregate.json", agg, "telemetry bands persist");
      }
      return res.status(200).json({
        bands,
        events: dayData.events?.length || 0,
        aggregate: agg,
        today: dayData.counts || {},
      });
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }
      const event = body || {};
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
      // Recompute + persist bands on every thumb/deal batch
      if (type === "thumb_up" || type === "thumb_down" || type === "deal") {
        agg.bands = suggestBands(agg);
        agg.bandsUpdatedAt = Date.now();
      }
      await putJson("telemetry/aggregate.json", agg, "telemetry aggregate");
      return res.status(204).end();
    }

    return res.status(405).json({ error: { message: "Method not allowed" } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Telemetry error" } });
  }
}
