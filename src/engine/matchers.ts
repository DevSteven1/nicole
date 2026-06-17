import type { MessageType } from "../whatsapp/types.js";
import type { Matcher } from "./types.js";

const norm = (s: string): string => s.trim().toLowerCase();

// Texto exacto (ignora mayusculas y espacios al borde).
export const text = (value: string): Matcher => {
  const target = norm(value);
  return (msg) => norm(msg.text) === target;
};

// El texto contiene la subcadena.
export const contains = (value: string): Matcher => {
  const needle = norm(value);
  return (msg) => norm(msg.text).includes(needle);
};

// Empieza con un prefijo (util para comandos: "!ping").
export const prefix = (value: string): Matcher => {
  const p = norm(value);
  return (msg) => norm(msg.text).startsWith(p);
};

// El texto matchea una expresion regular.
export const regex = (re: RegExp): Matcher => (msg) => re.test(msg.text);

// Tipo de contenido (image, audio, ...).
export const ofType = (type: MessageType): Matcher => (msg) => msg.type === type;

export const fromGroup = (): Matcher => (msg) => msg.isGroup;
export const fromDM = (): Matcher => (msg) => !msg.isGroup;

// Matchea siempre (catch-all). Util como ultima macro con baja prioridad.
export const always = (): Matcher => () => true;

// Combinadores.
export const and =
  (...ms: Matcher[]): Matcher =>
  (msg) =>
    ms.every((m) => m(msg));

export const or =
  (...ms: Matcher[]): Matcher =>
  (msg) =>
    ms.some((m) => m(msg));

export const not =
  (m: Matcher): Matcher =>
  (msg) =>
    !m(msg);
