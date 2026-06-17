import type { WASocket } from "@whiskeysockets/baileys";
import type { Logger } from "pino";
import type { Messenger } from "../engine/types.js";

// Messenger real sobre Baileys: envia de verdad.
export function createBaileysMessenger(sock: WASocket): Messenger {
  return {
    sendText: async (chatId, text) => {
      await sock.sendMessage(chatId, { text });
    },
    react: async (message, emoji) => {
      await sock.sendMessage(message.chatId, {
        react: { text: emoji, key: message.raw.key },
      });
    },
  };
}

// Messenger de solo lectura: registra lo que se HABRIA enviado, sin enviar nada.
// Es el unico choke point de seguridad: en modo read-only ninguna macro puede
// mandar mensajes a WhatsApp, sin importar lo que intente hacer.
export function createReadOnlyMessenger(logger: Logger): Messenger {
  return {
    sendText: async (chatId, text) => {
      logger.warn({ chatId, text }, "[read-only] envio omitido");
    },
    react: async (message, emoji) => {
      logger.warn(
        { chatId: message.chatId, emoji },
        "[read-only] reaccion omitida",
      );
    },
  };
}
