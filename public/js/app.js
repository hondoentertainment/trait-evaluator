import {
  uid,
  saveDeal,
  recentDeals,
  shareUrl,
  clientAllowRequest,
  getCurrentDeal,
} from "./store.js";
import {
  getBands,
  normalizeItem,
  fmtCount,
  trueCount,
  heatClass,
  scoreColor,
  applyFeedback,
  verdictFromTrue,
} from "./hilo.js";
import {
  getAccount,
  restoreAccount,
  pullSync,
  pushSync,
  createServerShare,
  initClerk,
} from "./auth.js";
import { track, hydrateBandsFromTelemetry } from "./telemetry.js";

const EXAMPLES = [
  "Loves hiking",
  '6\'2"',
  "Entrepreneur",
  "Fluent in sarcasm",
  "Dog mom",
  "Fitness enthusiast",
  "Foodie",
  "Just ask",
  "Wine + true crime",
  "Fluent in three languages",
];

const DEMO_CROSSWALK = [
  {
    trait: "Loves hiking",
    score: 82,
    count: 1,
    signal: "Outdoorsy without being vague — invites a real plan.",
    tags: ["green flag", "distinctive"],
    upgrade: "Name a trail or trip.",
  },
  {
    trait: "Foodie",
    score: 28,
    count: -1,
    signal: "Low-info cliché — almost everyone eats.",
    tags: ["cliché", "low-info"],
    upgrade: "Pick a cuisine or spot.",
  },
  {
    trait: "Dog mom",
    score: 74,
    count: 1,
    signal: "Warm and specific enough to open a chat.",
    tags: ["green flag"],
    upgrade: "Breed + one ritual.",
  },
  {
    trait: "Just ask",
    score: 18,
    count: -1,
    signal: "Hands the work back to the reader.",
    tags: ["low-info"],
    upgrade: "Offer one concrete prompt.",
  },
];

const input = document.getElementById("input");
const results = document.getElementById("results");
const statusEl = document.getElementById("status");
const errEl = document.getElementById("err");
const goBtn = document.getElementById("go");
const pager1 = document.getElementById("pager1");
const extractPanel = document.getElementById("extractPanel");
const extractInput = document.getElementById("extractInput");
const confirmExtract = document.getElementById("confirmExtract");
const cancelExtract = document.getElementById("cancelExtract");
const historyEl = document.getElementById("history");
const bandsEl = document.getElementById("bandsLive");
const shareBtn = document.getElementById("shareBtn");
const cropModal = document.getElementById("cropModal");
const cropCanvas = document.getElementById("cropCanvas");
const cropApply = document.getElementById("cropApply");
const cropSkip = document.getElementById("cropSkip");
const cropCancel = document.getElementById("cropCancel");
const ocrPreview = document.getElementById("ocrPreview");
const confList = document.getElementById("confList");
const photoScoreEl = document.getElementById("photoScore");
const reOcrBtn = document.getElementById("reOcrBtn");
const recoveryCodeEl = document.getElementById("recoveryCode");
const syncBtn = document.getElementById("syncBtn");
const restoreBtn = document.getElementById("restoreBtn");
const clerkBtn = document.getElementById("clerkBtn");

let imageData = null;
let imageMime = null;
let imagePreviewUrl = null;
let pendingFullImage = null;
let cropState = null;
let lastDeal = null;
let dealTimer = null;
let lastExtractMeta = [];

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
  );
}

function splitTraits(raw) {
  return raw
    .split(/\n|,|·|•|\|/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function showErr(msg) {
  errEl.textContent = msg;
  errEl.style.display = "block";
}

function clearErr() {
  errEl.style.display = "none";
}

function updateBandsLabel() {
  if (!bandsEl) return;
  const b = getBands();
  bandsEl.textContent = `Hi-Lo bands · +1 ≥ ${b.high} · −1 ≤ ${b.low}`;
}

function renderHistory() {
  if (!historyEl) return;
  const list = recentDeals(6);
  if (!list.length) {
    historyEl.innerHTML = "";
    return;
  }
  historyEl.innerHTML = `
    <div class="hist-label">Saved shoes</div>
    <div class="hist-row">
      ${list
        .map((d) => {
          const n = d.items?.length || 0;
          const when = new Date(d.createdAt || Date.now()).toLocaleDateString();
          const word = d.verdict?.word || "—";
          return `<a class="hist-chip" href="/crosswalk?id=${encodeURIComponent(d.id)}">${escapeHtml(word)} · ${n} cards · ${when}</a>`;
        })
        .join("")}
    </div>`;
}

async function callEvaluate(content, mode) {
  const gate = clientAllowRequest(30);
  if (!gate.ok) {
    throw new Error(`Client rate limit — try again in ~${gate.retryInMin} min.`);
  }
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, mode }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API error");
  let text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  text = text.replace(/```json|```/g, "").trim();
  return text;
}

function parseJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no json array");
  return JSON.parse(text.slice(start, end + 1));
}

