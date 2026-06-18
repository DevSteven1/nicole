import { describe, expect, it } from "vitest";
import { buildAuthoringMessages, parseProposal } from "../src/web/authoring.js";

describe("buildAuthoringMessages", () => {
  it("arma system + user", () => {
    const msgs = buildAuthoringMessages("quiero un saludo");
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[1]).toEqual({ role: "user", content: "quiero un saludo" });
  });
});

describe("parseProposal", () => {
  it("extrae nombre (slug), source y explicacion", () => {
    const raw = [
      "NOMBRE: Saludo VIP",
      "```nicole",
      'on message when text contains "hola":',
      '  propose "Hola {{senderName}}"',
      "```",
      "Propone un saludo cuando alguien dice hola.",
    ].join("\n");
    const p = parseProposal(raw);
    expect(p.name).toBe("saludo-vip");
    expect(p.source).toBe(
      'on message when text contains "hola":\n  propose "Hola {{senderName}}"',
    );
    expect(p.explanation).toContain("saludo");
  });

  it("tolera bloque sin etiqueta de lenguaje", () => {
    const raw = 'NOMBRE: x\n```\non message:\n  stop\n```';
    expect(parseProposal(raw).source).toBe("on message:\n  stop");
  });

  it("cae a slug por defecto si no hay NOMBRE", () => {
    const raw = '```nicole\non message:\n  stop\n```';
    expect(parseProposal(raw).name).toBe("macro-nueva");
  });

  it("toma el codigo sin fences (desde on message)", () => {
    const raw = "aca va:\non message:\n  reply \"ok\"";
    expect(parseProposal(raw).source).toBe('on message:\n  reply "ok"');
  });
});
