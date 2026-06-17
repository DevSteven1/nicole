import type { WAMessage } from "@whiskeysockets/baileys";
import type { IncomingMessage, MessageType } from "./types.js";

type Content = WAMessage["message"];

// messageTimestamp puede venir como number o como Long (protobuf).
function toSeconds(ts: WAMessage["messageTimestamp"]): number {
  if (typeof ts === "number") return ts;
  if (ts && typeof ts === "object" && "toNumber" in ts) return ts.toNumber();
  return 0;
}

// Extrae texto y tipo del contenido. El orden importa: probamos las variantes
// mas comunes primero.
function extractContent(message: Content): { text: string; type: MessageType } {
  if (!message) return { text: "", type: "other" };
  if (message.conversation) return { text: message.conversation, type: "text" };
  if (message.extendedTextMessage?.text)
    return { text: message.extendedTextMessage.text, type: "text" };
  if (message.imageMessage)
    return { text: message.imageMessage.caption ?? "", type: "image" };
  if (message.videoMessage)
    return { text: message.videoMessage.caption ?? "", type: "video" };
  if (message.documentMessage)
    return { text: message.documentMessage.caption ?? "", type: "document" };
  if (message.audioMessage) return { text: "", type: "audio" };
  if (message.stickerMessage) return { text: "", type: "sticker" };
  return { text: "", type: "other" };
}

// Convierte un mensaje crudo de Baileys a nuestro IncomingMessage. Devuelve null
// si el mensaje no tiene contenido o chat utilizable (eventos de sistema, etc.).
export function normalize(msg: WAMessage): IncomingMessage | null {
  const chatId = msg.key.remoteJid;
  if (!msg.message || !chatId) return null;

  const isGroup = chatId.endsWith("@g.us");
  const fromMe = msg.key.fromMe ?? false;
  const sender = isGroup ? (msg.key.participant ?? chatId) : chatId;
  const { text, type } = extractContent(msg.message);

  return {
    id: msg.key.id ?? "",
    chatId,
    sender,
    senderName: msg.pushName ?? undefined,
    fromMe,
    isGroup,
    text,
    type,
    timestamp: toSeconds(msg.messageTimestamp),
    raw: msg,
  };
}
