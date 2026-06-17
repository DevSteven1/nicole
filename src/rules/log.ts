import { always } from "../engine/matchers.js";
import type { Macro } from "../engine/types.js";

// Observador: registra todo mensaje entrante sin cortar la cadena. Corre primero
// (prioridad alta) y deja seguir al resto gracias a stop: false.
export const log: Macro = {
  name: "log",
  priority: 1000,
  stop: false,
  match: always(),
  run: (ctx) => {
    const m = ctx.message;
    ctx.logger.info(
      { chat: m.chatId, from: m.senderName ?? m.sender, type: m.type },
      m.text || `[${m.type}]`,
    );
  },
};
