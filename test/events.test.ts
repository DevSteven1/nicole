import { describe, expect, it, vi } from "vitest";
import { createEventHub, createNullEventHub } from "../src/events.js";

describe("createEventHub", () => {
  it("asigna id incremental y ts a cada evento", () => {
    const hub = createEventHub();
    const a = hub.publish({ type: "message", text: "hola" });
    const b = hub.publish({ type: "propose", text: "chau" });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(typeof a.ts).toBe("number");
  });

  it("respeta el ts provisto", () => {
    const hub = createEventHub();
    const e = hub.publish({ type: "system", ts: 123 });
    expect(e.ts).toBe(123);
  });

  it("notifica a los suscriptores y permite desuscribir", () => {
    const hub = createEventHub();
    const seen: string[] = [];
    const off = hub.subscribe((e) => seen.push(e.type));
    hub.publish({ type: "message" });
    off();
    hub.publish({ type: "emit" });
    expect(seen).toEqual(["message"]);
  });

  it("un suscriptor que lanza no frena a los demas", () => {
    const hub = createEventHub();
    const ok = vi.fn();
    hub.subscribe(() => {
      throw new Error("boom");
    });
    hub.subscribe(ok);
    hub.publish({ type: "message" });
    expect(ok).toHaveBeenCalledOnce();
  });

  it("acota el buffer a los ultimos max eventos", () => {
    const hub = createEventHub(3);
    for (let i = 0; i < 5; i++) hub.publish({ type: "message", text: `${i}` });
    const recent = hub.recent();
    expect(recent).toHaveLength(3);
    expect(recent.map((e) => e.text)).toEqual(["2", "3", "4"]);
  });
});

describe("createNullEventHub", () => {
  it("descarta todo sin lanzar", () => {
    const hub = createNullEventHub();
    expect(() => hub.publish({ type: "message" })).not.toThrow();
    expect(hub.recent()).toEqual([]);
    const off = hub.subscribe(() => {});
    expect(() => off()).not.toThrow();
  });
});
