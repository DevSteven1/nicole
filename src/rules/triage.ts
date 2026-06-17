import { always } from "../engine/matchers.js";
import type { Macro } from "../engine/types.js";

// Forma estructurada que le pedimos a la IA. nicole decide ESTO; otro agente
// luego vera que hacer con el ticket. Estan desacoplados.
export interface TriageResult {
  esPedido: boolean;
  claro: boolean;
  ticket: { titulo: string; descripcion: string; tipo: string } | null;
  faltaInfo: string[];
}

const SYSTEM = `Sos nicole, una asistente que hace triage de mensajes en chats de soporte de clientes (WhatsApp, en espanol).
Te paso la conversacion reciente de un chat. Analiza el ULTIMO mensaje en el contexto de los anteriores y decidi si hay una solicitud de soporte.

Devolve UNICAMENTE un JSON valido, sin texto adicional, con esta forma exacta:
{
  "esPedido": boolean,
  "claro": boolean,
  "ticket": { "titulo": string, "descripcion": string, "tipo": "Soporte" | "Tarea" | "Seguimiento" } | null,
  "faltaInfo": string[]
}

Reglas:
- esPedido=true solo si el cliente esta pidiendo algo (soporte, cambio, reporte de error, tarea).
- claro=true solo si hay info suficiente para abrir un ticket.
- Si claro=true, completa "ticket" (titulo conciso: accion + objeto + contexto). Si no, ticket=null.
- Si claro=false, en "faltaInfo" pone los datos puntuales que habria que pedir. Si claro=true, faltaInfo=[].
- Si el ultimo mensaje no es un pedido (saludo, charla, agradecimiento): esPedido=false, claro=false, ticket=null, faltaInfo=[].
- Se conciso. No inventes datos que el cliente no dio.`;

// Extrae el JSON de la respuesta de la IA, tolerando ```json ... ``` y texto
// alrededor. Devuelve null si no se puede parsear.
export function parseTriage(raw: string): TriageResult | null {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;

  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    return {
      esPedido: Boolean(obj.esPedido),
      claro: Boolean(obj.claro),
      ticket: (obj.ticket as TriageResult["ticket"]) ?? null,
      faltaInfo: Array.isArray(obj.faltaInfo)
        ? (obj.faltaInfo as string[])
        : [],
    };
  } catch {
    return null;
  }
}

// Macro de triage: por cada mensaje con texto, la IA razona sobre el contexto
// del chat y decide si hay un pedido. En read-only solo PROPONE/EMITE, no
// ejecuta nada.
export const triage: Macro = {
  name: "triage",
  priority: 100,
  match: always(),
  run: async (ctx) => {
    if (!ctx.llm) return; // sin IA no hace nada
    if (!ctx.message.text.trim()) return; // ignora mensajes sin texto

    const convo = ctx.memory
      .map((e) => `${e.senderName ?? e.sender}: ${e.text}`)
      .join("\n");

    let raw: string;
    try {
      raw = await ctx.ai([
        { role: "system", content: SYSTEM },
        { role: "user", content: convo },
      ]);
    } catch (err) {
      ctx.logger.error({ err }, "triage: fallo la llamada a la IA");
      return;
    }

    const result = parseTriage(raw);
    if (!result) {
      ctx.logger.warn({ raw }, "triage: respuesta de IA no parseable");
      return;
    }
    if (!result.esPedido) return; // no es un pedido: nada que hacer

    if (result.claro && result.ticket) {
      // Handoff: nicole emite el ticket propuesto; otro agente lo procesara.
      await ctx.emit("ticket.propuesto", result.ticket);
    } else {
      // Falta info: propone que habria que preguntarle al cliente.
      const faltan = result.faltaInfo.join(", ") || "mas detalle";
      await ctx.propose(`Pedido sin datos suficientes. Habria que pedir: ${faltan}`);
    }
  },
};
