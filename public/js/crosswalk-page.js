import {
  getDeal,
  getCurrentDeal,
  fromShareParam,
  saveDeal,
  shareUrl,
  recentDeals,
  uid,
} from "./store.js";
import {
  getBands,
  fmtCount,
  trueCount,
  scoreColor,
  normalizeItem,
  applyFeedback,
} from "./hilo.js";

const DEMO = [
  {
    trait: "Loves hiking",
    score: 82,
    signal: "Outdoorsy without being vague — invites a real plan.",
    tags: ["green flag", "distinctive"],
    upgrade: "Name a trail or trip.",
  },
  {
    trait: "Foodie",
    score: 28,
    signal: "Low-info cliché — almost everyone eats.",
    tags: ["cliché", "low-info"],
    upgrade: "Pick a cuisine or spot.",
  },
  {
    trait: "Dog mom",
    score: 74,
    signal: "Warm and specific enough to open a chat.",
    tags: ["green flag"],
    upgrade: "Breed + one ritual.",
  },
  {
    trait: "Just ask",
    score: 18,
    signal: "Hands the work back to the reader.",
    tags: ["low-info"],
    upgrade: "Offer one concrete prompt.",
  },
];

const crosswalkEl = document.getElementById("crosswalk");
const pageMeta = document.getElementById("pageMeta");
const bandsEl = document.getElementById("bandsLive");
const shareBtn = document.getElementById("shareBtn");
const historyEl = document.getElementById("history");

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
  );
}

function resolveDeal() {
  const params = new URLSearchParams(location.search);
  const d = params.get("d");
  if (d) {
    const shared = fromShareParam(d);
    if (shared?.items?.length) {
      shared.items = shared.items.map((it) => normalizeItem(it));
      // Persist shared deal so refresh/history works
      const saved = saveDeal({
        id: uid(),
        createdAt: Date.now(),
        items: shared.items,
        shared: true,
        verdict: {},
      });
      history.replaceState({}, "", `/crosswalk?id=${saved.id}`);
      return saved;
    }
  }
  const id = params.get("id");
  if (id) {
    const deal = getDeal(id);
    if (deal) return deal;
  }
  const cur = getCurrentDeal();
  if (cur?.items?.length) return cur;
  return saveDeal({
    id: uid(),
    createdAt: Date.now(),
    items: DEMO.map((it) => normalizeItem(it)),
    verdict: { word: "DEMO" },
    demo: true,
  });
}

function renderHistory(activeId) {
  const list = recentDeals(8);
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
          const cls = d.id === activeId ? "hist-chip on" : "hist-chip";
          const word = d.verdict?.word || (d.demo ? "DEMO" : "—");
          return `<a class="${cls}" href="/crosswalk?id=${encodeURIComponent(d.id)}">${escapeHtml(word)} · ${n}</a>`;
        })
        .join("")}
    </div>`;
}

function renderCrosswalk(deal) {
  const items = (deal.items || []).map((it) => normalizeItem(it));
  const bands = getBands();
  if (bandsEl) {
    bandsEl.textContent = `Hi-Lo · +1 ≥ ${bands.high} · −1 ≤ ${bands.low}`;
  }

  if (!items.length) {
    crosswalkEl.innerHTML = `
      <div class="xwalk-empty">
        No shoe dealt yet.<br><br>
        <a class="nav-btn primary" href="/#deal">Deal a profile on page 1 →</a>
      </div>`;
    pageMeta.textContent = "Page 2 of 2 · empty shoe";
    return;
  }

  let running = 0;
  const rows = items
    .map((it, idx) => {
      const cv = it.count;
      running += cv;
      const cvClass = cv > 0 ? "cv-pos" : cv < 0 ? "cv-neg" : "cv-zero";
      const cvText = fmtCount(cv).replace("-", "−");
      const runText = fmtCount(running).replace("-", "−");
      const tags = (it.tags || [])
        .map((t) => `<span class="tag">${escapeHtml(String(t))}</span>`)
        .join("");
      return `<tr data-idx="${idx}">
      <td class="c-num">${idx + 1}</td>
      <td class="c-trait">${escapeHtml(it.trait)}</td>
      <td class="c-score"><span style="background:${scoreColor(it.score)}">${it.score}</span></td>
      <td class="c-count"><span class="count-val ${cvClass}">${cvText}</span></td>
      <td class="c-run">${runText}</td>
      <td class="c-tags"><div class="tags">${tags || "—"}</div></td>
      <td class="c-signal">${escapeHtml(it.signal) || "—"}</td>
      <td class="c-upgrade">${escapeHtml(it.upgrade) || "—"}</td>
      <td class="c-fb">
        <button type="button" class="fb-btn" data-agree="1" title="Agree">👍</button>
        <button type="button" class="fb-btn" data-agree="0" title="Disagree">👎</button>
      </td>
    </tr>`;
    })
    .join("");

  const finalRun = fmtCount(running).replace("-", "−");
  const tc = trueCount(running, items.length, items.length);
  const tcNum = (tc > 0 ? "+" : "") + tc.toFixed(1);
  pageMeta.textContent = `Page 2 of 2 · ${items.length} cards · TC ${tcNum}`;

  // Update legend bands
  document.querySelectorAll("[data-band-high]").forEach((el) => {
    el.textContent = `Score ${bands.high}–100`;
  });
  document.querySelectorAll("[data-band-mid]").forEach((el) => {
    el.textContent = `Score ${bands.low + 1}–${bands.high - 1}`;
  });
  document.querySelectorAll("[data-band-low]").forEach((el) => {
    el.textContent = `Score 0–${bands.low}`;
  });

  crosswalkEl.innerHTML = `
    <div class="xwalk-wrap">
      <table class="xwalk">
        <thead>
          <tr>
            <th>#</th>
            <th>Trait</th>
            <th>Score</th>
            <th>Count</th>
            <th>Running</th>
            <th>Tags</th>
            <th>Signal</th>
            <th>Upgrade</th>
            <th>FB</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="foot-label">Shoe total</td>
            <td></td>
            <td class="c-run foot-run">${finalRun}</td>
            <td colspan="4" class="foot-meta">True count ${tcNum} · ${items.length} cards</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  crosswalkEl.querySelectorAll(".fb-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const idx = Number(tr.dataset.idx);
      applyFeedback(items[idx], btn.dataset.agree === "1");
      // Re-normalize counts with new bands and re-render
      deal.items = items.map((it) => normalizeItem(it));
      saveDeal(deal);
      renderCrosswalk(deal);
    });
  });

  if (shareBtn) {
    shareBtn.onclick = async () => {
      const url = shareUrl(deal);
      try {
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = "Link copied";
        setTimeout(() => (shareBtn.textContent = "Copy share link"), 1600);
      } catch {
        prompt("Copy share link:", url);
      }
    };
  }

  // OG-ish document title
  document.title = `Crosswalk · TC ${tcNum} · Profile Read`;
}

const deal = resolveDeal();
renderHistory(deal.id);
renderCrosswalk(deal);
