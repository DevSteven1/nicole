import { describe, expect, it } from "vitest";
import { normalize } from "../src/whatsapp/normalize.js";
import type { WAMessage } from "@whiskeysockets/baileys";

// Construye un mensaje crudo minimo para las pruebas. Usamos un cast porque solo
// poblamos los campos que normalize() realmente lee.
function fakeMsg(over: {
  key?: Record<string, unknown>;
  message?: unknown;
  pushName?: string;
  messageTimestamp?: number;
}): WAMessage {
  return {
    key: {
      remoteJid: "123@s.whatsapp.net",
      fromMe: false,
      id: "ABC",
      ...(over.key ?? {}),
    },
    message: over.message === undefined ? { conversation: "hola" } : over.message,
    pushName: over.pushName ?? "Steven",
    messageTimestamp: over.messageTimestamp ?? 1700000000,
  } as unknown as WAMessage;
}

describe("normalize", () => {
  it("extrae texto plano de un mensaje directo", () => {
    const m = normalize(fakeMsg({}));
    expect(m).not.toBeNull();
    expect(m?.text).toBe("hola");
    expect(m?.type).toBe("text");
    expect(m?.isGroup).toBe(false);
    expect(m?.sender).toBe("123@s.whatsapp.net");
  });

  it("usa el participante como sender en grupos", () => {
    const m = normalize(
      fakeMsg({ key: { remoteJid: "xyz@g.us", participant: "999@s.whatsapp.net" } }),
    );
    expect(m?.isGroup).toBe(true);
    expect(m?.sender).toBe("999@s.whatsapp.net");
  });

  it("lee caption y tipo de una imagen", () => {
    const m = normalize(fakeMsg({ message: { imageMessage: { caption: "mira esto" } } }));
    expect(m?.type).toBe("image");
    expect(m?.text).toBe("mira esto");
  });

  it("devuelve null cuando no hay contenido", () => {
    const m = normalize(fakeMsg({ message: null }));
    expect(m).toBeNull();
  });
});
