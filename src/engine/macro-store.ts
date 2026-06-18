import { randomUUID } from "node:crypto";
import {
  always,
  contains,
  prefix as prefixMatcher,
  regex,
  text,
} from "./matchers.js";
import type { Macro, Matcher } from "./types.js";

// Macros creadas desde la consola web. A diferencia de las macros base (codigo
// en src/rules), estas son DECLARATIVAS: se describen con datos (que matchea,
// que accion dispara) y se compilan a una Macro normal en runtime. Asi el motor
// no distingue su origen y el read-only / handoff las cubren igual.

export type MatcherKind =
  | "always"
  | "equals"
  | "contains"
  | "prefix"
  | "regex";

export interface MatcherDef {
  kind: MatcherKind;
  // Valor para equals/contains/prefix/regex. Ignorado en "always".
  value?: string;
  // Flags de la regex (ej. "i"). Solo para kind "regex".
  flags?: string;
}

export type ActionKind = "reply" | "propose" | "react" | "emit";

export interface ActionDef {
  kind: ActionKind;
  // Plantilla de texto para reply/propose. Soporta {{text}}, {{sender}},
  // {{senderName}}, {{chatId}}.
  text?: string;
  // Emoji para react.
  emoji?: string;
  // Tipo de intencion para emit (ej. "ticket.propuesto").
  kindName?: string;
}

export interface MacroDef {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  stop: boolean;
  match: MatcherDef;
  action: ActionDef;
}

// Entrada para crear: sin id, con defaults razonables.
export interface MacroDefInput {
  name: string;
  enabled?: boolean;
  priority?: number;
  stop?: boolean;
  match: MatcherDef;
  action: ActionDef;
}

export class MacroDefError extends Error {}

// Valida y normaliza una definicion entrante. Lanza MacroDefError con un mensaje
// claro si algo no cierra (lo usa la API web para responder 400).
export function normalizeDef(input: MacroDefInput): Omit<MacroDef, "id"> {
  const name = (input.name ?? "").trim();
  if (!name) throw new MacroDefError("la macro necesita un nombre");
  if (name.startsWith("dyn:")) {
    throw new MacroDefError('el nombre no puede empezar con "dyn:"');
  }

  const match = normalizeMatch(input.match);
  const action = normalizeAction(input.action);

  return {
    name,
    enabled: input.enabled ?? true,
    priority: Number.isFinite(input.priority) ? Number(input.priority) : 0,
    stop: input.stop ?? true,
    match,
    action,
  };
}

function normalizeMatch(m: MatcherDef | undefined): MatcherDef {
  if (!m) throw new MacroDefError("falta el matcher");
  const kind = m.kind;
  if (kind === "always") return { kind };
  const value = (m.value ?? "").trim();
  if (!value) throw new MacroDefError(`el matcher "${kind}" necesita un valor`);
  if (kind === "regex") {
    try {
      new RegExp(value, m.flags || undefined);
    } catch {
      throw new MacroDefError("la expresion regular no es valida");
    }
    return { kind, value, flags: m.flags || undefined };
  }
  return { kind, value };
}

function normalizeAction(a: ActionDef | undefined): ActionDef {
  if (!a) throw new MacroDefError("falta la accion");
  switch (a.kind) {
    case "reply":
    case "propose": {
      const txt = (a.text ?? "").trim();
      if (!txt) throw new MacroDefError("la accion necesita un texto");
      return { kind: a.kind, text: txt };
    }
    case "react": {
      const emoji = (a.emoji ?? "").trim();
      if (!emoji) throw new MacroDefError("la reaccion necesita un emoji");
      return { kind: "react", emoji };
    }
    case "emit": {
      const kindName = (a.kindName ?? "").trim();
      if (!kindName) throw new MacroDefError("el emit necesita un tipo (kind)");
      return { kind: "emit", kindName };
    }
    default:
      throw new MacroDefError("accion desconocida");
  }
}

// Rellena {{text}}, {{sender}}, {{senderName}}, {{chatId}} con datos del mensaje.
function render(
  template: string,
  msg: { text: string; sender: string; senderName?: string; chatId: string },
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    switch (key) {
      case "text":
        return msg.text;
      case "sender":
        return msg.sender;
      case "senderName":
        return msg.senderName ?? msg.sender;
      case "chatId":
        return msg.chatId;
      default:
        return whole;
    }
  });
}

function compileMatcher(m: MatcherDef): Matcher {
  switch (m.kind) {
    case "always":
      return always();
    case "equals":
      return text(m.value ?? "");
    case "contains":
      return contains(m.value ?? "");
    case "prefix":
      return prefixMatcher(m.value ?? "");
    case "regex":
      return regex(new RegExp(m.value ?? "", m.flags || undefined));
  }
}

// Compila una definicion a una Macro ejecutable. El nombre lleva el prefijo
// "dyn:" para que el motor pueda distinguir y reemplazar solo las dinamicas.
export function compileMacro(def: MacroDef): Macro {
  const match = compileMatcher(def.match);
  const action = def.action;

  return {
    name: `dyn:${def.id}`,
    priority: def.priority,
    stop: def.stop,
    match,
    run: async (ctx) => {
      const msg = ctx.message;
      switch (action.kind) {
        case "reply":
          await ctx.reply(render(action.text ?? "", msg));
          break;
        case "propose":
          await ctx.propose(render(action.text ?? "", msg));
          break;
        case "react":
          await ctx.react(action.emoji ?? "");
          break;
        case "emit":
          await ctx.emit(action.kindName ?? "custom", { text: msg.text });
          break;
      }
    },
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

// Store en memoria de las macros declarativas. Igual que ChatMemory/ChatState,
// la interfaz permite enchufar una version persistente mas adelante.
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
      const merged: MacroDef = {
        id,
        ...normalizeDef({ ...current, ...patch }),
      };
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
