import { pino } from "pino";

// En desarrollo usamos pino-pretty para una salida legible. En produccion
// dejamos el JSON estructurado por defecto (mas barato y apto para agregadores).
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  isDev
    ? {
        level: process.env.LOG_LEVEL ?? "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : { level: process.env.LOG_LEVEL ?? "info" },
);
