import { loadDeals, saveDeal, deleteDeal } from "./store.js";

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

function persistAccount(account) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

export function getAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const recovery = formatRecovery(randomCode(12));
  return persistAccount({
    id: idFromRecovery(recovery),
    recovery,
    createdAt: Date.now(),
    clerkUserId: null,
    clerkEmail: null,
  });
}

export function restoreAccount(recovery) {
  const formatted = formatRecovery(recovery);
  if (formatted.replace(/-/g, "").length < 10) {
    throw new Error("Recovery code too short");
  }
  return persistAccount({
    id: idFromRecovery(formatted),
    recovery: formatted,
    createdAt: Date.now(),
    restored: true,
    clerkUserId: null,
    clerkEmail: null,
  });
}

export function linkClerkUser(user) {
  const account = getAccount();
  account.clerkUserId = user?.id || null;
  account.clerkEmail =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    null;
  account.linkedAt = Date.now();
  return persistAccount(account);
}

export function unlinkClerkUser() {
  const account = getAccount();
  account.clerkUserId = null;
  account.clerkEmail = null;
  return persistAccount(account);
}

export async function pullSync() {
  const account = getAccount();
  const res = await fetch(`/api/sync?accountId=${encodeURIComponent(account.id)}`, {
    headers: { "X-Account-Id": account.id },
  });
  if (!res.ok) throw new Error("Sync pull failed");
  const data = await res.json();
  const deals = data.deals || {};
  let live = 0;
  for (const deal of Object.values(deals)) {
    if (!deal?.id) continue;
    if (deal.deleted) {
      deleteDeal(deal.id);
      continue;
    }
    if (deal.items?.length) {
      saveDeal(deal);
      live++;
    }
  }
  return { count: live, account };
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
    body: JSON.stringify({
      accountId: account.id,
      clerkUserId: account.clerkUserId || null,
      deals,
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error?.message || "Sync push failed");
  }
  return res.json();
}

export async function createServerShare(deal, ttlDays = 30) {
  const account = getAccount();
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deal: { ...deal, accountId: account.id },
      ttlDays,
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error?.message || "Share failed");
  }
  return res.json();
}

export async function revokeServerShare(id) {
  const account = getAccount();
  const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "X-Account-Id": account.id,
    },
    body: JSON.stringify({ id, accountId: account.id }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error?.message || "Revoke failed");
  }
  return res.json();
}

export async function loadServerShare(id) {
  const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Optional Clerk — activates when publishable key present in /api/config */
export async function initClerk(publishableKey, { onChange } = {}) {
  if (!publishableKey) return null;
  if (!window.Clerk) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const clerk = window.Clerk?.publishableKey
    ? window.Clerk
    : new window.Clerk(publishableKey);
  if (!clerk.loaded) await clerk.load();
  window.__clerk = clerk;

  const syncUser = () => {
    if (clerk.user) linkClerkUser(clerk.user);
    else unlinkClerkUser();
    onChange?.(clerk);
  };
  syncUser();
  clerk.addListener?.(({ user }) => {
    if (user) linkClerkUser(user);
    else unlinkClerkUser();
    onChange?.(clerk);
  });
  return clerk;
}