/* ---------- image / crop ---------- */
function encodeJpeg(img, sx, sy, sw, sh, max = 1400) {
  let w = sw;
  let h = sh;
  if (w > max || h > max) {
    const s = max / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  return { data: jpeg.split(",")[1], mime: "image/jpeg", preview: jpeg };
}

function setImage(result, name) {
  imageData = result.data;
  imageMime = result.mime;
  imagePreviewUrl = result.preview;
  const thumb = document.getElementById("thumb");
  const thumbImg = document.getElementById("thumbImg");
  const thumbName = document.getElementById("thumbName");
  thumbImg.src = result.preview;
  thumbName.textContent = name || "pasted image";
  thumb.classList.add("show");
  clearErr();
}

function openCrop(img, name) {
  pendingFullImage = { img, name };
  cropModal.classList.add("show");
  const maxW = Math.min(640, window.innerWidth - 48);
  const scale = Math.min(1, maxW / img.naturalWidth);
  const dw = Math.round(img.naturalWidth * scale);
  const dh = Math.round(img.naturalHeight * scale);
  cropCanvas.width = dw;
  cropCanvas.height = dh;
  const ctx = cropCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0, dw, dh);
  // Default crop: center 70%
  const cw = dw * 0.72;
  const ch = dh * 0.72;
  cropState = {
    scale,
    x: (dw - cw) / 2,
    y: (dh - ch) / 2,
    w: cw,
    h: ch,
    drag: null,
  };
  drawCrop();
}

function drawCrop() {
  const { img } = pendingFullImage;
  const s = cropState;
  const ctx = cropCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);
  ctx.fillStyle = "rgba(23,19,16,.45)";
  ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  ctx.clearRect(s.x, s.y, s.w, s.h);
  ctx.drawImage(
    img,
    s.x / s.scale,
    s.y / s.scale,
    s.w / s.scale,
    s.h / s.scale,
    s.x,
    s.y,
    s.w,
    s.h
  );
  ctx.strokeStyle = "#c3e600";
  ctx.lineWidth = 2;
  ctx.strokeRect(s.x, s.y, s.w, s.h);
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showErr("That doesn't look like an image file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => openCrop(img, file.name || "pasted image");
    img.onerror = () => showErr("Couldn't open that image.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

cropCanvas?.addEventListener("pointerdown", (e) => {
  if (!cropState) return;
  const r = cropCanvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  cropState.drag = { ox: x - cropState.x, oy: y - cropState.y };
  cropCanvas.setPointerCapture(e.pointerId);
});
cropCanvas?.addEventListener("pointermove", (e) => {
  if (!cropState?.drag) return;
  const r = cropCanvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  cropState.x = Math.max(0, Math.min(cropCanvas.width - cropState.w, x - cropState.drag.ox));
  cropState.y = Math.max(0, Math.min(cropCanvas.height - cropState.h, y - cropState.drag.oy));
  drawCrop();
});
cropCanvas?.addEventListener("pointerup", () => {
  if (cropState) cropState.drag = null;
});

cropApply?.addEventListener("click", () => {
  const { img, name } = pendingFullImage;
  const s = cropState;
  const result = encodeJpeg(
    img,
    s.x / s.scale,
    s.y / s.scale,
    s.w / s.scale,
    s.h / s.scale
  );
  setImage(result, name + " (cropped)");
  cropModal.classList.remove("show");
});
cropSkip?.addEventListener("click", () => {
  const { img, name } = pendingFullImage;
  const result = encodeJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight);
  setImage(result, name);
  cropModal.classList.remove("show");
});
cropCancel?.addEventListener("click", () => {
  cropModal.classList.remove("show");
  pendingFullImage = null;
});

/* ---------- extract / score ---------- */
function scorePrompt(traits) {
  const list = traits.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const b = getBands();
  return `You are a witty, perceptive dating-profile analyst.

Traits (already provided as text):
${list}

For each trait, evaluate the SIGNAL it sends to a potential match.

Hi-Lo shoe counts: score>=${b.high} → count 1; score<=${b.low} → count -1; else 0.

Respond with ONLY a JSON array (no markdown). Each element:
{"trait":"...","score":<0-100 int>,"signal":"...","tags":["..."],"count":1|0|-1,"upgrade":"..."}
Be honest, specific, a little playful, never mean.`;
}

function extractPrompt() {
  return `OCR this dating-profile screenshot. Extract EVERY stated trait / interest / self-description / bio line / prompt answer.
Ignore UI chrome (Like, buttons, nav, other cards).
Respond with ONLY a JSON array of objects (no markdown), max 10:
[{"text":"exact phrase","confidence":0.0-1.0}]
confidence = how sure you are the OCR is correct (1 = crystal clear, 0.4 = guessy).
If nothing readable, return [].`;
}

function photoPrompt() {
  return `Look at this dating-profile photo (not just text). Infer 1-3 lifestyle / presentation signals a match might read from the image alone (e.g. "outdoor adventure photos", "group shot energy", "polished studio look").
Respond ONLY with JSON array:
[{"trait":"...","score":0-100,"signal":"...","tags":["photo"],"count":1|0|-1,"upgrade":"..."}]
Be fair, never body-shame. If the image is mostly text/UI, return [].`;
}

function normalizeExtract(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), confidence: 0.7 };
      }
      const text = String(item.text || item.trait || "").trim();
      let confidence = Number(item.confidence);
      if (!Number.isFinite(confidence)) confidence = 0.7;
      confidence = Math.max(0, Math.min(1, confidence));
      return { text, confidence };
    })
    .filter((x) => x.text)
    .slice(0, 10);
}

