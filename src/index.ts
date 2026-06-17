import { config } from "./config.js";
import { MacroEngine } from "./engine/engine.js";
import { logger } from "./logger.js";
import { rules } from "./rules/index.js";
import { startWhatsApp } from "./whatsapp/client.js";

async function main(): Promise<void> {
  logger.info("iniciando nicole");

  if (config.readOnly) {
    logger.warn("modo READ-ONLY activo: nicole observa pero no envia nada");
  } else {
    logger.warn("modo de ENVIO activo: nicole puede responder por WhatsApp");
  }

  const engine = new MacroEngine(logger).registerAll(rules);
  logger.info({ macros: engine.list().map((m) => m.name) }, "macros registradas");

  await startWhatsApp({
    authDir: config.authDir,
    readOnly: config.readOnly,
    onMessage: (msg, messenger) => engine.dispatch(msg, messenger),
  });
}

main().catch((err) => {
  logger.error(err, "fallo al iniciar nicole");
  process.exit(1);
});
