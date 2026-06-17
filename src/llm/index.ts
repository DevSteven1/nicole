import { config } from "../config.js";
import { createOpenCodeProvider } from "./adapters/opencode.js";
import type { LLMProvider } from "./types.js";

export * from "./types.js";
export { createOpenCodeProvider } from "./adapters/opencode.js";

// Crea el proveedor de IA segun la configuracion. Devuelve null si falta la
// clave o el proveedor no se reconoce: en ese caso nicole corre sin IA.
export function createProvider(): LLMProvider | null {
  switch (config.llm.provider) {
    case "opencode":
      if (!config.llm.apiKey) return null;
      return createOpenCodeProvider({
        apiKey: config.llm.apiKey,
        baseUrl: config.llm.baseUrl,
        model: config.llm.model,
      });
    default:
      return null;
  }
}
