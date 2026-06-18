import { describe, expect, it, vi } from "vitest";
import {
  MacroDefError,
  compileMacro,
  createMacroStore,
  normalizeDef,
  type MacroDef,
} from "../src/engine/macro-store.js";

const SRC = 'on message when text contains "hola":\n  propose "hey"';

describe("normalizeDef", () => {
  it("rellena defaults (enabled, priority, stop)", () => {
    const def = normalizeDef({ name: "saludo", source: SRC });
    expect(def).toMatchObject({ enabled: true, priority: 0, stop: true });
    expect(def.source).toBe(SRC);
  });

  it("rechaza nombre vacio", () => {
    expect(() => normalizeDef({ name: "  ", source: SRC })).toThrow(MacroDefError);
  });

  it('rechaza nombre con prefijo reservado "dyn:"', () => {
    expect(() => normalizeDef({ name: "dyn:x", source: SRC })).toThrow(
      MacroDefError,
    );
  });

  it("rechaza source vacio", () => {
    expect(() => normalizeDef({ name: "x", source: "  " })).toThrow(/codigo/);
  });

  it("rechaza source que no compila, con MacroDefError", () => {
    expect(() => normalizeDef({ name: "x", source: "on message:" })).toThrow(
      MacroDefError,
    );
  });
});

describe("compileMacro", () => {
  const base: MacroDef = {
    id: "abc",
    name: "x",
    enabled: true,
    priority: 5,
    stop: false,
    source: SRC,
  };

  it("usa prefijo dyn: y conserva prioridad/stop", () => {
    const macro = compileMacro(base);
    expect(macro.name).toBe("dyn:abc");
    expect(macro.priority).toBe(5);
    expect(macro.stop).toBe(false);
  });

  it("el matcher refleja el when del source", () => {
    const macro = compileMacro(base);
    expect(macro.match({ text: "hola que tal" } as never)).toBe(true);
    expect(macro.match({ text: "chau" } as never)).toBe(false);
  });
});

describe("createMacroStore", () => {
  const input = { name: "saludo", source: SRC };

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

  it("rechaza update con source invalido", () => {
    const store = createMacroStore();
    const def = store.create(input);
    expect(() => store.update(def.id, { source: "on message:" })).toThrow(
      MacroDefError,
    );
  });

  it("elimina por id", () => {
    const store = createMacroStore();
    const def = store.create(input);
    expect(store.remove(def.id)).toBe(true);
    expect(store.remove(def.id)).toBe(false);
    expect(store.list()).toHaveLength(0);
  });
});
