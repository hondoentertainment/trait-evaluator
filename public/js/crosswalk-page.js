import {
  getDeal,
  getCurrentDeal,
  fromShareParam,
  saveDeal,
  deleteDeal,
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
  whyCount,
  bandsForTrait,
} from "./hilo.js";
import {
  createServerShare,
  loadServerShare,
  revokeServerShare,
  pushSync,
} from "./auth.js";
import { track } from "./telemetry.js";

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
const revokeBtn = document.getElementById("revokeShareBtn");
const compareBtn = document.getElementById("compareBtn");
const historyEl = document.getElementById("history");
let activeShareId = null;

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
  );
}

async function resolveDeal() {
  const params = new URLSearchParams(location.search);
  const sid = params.get("sid") || params.get("s");
  if (sid) {
    const server = await loadServerShare(sid);
    if (server?.items?.length) {
      activeShareId = sid;
      server.items = server.items.map((it) => normalizeItem(it));
      const saved = saveDeal({
        ...server,
        id: server.id || uid(),
        shareId: sid,
        fromShare: sid,
      });
      history.replaceState({}, "", `/crosswalk?id=${encodeURIComponent(saved.id)}`);
      return saved;
    }
  }
  const d = params.get("d");
  if (d) {
    const shared = fromShareParam(d);
    if (shared?.items?.length) {
      shared.items = shared.items.map((it) => normalizeItem(it));
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
          return `<span class="hist-item">
            <a class="${cls}" href="/crosswalk?id=${encodeURIComponent(d.id)}">${escapeHtml(word)} · ${n}</a>
            <button type="button" class="hist-del" data-id="${escapeHtml(d.id)}" aria-label="Delete shoe" title="Delete">×</button>
          </span>`;
        })
        .join("")}
    </div>`;
}

historyEl?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".hist-del");
  if (!btn) return;
  e.preventDefault();
  const id = btn.getAttribute("data-id");
  if (!id || !confirm("Delete this shoe from your history?")) return;
  deleteDeal(id);
  track("deal_delete");
  try {
    await pushSync();
  } catch {
    /* offline ok */
  }
  const next = recentDeals(1)[0];
  location.href = next
    ? `/crosswalk?id=${encodeURIComponent(next.id)}`
    : "/#deal";
});

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
      const why = whyCount(it, bandsForTrait(it.trait));
      return `<tr data-idx="${idx}">
      <td class="c-num">${idx + 1}</td>
      <td class="c-trait">${escapeHtml(it.trait)}</td>
      <td class="c-score"><span style="background:${scoreColor(it.score)}">${it.score}</span></td>
      <td class="c-count"><span class="count-val ${cvClass}">${cvText}</span><div class="why-count">${escapeHtml(why)}</div></td>
      <td class="c-run">${runText}</td>
      <td class="c-tags"><div class="tags">${tags || "—"}</div></td>
      <td class="c-signal">${escapeHtml(it.signal) || "—"}</td>
      <td class="c-upgrade">${
        it.upgrade
          ? `${escapeHtml(it.upgrade)}<br><button type="button" class="upgrade-btn" data-idx="${idx}">Deal upgrade →</button>`
          : "—"
      }</td>
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
      track(btn.dataset.agree === "1" ? "thumb_up" : "thumb_down", {
        score: items[idx].score,
        trait: items[idx].trait,
      });
      deal.items = items.map((it) => normalizeItem(it));
      saveDeal(deal);
      renderCrosswalk(deal);
    });
  });

  crosswalkEl.querySelectorAll(".upgrade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const upgrade = items[idx]?.upgrade;
      if (!upgrade) return;
      sessionStorage.setItem(
        "profileRead.pendingUpgrade",
        JSON.stringify({
          traits: items.map((it, i) => (i === idx ? upgrade : it.trait)),
        })
      );
      track("upgrade_redeal", { idx, from: "crosswalk" });
      location.href = "/?redeal=1#deal";
    });
  });

  if (compareBtn) {
    const sid = activeShareId || deal.shareId || deal.fromShare;
    compareBtn.href = sid
      ? `/compare?asid=${encodeURIComponent(sid)}`
      : `/compare?a=${encodeURIComponent(deal.id)}`;
    compareBtn.style.display = "inline-block";
  }

  if (revokeBtn) {
    const sid = activeShareId || deal.shareId;
    if (sid) {
      revokeBtn.style.display = "inline-block";
      revokeBtn.onclick = async () => {
        if (!confirm("Revoke this short link? Anyone with it will get a dead end.")) return;
        try {
          await revokeServerShare(sid);
          deal.shareId = null;
          activeShareId = null;
          saveDeal(deal);
          revokeBtn.style.display = "none";
          track("share_revoke");
          alert("Link revoked.");
        } catch (e) {
          alert(e.message || "Could not revoke");
        }
      };
    } else {
      revokeBtn.style.display = "none";
    }
  }

  if (shareBtn) {
    shareBtn.onclick = async () => {
      shareBtn.textContent = "Creating link…";
      try {
        const server = await createServerShare(deal, 30);
        deal.shareId = server.id;
        deal.shareExpiresAt = server.expiresAt;
        activeShareId = server.id;
        saveDeal(deal);
        const url = server.url.startsWith("http")
          ? server.url
          : location.origin + server.url;
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = "Short link copied";
        if (revokeBtn) revokeBtn.style.display = "inline-block";
        if (compareBtn) {
          compareBtn.href = `/compare?asid=${encodeURIComponent(server.id)}`;
        }
        track("share_server");
      } catch {
        const url = shareUrl(deal);
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          prompt("Copy share link:", url);
        }
        shareBtn.textContent = "Fallback link copied";
      }
      setTimeout(() => (shareBtn.textContent = "Copy share link"), 1800);
    };
  }

  document.title = `Crosswalk · TC ${tcNum} · Profile Read`;
  // Dynamic social preview for this view
  let og = document.querySelector('meta[property="og:title"]');
  if (!og) {
    og = document.createElement("meta");
    og.setAttribute("property", "og:title");
    document.head.appendChild(og);
  }
  og.setAttribute("content", `TC ${tcNum} · Profile Read crosswalk`);
}

const deal = await resolveDeal();
renderHistory(deal.id);
renderCrosswalk(deal);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
