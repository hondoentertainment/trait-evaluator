import { readFileSync } from "fs";
import { put } from "@vercel/blob";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  let k = line.slice(0, i);
  let v = line.slice(i + 1);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  v = v.replace(/\\r\\n/g, "").replace(/[\r\n]/g, "");
  process.env[k] = v;
}
console.log("BLOB_STORE_ID=", JSON.stringify(process.env.BLOB_STORE_ID));
console.log("has OIDC", !!process.env.VERCEL_OIDC_TOKEN);
try {
  const r = await put("test/hello.json", JSON.stringify({ ok: true, t: Date.now() }), { access: "public", addRandomSuffix: false, allowOverwrite: true });
  console.log("PUT OK", r.url);
} catch (e) {
  console.error("PUT FAIL", e.message);
  process.exitCode = 1;
}
