import type { Logger } from "pino";
import type { IncomingMessage } from "../whatsapp/types.js";

// Abstraccion de salida: lo minimo que el motor necesita para responder. La
// implementacion concreta (Baileys) vive en src/whatsapp y se inyecta. El motor
// no conoce Baileys.
export interface Messenger {
  sendText(chatId: string, text: string): Promise<void>;
  react(message: IncomingMessage, emoji: string): Promise<void>;
}

// Caja de herramientas que recibe cada macro al ejecutarse.
export interface Context {
  message: IncomingMessage;
  messenger: Messenger;
  logger: Logger;
  // Responde en el mismo chat del mensaje entrante.
  reply(text: string): Promise<void>;
  // Envia a un chat arbitrario.
  send(chatId: string, text: string): Promise<void>;
  // Reacciona al mensaje entrante con un emoji.
  react(emoji: string): Promise<void>;
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
