import { randomBytes } from "node:crypto";

const REPO = () =>
  (process.env.DATA_REPO || "hondoentertainment/profileread-data").replace(
    /[\r\n]/g,
    ""
  );
const TOKEN = () => (process.env.GITHUB_TOKEN || "").replace(/[\r\n]/g, "");

function headers() {
  const token = TOKEN();
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "profile-read",
  };
}

async function getFile(path) {
  const url = `https://api.github.com/repos/${REPO()}/contents/${path}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub GET ${res.status}: ${t}`);
  }
  const data = await res.json();
  const json = Buffer.from(data.content, "base64").toString("utf8");
  return { sha: data.sha, data: JSON.parse(json) };
}

async function putFileOnce(path, data, message, sha) {
  const body = {
    message: message || `update ${path}`,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64"),
    ...(sha ? { sha } : {}),
  };
  const url = `https://api.github.com/repos/${REPO()}/contents/${path}`;
  return fetch(url, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function putFile(path, data, message, attempts = 4) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const existing = await getFile(path).catch(() => null);
    const res = await putFileOnce(path, data, message, existing?.sha);
    if (res.ok) return res.json();
    const t = await res.text();
    lastErr = new Error(`GitHub PUT ${res.status}: ${t}`);
    // 409 conflict / 422 sha mismatch — refetch and retry
    if (res.status === 409 || res.status === 422) {
      await new Promise((r) => setTimeout(r, 80 * (i + 1)));
      continue;
    }
    throw lastErr;
  }
  throw lastErr || new Error("GitHub PUT failed after retries");
}

export async function getJson(path) {
  const file = await getFile(path);
  return file?.data ?? null;
}

export async function putJson(path, data, message) {
  return putFile(path, data, message);
}

export async function deleteJson(path, message) {
  const existing = await getFile(path);
  if (!existing) return null;
  const url = `https://api.github.com/repos/${REPO()}/contents/${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message || `delete ${path}`,
      sha: existing.sha,
    }),
  });
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`GitHub DELETE ${res.status}: ${t}`);
  }
  return true;
}

export async function available() {
  return Boolean(TOKEN() && REPO());
}

export function shortId(len = 8) {
  const alphabet = "23456789abcdefghijkmnopqrstuvwxyz";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
