import type { Logger } from "pino";
import type { LLMMessage, LLMProvider } from "../llm/types.js";
import type { IncomingMessage } from "../whatsapp/types.js";
import type { MemoryEntry } from "./memory.js";

// Abstraccion de salida: lo minimo que el motor necesita para responder. La
// implementacion concreta (Baileys) vive en src/whatsapp y se inyecta. El motor
// no conoce Baileys.
export interface Messenger {
  sendText(chatId: string, text: string): Promise<void>;
  react(message: IncomingMessage, emoji: string): Promise<void>;
}

// Opciones para una llamada a la IA desde una macro.
export interface AiOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Estado por chat, ya scopeado al chat del mensaje actual.
export interface ChatStateScope {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}

// Caja de herramientas que recibe cada macro al ejecutarse.
export interface Context {
  message: IncomingMessage;
  messenger: Messenger;
  logger: Logger;

  // Responde en el mismo chat del mensaje entrante (envia de verdad).
  reply(text: string): Promise<void>;
  // Envia a un chat arbitrario.
  send(chatId: string, text: string): Promise<void>;
  // Reacciona al mensaje entrante con un emoji.
  react(emoji: string): Promise<void>;

  // Proveedor de IA activo (o null si no hay configurado).
  llm: LLMProvider | null;
  // Razonar con la IA. Acepta un prompt simple o una lista de mensajes.
  // Devuelve el texto de la respuesta. Lanza si no hay IA configurada.
  ai(input: string | LLMMessage[], opts?: AiOptions): Promise<string>;

  // Historial reciente del chat (incluye el mensaje actual).
  memory: MemoryEntry[];

  // Estado por chat (clave-valor) para recordar entre mensajes.
  state: ChatStateScope;

  // Propone un mensaje de respuesta: lo registra, NO lo envia. Es la accion
  // segura en read-only.
  propose(text: string): Promise<void>;
  // Emite una intencion estructurada para que otro agente la procese (handoff
  // desacoplado: nicole decide que mandar, el consumidor decide que hacer). Por
  // ahora se registra.
  emit(kind: string, data: unknown): Promise<void>;
}

// Un matcher decide si una macro aplica a un mensaje. Es puro y sincronico para
// poder componerlo y testearlo facil.
export type Matcher = (msg: IncomingMessage) => boolean;

// El handler ejecuta la accion de la macro.
export type Handler = (ctx: Context) => void | Promise<void>;

export interface Macro {
  name: string;
  match: Matcher;
  run: Handler;
  // Mayor prioridad se evalua primero. Default 0.
  priority?: number;
  // Si es false, la cadena sigue evaluando otras macros tras ejecutar esta
  // (observador pasivo). Default true: corta al primer match ejecutado.
  stop?: boolean;
}
