import { describe, expect, it } from "vitest";
import {
  and,
  contains,
  fromGroup,
  not,
  or,
  ofType,
  prefix,
  regex,
  text,
} from "../src/engine/matchers.js";
import type { IncomingMessage } from "../src/whatsapp/types.js";

function msg(over: Partial<IncomingMessage> = {}): IncomingMessage {
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
    ...over,
  };
}

describe("matchers", () => {
  it("text matchea exacto ignorando mayusculas y espacios", () => {
    expect(text("ping")(msg({ text: "  PING " }))).toBe(true);
    expect(text("ping")(msg({ text: "pinging" }))).toBe(false);
  });

  it("contains matchea subcadena", () => {
    expect(contains("hola")(msg({ text: "buenas, HOLA a todos" }))).toBe(true);
    expect(contains("hola")(msg({ text: "chau" }))).toBe(false);
  });

  it("prefix detecta comandos", () => {
    expect(prefix("!")(msg({ text: "!ping" }))).toBe(true);
    expect(prefix("!")(msg({ text: "ping" }))).toBe(false);
  });

  it("regex testea el texto", () => {
    expect(regex(/\d{4}/)(msg({ text: "codigo 1234" }))).toBe(true);
    expect(regex(/\d{4}/)(msg({ text: "sin numeros" }))).toBe(false);
  });

  it("ofType y fromGroup miran metadatos", () => {
    expect(ofType("image")(msg({ type: "image" }))).toBe(true);
    expect(fromGroup()(msg({ isGroup: true }))).toBe(true);
    expect(fromGroup()(msg({ isGroup: false }))).toBe(false);
  });

  it("and/or/not combinan", () => {
    const cmd = and(prefix("!"), contains("ping"));
    expect(cmd(msg({ text: "!ping" }))).toBe(true);
    expect(cmd(msg({ text: "ping" }))).toBe(false);

    const any = or(text("hola"), text("chau"));
    expect(any(msg({ text: "chau" }))).toBe(true);

    expect(not(text("hola"))(msg({ text: "chau" }))).toBe(true);
  });
});
