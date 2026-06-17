import { pino } from "pino";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/engine/types.js";
import { parseTriage, triage } from "../src/rules/triage.js";

const silent = pino({ level: "silent" });

describe("parseTriage", () => {
  it("parsea JSON plano", () => {
    const r = parseTriage(
      '{"esPedido":true,"claro":true,"esNuevo":true,"ticket":{"titulo":"t","descripcion":"d","tipo":"Soporte"},"faltaInfo":[]}',
    );
    expect(r?.esPedido).toBe(true);
    expect(r?.ticket?.tipo).toBe("Soporte");
  });

  it("tolera bloques de codigo ```json y texto alrededor", () => {
    const r = parseTriage(
      'Claro, aca tenes:\n```json\n{"esPedido":false,"claro":false,"esNuevo":false,"ticket":null,"faltaInfo":[]}\n```',
    );
    expect(r?.esPedido).toBe(false);
    expect(r?.ticket).toBeNull();
  });

  it("asume esNuevo=true si la IA lo omite", () => {
    const r = parseTriage(
      '{"esPedido":true,"claro":true,"ticket":{"titulo":"t","descripcion":"d","tipo":"Tarea"},"faltaInfo":[]}',
    );
    expect(r?.esNuevo).toBe(true);
  });

  it("devuelve null si no hay JSON", () => {
    expect(parseTriage("no se que decir")).toBeNull();
  });
});

interface FakeOptions {
  text?: string;
  openTickets?: Array<{ titulo: string; descripcion: string; tipo: string }>;
}

// Construye un ctx falso minimo capturando emit/propose/state y devolviendo una
// respuesta de IA fija.
function fakeCtx(aiResponse: string, opts: FakeOptions = {}) {
  const emits: Array<{ kind: string; data: unknown }> = [];
  const proposals: string[] = [];
  const store = new Map<string, unknown>();
  if (opts.openTickets) store.set("ticketsAbiertos", opts.openTickets);
  const text = opts.text ?? "necesito que arreglen el login";

  const ctx = {
    message: { text, chatId: "c@s.whatsapp.net" },
    memory: [{ sender: "cli", text, timestamp: 0 }],
    llm: {},
    logger: silent,
    ai: async () => aiResponse,
    emit: async (kind: string, data: unknown) => {
      emits.push({ kind, data });
    },
    propose: async (t: string) => {
      proposals.push(t);
    },
    state: {
      get: (key: string) => store.get(key),
      set: (key: string, value: unknown) => store.set(key, value),
    },
  } as unknown as Context;

  return { ctx, emits, proposals, store };
}

describe("triage macro", () => {
  it("emite ticket.propuesto cuando el pedido esta claro y es nuevo", async () => {
    const { ctx, emits, proposals, store } = fakeCtx(
      '{"esPedido":true,"claro":true,"esNuevo":true,"ticket":{"titulo":"Arreglar login","descripcion":"el login falla","tipo":"Soporte"},"faltaInfo":[]}',
    );
    await triage.run(ctx);
    expect(emits).toHaveLength(1);
    expect(emits[0]?.kind).toBe("ticket.propuesto");
    expect(proposals).toHaveLength(0);
    // Recuerda el ticket en el estado del chat.
    expect((store.get("ticketsAbiertos") as unknown[]).length).toBe(1);
  });

  it("NO re-emite si el pedido ya esta cubierto por un ticket abierto", async () => {
    const { ctx, emits } = fakeCtx(
      '{"esPedido":true,"claro":true,"esNuevo":false,"ticket":{"titulo":"Arreglar login","descripcion":"el login falla","tipo":"Soporte"},"faltaInfo":[]}',
      {
        openTickets: [
          { titulo: "Arreglar login", descripcion: "el login falla", tipo: "Soporte" },
        ],
      },
    );
    await triage.run(ctx);
    expect(emits).toHaveLength(0);
  });

  it("emite si es un pedido nuevo distinto a los ya abiertos", async () => {
    const { ctx, emits } = fakeCtx(
      '{"esPedido":true,"claro":true,"esNuevo":true,"ticket":{"titulo":"Crear reporte","descripcion":"falta un reporte","tipo":"Tarea"},"faltaInfo":[]}',
      {
        openTickets: [
          { titulo: "Arreglar login", descripcion: "el login falla", tipo: "Soporte" },
        ],
      },
    );
    await triage.run(ctx);
    expect(emits).toHaveLength(1);
  });

  it("propone pedir mas datos cuando el pedido no esta claro", async () => {
    const { ctx, emits, proposals } = fakeCtx(
      '{"esPedido":true,"claro":false,"esNuevo":true,"ticket":null,"faltaInfo":["que usuario","desde cuando"]}',
    );
    await triage.run(ctx);
    expect(emits).toHaveLength(0);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toContain("que usuario");
  });

  it("no hace nada cuando no es un pedido", async () => {
    const { ctx, emits, proposals } = fakeCtx(
      '{"esPedido":false,"claro":false,"esNuevo":false,"ticket":null,"faltaInfo":[]}',
      { text: "buenas, gracias por todo" },
    );
    await triage.run(ctx);
    expect(emits).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });
});
