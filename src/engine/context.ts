import type { Logger } from "pino";
import type { EventHub } from "../events.js";
import type { LLMMessage, LLMProvider } from "../llm/types.js";
import type { IncomingMessage } from "../whatsapp/types.js";
import type { MemoryEntry } from "./memory.js";
import type { ChatState } from "./state.js";
import type { Context, HandoffSink, Messenger } from "./types.js";

export interface ContextDeps {
  message: IncomingMessage;
  messenger: Messenger;
  logger: Logger;
  llm: LLMProvider | null;
  memory: MemoryEntry[];
  state: ChatState;
  handoff: HandoffSink;
  events: EventHub;
}

// Arma el contexto que recibe una macro: ata los helpers (reply/send/react/ai/
// propose/emit) al mensaje, al messenger y a la IA concretos. De paso publica
// cada accion en el bus de eventos para la consola en vivo (solo observabilidad).
export function buildContext(deps: ContextDeps): Context {
  const { message, messenger, logger, llm, memory, state, handoff, events } =
    deps;
  const { chatId, sender, senderName } = message;

  return {
    message,
    messenger,
    logger,
    llm,
    memory,

    // Estado scopeado al chat del mensaje actual.
    state: {
      get: <T>(key: string): T | undefined => state.get<T>(message.chatId, key),
      set: (key, value) => state.set(message.chatId, key, value),
    },

    reply: async (txt) => {
      events.publish({ type: "send", chatId, text: txt });
      await messenger.sendText(chatId, txt);
    },
    send: async (toChatId, txt) => {
      events.publish({ type: "send", chatId: toChatId, text: txt });
      await messenger.sendText(toChatId, txt);
    },
    react: async (emoji) => {
      events.publish({ type: "react", chatId, emoji });
      await messenger.react(message, emoji);
    },

    ai: async (input, opts) => {
      if (!llm) throw new Error("IA no configurada");
      const messages: LLMMessage[] =
        typeof input === "string" ? [{ role: "user", content: input }] : input;
      const res = await llm.complete({ messages, ...opts });
      return res.text;
    },

    propose: async (txt) => {
      events.publish({ type: "propose", chatId, sender, senderName, text: txt });
      logger.info({ chatId, text: txt }, "[propuesta de respuesta]");
    },

    emit: async (kind, data) => {
      events.publish({ type: "emit", chatId, kind, data });
      await handoff.emit({ kind, data, chatId });
    },
  };
}
