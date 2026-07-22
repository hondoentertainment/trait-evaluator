import { loadFeedback, saveFeedback, loadTraitFeedback, saveTraitFeedback } from "./store.js";

export function getBands() {
  const fb = loadFeedback();
  return {
    high: Math.max(55, Math.min(85, Number(fb.high) || 70)),
    low: Math.max(15, Math.min(45, Number(fb.low) || 35)),
  };
}

export function traitKey(trait) {
  return String(trait || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Bands nudged by global feedback + per-trait history. */
export function bandsForTrait(trait) {
  const base = getBands();
  const key = traitKey(trait);
  if (!key) return base;
  const map = loadTraitFeedback();
  const row = map[key];
  if (!row || !(row.up || row.down)) return base;
  let { high, low } = base;
  // More disagrees on this trait → widen (harder to hit ±1); agrees → tighten.
  const delta = (row.down || 0) - (row.up || 0);
  if (delta >= 2) {
    high = Math.min(85, high + Math.min(6, delta));
    low = Math.max(15, low - Math.min(6, delta));
  } else if (delta <= -2) {
    high = Math.max(55, high - Math.min(4, -delta));
    low = Math.min(45, low + Math.min(4, -delta));
  }
  if (low >= high - 10) low = high - 10;
  return { high, low };
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

export function whyCount(item, bands) {
  const b = bands || bandsForTrait(item.trait);
  const score = item.score;
  const count = item.count ?? countFromScore(score, b);
  if (count === 1) {
    return `Why +1: score ${score} ≥ high band ${b.high} — reads as a distinctive high card.`;
  }
  if (count === -1) {
    return `Why −1: score ${score} ≤ low band ${b.low} — low-info / cliché card.`;
  }
  return `Why 0: score ${score} sits between ${b.low + 1}–${b.high - 1} — neither high nor low card.`;
}

export function normalizeItem(it, bands) {
  let score = Number(it.score);
  if (!Number.isFinite(score)) score = 50;
  if (score > 0 && score <= 1) score = Math.round(score * 100);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const trait = String(it.trait || "").trim();
  const b = bands || bandsForTrait(trait);
  return {
    trait,
    score,
    signal: String(it.signal || "").trim(),
    tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
    count: countFromScore(score, b),
    upgrade: String(it.upgrade || "").trim(),
  };
}

/**
 * Thumbs feedback nudges global Hi-Lo bands + per-trait memory.
 * agree=true reinforces the assigned count; false pushes the band away.
 */
export function applyFeedback(item, agree) {
  const fb = loadFeedback();
  const bands = getBands();
  const score = item.score;
  const count = countFromScore(score, bandsForTrait(item.trait));

  if (agree) {
    if (count === 1) fb.high = Math.max(55, fb.high - 0.5);
    else if (count === -1) fb.low = Math.min(45, fb.low + 0.5);
  } else {
    if (count === 1) fb.high = Math.min(85, fb.high + 1.5);
    else if (count === -1) fb.low = Math.max(15, fb.low - 1.5);
    else {
      if (score >= (bands.high + bands.low) / 2) fb.high = Math.max(55, fb.high - 1);
      else fb.low = Math.min(45, fb.low + 1);
    }
  }
  fb.high = Math.round(fb.high * 10) / 10;
  fb.low = Math.round(fb.low * 10) / 10;
  if (fb.low >= fb.high - 10) fb.low = fb.high - 10;
  fb.votes = (fb.votes || 0) + 1;
  saveFeedback(fb);

  const key = traitKey(item.trait);
  if (key) {
    const map = loadTraitFeedback();
    const row = map[key] || { up: 0, down: 0, trait: item.trait };
    if (agree) row.up = (row.up || 0) + 1;
    else row.down = (row.down || 0) + 1;
    row.lastScore = score;
    row.updatedAt = Date.now();
    map[key] = row;
    // Cap map size
    const keys = Object.keys(map);
    if (keys.length > 200) {
      keys
        .sort((a, b) => (map[a].updatedAt || 0) - (map[b].updatedAt || 0))
        .slice(0, keys.length - 200)
        .forEach((k) => delete map[k]);
    }
    saveTraitFeedback(map);
  }

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
