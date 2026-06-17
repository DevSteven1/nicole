import type { WAMessage } from "@whiskeysockets/baileys";

// Tipo de contenido del mensaje, acotado a lo que nos interesa. El resto cae en
// "other".
export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "other";

// Representacion propia de un mensaje entrante. El resto del codigo trabaja
// contra este tipo, no contra la estructura cruda de Baileys. `raw` queda como
// escape hatch para casos avanzados.
export interface IncomingMessage {
  id: string;
  chatId: string; // jid del chat (remoteJid)
  sender: string; // quien envia: el participante en grupos, el chat en directos
  senderName?: string; // nombre visible (pushName), si viene
  fromMe: boolean;
  isGroup: boolean;
  text: string; // texto o caption; cadena vacia si no hay
  type: MessageType;
  timestamp: number; // unix en segundos
  raw: WAMessage;
}
