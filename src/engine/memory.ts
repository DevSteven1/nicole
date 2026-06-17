import type { IncomingMessage } from "../whatsapp/types.js";

// Una entrada del historial de un chat. Guardamos lo minimo para dar contexto a
// la IA, incluyendo quien hablo (importante en grupos).
export interface MemoryEntry {
  sender: string;
  senderName?: string;
  text: string;
  timestamp: number;
}

export interface ChatMemory {
  get(chatId: string): MemoryEntry[];
  append(chatId: string, entry: MemoryEntry): void;
}

// Almacen en memoria, acotado a los ultimos `max` mensajes por chat. Cumple la
// interfaz ChatMemory, asi que mas adelante se puede reemplazar por una version
// persistente (disco/db) sin tocar el resto.
export function createInMemoryStore(max = 20): ChatMemory {
  const chats = new Map<string, MemoryEntry[]>();
  return {
    get(chatId) {
      return chats.get(chatId) ?? [];
    },
    append(chatId, entry) {
      const list = chats.get(chatId) ?? [];
      list.push(entry);
      // Conserva solo los ultimos `max`.
      if (list.length > max) list.splice(0, list.length - max);
      chats.set(chatId, list);
    },
  };
}

// Construye una entrada de memoria a partir de un mensaje entrante.
export function entryFromMessage(msg: IncomingMessage): MemoryEntry {
  return {
    sender: msg.sender,
    senderName: msg.senderName,
    text: msg.text || `[${msg.type}]`,
    timestamp: msg.timestamp,
  };
}
