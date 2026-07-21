import { readFileSync } from "fs";
import { putJson, getJson, shortId } from "../api/_lib/githubStore.js";
for (const line of readFileSync(".env.local","utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  let k = line.slice(0,i), v = line.slice(i+1);
  if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
  v = v.replace(/\\r\\n/g,"").replace(/[\r\n]/g,"");
  process.env[k]=v;
}
const id = shortId(8);
await putJson(`shares/${id}.json`, { id, items:[{trait:"test",score:80,count:1}], createdAt:Date.now() }, `test ${id}`);
const got = await getJson(`shares/${id}.json`);
console.log("OK", id, got?.items?.[0]?.trait);
