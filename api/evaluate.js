import { getVercelOidcToken } from "@vercel/oidc";

export const config = {
  api: {
    bodyParser: { sizeLimit: "8mb" },
  },
  maxDuration: 60,
};

// Proxies to Grok via Vercel AI Gateway (OIDC) or a direct xAI key.
// Returns Anthropic-shaped { content: [{ type: "text", text }] } so the
// frontend does not need changes.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  let apiKey =
    process.env.AI_GATEWAY_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN ||
    null;

  if (!apiKey) {
    try {
      apiKey = await getVercelOidcToken();
    } catch {
      apiKey = null;
    }
  }

  if (!apiKey) {
    return res.status(500).json({
      error: {
        message:
          "Missing AI auth. Set AI_GATEWAY_API_KEY / XAI_API_KEY, or deploy on Vercel with AI Gateway OIDC.",
      },
    });
  }

  const useDirectXai = !!process.env.XAI_API_KEY && !process.env.AI_GATEWAY_API_KEY;
  const baseUrl = useDirectXai
    ? "https://api.x.ai/v1"
    : "https://ai-gateway.vercel.sh/v1";
  const model = useDirectXai
    ? "grok-4-1-fast-non-reasoning"
    : "xai/grok-4.1-fast-non-reasoning";

  try {
    const { content } = req.body || {};
    if (!content) {
      return res
        .status(400)
        .json({ error: { message: "Missing 'content' in request body" } });
    }

    const openAiContent = toOpenAiContent(content);
    const hasImage = Array.isArray(openAiContent)
      ? openAiContent.some((b) => b?.type === "image_url")
      : false;

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: hasImage ? 2500 : 1500,
        temperature: 0.4,
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
