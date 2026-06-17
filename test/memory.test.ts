import { describe, expect, it } from "vitest";
import { createInMemoryStore } from "../src/engine/memory.js";

describe("createInMemoryStore", () => {
  it("acumula y devuelve el historial por chat", () => {
    const m = createInMemoryStore();
    m.append("a", { sender: "x", text: "hola", timestamp: 1 });
    m.append("a", { sender: "x", text: "que tal", timestamp: 2 });
    m.append("b", { sender: "y", text: "otro", timestamp: 3 });

    expect(m.get("a").map((e) => e.text)).toEqual(["hola", "que tal"]);
    expect(m.get("b")).toHaveLength(1);
    expect(m.get("c")).toEqual([]);
  });

  it("acota a los ultimos max mensajes", () => {
    const m = createInMemoryStore(2);
    for (const t of ["1", "2", "3"]) {
      m.append("a", { sender: "x", text: t, timestamp: 0 });
    }
    expect(m.get("a").map((e) => e.text)).toEqual(["2", "3"]);
  });
});
