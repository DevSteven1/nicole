import { MacroEngine } from "./engine/engine.js";
import { logger } from "./logger.js";
import { rules } from "./rules/index.js";
import { startWhatsApp } from "./whatsapp/client.js";

async function main(): Promise<void> {
  logger.info("iniciando nicole");

  const engine = new MacroEngine(logger).registerAll(rules);
  logger.info({ macros: engine.list().map((m) => m.name) }, "macros registradas");

  await startWhatsApp({
    onMessage: (msg, messenger) => engine.dispatch(msg, messenger),
  });
}

main().catch((err) => {
  logger.error(err, "fallo al iniciar nicole");
  process.exit(1);
});
