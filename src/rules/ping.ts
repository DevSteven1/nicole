import { or, text } from "../engine/matchers.js";
import type { Macro } from "../engine/types.js";

// Macro de prueba: responde "pong" a "ping" o "!ping". Sirve para verificar de
// punta a punta que el motor responde por WhatsApp.
export const ping: Macro = {
  name: "ping",
  match: or(text("ping"), text("!ping")),
  run: (ctx) => ctx.reply("pong"),
};