function renderConfidence(meta) {
  if (!confList) return;
  confList.innerHTML = meta
    .map((m) => {
      const pct = Math.round(m.confidence * 100);
      const cls = m.confidence >= 0.75 ? "hi" : m.confidence >= 0.5 ? "mid" : "lo";
      return `<span class="conf ${cls}" title="OCR confidence">${escapeHtml(m.text)} · ${pct}%</span>`;
    })
    .join("");
}

async function extractFromImage() {
  statusEl.textContent = "Reading text from the screenshot…";
  statusEl.classList.add("show");
  const content = [
    {
      type: "image",
      source: { type: "base64", media_type: imageMime, data: imageData },
    },
    { type: "text", text: extractPrompt() },
  ];
  let text = await callEvaluate(content, "extract");
  let meta = [];
  try {
    meta = normalizeExtract(parseJsonArray(text));
  } catch {
    meta = [];
  }
  if (!meta.length) {
    text = await callEvaluate(
      [
        content[0],
        {
          type: "text",
          text:
            extractPrompt() +
            "\nRetry carefully. Prefer any visible bio words over returning empty.",
        },
      ],
      "extract"
    );
    try {
      meta = normalizeExtract(parseJsonArray(text));
    } catch {
      meta = [];
    }
  }
  if (!meta.length) {
    track("ocr_fail");
    throw new Error("no traits");
  }
  lastExtractMeta = meta;
  return meta.map((m) => m.text);
}

async function scorePhotoSignals() {
  if (!imageData || !photoScoreEl?.checked) return [];
  statusEl.textContent = "Reading photo vibe…";
  try {
    const text = await callEvaluate(
      [
        {
          type: "image",
          source: { type: "base64", media_type: imageMime, data: imageData },
        },
        { type: "text", text: photoPrompt() },
      ],
      "photo"
    );
    return parseJsonArray(text)
      .map((it) => normalizeItem(it))
      .filter((it) => it.trait)
      .slice(0, 3)
      .map((it) => ({
        ...it,
        tags: Array.from(new Set([...(it.tags || []), "photo"])),
      }));
  } catch {
    return [];
  }
}

async function scoreTraits(traits) {
  statusEl.textContent = "Counting the shoe…";
  statusEl.classList.add("show");
  const content = [{ type: "text", text: scorePrompt(traits) }];
  const text = await callEvaluate(content, "score");
  const parsed = parseJsonArray(text).map((it) => normalizeItem(it)).filter((it) => it.trait);
  if (!parsed.length) throw new Error("no traits");
  return parsed;
}

