import type { Logger } from "pino";
import type { IncomingMessage } from "../whatsapp/types.js";
import type { Context, Messenger } from "./types.js";

// Arma el contexto que recibe una macro: ata los helpers (reply/send/react) al
// mensaje y al messenger concretos.
export function buildContext(
  message: IncomingMessage,
  messenger: Messenger,
  logger: Logger,
): Context {
  return {
    message,
    messenger,
    logger,
    reply: (txt) => messenger.sendText(message.chatId, txt),
    send: (chatId, txt) => messenger.sendText(chatId, txt),
    react: (emoji) => messenger.react(message, emoji),
  };
}
