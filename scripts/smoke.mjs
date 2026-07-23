/**
 * Smoke tests against a live origin.
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const base = (process.argv[2] || "https://trait-evaluator.vercel.app").replace(/\/$/, "");

const results = [];

async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✓ ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: e.message });
    console.error(`✗ ${name}: ${e.message}`);
  }
}

await check("GET /", async () => {
  const r = await fetch(base + "/");
  if (!r.ok) throw new Error(`status ${r.status}`);
  const t = await r.text();
  if (!t.includes("Profile")) throw new Error("missing brand");
});

await check("GET /api/config", async () => {
  const r = await fetch(base + "/api/config");
  if (!r.ok) throw new Error(`status ${r.status}`);
  const j = await r.json();
  if (!j.brand) throw new Error("no brand");
});

await check("GET /api/og", async () => {
  const r = await fetch(base + "/api/og?word=HIT&tc=%2B1.2");
  if (!r.ok) throw new Error(`status ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("svg")) throw new Error(`bad content-type ${ct}`);
});

await check("GET /api/share missing id", async () => {
  const r = await fetch(base + "/api/share");
  if (r.status !== 400 && r.status !== 503) {
    throw new Error(`expected 400/503 got ${r.status}`);
  }
});

await check("GET /s/:id redirects or OG", async () => {
  const r = await fetch(base + "/s/smoke9999", {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  // 302 to landing, or 200 bot HTML
  if (![200, 301, 302, 307, 308].includes(r.status)) {
    throw new Error(`status ${r.status}`);
  }
  const loc = r.headers.get("location") || "";
  if (r.status >= 300 && !loc.includes("landing") && !loc.includes("crosswalk")) {
    throw new Error(`unexpected location ${loc}`);
  }
});

await check("POST /api/evaluate validates", async () => {
  const r = await fetch(base + "/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (r.status !== 400) throw new Error(`expected 400 got ${r.status}`);
});

await check("GET /demo", async () => {
  const r = await fetch(base + "/demo");
  if (!r.ok) throw new Error(`status ${r.status}`);
});

await check("GET /landing", async () => {
  const r = await fetch(base + "/landing");
  if (!r.ok) throw new Error(`status ${r.status}`);
});

await check("GET /admin", async () => {
  const r = await fetch(base + "/admin");
  if (!r.ok) throw new Error(`status ${r.status}`);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed @ ${base}`);
process.exit(failed.length ? 1 : 0);
