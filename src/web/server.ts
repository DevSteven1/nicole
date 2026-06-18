import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage as HttpRequest,
  type Server,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "pino";
import {
  type MacroDef,
  MacroDefError,
  type MacroDefInput,
  type MacroStore,
} from "../engine/macro-store.js";
import type { EventHub } from "../events.js";
import type { LLMProvider } from "../llm/types.js";
import { MacroLangError, compile } from "../macro-lang/index.js";
import { buildAuthoringMessages, parseProposal } from "./authoring.js";
import { renderAuthoringTurn, renderMacrosPanel } from "./views.js";

// Estado del sistema que la consola muestra. index.ts lo mantiene al dia (la
// conexion de WhatsApp lo va actualizando).
export interface WebStatus {
  readOnly: boolean;
  provider: string | null;
  handoff: "log" | "webhook";
  connection: string;
  builtins: string[];
}

export interface WebServerOptions {
  hub: EventHub;
  store: MacroStore;
  logger: Logger;
  getStatus: () => WebStatus;
  // Proveedor de IA para el chat de autoria de macros (null si no hay).
  llm: LLMProvider | null;
  host?: string;
  port?: number;
}

const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  return CONTENT_TYPES[path.slice(dot)] ?? "application/octet-stream";
}

// Arranca la consola web embebida. Devuelve el server por si hace falta cerrarlo.
export function startWebServer(opts: WebServerOptions): Server {
  const { hub, store, logger, getStatus, llm } = opts;
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 4321;

  const macrosPanel = (opts: Parameters<typeof renderMacrosPanel>[2] = {}) =>
    renderMacrosPanel(store, getStatus().builtins, opts);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const { pathname } = url;

    try {
      if (req.method === "GET" && pathname === "/api/stream") {
        return streamEvents(req, res, hub);
      }
      if (req.method === "GET" && pathname === "/api/status") {
        return json(res, 200, getStatus());
      }
      if (req.method === "GET" && pathname === "/api/macros") {
        return html(res, 200, macrosPanel());
      }
      if (req.method === "POST" && pathname === "/api/macros") {
        const form = await readForm(req);
        try {
          store.create(formToDef(form));
          return html(res, 200, macrosPanel());
        } catch (err) {
          if (err instanceof MacroDefError) {
            return html(res, 200, macrosPanel({ error: err.message }));
          }
          throw err;
        }
      }
      const editId = matchId(pathname, "/api/macros/", "/edit");
      if (req.method === "GET" && editId) {
        const def = store.get(editId);
        return html(res, 200, macrosPanel(def ? { edit: def } : {}));
      }
      const toggle = matchId(pathname, "/api/macros/", "/toggle");
      if (req.method === "POST" && toggle) {
        const def = store.get(toggle);
        if (def) store.update(toggle, { enabled: !def.enabled });
        return html(res, 200, macrosPanel());
      }
      const del = matchId(pathname, "/api/macros/", "/delete");
      if (req.method === "POST" && del) {
        store.remove(del);
        return html(res, 200, macrosPanel());
      }
      const updateId = plainId(pathname);
      if (req.method === "POST" && updateId) {
        const form = await readForm(req);
        try {
          const updated = store.update(updateId, formToDef(form));
          if (!updated) return html(res, 200, macrosPanel());
          return html(res, 200, macrosPanel());
        } catch (err) {
          if (err instanceof MacroDefError) {
            return html(res, 200, macrosPanel({
              error: err.message,
              edit: formToEditDef(updateId, form, store),
            }));
          }
          throw err;
        }
      }

      if (req.method === "POST" && pathname === "/api/authoring") {
        const form = await readForm(req);
        const message = (form.get("message") ?? "").trim();
        if (!message) return html(res, 200, "");
        return html(res, 200, await authorMacro(message, llm, logger));
      }

      // Estaticos.
      const file = pathname === "/" ? "index.html" : pathname.slice(1);
      return serveStatic(res, file, logger);
    } catch (err) {
      logger.error({ err, pathname }, "web: error sirviendo request");
      if (!res.headersSent) json(res, 500, { error: "error interno" });
      else res.end();
    }
  });

  server.listen(port, host, () => {
    logger.info({ url: `http://${host}:${port}` }, "consola web escuchando");
  });
  return server;
}

