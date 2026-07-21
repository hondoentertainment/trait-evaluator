export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");
  if (req.method !== "GET") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  return res.status(200).json({
    brand: "Profile Read",
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
    features: {
      sync: Boolean(process.env.GITHUB_TOKEN && process.env.DATA_REPO),
      share: Boolean(process.env.GITHUB_TOKEN && process.env.DATA_REPO),
      telemetry: Boolean(process.env.GITHUB_TOKEN && process.env.DATA_REPO),
      pwa: true,
      compare: true,
      photoScore: true,
    },
  });
}
