// 6-provider fallback chain — tries each in order, skips on rate limit / error
// All providers use OpenAI-compatible chat completions format

const PROVIDERS = [
  {
    name: "NVIDIA NIM (GLM-5)",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: () => process.env.NVIDIA_API_KEY,
    model: "zai-org/glm-5",
    headers: (key) => ({ "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }),
  },
  {
    name: "Cerebras (GPT-OSS 120B)",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: () => process.env.CEREBRAS_API_KEY,
    model: "gpt-oss-120b",
    headers: (key) => ({ "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }),
  },
  {
    name: "Groq (Kimi K2)",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => process.env.GROQ_API_KEY,
    model: "moonshotai/kimi-k2-instruct",
    headers: (key) => ({ "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }),
  },
  {
    name: "Google Gemini 2.5 Flash",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: () => process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash",
    headers: (key) => ({ "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }),
  },
  {
    name: "Z.ai GLM-4.7 Flash",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    key: () => process.env.ZAI_API_KEY,
    model: "glm-4-flash",
    headers: (key) => ({ "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }),
  },
  {
    name: "OpenRouter GLM-4.5-Air (free)",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env.OPENROUTER_API_KEY,
    model: "z-ai/glm-4.5-air:free",
    headers: (key) => ({
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://deutsch-tutor.vercel.app",
      "X-Title": "Deutsch Tutor",
    }),
  },
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, system, max_tokens = 2000 } = req.body;

  // Build messages array — handle both Anthropic-style (system separate) and OpenAI-style
  const builtMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  let lastError = null;

  for (const provider of PROVIDERS) {
    const key = provider.key();
    if (!key) continue; // skip if env var not set

    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: provider.headers(key),
        body: JSON.stringify({
          model: provider.model,
          messages: builtMessages,
          max_tokens,
          temperature: 0.7,
        }),
      });

      // Skip to next provider on rate limit or server error
      if (response.status === 429 || response.status === 503 || response.status === 502) {
        lastError = `${provider.name}: ${response.status}`;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        lastError = `${provider.name}: ${response.status} ${errText.slice(0, 100)}`;
        continue;
      }

      const data = await response.json();

      // Normalise response — all providers return choices[0].message.content
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = `${provider.name}: empty response`;
        continue;
      }

      // Return in Anthropic-compatible format so frontend doesn't need to change
      return res.status(200).json({
        content: [{ type: "text", text: content }],
        provider: provider.name,
      });

    } catch (err) {
      lastError = `${provider.name}: ${err.message}`;
      continue;
    }
  }

  // All providers failed
  return res.status(503).json({
    error: "All providers unavailable",
    detail: lastError,
  });
}
