import { randomUUID } from "node:crypto";
import { MacroLangError, compile } from "../macro-lang/index.js";
import type { Macro } from "./types.js";

// Macros creadas desde la consola. Cada una es codigo del lenguaje de macros
// (DSL) guardado como texto. El store valida que parsee y lo compila a una Macro
// normal en runtime, asi el motor no distingue su origen y el read-only / handoff
// las cubren igual.

export interface MacroDef {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  stop: boolean;
  source: string; // codigo DSL
}

export interface MacroDefInput {
  name: string;
  source: string;
  enabled?: boolean;
  priority?: number;
  stop?: boolean;
}

export class MacroDefError extends Error {}

// Valida y normaliza una definicion entrante. Lanza MacroDefError con un mensaje
// claro si el nombre falta o el source no compila (lo usa la consola para el 400).
export function normalizeDef(input: MacroDefInput): Omit<MacroDef, "id"> {
  const name = (input.name ?? "").trim();
  if (!name) throw new MacroDefError("la macro necesita un nombre");
  if (name.startsWith("dyn:")) {
    throw new MacroDefError('el nombre no puede empezar con "dyn:"');
  }

  const source = (input.source ?? "").trim();
  if (!source) throw new MacroDefError("la macro necesita codigo");
  try {
    compile(source); // valida sintaxis y semantica del when
  } catch (err) {
    if (err instanceof MacroLangError) throw new MacroDefError(err.message);
    throw err;
  }

  return {
    name,
    enabled: input.enabled ?? true,
    priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
    stop: input.stop ?? true,
    source,
  };
}

// Compila una definicion a una Macro ejecutable. El nombre lleva el prefijo
// "dyn:" para que el motor pueda distinguir y reemplazar solo las dinamicas.
export function compileMacro(def: MacroDef): Macro {
  const compiled = compile(def.source);
  return {
    name: `dyn:${def.id}`,
    priority: def.priority,
    stop: def.stop,
    match: compiled.match,
    run: compiled.run,
  };
}

export interface MacroStore {
  list(): MacroDef[];
  get(id: string): MacroDef | undefined;
  create(input: MacroDefInput): MacroDef;
  update(id: string, patch: Partial<MacroDefInput>): MacroDef | undefined;
  remove(id: string): boolean;
  // Notifica cuando cambia el set (para re-sincronizar el motor). Devuelve el
  // desuscriptor.
  subscribe(listener: () => void): () => void;
}

// Store en memoria de las macros. Igual que ChatMemory/ChatState, la interfaz
// permite enchufar una version persistente mas adelante.
export function createMacroStore(seed: MacroDef[] = []): MacroStore {
  const defs = new Map<string, MacroDef>();
  for (const d of seed) defs.set(d.id, d);
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of listeners) l();
  };

  return {
    list() {
      return [...defs.values()];
    },
    get(id) {
      return defs.get(id);
    },
    create(input) {
      const def: MacroDef = { id: randomUUID(), ...normalizeDef(input) };
      defs.set(def.id, def);
      notify();
      return def;
    },
    update(id, patch) {
      const current = defs.get(id);
      if (!current) return undefined;
      const merged: MacroDef = { id, ...normalizeDef({ ...current, ...patch }) };
      defs.set(id, merged);
      notify();
      return merged;
    },
    remove(id) {
      const existed = defs.delete(id);
      if (existed) notify();
      return existed;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
