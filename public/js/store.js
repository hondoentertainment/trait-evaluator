/** Persist deals + build/load shareable payloads (no server DB). */
const DEALS_KEY = "profileRead.deals.v1";
const CURRENT_KEY = "profileRead.current.v1";
const FEEDBACK_KEY = "profileRead.feedback.v1";
const TRAIT_FB_KEY = "profileRead.traitFeedback.v1";
const CLIENT_RATE_KEY = "profileRead.rate.v1";
const EVAL_CACHE_KEY = "profileRead.evalCache.v1";
const DEAL_CAP_KEY = "profileRead.dealCap.v1";
const AB_KEY = "profileRead.ab.v1";
const INSTALL_KEY = "profileRead.installPrompted.v1";

/** Soft daily free-deal cap (client). Default 12 deals/day. */
export function dealCapStatus(maxPerDay = 12) {
  const day = new Date().toISOString().slice(0, 10);
  let row = { day, count: 0 };
  try {
    row = JSON.parse(localStorage.getItem(DEAL_CAP_KEY) || "null") || row;
  } catch {}
  if (row.day !== day) row = { day, count: 0 };
  const remaining = Math.max(0, maxPerDay - (row.count || 0));
  return {
    ok: remaining > 0,
    remaining,
    used: row.count || 0,
    max: maxPerDay,
    day,
  };
}

export function consumeDealCap(maxPerDay = 12) {
  const st = dealCapStatus(maxPerDay);
  if (!st.ok) return st;
  const row = { day: st.day, count: st.used + 1 };
  localStorage.setItem(DEAL_CAP_KEY, JSON.stringify(row));
  return dealCapStatus(maxPerDay);
}

export function renameDeal(id, name) {
  const deals = loadDeals();
  if (!deals[id] || deals[id].deleted) return null;
  deals[id].name = String(name || "")
    .trim()
    .slice(0, 48);
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
  return deals[id];
}

export function dealLabel(d) {
  if (d?.name) return d.name;
  const word = d?.verdict?.word || "Shoe";
  const when = new Date(d?.createdAt || Date.now()).toLocaleDateString();
  return `${word} · ${when}`;
}

export function getAbBucket() {
  try {
    let v = localStorage.getItem(AB_KEY);
    if (v === "A" || v === "B") return v;
    v = Math.random() < 0.5 ? "A" : "B";
    localStorage.setItem(AB_KEY, v);
    return v;
  } catch {
    return "A";
  }
}

export function shouldShowInstallPrompt() {
  try {
    return localStorage.getItem(INSTALL_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markInstallPrompted() {
  try {
    localStorage.setItem(INSTALL_KEY, "1");
  } catch {}
}

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
  deals[deal.id] = { ...deal, deleted: false };
  // Cap history
  const ids = Object.keys(deals)
    .filter((id) => !deals[id].deleted)
    .sort((a, b) => (deals[b].createdAt || 0) - (deals[a].createdAt || 0));
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

/** Soft-delete so sync can tombstone remotely. */
export function deleteDeal(id) {
  const deals = loadDeals();
  if (!deals[id]) return false;
  deals[id] = {
    ...deals[id],
    deleted: true,
    deletedAt: Date.now(),
    items: [],
  };
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
  if (localStorage.getItem(CURRENT_KEY) === id) {
    const next = recentDeals(1)[0];
    if (next) localStorage.setItem(CURRENT_KEY, next.id);
    else localStorage.removeItem(CURRENT_KEY);
  }
  return true;
}

export function getDeal(id) {
  const deals = loadDeals();
  const d = deals[id];
  if (!d || d.deleted) return null;
  return d;
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
    .filter((d) => d && !d.deleted && d.items?.length)
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

export function loadTraitFeedback() {
  try {
    return JSON.parse(localStorage.getItem(TRAIT_FB_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveTraitFeedback(map) {
  localStorage.setItem(TRAIT_FB_KEY, JSON.stringify(map || {}));
}

/** Client-side evaluate cache for identical text score prompts. */
export function getEvalCache(key) {
  try {
    const all = JSON.parse(sessionStorage.getItem(EVAL_CACHE_KEY) || "{}");
    const hit = all[key];
    if (!hit || Date.now() - hit.at > 60 * 60 * 1000) return null;
    return hit.text;
  } catch {
    return null;
  }
}

export function setEvalCache(key, text) {
  try {
    const all = JSON.parse(sessionStorage.getItem(EVAL_CACHE_KEY) || "{}");
    all[key] = { at: Date.now(), text };
    const keys = Object.keys(all);
    if (keys.length > 40) {
      keys
        .sort((a, b) => all[a].at - all[b].at)
        .slice(0, keys.length - 40)
        .forEach((k) => delete all[k]);
    }
    sessionStorage.setItem(EVAL_CACHE_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
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