// SSE: replay del buffer y luego eventos en vivo. Un ping periodico mantiene la
// conexion despierta detras de proxies.
function streamEvents(
  req: HttpRequest,
  res: ServerResponse,
  hub: EventHub,
): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  for (const event of hub.recent()) send(event);

  const off = hub.subscribe(send);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(ping);
    off();
  });
}

async function serveStatic(
  res: ServerResponse,
  file: string,
  logger: Logger,
): Promise<void> {
  // Evita salir del directorio publico.
  if (file.includes("..")) return json(res, 403, { error: "prohibido" });
  try {
    const buf = await readFile(join(PUBLIC_DIR, file));
    res.writeHead(200, { "content-type": contentTypeFor(file) });
    res.end(buf);
  } catch {
    logger.debug({ file }, "web: estatico no encontrado");
    json(res, 404, { error: "no encontrado" });
  }
}

function matchId(pathname: string, prefix: string, suffix: string): string | null {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) return null;
  const id = pathname.slice(prefix.length, pathname.length - suffix.length);
  return id.length > 0 && !id.includes("/") ? id : null;
}

// Pide a la IA una macro a partir del texto del usuario, la valida compilandola
// y devuelve la burbuja del chat (con boton de crear si compila).
async function authorMacro(
  message: string,
  llm: LLMProvider | null,
  logger: Logger,
): Promise<string> {
  if (!llm) {
    return renderAuthoringTurn({
      name: "",
      source: "",
      explanation: "La IA no esta configurada (falta API key).",
      valid: false,
      error: "sin IA",
    });
  }

  let aiText: string;
  try {
    const res = await llm.complete({ messages: buildAuthoringMessages(message) });
    aiText = res.text;
  } catch (err) {
    logger.error({ err }, "autoria: fallo la consulta a la IA");
    return renderAuthoringTurn({
      name: "",
      source: "",
      explanation: "Fallo la consulta a la IA.",
      valid: false,
      error: "error de la IA",
    });
  }

  const proposal = parseProposal(aiText);
  let valid = true;
  let error: string | undefined;
  try {
    compile(proposal.source);
  } catch (err) {
    valid = false;
    error = err instanceof MacroLangError ? err.message : "no compila";
  }

  return renderAuthoringTurn({ ...proposal, valid, error });
}

// Id directo (sin sufijo) en /api/macros/<id>, para el update.
function plainId(pathname: string): string | null {
  const prefix = "/api/macros/";
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length);
  return id.length > 0 && !id.includes("/") ? id : null;
}

// Traduce el form plano (campos urlencoded) a la definicion de macro.
function formToDef(form: URLSearchParams): MacroDefInput {
  return {
    name: form.get("name") ?? "",
    source: form.get("source") ?? "",
    priority: Number(form.get("priority") ?? 0),
    stop: form.get("stop") !== null,
  };
}

// Reconstruye un MacroDef desde el form para re-pintar el editor cuando el
// update falla la validacion (asi no se pierde lo que el usuario tipeo).
function formToEditDef(
  id: string,
  form: URLSearchParams,
  store: MacroStore,
): MacroDef {
  return {
    id,
    name: form.get("name") ?? "",
    source: form.get("source") ?? "",
    priority: Number(form.get("priority") ?? 0),
    stop: form.get("stop") !== null,
    enabled: store.get(id)?.enabled ?? true,
  };
}

async function readForm(
  req: HttpRequest,
): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function html(
  res: ServerResponse,
  status: number,
  body: string,
): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}
