import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import type { Messenger } from "../engine/types.js";
import { logger } from "../logger.js";
import { normalize } from "./normalize.js";
import type { IncomingMessage } from "./types.js";

export interface WhatsAppClientOptions {
  // Carpeta donde se persiste la sesion (credenciales). Ignorada por git.
  authDir?: string;
  // Se invoca por cada mensaje entrante ya normalizado. Recibe tambien el
  // messenger para poder responder.
  onMessage?: (msg: IncomingMessage, messenger: Messenger) => void | Promise<void>;
}

// Baileys envuelve los errores de conexion en objetos tipo Boom. Leemos el
// codigo sin depender del paquete @hapi/boom.
function statusCode(err: unknown): number | undefined {
  return (err as { output?: { statusCode?: number } } | undefined)?.output
    ?.statusCode;
}

// Conecta a WhatsApp y mantiene la sesion viva. Se reconecta sola salvo que la
// sesion haya sido cerrada (logout), en cuyo caso hay que volver a vincular.
export async function startWhatsApp(
  opts: WhatsAppClientOptions = {},
): Promise<void> {
  const authDir = opts.authDir ?? "auth_state";
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  // Baileys trae sus propios tipos de pino; el cast evita el choque de versiones
  // entre nuestra instancia y la que espera la libreria.
  const baileysLogger = logger.child({ module: "baileys" });
  baileysLogger.level = process.env.BAILEYS_LOG_LEVEL ?? "warn";

  const sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger as never,
  });

  // Implementacion concreta del contrato Messenger sobre Baileys.
  const messenger: Messenger = {
    sendText: async (chatId, text) => {
      await sock.sendMessage(chatId, { text });
    },
    react: async (message, emoji) => {
      await sock.sendMessage(message.chatId, {
        react: { text: emoji, key: message.raw.key },
      });
    },
  };

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("escanea el codigo QR para vincular el numero");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      logger.info("conexion abierta, nicole esta en linea");
    }

    if (connection === "close") {
      const code = statusCode(lastDisconnect?.error);
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        logger.warn(
          "sesion cerrada (logout); borra la carpeta auth_state para volver a vincular",
        );
        return;
      }
      logger.warn({ code }, "conexion cerrada, reconectando");
      void startWhatsApp(opts);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // "notify" son mensajes nuevos en tiempo real; ignoramos el historial.
    if (type !== "notify") return;
    for (const raw of messages) {
      const msg = normalize(raw);
      // Ignoramos los propios para no entrar en bucles al responder.
      if (!msg || msg.fromMe) continue;
      await opts.onMessage?.(msg, messenger);
    }
  });
}
