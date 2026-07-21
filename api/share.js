import { available, getJson, putJson, shortId } from "./_lib/githubStore.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!(await available())) {
      return res.status(503).json({
        error: { message: "Server data store not configured (GITHUB_TOKEN)." },
      });
    }

    if (req.method === "GET") {
      const id = String(req.query.id || "").replace(/[^a-z0-9]/gi, "");
      if (!id) return res.status(400).json({ error: { message: "Missing id" } });
      const deal = await getJson(`shares/${id}.json`);
      if (!deal) return res.status(404).json({ error: { message: "Share not found" } });
      return res.status(200).json(deal);
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: { message: "Invalid JSON" } });
        }
      }
      const { deal } = body || {};
      if (!deal?.items?.length) {
        return res.status(400).json({ error: { message: "Missing deal.items" } });
      }
      const id = shortId(8);
      const record = {
        id,
        createdAt: Date.now(),
        items: deal.items.slice(0, 12),
        verdict: deal.verdict || null,
        accountId: deal.accountId || null,
      };
      await putJson(`shares/${id}.json`, record, `share ${id}`);
      const origin =
        req.headers["x-forwarded-host"]
          ? `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"]}`
          : "";
      return res.status(201).json({
        id,
        url: origin ? `${origin}/s/${id}` : `/s/${id}`,
      });
    }

    return res.status(405).json({ error: { message: "Method not allowed" } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Share error" } });
  }
}
