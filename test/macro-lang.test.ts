import { describe, expect, it, vi } from "vitest";
import type { Context } from "../src/engine/types.js";
import { MacroLangError, compile, parse } from "../src/macro-lang/index.js";

function msg(text: string) {
  return {
    id: "1",
    chatId: "c@s.whatsapp.net",
    sender: "bob@s.whatsapp.net",
    senderName: "Bob",
    fromMe: false,
    isGroup: false,
    text,
    type: "text" as const,
    timestamp: 0,
    raw: {} as never,
  };
}

// ctx falso: captura acciones y devuelve una respuesta de IA fija. El estado es
// un Map en memoria.
function fakeCtx(text: string, aiResponse = "") {
  const calls: Array<{ fn: string; arg?: unknown; arg2?: unknown }> = [];
  const store = new Map<string, unknown>();
  const ai = vi.fn(async () => aiResponse);
  const ctx = {
    message: msg(text),
    ai,
    reply: async (t: string) => void calls.push({ fn: "reply", arg: t }),
    propose: async (t: string) => void calls.push({ fn: "propose", arg: t }),
    react: async (e: string) => void calls.push({ fn: "react", arg: e }),
    emit: async (k: string, d: unknown) =>
      void calls.push({ fn: "emit", arg: k, arg2: d }),
    state: {
      get: (k: string) => store.get(k),
      set: (k: string, v: unknown) => store.set(k, v),
    },
  } as unknown as Context;
  return { ctx, calls, store, ai };
}

describe("parse", () => {
  it("parsea cabecera, when y un paso", () => {
    const ast = parse('on message when text contains "hola":\n  propose "hey"');
    expect(ast.when).toMatchObject({ t: "cmp", op: "contains" });
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0]).toMatchObject({ t: "say", kind: "propose" });
  });

  it("when es null cuando se omite", () => {
    const ast = parse('on message:\n  reply "ok"');
    expect(ast.when).toBeNull();
  });

  it("ignora comentarios y lineas vacias", () => {
    const ast = parse('# hola\non message:\n\n  # paso\n  stop');
    expect(ast.body).toEqual([{ t: "stop" }]);
  });

  it("parsea if/else anidado", () => {
    const ast = parse(
      ['on message:', '  if text contains "x":', '    reply "si"', '  else:', '    reply "no"'].join("\n"),
    );
    const step = ast.body[0] as Extract<typeof ast.body[number], { t: "if" }>;
    expect(step.t).toBe("if");
    expect(step.then).toHaveLength(1);
    expect(step.otherwise).toHaveLength(1);
  });

  it("falla con numero de linea ante token sobrante", () => {
    expect(() => parse('on message:\n  reply "a" "b"')).toThrow(/linea 2/);
  });

  it("falla si falta el cuerpo", () => {
    expect(() => parse("on message:")).toThrow(MacroLangError);
  });

  it("rechaza tabs en la indentacion", () => {
    expect(() => parse("on message:\n\treply \"x\"")).toThrow(/tabs/);
  });
});

describe("compile - matcher (when)", () => {
  it("contains y matches funcionan", () => {
    const a = compile('on message when text contains "factura":\n  stop');
    expect(a.match(msg("mandame la FACTURA"))).toBe(true);
    expect(a.match(msg("hola"))).toBe(false);

    const b = compile("on message when text matches /fact\\w+/i:\n  stop");
    expect(b.match(msg("FACTURACION"))).toBe(true);
  });

  it("combina or/and/not", () => {
    const a = compile('on message when text contains "uno" or text contains "dos":\n  stop');
    expect(a.match(msg("solo dos"))).toBe(true);
    expect(a.match(msg("hola mundo"))).toBe(false);
  });

  it("rechaza condiciones de estado en el when", () => {
    expect(() => compile('on message when state "x" == "y":\n  stop')).toThrow(
      /when/,
    );
  });
});

describe("compile - run (body)", () => {
  it("propose con template interpola variables del mensaje", async () => {
    const { ctx, calls } = fakeCtx("necesito ayuda");
    await compile('on message:\n  propose "Hola {{senderName}}: {{text}}"').run(ctx);
    expect(calls).toEqual([
      { fn: "propose", arg: "Hola Bob: necesito ayuda" },
    ]);
  });

  it("ask ai json + if/else ramifica segun el resultado", async () => {
    const json = '{"claro":true,"titulo":"Arreglar login"}';
    const { ctx, calls, ai } = fakeCtx("arreglen el login", json);
    const src = [
      "on message:",
      '  ask ai json "clasifica: {{text}}" -> r',
      "  if r.claro:",
      '    emit "ticket.propuesto"',
      "  else:",
      '    propose "falta info"',
    ].join("\n");
    await compile(src).run(ctx);
    expect(ai).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      { fn: "emit", arg: "ticket.propuesto", arg2: { text: "arreglen el login" } },
    ]);
  });

  it("toma la rama else cuando la condicion es falsa", async () => {
    const { ctx, calls } = fakeCtx("hola", '{"claro":false,"faltaInfo":["usuario","fecha"]}');
    const src = [
      "on message:",
      '  ask ai json "x" -> r',
      "  if r.claro:",
      '    emit "t"',
      "  else:",
      '    propose "falta: {{r.faltaInfo}}"',
    ].join("\n");
    await compile(src).run(ctx);
    expect(calls).toEqual([{ fn: "propose", arg: "falta: usuario, fecha" }]);
  });

  it("set escribe en el estado y la condicion lo lee", async () => {
    const { ctx, calls, store } = fakeCtx("hola");
    const src = [
      "on message:",
      '  set "saludado" = true',
      '  if state "saludado" == true:',
      '    reply "ya te salude"',
    ].join("\n");
    await compile(src).run(ctx);
    expect(store.get("saludado")).toBe(true);
    expect(calls).toEqual([{ fn: "reply", arg: "ya te salude" }]);
  });

  it("stop corta la ejecucion del cuerpo", async () => {
    const { ctx, calls } = fakeCtx("hola");
    await compile('on message:\n  stop\n  reply "no deberia"').run(ctx);
    expect(calls).toEqual([]);
  });
});
