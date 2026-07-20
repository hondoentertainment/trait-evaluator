/** Persist deals + build/load shareable payloads (no server DB). */
const DEALS_KEY = "profileRead.deals.v1";
const CURRENT_KEY = "profileRead.current.v1";
const FEEDBACK_KEY = "profileRead.feedback.v1";
const CLIENT_RATE_KEY = "profileRead.rate.v1";

export function uid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

export function loadDeals() {
  try {
    return JSON.parse(localStorage.getItem(DEALS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveDeal(deal) {
  const deals = loadDeals();
  deals[deal.id] = deal;
  // Cap history
  const ids = Object.keys(deals).sort(
    (a, b) => (deals[b].createdAt || 0) - (deals[a].createdAt || 0)
  );
  while (ids.length > 40) {
    delete deals[ids.pop()];
  }
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
  localStorage.setItem(CURRENT_KEY, deal.id);
  try {
    sessionStorage.setItem("profileRead.crosswalk", JSON.stringify(deal.items));
  } catch {}
  return deal;
}

export function getDeal(id) {
  const deals = loadDeals();
  return deals[id] || null;
}

export function getCurrentDeal() {
  const id = localStorage.getItem(CURRENT_KEY);
  if (id && getDeal(id)) return getDeal(id);
  try {
    const items = JSON.parse(sessionStorage.getItem("profileRead.crosswalk") || "[]");
    if (items.length) return { id: "session", items, createdAt: Date.now() };
  } catch {}
  return null;
}

export function recentDeals(limit = 8) {
  const deals = loadDeals();
  return Object.values(deals)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
}

export function toShareParam(deal) {
  const payload = {
    v: 1,
    items: (deal.items || []).map((it) => ({
      t: it.trait,
      s: it.score,
      c: it.count,
      g: it.signal,
      a: it.tags,
      u: it.upgrade,
    })),
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromShareParam(param) {
  if (!param) return null;
  try {
    let b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const items = (payload.items || []).map((it) => ({
      trait: it.t || it.trait || "",
      score: it.s ?? it.score ?? 50,
      count: it.c ?? it.count ?? 0,
      signal: it.g || it.signal || "",
      tags: it.a || it.tags || [],
      upgrade: it.u || it.upgrade || "",
    }));
    return { id: "shared", items, createdAt: Date.now(), shared: true };
  } catch {
    return null;
  }
}

export function shareUrl(deal, origin = location.origin) {
  return `${origin}/crosswalk?d=${toShareParam(deal)}`;
}

export function loadFeedback() {
  try {
    return (
      JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "null") || {
        high: 70,
        low: 35,
        votes: 0,
      }
    );
  } catch {
    return { high: 70, low: 35, votes: 0 };
  }
}

export function saveFeedback(fb) {
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(fb));
}

/** Client-side spend guard: max N calls / hour. */
export function clientAllowRequest(maxPerHour = 30) {
  const now = Date.now();
  let stamps = [];
  try {
    stamps = JSON.parse(localStorage.getItem(CLIENT_RATE_KEY) || "[]");
  } catch {}
  stamps = stamps.filter((t) => now - t < 60 * 60 * 1000);
  if (stamps.length >= maxPerHour) {
    return { ok: false, retryInMin: Math.ceil((stamps[0] + 3600000 - now) / 60000) };
  }
  stamps.push(now);
  localStorage.setItem(CLIENT_RATE_KEY, JSON.stringify(stamps));
  return { ok: true };
}
