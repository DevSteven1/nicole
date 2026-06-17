import { describe, expect, it } from "vitest";
import { createInMemoryState } from "../src/engine/state.js";

describe("createInMemoryState", () => {
  it("guarda y lee por chat y clave", () => {
    const s = createInMemoryState();
    s.set("a", "k", 1);
    s.set("b", "k", 2);

    expect(s.get("a", "k")).toBe(1);
    expect(s.get("b", "k")).toBe(2);
    expect(s.get("a", "otra")).toBeUndefined();
    expect(s.get("c", "k")).toBeUndefined();
  });

  it("sobreescribe el valor de una clave existente", () => {
    const s = createInMemoryState();
    s.set("a", "k", 1);
    s.set("a", "k", 9);
    expect(s.get("a", "k")).toBe(9);
  });
});