function showExtract(traits) {
  extractInput.value = traits.join("\n");
  if (ocrPreview && imagePreviewUrl) ocrPreview.src = imagePreviewUrl;
  renderConfidence(lastExtractMeta);
  extractPanel.classList.add("show");
  extractPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function evaluate() {
  const raw = input.value.trim();
  clearErr();
  results.innerHTML = "";
  pager1.style.display = "none";
  extractPanel.classList.remove("show");
  if (shareBtn) shareBtn.style.display = "none";
  if (dealTimer) {
    clearTimeout(dealTimer);
    dealTimer = null;
  }

  if (!raw && !imageData) {
    showErr("Add some profile text or upload a screenshot first.");
    return;
  }

  goBtn.disabled = true;
  try {
    let traits;
    if (imageData) {
      traits = await extractFromImage();
      showExtract(traits);
      statusEl.classList.remove("show");
      goBtn.disabled = false;
      return; // wait for confirm
    }
    traits = splitTraits(raw);
    if (!traits.length) throw new Error("no traits");
    const parsed = await scoreTraits(traits);
    finishDeal(parsed);
  } catch (e) {
    console.error(e);
    const detail = e?.message || "";
    if (detail.includes("Rate limit") || detail.includes("rate limit")) {
      showErr(detail);
    } else if (imageData) {
      showErr(
        "Couldn't read that screenshot. Crop the bio tighter, or type the text in."
      );
    } else {
      showErr("Something went wrong reading that. Try again in a moment.");
    }
  } finally {
    goBtn.disabled = false;
    statusEl.classList.remove("show");
  }
}

confirmExtract?.addEventListener("click", async () => {
  const traits = splitTraits(extractInput.value);
  if (!traits.length) {
    showErr("Add at least one trait line before dealing.");
    return;
  }
  clearErr();
  confirmExtract.disabled = true;
  goBtn.disabled = true;
  try {
    const parsed = await scoreTraits(traits);
    const photoItems = await scorePhotoSignals();
    const merged = [...parsed, ...photoItems].slice(0, 12);
    extractPanel.classList.remove("show");
    input.value = traits.join("\n");
    finishDeal(merged);
  } catch (e) {
    console.error(e);
    showErr("Couldn't score those traits. Try again.");
  } finally {
    confirmExtract.disabled = false;
    goBtn.disabled = false;
    statusEl.classList.remove("show");
  }
});

cancelExtract?.addEventListener("click", () => {
  extractPanel.classList.remove("show");
});

reOcrBtn?.addEventListener("click", async () => {
  if (!imageData) {
    showErr("No crop loaded — upload a screenshot first.");
    return;
  }
  reOcrBtn.disabled = true;
  try {
    const traits = await extractFromImage();
    showExtract(traits);
    track("ocr_retry");
  } catch (e) {
    showErr("Re-OCR still empty. Crop tighter on the bio text.");
  } finally {
    reOcrBtn.disabled = false;
    statusEl.classList.remove("show");
  }
});

function finishDeal(items) {
  let running = 0;
  items.forEach((it) => (running += it.count));
  const tc = trueCount(running, items.length, items.length);
  const v = verdictFromTrue(tc, running, items.length);
  const deal = {
    id: uid(),
    createdAt: Date.now(),
    items,
    verdict: { word: v.word, running, trueCount: tc },
  };
  lastDeal = saveDeal(deal);
  track("deal", { verdict: deal.verdict?.word, n: items.length });
  renderHistory();
  updateBandsLabel();
  dealAnimated(items, deal);
  pager1.style.display = "flex";
  const link = document.getElementById("toPage2");
  if (link) link.href = `/crosswalk?id=${encodeURIComponent(deal.id)}`;
  if (shareBtn) {
    shareBtn.style.display = "inline-block";
    shareBtn.onclick = async () => {
      shareBtn.textContent = "Creating link…";
      try {
        const server = await createServerShare(deal);
        const url = server.url.startsWith("http")
          ? server.url
          : location.origin + server.url;
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = "Short link copied";
        track("share_server");
      } catch {
        const url = shareUrl(deal);
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          prompt("Copy share link:", url);
        }
        shareBtn.textContent = "Fallback link copied";
        track("share_fallback");
      }
      setTimeout(() => (shareBtn.textContent = "Copy share link"), 1800);
    };
  }
  pushSync().catch(() => {});
}

