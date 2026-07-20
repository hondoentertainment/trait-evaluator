export const config = {
  api: {
    bodyParser: { sizeLimit: "8mb" },
  },
};

// Proxies to Grok via Vercel AI Gateway (OIDC) or a direct xAI key.
// Returns Anthropic-shaped { content: [{ type: "text", text }] } so the
// frontend does not need changes.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const apiKey =
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN ||
    process.env.XAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: {
        message:
          "Missing AI auth. Run `vercel env pull .env.local` or set XAI_API_KEY.",
      },
    });
  }

  const useGateway = !!(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  );
  const baseUrl = useGateway
    ? "https://ai-gateway.vercel.sh/v1"
    : "https://api.x.ai/v1";
  const model = useGateway
    ? "xai/grok-4.1-fast-non-reasoning"
    : "grok-4-1-fast-non-reasoning";

  try {
    const { content } = req.body || {};
    if (!content) {
      return res
        .status(400)
        .json({ error: { message: "Missing 'content' in request body" } });
    }

    const openAiContent = toOpenAiContent(content);
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: "user", content: openAiContent }],
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const message =
        data?.error?.message ||
        data?.message ||
        JSON.stringify(data) ||
        "Upstream error";
      return res.status(upstream.status).json({ error: { message } });
    }

    const text = data?.choices?.[0]?.message?.content ?? "";
    return res.status(200).json({
      content: [{ type: "text", text }],
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: { message: err?.message || "Proxy error" } });
  }
}

function toOpenAiContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");

  return content.map((block) => {
    if (block?.type === "text") {
      return { type: "text", text: block.text ?? "" };
    }
    if (block?.type === "image" && block.source?.data) {
      const mime = block.source.media_type || "image/jpeg";
      return {
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${block.source.data}`,
          detail: "high",
        },
      };
    }
    if (block?.type === "image_url") return block;
    return { type: "text", text: JSON.stringify(block) };
  });
}
