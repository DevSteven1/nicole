import type { Logger } from "pino";
import type { LLMMessage, LLMProvider } from "../llm/types.js";
import type { IncomingMessage } from "../whatsapp/types.js";
import type { MemoryEntry } from "./memory.js";
import type { Context, Messenger } from "./types.js";

export interface ContextDeps {
  message: IncomingMessage;
  messenger: Messenger;
  logger: Logger;
  llm: LLMProvider | null;
  memory: MemoryEntry[];
}

// Arma el contexto que recibe una macro: ata los helpers (reply/send/react/ai/
// propose/emit) al mensaje, al messenger y a la IA concretos.
export function buildContext(deps: ContextDeps): Context {
  const { message, messenger, logger, llm, memory } = deps;

  return {
    message,
    messenger,
    logger,
    llm,
    memory,

    reply: (txt) => messenger.sendText(message.chatId, txt),
    send: (chatId, txt) => messenger.sendText(chatId, txt),
    react: (emoji) => messenger.react(message, emoji),

    ai: async (input, opts) => {
      if (!llm) throw new Error("IA no configurada");
      const messages: LLMMessage[] =
        typeof input === "string" ? [{ role: "user", content: input }] : input;
      const res = await llm.complete({ messages, ...opts });
      return res.text;
    },

    propose: async (txt) => {
      logger.info(
        { chatId: message.chatId, text: txt },
        "[propuesta de respuesta]",
      );
    },

    emit: async (kind, data) => {
      logger.info({ chatId: message.chatId, kind, data }, "[emit intent]");
    },
  };
}
