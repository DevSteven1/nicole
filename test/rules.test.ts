import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { MacroEngine } from "../src/engine/engine.js";
import type { Messenger } from "../src/engine/types.js";
import { rules } from "../src/rules/index.js";
import type { IncomingMessage } from "../src/whatsapp/types.js";

const silentLogger = pino({ level: "silent" });

function msg(textValue: string): IncomingMessage {
  return {
    id: "1",
    chatId: "c@s.whatsapp.net",
    sender: "c@s.whatsapp.net",
    fromMe: false,
    isGroup: false,
    text: textValue,
    type: "text",
    timestamp: 0,
    raw: {} as IncomingMessage["raw"],
  };
}

function fakeMessenger() {
  const sent: Array<{ chatId: string; text: string }> = [];
  const messenger: Messenger = {
    sendText: async (chatId, textValue) => {
      sent.push({ chatId, text: textValue });
    },
    react: async () => {},
  };
  return { messenger, sent };
}

describe("rules", () => {
  it("responde pong a ping (el observador no bloquea)", async () => {
    const { messenger, sent } = fakeMessenger();
    const engine = new MacroEngine(silentLogger).registerAll(rules);

    await engine.dispatch(msg("ping"), messenger);

    expect(sent).toEqual([{ chatId: "c@s.whatsapp.net", text: "pong" }]);
  });

  it("no responde a un mensaje cualquiera", async () => {
    const { messenger, sent } = fakeMessenger();
    const engine = new MacroEngine(silentLogger).registerAll(rules);

    await engine.dispatch(msg("hola que tal"), messenger);

    expect(sent).toEqual([]);
  });
});
