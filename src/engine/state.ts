// Estado por chat, clave-valor. Lo usan las macros para recordar cosas entre
// mensajes de un mismo chat (ej. que tickets ya se propusieron). Igual que la
// memoria, la implementacion en memoria se puede cambiar por una persistente
// sin tocar el resto.
export interface ChatState {
  get<T>(chatId: string, key: string): T | undefined;
  set(chatId: string, key: string, value: unknown): void;
}

export function createInMemoryState(): ChatState {
  const chats = new Map<string, Map<string, unknown>>();
  return {
    get<T>(chatId: string, key: string): T | undefined {
      return chats.get(chatId)?.get(key) as T | undefined;
    },
    set(chatId, key, value) {
      let bucket = chats.get(chatId);
      if (!bucket) {
        bucket = new Map();
        chats.set(chatId, bucket);
      }
      bucket.set(key, value);
    },
  };
}
