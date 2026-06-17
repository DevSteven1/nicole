import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { createReadOnlyMessenger } from "../src/whatsapp/messenger.js";
import type { IncomingMessage } from "../src/whatsapp/types.js";

const silent = pino({ level: "silent" });

function msg(): IncomingMessage {
  return {
    id: "1",
    chatId: "c@s.whatsapp.net",
    sender: "c@s.whatsapp.net",
    fromMe: false,
    isGroup: false,
    text: "",
    type: "text",
    timestamp: 0,
    raw: {} as IncomingMessage["raw"],
  };
}

describe("createReadOnlyMessenger", () => {
  it("no lanza y resuelve sin enviar (solo registra la intencion)", async () => {
    const m = createReadOnlyMessenger(silent);
    await expect(m.sendText("c@s.whatsapp.net", "hola")).resolves.toBeUndefined();
    await expect(m.react(msg(), "ok")).resolves.toBeUndefined();
  });
});
