import { env } from "../../../config/env";

export class NimGenerationError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
    this.name = "NimGenerationError";
  }
}

type NimOptions = {
  prompt: string;
  maxTokens: number;
  temperature?: number;
  json?: boolean;
};

function endpoint() {
  return `${env.NVIDIA_NIM_BASE_URL.replace(/\/$/, "")}/chat/completions`;
}

export function nimConfigured() {
  return !!env.NVIDIA_NIM_API_KEY;
}

export async function generateWithNim({ prompt, maxTokens, temperature = 0.35, json = false }: NimOptions) {
  if (!env.NVIDIA_NIM_API_KEY) throw new NimGenerationError("NVIDIA_NIM_API_KEY não configurada.", false);

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.NVIDIA_NIM_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.NVIDIA_NIM_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature,
        top_p: 0.95,
        max_tokens: maxTokens,
        stream: false,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        extra_body: { chat_template_kwargs: { enable_thinking: false } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha de rede";
    throw new NimGenerationError(`NIM indisponível: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new NimGenerationError(`NIM retornou HTTP ${response.status}: ${body.slice(0, 500)}`, response.status === 408 || response.status === 429 || response.status >= 500);
  }

  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new NimGenerationError("NIM não retornou conteúdo.");
  return content;
}
