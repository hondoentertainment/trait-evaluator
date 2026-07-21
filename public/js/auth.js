import { loadDeals, saveDeal } from "./store.js";

const ACCOUNT_KEY = "profileRead.account.v1";

function randomCode(len = 10) {
  const a = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => a[b % a.length]).join("");
}

function formatRecovery(raw) {
  const c = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12)
    .padEnd(12, "X");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

function idFromRecovery(recovery) {
  return (
    "acc_" +
    String(recovery || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .toLowerCase()
      .slice(0, 12)
  );
}

export function getAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const recovery = formatRecovery(randomCode(12));
  const account = {
    id: idFromRecovery(recovery),
    recovery,
    createdAt: Date.now(),
    clerkUserId: null,
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export function restoreAccount(recovery) {
  const formatted = formatRecovery(recovery);
  if (formatted.replace(/-/g, "").length < 10) {
    throw new Error("Recovery code too short");
  }
  const account = {
    id: idFromRecovery(formatted),
    recovery: formatted,
    createdAt: Date.now(),
    restored: true,
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export async function pullSync() {
  const account = getAccount();
  const res = await fetch(`/api/sync?accountId=${encodeURIComponent(account.id)}`, {
    headers: { "X-Account-Id": account.id },
  });
  if (!res.ok) throw new Error("Sync pull failed");
  const data = await res.json();
  const deals = data.deals || {};
  for (const deal of Object.values(deals)) {
    if (deal?.id && deal?.items) saveDeal(deal);
  }
  return { count: Object.keys(deals).length, account };
}

export async function pushSync() {
  const account = getAccount();
  const deals = loadDeals();
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Account-Id": account.id,
    },
    body: JSON.stringify({ accountId: account.id, deals }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error?.message || "Sync push failed");
  }
  return res.json();
}

export async function createServerShare(deal) {
  const account = getAccount();
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deal: { ...deal, accountId: account.id },
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error?.message || "Share failed");
  }
  return res.json();
}

export async function loadServerShare(id) {
  const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Optional Clerk — activates when publishable key present in /api/config */
export async function initClerk(publishableKey) {
  if (!publishableKey || window.Clerk) return null;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  const clerk = new window.Clerk(publishableKey);
  await clerk.load();
  window.__clerk = clerk;
  if (clerk.user) {
    const account = getAccount();
    account.clerkUserId = clerk.user.id;
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }
  return clerk;
}
