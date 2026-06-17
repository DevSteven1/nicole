import { always } from "../engine/matchers.js";
import type { Macro } from "../engine/types.js";

// Forma estructurada que le pedimos a la IA. nicole decide ESTO; otro agente
// luego vera que hacer con el ticket. Estan desacoplados.
export interface TriageResult {
  esPedido: boolean;
  claro: boolean;
  esNuevo: boolean;
  ticket: { titulo: string; descripcion: string; tipo: string } | null;
  faltaInfo: string[];
}

type TicketDraft = NonNullable<TriageResult["ticket"]>;

// Clave bajo la que guardamos, por chat, los tickets ya propuestos.
const STATE_KEY = "ticketsAbiertos";

const SYSTEM = `Sos nicole, una asistente que hace triage de mensajes en chats de soporte de clientes (WhatsApp, en espanol).
Te paso la conversacion reciente de un chat y la lista de tickets ya abiertos en ese chat. Analiza el ULTIMO mensaje en el contexto de los anteriores.

Devolve UNICAMENTE un JSON valido, sin texto adicional, con esta forma exacta:
{
  "esPedido": boolean,
  "claro": boolean,
  "esNuevo": boolean,
  "ticket": { "titulo": string, "descripcion": string, "tipo": "Soporte" | "Tarea" | "Seguimiento" } | null,
  "faltaInfo": string[]
}

Reglas:
- esPedido=true solo si el cliente esta pidiendo algo (soporte, cambio, reporte de error, tarea).
- claro=true solo si hay info suficiente para abrir un ticket.
- esNuevo=true solo si el pedido es NUEVO y distinto de los "tickets ya abiertos". Si es el mismo pedido o un seguimiento de uno ya abierto, esNuevo=false.
- Si claro=true, completa "ticket" (titulo conciso: accion + objeto + contexto). Si no, ticket=null.
- Si claro=false, en "faltaInfo" pone los datos puntuales que habria que pedir. Si claro=true, faltaInfo=[].
- Si el ultimo mensaje no es un pedido (saludo, charla, agradecimiento): esPedido=false, claro=false, esNuevo=false, ticket=null, faltaInfo=[].
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
      // Si la IA omite esNuevo, asumimos que si lo es (no suprimir por omision).
      esNuevo: obj.esNuevo === undefined ? true : Boolean(obj.esNuevo),
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
// del chat y decide si hay un pedido. Usa el estado del chat para NO re-proponer
// un ticket ya abierto. En read-only solo PROPONE/EMITE, no ejecuta nada.
export const triage: Macro = {
  name: "triage",
  priority: 100,
  match: always(),
  run: async (ctx) => {
    if (!ctx.llm) return; // sin IA no hace nada
    if (!ctx.message.text.trim()) return; // ignora mensajes sin texto

    const open = ctx.state.get<TicketDraft[]>(STATE_KEY) ?? [];

    const convo = ctx.memory
      .map((e) => `${e.senderName ?? e.sender}: ${e.text}`)
      .join("\n");
    const openList = open.length
      ? open.map((t) => `- ${t.titulo}`).join("\n")
      : "ninguno";
    const userContent = `Conversacion reciente:\n${convo}\n\nTickets ya abiertos en este chat:\n${openList}`;

    let raw: string;
    try {
      raw = await ctx.ai([
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
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
      // Sin tickets abiertos, cualquier pedido claro es nuevo (determinista).
      const esNuevo = open.length === 0 ? true : result.esNuevo;
      if (!esNuevo) {
        ctx.logger.debug(
          { chatId: ctx.message.chatId },
          "triage: pedido ya cubierto por un ticket abierto",
        );
        return;
      }
      // Handoff: nicole emite el ticket propuesto; otro agente lo procesara.
      await ctx.emit("ticket.propuesto", result.ticket);
      // Recuerda el ticket para no re-proponerlo en los proximos mensajes.
      ctx.state.set(STATE_KEY, [...open, result.ticket]);
    } else {
      // Falta info: propone que habria que preguntarle al cliente.
      const faltan = result.faltaInfo.join(", ") || "mas detalle";
      await ctx.propose(`Pedido sin datos suficientes. Habria que pedir: ${faltan}`);
    }
  },
};
