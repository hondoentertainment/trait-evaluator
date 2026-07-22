import { recentDeals, getDeal, saveDeal, uid } from "./store.js";
import { trueCount, fmtCount, verdictFromTrue, normalizeItem } from "./hilo.js";
import { loadServerShare } from "./auth.js";

const aEl = document.getElementById("a");
const bEl = document.getElementById("b");
const out = document.getElementById("out");
const goBtn = document.getElementById("go");

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
  );
}

function label(d) {
  const n = d.items?.length || 0;
  const w = d.verdict?.word || "—";
  const when = new Date(d.createdAt || Date.now()).toLocaleDateString();
  return `${w} · ${n} cards · ${when} · ${d.id.slice(0, 8)}`;
}

function stats(deal) {
  const items = (deal.items || []).map((it) => normalizeItem(it));
  let running = 0;
  items.forEach((it) => (running += it.count));
  const tc = trueCount(running, items.length, items.length || 1);
  const v = verdictFromTrue(tc, running, items.length || 1);
  return { items, running, tc, v };
}

function traitKey(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function traitDeltaRows(sa, sb) {
  const mapA = new Map();
  const mapB = new Map();
  sa.items.forEach((it) => mapA.set(traitKey(it.trait), it));
  sb.items.forEach((it) => mapB.set(traitKey(it.trait), it));
  const keys = [...new Set([...mapA.keys(), ...mapB.keys()])].filter(Boolean);
  return keys
    .map((k) => {
      const a = mapA.get(k);
      const b = mapB.get(k);
      const scoreA = a?.score ?? null;
      const scoreB = b?.score ?? null;
      const dScore =
        scoreA != null && scoreB != null ? scoreA - scoreB : null;
      const countA = a?.count ?? null;
      const countB = b?.count ?? null;
      const name = a?.trait || b?.trait || k;
      return { name, scoreA, scoreB, dScore, countA, countB, both: !!(a && b) };
    })
    .sort((x, y) => {
      if (x.both !== y.both) return x.both ? -1 : 1;
      return Math.abs(y.dScore || 0) - Math.abs(x.dScore || 0);
    });
}

function fill(selectA, selectB) {
  const list = recentDeals(30);
  if (!list.length) {
    aEl.innerHTML = "<option value=\"\">No saved shoes yet</option>";
    bEl.innerHTML = "<option value=\"\">Deal a profile first</option>";
    return;
  }
  const opts = list.map((d) => `<option value="${d.id}">${escapeHtml(label(d))}</option>`).join("");
  aEl.innerHTML = opts;
  bEl.innerHTML = opts;
  if (selectA && list.some((d) => d.id === selectA)) aEl.value = selectA;
  if (selectB && list.some((d) => d.id === selectB)) bEl.value = selectB;
  else if (!selectB && list[1]) bEl.value = list[1].id;
}

function syncUrl(idA, idB) {
  const u = new URL(location.href);
  if (idA) u.searchParams.set("a", idA);
  else u.searchParams.delete("a");
  if (idB) u.searchParams.set("b", idB);
  else u.searchParams.delete("b");
  // Drop one-shot share ids after import
  u.searchParams.delete("asid");
  u.searchParams.delete("bsid");
  history.replaceState({}, "", u.pathname + u.search);
}

function renderCompare(A, B) {
  if (!A || !B) {
    out.innerHTML = "<p class=\"empty\">Pick two saved shoes.</p>";
    return;
  }
  const sa = stats(A);
  const sb = stats(B);
  const dRun = sa.running - sb.running;
  const dTc = sa.tc - sb.tc;
  let winner = "Push";
  if (dTc > 0.15) winner = "Shoe A";
  else if (dTc < -0.15) winner = "Shoe B";

  const rows = traitDeltaRows(sa, sb);
  const table =
    rows.length === 0
      ? ""
      : `<div class="trait-table-wrap">
      <h3>Trait Δ</h3>
      <table class="trait-table">
        <thead>
          <tr><th>Trait</th><th>A</th><th>B</th><th>Δ score</th><th>Δ count</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const dScore =
                r.dScore == null
                  ? "—"
                  : (r.dScore >= 0 ? "+" : "") + r.dScore;
              const dCount =
                r.countA == null || r.countB == null
                  ? r.countA != null
                    ? "A only"
                    : "B only"
                  : fmtCount(r.countA - r.countB);
              const cls =
                r.dScore == null
                  ? ""
                  : r.dScore > 0
                    ? "pos"
                    : r.dScore < 0
                      ? "neg"
                      : "";
              return `<tr class="${cls}">
                <td>${escapeHtml(r.name)}</td>
                <td>${r.scoreA == null ? "—" : r.scoreA}</td>
                <td>${r.scoreB == null ? "—" : r.scoreB}</td>
                <td>${dScore}</td>
                <td>${escapeHtml(String(dCount))}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;

  out.innerHTML = `
    <div class="board">
      <div class="shoe-card">
        <h2>Shoe A · ${sa.v.word}</h2>
        <div class="big ${sa.running > 0 ? "hot" : sa.running < 0 ? "cold" : "mid"}">${fmtCount(sa.running)}</div>
        <div class="meta">True ${sa.tc >= 0 ? "+" : ""}${sa.tc.toFixed(1)} · ${sa.items.length} cards</div>
        <p style="margin-top:10px">${escapeHtml(sa.v.label)}</p>
      </div>
      <div class="vs">VS</div>
      <div class="shoe-card">
        <h2>Shoe B · ${sb.v.word}</h2>
        <div class="big ${sb.running > 0 ? "hot" : sb.running < 0 ? "cold" : "mid"}">${fmtCount(sb.running)}</div>
        <div class="meta">True ${sb.tc >= 0 ? "+" : ""}${sb.tc.toFixed(1)} · ${sb.items.length} cards</div>
        <p style="margin-top:10px">${escapeHtml(sb.v.label)}</p>
      </div>
    </div>
    <div class="delta">
      <div class="word">${winner}</div>
      <div>Δ running ${fmtCount(dRun)} · Δ true ${(dTc >= 0 ? "+" : "") + dTc.toFixed(1)}</div>
      <div class="meta">Edge goes to the denser shoe (true count), not raw card count alone.</div>
    </div>
    ${table}`;
}

function runCompare() {
  const A = getDeal(aEl.value);
  const B = getDeal(bEl.value);
  if (!A || !B) {
    out.innerHTML = "<p class=\"empty\">Pick two saved shoes.</p>";
    return;
  }
  syncUrl(A.id, B.id);
  renderCompare(A, B);
}

async function importSid(param, fallbackLabel) {
  const id = param?.replace(/[^a-z0-9]/gi, "");
  if (!id) return null;
  const remote = await loadServerShare(id);
  if (!remote?.items?.length) return null;
  const localId = uid();
  const deal = saveDeal({
    id: localId,
    createdAt: remote.createdAt || Date.now(),
    items: remote.items.map((it) => normalizeItem(it)),
    verdict: remote.verdict || null,
    fromShare: id,
    label: fallbackLabel,
  });
  return deal.id;
}

goBtn.onclick = runCompare;
aEl?.addEventListener("change", () => {
  if (aEl.value && bEl.value) runCompare();
});
bEl?.addEventListener("change", () => {
  if (aEl.value && bEl.value) runCompare();
});

(async () => {
  const params = new URLSearchParams(location.search);
  let idA = params.get("a") || "";
  let idB = params.get("b") || "";
  try {
    if (params.get("asid")) idA = (await importSid(params.get("asid"), "Share A")) || idA;
    if (params.get("bsid")) idB = (await importSid(params.get("bsid"), "Share B")) || idB;
  } catch {
    /* ignore */
  }
  fill(idA, idB);
  if (idA && idB && getDeal(idA) && getDeal(idB)) runCompare();
})();
