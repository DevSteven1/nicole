import { describe, expect, it } from "vitest";
import { createOpenCodeProvider } from "../src/llm/adapters/opencode.js";

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("opencode provider", () => {
  it("arma la request OpenAI-compatible y parsea la respuesta", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse({
        model: "kimi-k2.7-code",
        choices: [{ message: { content: "hola" } }],
      });
    }) as unknown as typeof fetch;

    const provider = createOpenCodeProvider({ apiKey: "secret", fetchImpl });
    const res = await provider.complete({
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.text).toBe("hola");
    expect(res.model).toBe("kimi-k2.7-code");
    expect(captured?.url).toBe(
      "https://opencode.ai/zen/go/v1/chat/completions",
    );

    const headers = captured?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret");

    const body = JSON.parse(String(captured?.init.body));
    expect(body.model).toBe("kimi-k2.7-code");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("lanza un error si la API responde con fallo", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: "nope" }, {
        ok: false,
        status: 401,
      })) as unknown as typeof fetch;

    const provider = createOpenCodeProvider({ apiKey: "x", fetchImpl });

    await expect(
      provider.complete({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/401/);
  });
});
