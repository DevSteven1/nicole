import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { MacroEngine } from "../src/engine/engine.js";
import { always, text } from "../src/engine/matchers.js";
import type { Macro, Messenger } from "../src/engine/types.js";
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
  const reacted: Array<{ id: string; emoji: string }> = [];
  const messenger: Messenger = {
    sendText: async (chatId, textValue) => {
      sent.push({ chatId, text: textValue });
    },
    react: async (message, emoji) => {
      reacted.push({ id: message.id, emoji });
    },
  };
  return { messenger, sent, reacted };
}

describe("MacroEngine", () => {
  it("ejecuta la macro que matchea y responde", async () => {
    const { messenger, sent } = fakeMessenger();
    const engine = new MacroEngine(silentLogger).register({
      name: "ping",
      match: text("ping"),
      run: (ctx) => ctx.reply("pong"),
    });

    await engine.dispatch(msg("ping"), messenger);

    expect(sent).toEqual([{ chatId: "c@s.whatsapp.net", text: "pong" }]);
  });

  it("respeta la prioridad: gana la de mayor priority y corta", async () => {
    const order: string[] = [];
    const { messenger } = fakeMessenger();
    const engine = new MacroEngine(silentLogger).registerAll([
      { name: "baja", priority: 1, match: always(), run: () => void order.push("baja") },
      { name: "alta", priority: 10, match: always(), run: () => void order.push("alta") },
    ]);

    await engine.dispatch(msg("hola"), messenger);

    expect(order).toEqual(["alta"]);
  });

  it("stop:false deja seguir a las siguientes macros", async () => {
    const order: string[] = [];
    const { messenger } = fakeMessenger();
    const engine = new MacroEngine(silentLogger).registerAll([
      {
        name: "observador",
        priority: 10,
        stop: false,
        match: always(),
        run: () => void order.push("observador"),
      },
      { name: "principal", priority: 1, match: always(), run: () => void order.push("principal") },
    ]);

    await engine.dispatch(msg("hola"), messenger);

    expect(order).toEqual(["observador", "principal"]);
  });

  it("un error en una macro no rompe la cadena", async () => {
    const order: string[] = [];
    const { messenger } = fakeMessenger();
    const engine = new MacroEngine(silentLogger).registerAll([
      {
        name: "rompe",
        priority: 10,
        stop: false,
        match: always(),
        run: () => {
          throw new Error("boom");
        },
      },
      { name: "sigue", priority: 1, match: always(), run: () => void order.push("sigue") },
    ]);

    await engine.dispatch(msg("hola"), messenger);

    expect(order).toEqual(["sigue"]);
  });

  it("no ejecuta nada si ninguna macro matchea", async () => {
    const { messenger, sent } = fakeMessenger();
    const engine = new MacroEngine(silentLogger).register({
      name: "ping",
      match: text("ping"),
      run: (ctx) => ctx.reply("pong"),
    } satisfies Macro);

    await engine.dispatch(msg("otra cosa"), messenger);

    expect(sent).toEqual([]);
  });
});
