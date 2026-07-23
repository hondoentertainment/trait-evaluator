import { available, getJson, putJson, deleteJson, shortId } from "./_lib/githubStore.js";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function cleanId(id) {
  return String(id || "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
}

function isExpired(record) {
  if (!record) return true;
  if (record.revokedAt) return true;
  if (record.expiresAt && Date.now() > record.expiresAt) return true;
  return false;
}

function originFrom(req) {
  if (req.headers["x-forwarded-host"]) {
    return `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["x-forwarded-host"]}`;
  }
  return "";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Account-Id");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!(await available())) {
      return res.status(503).json({
        error: { message: "Server data store not configured (GITHUB_TOKEN)." },
      });
    }

    if (req.method === "GET") {
      const id = cleanId(req.query.id);
      if (!id) return res.status(400).json({ error: { message: "Missing id" } });
      const deal = await getJson(`shares/${id}.json`);
      if (!deal || isExpired(deal)) {
        return res.status(404).json({ error: { message: "Share not found or expired" } });
      }
      return res.status(200).json(deal);
    }

    if (req.method === "DELETE") {
      const id = cleanId(req.query.id || req.body?.id);
      if (!id) return res.status(400).json({ error: { message: "Missing id" } });
      const existing = await getJson(`shares/${id}.json`);
      if (!existing) {
        return res.status(404).json({ error: { message: "Share not found" } });
      }
      const accountId = String(
        req.headers["x-account-id"] || req.body?.accountId || ""
      );
      // Soft-revoke so OG/cache can show expired; then delete file.
      if (accountId && existing.accountId && accountId !== existing.accountId) {
        return res.status(403).json({ error: { message: "Not your share" } });
      }
      existing.revokedAt = Date.now();
      await putJson(`shares/${id}.json`, existing, `revoke share ${id}`);
      await deleteJson(`shares/${id}.json`, `delete share ${id}`);
      return res.status(200).json({ ok: true, id });
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
      const { deal, ttlDays } = body || {};
      if (!deal?.items?.length) {
        return res.status(400).json({ error: { message: "Missing deal.items" } });
      }
      const ttl = Math.min(
        MAX_TTL_MS,
        Math.max(24 * 60 * 60 * 1000, (Number(ttlDays) || 30) * 86400000)
      );
      const id = shortId(8);
      const createdAt = Date.now();
      const record = {
        id,
        createdAt,
        expiresAt: createdAt + (Number.isFinite(ttl) ? ttl : DEFAULT_TTL_MS),
        items: deal.items.slice(0, 12),
        verdict: deal.verdict || null,
        name: deal.name ? String(deal.name).slice(0, 48) : null,
        accountId: deal.accountId || null,
      };
      await putJson(`shares/${id}.json`, record, `share ${id}`);
      const origin = originFrom(req);
      return res.status(201).json({
        id,
        url: origin ? `${origin}/s/${id}` : `/s/${id}`,
        expiresAt: record.expiresAt,
        ogImage: origin ? `${origin}/api/og?sid=${id}` : `/api/og?sid=${id}`,
      });
    }

    return res.status(405).json({ error: { message: "Method not allowed" } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message || "Share error" } });
  }
}
