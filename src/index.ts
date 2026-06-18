import { config } from "./config.js";
import { MacroEngine } from "./engine/engine.js";
import { compileMacro, createMacroStore } from "./engine/macro-store.js";
import { createInMemoryStore } from "./engine/memory.js";
import { createEventHub } from "./events.js";
import { createLoggingSink, createWebhookSink } from "./handoff/sink.js";
import { createProvider } from "./llm/index.js";
import { logger } from "./logger.js";
import { rules } from "./rules/index.js";
import { startWebServer, type WebStatus } from "./web/server.js";
import { startWhatsApp } from "./whatsapp/client.js";

async function main(): Promise<void> {
  logger.info("iniciando nicole");

  if (config.readOnly) {
    logger.warn("modo READ-ONLY activo: nicole observa pero no envia nada");
  } else {
    logger.warn("modo de ENVIO activo: nicole puede responder por WhatsApp");
  }

  const llm = createProvider();
  logger.info(
    { provider: llm?.name ?? "ninguno" },
    llm ? "IA disponible" : "IA no configurada (falta API key)",
  );

  const useWebhook = config.handoff.enabled && config.handoff.webhookUrl !== "";
  if (config.handoff.enabled && !config.handoff.webhookUrl) {
    logger.warn(
      "EMIT_ENABLED=true pero falta EMIT_WEBHOOK_URL: el handoff seguira solo logueando",
    );
  }
  const handoff = useWebhook
    ? createWebhookSink({
        url: config.handoff.webhookUrl,
        logger,
        timeoutMs: config.handoff.timeoutMs,
        retries: config.handoff.retries,
      })
    : createLoggingSink(logger);
  logger.info(
    { handoff: useWebhook ? "webhook" : "log" },
    useWebhook
      ? "handoff: envio real al webhook activo"
      : "handoff: solo log (envio desactivado)",
  );

  // Bus de eventos para la consola en vivo (descarta si la web esta apagada).
  const events = createEventHub();

  const memory = createInMemoryStore();
  const engine = new MacroEngine(logger, {
    llm,
    memory,
    handoff,
    events,
  }).registerAll(rules);

  // Macros declarativas creadas desde la consola: el store notifica y volcamos
  // las habilitadas al motor (en caliente, sin reiniciar).
  const macroStore = createMacroStore();
  const baseMacros = engine.list().map((m) => m.name);
  const syncDynamicMacros = () => {
    const compiled = macroStore
      .list()
      .filter((d) => d.enabled)
      .map(compileMacro);
    engine.replaceDynamic(compiled);
  };
  macroStore.subscribe(syncDynamicMacros);

  logger.info({ macros: baseMacros }, "macros registradas");

  // Estado que muestra la consola; la conexion de WhatsApp lo va actualizando.
  const status: WebStatus = {
    readOnly: config.readOnly,
    provider: llm?.name ?? null,
    handoff: useWebhook ? "webhook" : "log",
    connection: "iniciando",
    builtins: baseMacros,
  };

  if (config.web.enabled) {
    startWebServer({
      hub: events,
      store: macroStore,
      logger,
      getStatus: () => status,
      host: config.web.host,
      port: config.web.port,
    });
  }

  await startWhatsApp({
    authDir: config.authDir,
    readOnly: config.readOnly,
    onMessage: (msg, messenger) => engine.dispatch(msg, messenger),
    onStatus: (s) => {
      status.connection = s;
      events.publish({ type: "system", level: "info", message: `conexion: ${s}` });
    },
  });
}

main().catch((err) => {
  logger.error(err, "fallo al iniciar nicole");
  process.exit(1);
});
