export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60");
  if (req.method !== "GET") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  const hasData = Boolean(process.env.GITHUB_TOKEN && process.env.DATA_REPO);
  return res.status(200).json({
    brand: "Profile Read",
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
    features: {
      sync: hasData,
      share: hasData,
      shareExpiry: true,
      shareRevoke: true,
      dynamicOg: true,
      telemetry: hasData,
      evalCache: true,
      modelTiers: true,
      pwa: true,
      compare: true,
      photoScore: true,
      demo: true,
      clerk: Boolean(process.env.CLERK_PUBLISHABLE_KEY),
    },
  });
}
