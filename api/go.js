export default async function handler(req, res) {
  const id = String(req.query.id || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 32);
  if (!id) {
    res.writeHead(302, { Location: "/" });
    return res.end();
  }
  res.writeHead(302, { Location: `/crosswalk?sid=${encodeURIComponent(id)}` });
  return res.end();
}
