import type { LLMMessage } from "../llm/types.js";

// Autoria de macros con IA: arma el prompt que le ensena el lenguaje al modelo y
// parsea su respuesta (nombre + codigo DSL). La validacion real (que el codigo
// compile) la hace quien llama, reusando el parser del lenguaje.

const SYSTEM = `Sos un asistente que escribe macros para nicole, un bot de WhatsApp de soporte.
Las macros se escriben en un lenguaje propio (DSL). Tu tarea: a partir del pedido en lenguaje natural, devolver UNA macro valida en ese lenguaje.

Estructura:
- Cabecera: "on message when <condicion>:" (el "when" es opcional; sin el, matchea siempre).
  El "when" SOLO puede mirar el texto del mensaje:
    text contains "x" | text is "x" | text starts "x" | text matches /regex/flags
  Combinables con: and, or, not y parentesis.
- Cuerpo: indentado con 2 espacios, una accion por linea, en orden.

Pasos disponibles (no inventes otros):
- propose "texto"      -> propone una respuesta (NO la envia; modo seguro)
- reply "texto"        -> responde en el chat
- react "emoji"
- emit "tipo"          -> emite una intencion para otro agente (ej. "ticket.propuesto")
- ask ai "prompt" -> var          -> consulta a la IA, guarda el texto en var
- ask ai json "prompt" -> var     -> idem pero parsea JSON; despues podes usar var.campo
- set "clave" = <expr>            -> guarda en el estado del chat
- if <expr>:                      -> bloque condicional, con "else:" opcional
- stop                            -> corta la ejecucion

Expresiones en "if" (aca SI podes usar estado y variables):
- variables de la IA: r.claro, r.titulo, ...
- state "clave"
- comparadores: ==, !=, contains, matches, starts
- and, or, not; literales "texto", numeros, true, false

Plantillas: en cualquier texto podes interpolar {{text}}, {{senderName}}, {{sender}}, {{chatId}} o {{var.campo}}.

Reglas:
- Condiciones sobre estado o sobre la IA van en "if" del cuerpo, NUNCA en el "when".
- Preferi "propose"/"emit" sobre "reply" (nicole esta en modo observacion por defecto).
- Se conciso. No agregues pasos que el pedido no pide.

Formato de salida EXACTO:
NOMBRE: <un-slug-corto-con-guiones>
\`\`\`nicole
<codigo de la macro>
\`\`\`
<una linea explicando que hace>`;

export function buildAuthoringMessages(userPrompt: string): LLMMessage[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: userPrompt },
  ];
}

export interface Proposal {
  name: string;
  source: string;
  explanation: string;
}

// Extrae nombre, codigo DSL y explicacion de la respuesta del modelo. Tolera que
// el modelo agregue texto alrededor o etiquete el bloque de codigo.
export function parseProposal(raw: string): Proposal {
  const name = extractName(raw);
  const source = extractFence(raw);
  const explanation = extractExplanation(raw, source);
  return { name, source, explanation };
}

function extractName(raw: string): string {
  const m = raw.match(/NOMBRE:\s*(.+)/i);
  const candidate = m?.[1]?.trim() ?? "";
  const slug = candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "macro-nueva";
}

function extractFence(raw: string): string {
  // Primer bloque ```...``` (con o sin etiqueta de lenguaje).
  const fence = raw.match(/```[^\n]*\n([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].replace(/\s+$/, "");
  // Sin fences: tomamos desde "on message" hasta el final.
  const idx = raw.indexOf("on message");
  return idx === -1 ? "" : raw.slice(idx).trim();
}

function extractExplanation(raw: string, source: string): string {
  // Texto despues del bloque de codigo, como explicacion corta.
  const after = raw.split("```").pop() ?? "";
  const line = after.trim().split("\n").find((l) => l.trim().length > 0);
  if (line) return line.trim();
  return source ? "Macro propuesta." : raw.trim();
}
