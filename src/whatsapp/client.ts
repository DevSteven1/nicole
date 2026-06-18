import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import type { Messenger } from "../engine/types.js";
import { logger } from "../logger.js";
import {
  createBaileysMessenger,
  createReadOnlyMessenger,
} from "./messenger.js";
import { normalize } from "./normalize.js";
import type { IncomingMessage } from "./types.js";

export interface WhatsAppClientOptions {
  // Carpeta donde se persiste la sesion (credenciales). Ignorada por git.
  authDir?: string;
  // Modo seguro: si es true (default), nicole no envia nada a WhatsApp.
  readOnly?: boolean;
  // Se invoca por cada mensaje entrante ya normalizado. Recibe tambien el
  // messenger para poder responder.
  onMessage?: (msg: IncomingMessage, messenger: Messenger) => void | Promise<void>;
  // Notifica cambios de estado de la conexion (para la consola web). Valores:
  // "qr", "abierta", "cerrada".
  onStatus?: (status: string) => void;
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

  // En read-only (default) el messenger no envia nada: solo registra la
  // intencion. Asi el modo seguro no depende de que cada macro se porte bien.
  const readOnly = opts.readOnly ?? true;
  const messenger: Messenger = readOnly
    ? createReadOnlyMessenger(logger)
    : createBaileysMessenger(sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("escanea el codigo QR para vincular el numero");
      qrcode.generate(qr, { small: true });
      opts.onStatus?.("qr");
    }

    if (connection === "open") {
      logger.info("conexion abierta, nicole esta en linea");
      opts.onStatus?.("abierta");
    }

    if (connection === "close") {
      opts.onStatus?.("cerrada");
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
