import { recentDeals, getDeal } from "./store.js";
import { trueCount, fmtCount, verdictFromTrue, normalizeItem } from "./hilo.js";

const aEl = document.getElementById("a");
const bEl = document.getElementById("b");
const out = document.getElementById("out");

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

function fill() {
  const list = recentDeals(30);
  if (!list.length) {
    aEl.innerHTML = "<option>No saved shoes yet</option>";
    bEl.innerHTML = "<option>Deal a profile first</option>";
    return;
  }
  const opts = list.map((d) => `<option value="${d.id}">${label(d)}</option>`).join("");
  aEl.innerHTML = opts;
  bEl.innerHTML = opts;
  if (list[1]) bEl.value = list[1].id;
}

document.getElementById("go").onclick = () => {
  const A = getDeal(aEl.value);
  const B = getDeal(bEl.value);
  if (!A || !B) {
    out.innerHTML = "<p>Pick two saved shoes.</p>";
    return;
  }
  const sa = stats(A);
  const sb = stats(B);
  const dRun = sa.running - sb.running;
  const dTc = sa.tc - sb.tc;
  let winner = "Push";
  if (dTc > 0.15) winner = "Shoe A";
  else if (dTc < -0.15) winner = "Shoe B";

  out.innerHTML = `
    <div class="board">
      <div class="shoe-card">
        <h2>Shoe A · ${sa.v.word}</h2>
        <div class="big ${sa.running > 0 ? "hot" : sa.running < 0 ? "cold" : "mid"}">${fmtCount(sa.running)}</div>
        <div class="meta">True ${sa.tc >= 0 ? "+" : ""}${sa.tc.toFixed(1)} · ${sa.items.length} cards</div>
        <p style="margin-top:10px">${sa.v.label}</p>
      </div>
      <div class="vs">VS</div>
      <div class="shoe-card">
        <h2>Shoe B · ${sb.v.word}</h2>
        <div class="big ${sb.running > 0 ? "hot" : sb.running < 0 ? "cold" : "mid"}">${fmtCount(sb.running)}</div>
        <div class="meta">True ${sb.tc >= 0 ? "+" : ""}${sb.tc.toFixed(1)} · ${sb.items.length} cards</div>
        <p style="margin-top:10px">${sb.v.label}</p>
      </div>
    </div>
    <div class="delta">
      <div class="word">${winner}</div>
      <div>Δ running ${fmtCount(dRun)} · Δ true ${(dTc >= 0 ? "+" : "") + dTc.toFixed(1)}</div>
      <div class="meta">Edge goes to the denser shoe (true count), not raw card count alone.</div>
    </div>`;
};

fill();
