import { loadFeedback, saveFeedback } from "./store.js";

let remoteBands = null;

export async function track(type, meta = null) {
  try {
    // Fire-and-forget
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, meta }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export async function hydrateBandsFromTelemetry() {
  try {
    const res = await fetch("/api/telemetry");
    if (!res.ok) return null;
    const data = await res.json();
    remoteBands = data.bands || null;
    if (remoteBands) {
      const fb = loadFeedback();
      // Blend remote suggestion lightly with local
      fb.high = Math.round(((fb.high || 70) * 2 + remoteBands.high) / 3);
      fb.low = Math.round(((fb.low || 35) * 2 + remoteBands.low) / 3);
      saveFeedback(fb);
    }
    return data;
  } catch {
    return null;
  }
}

export function getRemoteBands() {
  return remoteBands;
}