/* ---------- animated shoe ---------- */
function dealAnimated(items, deal) {
  results.innerHTML = "";
  const shoeSize = items.length;
  const shoe = document.createElement("div");
  shoe.className = "shoe";
  shoe.id = "shoe";
  shoe.innerHTML = `
    <div class="shoe-cell">
      <div class="shoe-label">Shoe · cards out</div>
      <div class="shoe-val even" id="shoeCards">0 / ${shoeSize}</div>
      <div class="shoe-sub">Dealing…</div>
    </div>
    <div class="shoe-cell">
      <div class="shoe-label">Running count</div>
      <div class="shoe-val even" id="shoeRun">0</div>
      <div class="shoe-sub">sum of +1 / 0 / −1</div>
    </div>
    <div class="shoe-cell">
      <div class="shoe-label">True count</div>
      <div class="shoe-val even" id="shoeTrue">0.0</div>
      <div class="shoe-sub">running ÷ decks left</div>
    </div>`;
  results.appendChild(shoe);

  let running = 0;
  let idx = 0;

  function next() {
    if (idx >= items.length) {
      renderTally(running, shoeSize, deal);
      return;
    }
    const it = items[idx];
    const cv = it.count;
    running += cv;
    const dealt = idx + 1;
    const tc = trueCount(running, dealt, shoeSize);
    const cvClass = cv > 0 ? "cv-pos" : cv < 0 ? "cv-neg" : "cv-zero";
    const cvText = fmtCount(cv).replace("-", "−");
    const runText = fmtCount(running).replace("-", "−");
    const tcText = (tc > 0 ? "+" : "") + tc.toFixed(1);

    const el = document.createElement("div");
    el.className = "verdict deal-in";
    el.innerHTML = `
      <div class="vhead">
        <div class="score" style="background:${scoreColor(it.score)}">${it.score}</div>
        <div class="trait">
          <span class="trait-label">Card ${dealt} of ${shoeSize}</span>
          <span class="trait-text">${escapeHtml(it.trait)}</span>
        </div>
        <span class="count-val ${cvClass}" style="align-self:center;margin-right:14px">${cvText}</span>
      </div>
      <div class="vbody">
        <div class="signal">${escapeHtml(it.signal)}</div>
        <div class="tags">${(it.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      </div>
      <div class="running">
        <span>Card <b>${cvText}</b></span><span>·</span>
        <span>Running <b>${runText}</b></span><span>·</span>
        <span>True <b>${tcText}</b></span>
      </div>
      <div class="feedback">
        <span class="fb-label">Count feel?</span>
        <button type="button" class="fb-btn" data-agree="1" aria-label="Agree">👍</button>
        <button type="button" class="fb-btn" data-agree="0" aria-label="Disagree">👎</button>
      </div>
      ${it.upgrade ? `<div class="glow"><b>Stronger version:</b> ${escapeHtml(it.upgrade)}</div>` : ""}`;
    results.appendChild(el);

    el.querySelectorAll(".fb-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const agree = btn.dataset.agree === "1";
        applyFeedback(it, agree);
        track(agree ? "thumb_up" : "thumb_down", { score: it.score });
        updateBandsLabel();
        el.querySelector(".feedback").innerHTML =
          '<span class="fb-label">Thanks — bands updated</span>';
      });
    });

    document.getElementById("shoeCards").textContent = `${dealt} / ${shoeSize}`;
    const runEl = document.getElementById("shoeRun");
    const trueEl = document.getElementById("shoeTrue");
    runEl.textContent = runText;
    runEl.className = "shoe-val " + heatClass(running);
    trueEl.textContent = tcText;
    trueEl.className = "shoe-val " + heatClass(tc);
    shoe.querySelector(".shoe-sub").textContent =
      dealt < shoeSize ? "Dealing…" : "Shoe closed";

    idx += 1;
    dealTimer = setTimeout(next, 320);
  }

  next();
}

function renderTally(running, n, deal) {
  const tc = trueCount(running, n, n);
  const v = verdictFromTrue(tc, running, n);
  const num = fmtCount(running).replace("-", "−");
  const tcNum = (tc > 0 ? "+" : "") + tc.toFixed(1);

  const board = document.createElement("div");
  board.className = "tally deal-in";
  board.innerHTML = `
    <div class="tally-num ${heatClass(running)}">${num}</div>
    <div>
      <div class="tally-label">Final shoe · running count</div>
      <div class="tally-read">True count ${tcNum}</div>
      <div class="tally-sub">${n} cards dealt · Hi-Lo (+1 / 0 / −1)</div>
    </div>`;
  results.appendChild(board);

  const t = document.createElement("div");
  t.className = "call " + v.cls + " deal-in";
  t.innerHTML = `
    <div class="call-word">${v.word}</div>
    <div class="call-body">
      <div class="call-label">${v.label} · TC ${tcNum}</div>
      <div class="call-read">${v.read}</div>
    </div>`;
  results.appendChild(t);

  const next = document.createElement("div");
  next.className = "pager";
  next.innerHTML = `
    <span class="page-meta">Shoe closed · ${n} cards</span>
    <a class="nav-btn primary" href="/crosswalk?id=${encodeURIComponent(deal.id)}">See value crosswalk →</a>`;
  results.appendChild(next);
}

