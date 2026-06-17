import type { LLMInput, LLMProvider, LLMResult } from "../types.js";

export interface OpenCodeOptions {
  apiKey: string;
  // Base URL del proveedor. El adapter agrega "/chat/completions".
  baseUrl?: string;
  // Modelo por defecto si el input no especifica uno.
  model?: string;
  // fetch inyectable para tests; por defecto el global.
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
}

// Adapter para OpenCode Go. Es OpenAI-compatible y solo expone el endpoint
// /chat/completions, asi que hablamos ese protocolo con fetch directo (sin SDK).
export function createOpenCodeProvider(opts: OpenCodeOptions): LLMProvider {
  const baseUrl = (opts.baseUrl ?? "https://opencode.ai/zen/go/v1").replace(
    /\/+$/,
    "",
  );
  const defaultModel = opts.model ?? "kimi-k2.7-code";
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    name: "opencode",
    async complete(input: LLMInput): Promise<LLMResult> {
      const model = input.model ?? defaultModel;

      const res = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          ...(input.temperature !== undefined
            ? { temperature: input.temperature }
            : {}),
          ...(input.maxTokens !== undefined
            ? { max_tokens: input.maxTokens }
            : {}),
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `opencode respondio ${res.status}: ${detail.slice(0, 200)}`,
        );
      }

      const data = (await res.json()) as ChatCompletionResponse;
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        model: data.model ?? model,
        raw: data,
      };
    },
  };
}
