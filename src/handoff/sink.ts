import type { Logger } from "pino";
import type { HandoffSink } from "../engine/types.js";

// Sink de solo log: registra la intencion sin mandarla a ningun lado. Es el
// comportamiento por defecto (seguro), igual que el messenger read-only: hay que
// activar el envio real explicitamente.
export function createLoggingSink(logger: Logger): HandoffSink {
  return {
    emit: async (intent) => {
      logger.info(
        { chatId: intent.chatId, kind: intent.kind, data: intent.data },
        "[emit intent]",
      );
    },
  };
}

export interface WebhookSinkOptions {
  // URL del webhook generico (no atado a n8n) que recibe la intencion por POST.
  url: string;
  logger: Logger;
  // Timeout por intento, en ms.
  timeoutMs?: number;
  // Reintentos adicionales tras el primer intento fallido.
  retries?: number;
  // Base del backoff entre reintentos, en ms (se duplica por intento).
  retryDelayMs?: number;
  // fetch inyectable para tests; por defecto el global.
  fetchImpl?: typeof fetch;
  // sleep inyectable para tests (evita esperas reales).
  sleepImpl?: (ms: number) => Promise<void>;
}

// Sink que manda la intencion por HTTP POST a un webhook generico. El cuerpo es
// el HandoffIntent serializado (kind, data, chatId). Reintenta ante fallos de
// red o respuestas no-2xx con backoff exponencial simple.
//
// No lanza nunca: si tras agotar los reintentos sigue fallando, lo loguea y
// sigue. El handoff es best-effort y no debe tumbar el procesamiento del
// mensaje; ademas asi se mantiene el contrato de ctx.emit (no lanzaba antes).
export function createWebhookSink(opts: WebhookSinkOptions): HandoffSink {
  const { url, logger } = opts;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const retries = opts.retries ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 250;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleepImpl ?? defaultSleep;

  return {
    emit: async (intent) => {
      const body = JSON.stringify(intent);

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await doFetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(
              `webhook respondio ${res.status}: ${detail.slice(0, 200)}`,
            );
          }
          return; // exito
        } catch (err) {
          const last = attempt === retries;
          logger.warn(
            {
              err,
              kind: intent.kind,
              attempt: attempt + 1,
              attempts: retries + 1,
            },
            last
              ? "handoff: webhook fallo definitivamente, intencion no entregada"
              : "handoff: webhook fallo, reintentando",
          );
          if (last) return; // best-effort: no lanza
          await sleep(retryDelayMs * 2 ** attempt);
        }
      }
    },
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
