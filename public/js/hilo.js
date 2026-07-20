import { loadFeedback, saveFeedback } from "./store.js";

export function getBands() {
  const fb = loadFeedback();
  return {
    high: Math.max(55, Math.min(85, Number(fb.high) || 70)),
    low: Math.max(15, Math.min(45, Number(fb.low) || 35)),
  };
}

export function countFromScore(score, bands = getBands()) {
  if (score >= bands.high) return 1;
  if (score <= bands.low) return -1;
  return 0;
}

export function fmtCount(n) {
  return n > 0 ? "+" + n : String(n);
}

export function trueCount(running, cardsDealt, shoeSize) {
  const decks =
    cardsDealt >= shoeSize
      ? Math.max(shoeSize / 5, 0.5)
      : Math.max((shoeSize - cardsDealt) / 5, 0.5);
  return running / decks;
}

export function heatClass(n) {
  if (n > 0) return "hot";
  if (n < 0) return "cold";
  return "even";
}

export function scoreColor(n) {
  if (n >= 75) return "#5b2a86";
  if (n >= 50) return "#3a7d44";
  if (n >= 30) return "#c98a00";
  return "#ff5c49";
}

export function normalizeItem(it, bands = getBands()) {
  let score = Number(it.score);
  if (!Number.isFinite(score)) score = 50;
  if (score > 0 && score <= 1) score = Math.round(score * 100);
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    trait: String(it.trait || "").trim(),
    score,
    signal: String(it.signal || "").trim(),
    tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
    count: countFromScore(score, bands),
    upgrade: String(it.upgrade || "").trim(),
  };
}

/**
 * Thumbs feedback nudges Hi-Lo bands.
 * agree=true reinforces the assigned count; false pushes the band away.
 */
export function applyFeedback(item, agree) {
  const fb = loadFeedback();
  const bands = getBands();
  const score = item.score;
  const count = countFromScore(score, bands);

  if (agree) {
    // Slightly tighten toward this score's side
    if (count === 1) fb.high = Math.max(55, fb.high - 0.5);
    else if (count === -1) fb.low = Math.min(45, fb.low + 0.5);
  } else {
    if (count === 1) fb.high = Math.min(85, fb.high + 1.5);
    else if (count === -1) fb.low = Math.max(15, fb.low - 1.5);
    else {
      // Neutral disagreed: push toward nearer edge
      if (score >= (bands.high + bands.low) / 2) fb.high = Math.max(55, fb.high - 1);
      else fb.low = Math.min(45, fb.low + 1);
    }
  }
  fb.high = Math.round(fb.high * 10) / 10;
  fb.low = Math.round(fb.low * 10) / 10;
  if (fb.low >= fb.high - 10) fb.low = fb.high - 10;
  fb.votes = (fb.votes || 0) + 1;
  saveFeedback(fb);
  return getBands();
}

export function verdictFromTrue(tc, running, n) {
  const num = fmtCount(running).replace("-", "−");
  const tcNum = (tc > 0 ? "+" : "") + tc.toFixed(1);
  if (tc >= 1.5) {
    return {
      word: "HIT",
      cls: "call-hit",
      label: "The shoe is rich",
      read: `True count ${tcNum} (running ${num} over ${n} cards). Signal is dense — distinctive traits outnumber filler. Play it: swipe and lead with something specific.`,
    };
  }
  if (tc >= 0.5) {
    return {
      word: "HIT",
      cls: "call-hit",
      label: "Slight edge to the player",
      read: `True count ${tcNum} (running ${num}). Soft hit — a couple of strong cards carry the shoe. Worth a swipe if one of them lands for you.`,
    };
  }
  if (tc > -0.5) {
    return {
      word: "STAND",
      cls: "call-stand",
      label: "A pushed shoe",
      read: `True count ${tcNum} (running ${num}). Near even — greens and clichés cancel. Stand pat and read photos/prompts before you commit.`,
    };
  }
  if (tc > -1.5) {
    return {
      word: "STAND",
      cls: "call-stand",
      label: "The house has the edge",
      read: `True count ${tcNum} (running ${num}). Thin shoe. Nothing fatal, but you'd be betting on photos and conversation to make up the difference.`,
    };
  }
  return {
    word: "BUST",
    cls: "call-bust",
    label: "Fold the hand",
    read: `True count ${tcNum} (running ${num}). Low cards dominate. On the count alone this shoe busts — unless something off-list changes the math.`,
  };
}
