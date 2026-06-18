import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import { createLoggingSink, createWebhookSink } from "../src/handoff/sink.js";

const silent = pino({ level: "silent" });

const intent = {
  kind: "ticket.propuesto",
  data: { titulo: "Arreglar login" },
  chatId: "c@s.whatsapp.net",
};

describe("createLoggingSink", () => {
  it("loguea la intencion sin lanzar", async () => {
    const sink = createLoggingSink(silent);
    await expect(sink.emit(intent)).resolves.toBeUndefined();
  });
});

describe("createWebhookSink", () => {
  it("hace POST con la intencion serializada", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const sink = createWebhookSink({
      url: "https://hook.test/in",
      logger: silent,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await sink.emit(intent);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hook.test/in");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual(intent);
  });

  it("reintenta ante respuesta no-2xx y luego tiene exito", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const sleep = vi.fn(async () => {});
    const sink = createWebhookSink({
      url: "https://hook.test/in",
      logger: silent,
      retries: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: sleep,
    });

    await sink.emit(intent);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("reintenta ante error de red y agota sin lanzar", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const sleep = vi.fn(async () => {});
    const sink = createWebhookSink({
      url: "https://hook.test/in",
      logger: silent,
      retries: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: sleep,
    });

    await expect(sink.emit(intent)).resolves.toBeUndefined();
    // 1 intento + 2 reintentos.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
