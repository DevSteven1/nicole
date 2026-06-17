import { logger } from "./logger.js";
import { startWhatsApp } from "./whatsapp/client.js";

async function main(): Promise<void> {
  logger.info("iniciando nicole");

  await startWhatsApp({
    // Por ahora solo logueamos lo que llega. El motor de macros entra en la
    // siguiente parte.
    onMessage: (msg) => {
      logger.info(
        { chat: msg.chatId, from: msg.senderName ?? msg.sender, type: msg.type },
        msg.text || `[${msg.type}]`,
      );
    },
  });
}

main().catch((err) => {
  logger.error(err, "fallo al iniciar nicole");
  process.exit(1);
});
