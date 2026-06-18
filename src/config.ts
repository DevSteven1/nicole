import { existsSync } from "node:fs";

// Carga el .env si existe, usando el soporte nativo de Node (sin dependencias).
if (existsSync(".env")) process.loadEnvFile(".env");

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === "true" || v === "1";
}

function envNum(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  // Modo seguro. Si es true, nicole observa e ingiere mensajes pero NO envia
  // nada a WhatsApp. Por seguridad arranca activado: hay que poner explicitamente
  // READ_ONLY=false para habilitar el envio de mensajes.
  readOnly: envBool("READ_ONLY", true),

  // Carpeta donde se persiste la sesion de WhatsApp. Ignorada por git.
  authDir: process.env.AUTH_DIR ?? "auth_state",

  // Capa de IA. El proveedor es intercambiable; opencode es el primero. La
  // clave es obligatoria para que la IA este disponible (sin clave, se desactiva).
  llm: {
    provider: process.env.LLM_PROVIDER ?? "opencode",
    apiKey: process.env.OPENCODE_API_KEY ?? "",
    baseUrl: process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/go/v1",
    model: process.env.OPENCODE_MODEL ?? "deepseek-v4-flash",
  },

  // Handoff: adonde viaja la intencion emitida con ctx.emit. Por defecto solo
  // loguea (igual que read-only). Para mandarla de verdad hay que poner
  // EMIT_ENABLED=true y un EMIT_WEBHOOK_URL (un webhook generico, no atado a n8n).
  handoff: {
    enabled: envBool("EMIT_ENABLED", false),
    webhookUrl: process.env.EMIT_WEBHOOK_URL ?? "",
    timeoutMs: envNum("EMIT_TIMEOUT_MS", 10_000),
    retries: envNum("EMIT_RETRIES", 2),
  },

  // Consola web: dashboard de observacion en vivo y editor de macros. Por
  // defecto escucha solo en localhost. Apagala con WEB_ENABLED=false.
  web: {
    enabled: envBool("WEB_ENABLED", true),
    host: process.env.WEB_HOST ?? "127.0.0.1",
    port: envNum("WEB_PORT", 4321),
  },
};
