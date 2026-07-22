import { available, getJson, putJson } from "./_lib/githubStore.js";

function cleanAccount(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Account-Id");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!(await available())) {
      return res.status(503).json({
        error: { message: "Server sync not configured (GITHUB_TOKEN)." },
      });
    }

    const accountId = cleanAccount(
      req.headers["x-account-id"] || req.query.accountId || req.body?.accountId
    );
    if (!accountId || accountId.length < 8) {
      return res.status(400).json({ error: { message: "Invalid account id" } });
    }

    const path = `accounts/${accountId}.json`;

    if (req.method === "GET") {
      const data = (await getJson(path)) || { accountId, deals: {}, updatedAt: 0 };
      return res.status(200).json(data);
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
      const incoming = body?.deals || {};
      const existing = (await getJson(path)) || { accountId, deals: {} };
      const merged = { ...existing.deals };
      for (const [id, deal] of Object.entries(incoming)) {
        const prev = merged[id];
        const incomingTs = Math.max(deal.createdAt || 0, deal.deletedAt || 0);
        const prevTs = Math.max(prev?.createdAt || 0, prev?.deletedAt || 0);
        if (!prev || incomingTs >= prevTs) {
          merged[id] = deal;
        }
      }
      // Drop old tombstones, cap live deals
      const live = Object.entries(merged).filter(([, d]) => d && !d.deleted);
      const tombs = Object.entries(merged).filter(([, d]) => d?.deleted);
      live.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
      tombs.sort((a, b) => (b[1].deletedAt || 0) - (a[1].deletedAt || 0));
      const kept = {};
      for (const [id, d] of live.slice(0, 50)) kept[id] = d;
      for (const [id, d] of tombs.slice(0, 20)) kept[id] = d;
      const record = {
        accountId,
        clerkUserId: body?.clerkUserId || existing.clerkUserId || null,
        deals: kept,
        updatedAt: Date.now(),
      };
      await putJson(path, record, `sync ${accountId}`);
      return res.status(200).json(record);
    }

    return res.status(405).json({ error: { message: "Method not allowed" } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Sync error" } });
  }
}