/* ---------- wire UI ---------- */
document.getElementById("file")?.addEventListener("change", (e) => {
  if (e.target.files[0]) loadImageFile(e.target.files[0]);
});
document.getElementById("thumbDrop")?.addEventListener("click", () => {
  imageData = null;
  imageMime = null;
  document.getElementById("thumb").classList.remove("show");
  document.getElementById("file").value = "";
});
window.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) =>
    i.type.startsWith("image/")
  );
  if (item) {
    e.preventDefault();
    loadImageFile(item.getAsFile());
  }
});

const composer = document.getElementById("composer");
["dragenter", "dragover"].forEach((ev) =>
  composer.addEventListener(ev, (e) => {
    e.preventDefault();
    composer.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  composer.addEventListener(ev, (e) => {
    e.preventDefault();
    composer.classList.remove("dragover");
  })
);
composer.addEventListener("drop", (e) => {
  const file = [...(e.dataTransfer?.files || [])].find((f) =>
    f.type.startsWith("image/")
  );
  if (file) loadImageFile(file);
});

const chips = document.getElementById("examples");
EXAMPLES.forEach((e) => {
  const c = document.createElement("span");
  c.className = "chip";
  c.textContent = e;
  c.onclick = () => {
    input.value = input.value.trim() ? input.value.trim() + "\n" + e : e;
    input.focus();
  };
  chips.appendChild(c);
});

document.getElementById("showCrosswalk")?.addEventListener("click", (e) => {
  const cur = getCurrentDeal();
  if (!cur?.items?.length) {
    const deal = saveDeal({
      id: uid(),
      createdAt: Date.now(),
      items: DEMO_CROSSWALK.map((it) => normalizeItem(it)),
      verdict: { word: "HIT", running: 0, trueCount: 0 },
    });
    e.currentTarget.href = `/crosswalk?id=${deal.id}`;
  } else {
    e.currentTarget.href = `/crosswalk?id=${encodeURIComponent(cur.id)}`;
  }
});

goBtn.onclick = evaluate;
input.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") evaluate();
});

function refreshAccountUI() {
  const account = getAccount();
  if (recoveryCodeEl) recoveryCodeEl.textContent = account.recovery;
}

syncBtn?.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing…";
  try {
    await pushSync();
    const pulled = await pullSync();
    renderHistory();
    syncBtn.textContent = `Synced (${pulled.count})`;
    track("sync");
  } catch (e) {
    syncBtn.textContent = "Sync failed";
    showErr(e.message || "Sync failed");
  } finally {
    setTimeout(() => {
      syncBtn.disabled = false;
      syncBtn.textContent = "Sync now";
    }, 1600);
  }
});

restoreBtn?.addEventListener("click", async () => {
  const code = prompt("Paste your recovery code:");
  if (!code) return;
  try {
    restoreAccount(code);
    refreshAccountUI();
    await pullSync();
    renderHistory();
    track("restore");
  } catch (e) {
    showErr(e.message || "Could not restore");
  }
});

// Share-target / deep link text
const params = new URLSearchParams(location.search);
const sharedText = params.get("text") || params.get("title");
if (sharedText && !input.value) input.value = sharedText;

refreshAccountUI();
updateBandsLabel();
renderHistory();
hydrateBandsFromTelemetry().then(() => updateBandsLabel());
pullSync().then(() => renderHistory()).catch(() => {});

fetch("/api/config")
  .then((r) => r.json())
  .then(async (cfg) => {
    if (cfg.clerkPublishableKey && clerkBtn) {
      clerkBtn.style.display = "inline-block";
      const clerk = await initClerk(cfg.clerkPublishableKey);
      clerkBtn.onclick = () => {
        if (!clerk) return;
        if (clerk.user) clerk.signOut();
        else clerk.openSignIn();
      };
    }
  })
  .catch(() => {});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
