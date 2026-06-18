import { describe, expect, it, vi } from "vitest";
import type { Context } from "../src/engine/types.js";
import {
  MacroDefError,
  compileMacro,
  createMacroStore,
  normalizeDef,
  type MacroDef,
} from "../src/engine/macro-store.js";

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

// ctx falso que captura las acciones que dispara la macro compilada.
function fakeCtx(text: string) {
  const calls: Array<{ fn: string; arg: unknown; arg2?: unknown }> = [];
  const ctx = {
    message: msg(text),
    reply: async (t: string) => void calls.push({ fn: "reply", arg: t }),
    propose: async (t: string) => void calls.push({ fn: "propose", arg: t }),
    react: async (e: string) => void calls.push({ fn: "react", arg: e }),
    emit: async (k: string, d: unknown) =>
      void calls.push({ fn: "emit", arg: k, arg2: d }),
  } as unknown as Context;
  return { ctx, calls };
}

describe("normalizeDef", () => {
  it("rellena defaults (enabled, priority, stop)", () => {
    const def = normalizeDef({
      name: "saludo",
      match: { kind: "contains", value: "hola" },
      action: { kind: "propose", text: "hey" },
    });
    expect(def).toMatchObject({ enabled: true, priority: 0, stop: true });
  });

  it("rechaza nombre vacio", () => {
    expect(() =>
      normalizeDef({
        name: "  ",
        match: { kind: "always" },
        action: { kind: "propose", text: "x" },
      }),
    ).toThrow(MacroDefError);
  });

  it('rechaza nombre con prefijo reservado "dyn:"', () => {
    expect(() =>
      normalizeDef({
        name: "dyn:hack",
        match: { kind: "always" },
        action: { kind: "propose", text: "x" },
      }),
    ).toThrow(MacroDefError);
  });

  it("rechaza matcher sin valor cuando lo necesita", () => {
    expect(() =>
      normalizeDef({
        name: "m",
        match: { kind: "contains", value: "" },
        action: { kind: "propose", text: "x" },
      }),
    ).toThrow(/valor/);
  });

  it("rechaza regex invalida", () => {
    expect(() =>
      normalizeDef({
        name: "m",
        match: { kind: "regex", value: "(" },
        action: { kind: "propose", text: "x" },
      }),
    ).toThrow(/regular/);
  });

  it("rechaza emit sin tipo y react sin emoji", () => {
    expect(() =>
      normalizeDef({
        name: "m",
        match: { kind: "always" },
        action: { kind: "emit", kindName: "" },
      }),
    ).toThrow(MacroDefError);
    expect(() =>
      normalizeDef({
        name: "m",
        match: { kind: "always" },
        action: { kind: "react", emoji: "" },
      }),
    ).toThrow(MacroDefError);
  });
});

describe("compileMacro", () => {
  const base: MacroDef = {
    id: "abc",
    name: "x",
    enabled: true,
    priority: 5,
    stop: true,
    match: { kind: "contains", value: "hola" },
    action: { kind: "propose", text: "hey" },
  };

  it("usa prefijo dyn: en el nombre y conserva prioridad/stop", () => {
    const macro = compileMacro(base);
    expect(macro.name).toBe("dyn:abc");
    expect(macro.priority).toBe(5);
    expect(macro.stop).toBe(true);
  });

  it("compila el matcher contains", () => {
    const macro = compileMacro(base);
    expect(macro.match(msg("ey HOLA que tal"))).toBe(true);
    expect(macro.match(msg("chau"))).toBe(false);
  });

  it("renderiza la plantilla con datos del mensaje", async () => {
    const macro = compileMacro({
      ...base,
      action: { kind: "reply", text: "Hola {{senderName}}, dijiste: {{text}}" },
    });
    const { ctx, calls } = fakeCtx("necesito ayuda");
    await macro.run(ctx);
    expect(calls).toEqual([
      { fn: "reply", arg: "Hola Bob, dijiste: necesito ayuda" },
    ]);
  });

  it("emit manda el kind y el texto del mensaje", async () => {
    const macro = compileMacro({
      ...base,
      action: { kind: "emit", kindName: "ticket.propuesto" },
    });
    const { ctx, calls } = fakeCtx("arreglen el login");
    await macro.run(ctx);
    expect(calls[0]).toEqual({
      fn: "emit",
      arg: "ticket.propuesto",
      arg2: { text: "arreglen el login" },
    });
  });
});

describe("createMacroStore", () => {
  const input = {
    name: "saludo",
    match: { kind: "contains" as const, value: "hola" },
    action: { kind: "propose" as const, text: "hey" },
  };

  it("crea con id y notifica a los suscriptores", () => {
    const store = createMacroStore();
    const onChange = vi.fn();
    store.subscribe(onChange);
    const def = store.create(input);
    expect(def.id).toBeTruthy();
    expect(store.list()).toHaveLength(1);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("actualiza por id revalidando", () => {
    const store = createMacroStore();
    const def = store.create(input);
    const updated = store.update(def.id, { enabled: false });
    expect(updated?.enabled).toBe(false);
    expect(store.get(def.id)?.enabled).toBe(false);
  });

  it("elimina por id", () => {
    const store = createMacroStore();
    const def = store.create(input);
    expect(store.remove(def.id)).toBe(true);
    expect(store.remove(def.id)).toBe(false);
    expect(store.list()).toHaveLength(0);
  });
});
