import type { MacroDef, MacroStore } from "../engine/macro-store.js";

// Render del panel de macros para htmx. El servidor devuelve estos fragmentos y
// htmx los inserta; no hay framework de cliente. Todo lo que venga de datos pasa
// por escapeHtml.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLACEHOLDER = `on message when text contains "factura":
  ask ai json "clasifica: {{text}}" -> r
  if r.claro:
    emit "ticket.propuesto"
  else:
    propose "Falta info: {{r.faltaInfo}}"`;

interface PanelOptions {
  error?: string;
  edit?: MacroDef; // si viene, el form esta en modo edicion
}

function macroForm(opts: PanelOptions): string {
  const edit = opts.edit;
  const post = edit ? `/api/macros/${edit.id}` : "/api/macros";
  const cta = edit ? "guardar cambios" : "crear macro";
  const name = edit ? escapeHtml(edit.name) : "";
  const priority = edit ? edit.priority : 0;
  const stopAttr = !edit || edit.stop ? "checked" : "";
  const source = edit ? escapeHtml(edit.source) : "";
  const cancel = edit
    ? `<button type="button" class="btn btn--ghost" hx-get="/api/macros"
        hx-target="#macros-panel" hx-swap="innerHTML">cancelar</button>`
    : "";

  return `
  <form id="macro-form" class="form" hx-post="${post}"
    hx-target="#macros-panel" hx-swap="innerHTML">
    <div class="form__row">
      <label class="field field--grow">
        <span class="field__label">nombre</span>
        <input name="name" placeholder="triage-facturas" autocomplete="off"
          value="${name}" required>
      </label>
      <label class="field field--num">
        <span class="field__label">prioridad</span>
        <input name="priority" type="number" value="${priority}">
      </label>
      <label class="field field--check">
        <input name="stop" type="checkbox" ${stopAttr}>
        <span class="field__label">corta cadena</span>
      </label>
    </div>
    <label class="field field--grow">
      <span class="field__label">codigo (lenguaje de macros)</span>
      <textarea name="source" class="code" rows="8" spellcheck="false"
        placeholder="${escapeHtml(PLACEHOLDER)}">${source}</textarea>
    </label>
    <div class="form__foot">
      ${cancel}
      <button class="btn btn--primary" type="submit">${cta}</button>
    </div>
  </form>`;
}

function macroRow(def: MacroDef): string {
  const on = def.enabled;
  return `
    <li class="macro ${on ? "" : "macro--off"}">
      <div class="macro__head">
        <span class="macro__dot" aria-hidden="true"></span>
        <span class="macro__name">${escapeHtml(def.name)}</span>
        <span class="macro__prio" title="prioridad">p${def.priority}</span>
      </div>
      <pre class="macro__code">${escapeHtml(def.source)}</pre>
      <div class="macro__ops">
        <button class="btn btn--ghost" hx-get="/api/macros/${def.id}/edit"
          hx-target="#macros-panel" hx-swap="innerHTML">editar</button>
        <button class="btn btn--ghost" hx-post="/api/macros/${def.id}/toggle"
          hx-target="#macros-panel" hx-swap="innerHTML">
          ${on ? "desactivar" : "activar"}
        </button>
        <button class="btn btn--danger" hx-post="/api/macros/${def.id}/delete"
          hx-target="#macros-panel" hx-swap="innerHTML"
          hx-confirm="Eliminar la macro ${escapeHtml(def.name)}?">eliminar</button>
      </div>
    </li>`;
}

function builtinRow(name: string): string {
  return `
    <li class="macro macro--builtin">
      <div class="macro__head">
        <span class="macro__dot" aria-hidden="true"></span>
        <span class="macro__name">${escapeHtml(name)}</span>
        <span class="macro__tag">base</span>
      </div>
    </li>`;
}

export interface AuthoringTurn {
  name: string;
  source: string;
  explanation: string;
  valid: boolean;
  error?: string;
}

// Burbuja de respuesta de la IA en el chat de autoria: explicacion + el codigo
// propuesto y, si compila, un boton para crearla (vos aprobas).
export function renderAuthoringTurn(turn: AuthoringTurn): string {
  const code = turn.source
    ? `<pre class="macro__code">${escapeHtml(turn.source)}</pre>`
    : "";

  const action = turn.valid
    ? `<form class="bubble__act" hx-post="/api/macros" hx-target="#macros-panel"
        hx-swap="innerHTML" hx-on::after-request="nicoleShowMacros()">
        <input type="hidden" name="name" value="${escapeHtml(turn.name)}">
        <input type="hidden" name="priority" value="0">
        <input type="hidden" name="stop" value="on">
        <input type="hidden" name="source" value="${escapeHtml(turn.source)}">
        <span class="bubble__name">${escapeHtml(turn.name)}</span>
        <button class="btn btn--primary" type="submit">crear esta macro</button>
      </form>`
    : `<p class="bubble__err">No pude generar una macro valida: ${escapeHtml(
        turn.error ?? "error",
      )}. Proba reformular el pedido.</p>`;

  return `
    <div class="bubble bubble--ai">
      <p class="bubble__text">${escapeHtml(turn.explanation)}</p>
      ${code}
      ${action}
    </div>`;
}

export function renderMacrosPanel(
  store: MacroStore,
  builtins: string[],
  opts: PanelOptions = {},
): string {
  const defs = store.list();
  const dynamic = defs.length
    ? `<ul class="macros">${defs.map(macroRow).join("")}</ul>`
    : `<p class="empty">Todavia no hay macros. Escribi una arriba (o pedila por el chat de autoria): nicole la aplica al toque, sin reiniciar.</p>`;

  const base = builtins.length
    ? `<ul class="macros">${builtins.map(builtinRow).join("")}</ul>`
    : "";

  const banner = opts.error
    ? `<p class="banner banner--error" role="alert">${escapeHtml(opts.error)}</p>`
    : "";

  return `
    ${banner}
    ${macroForm(opts)}
    <div class="macros-list">
      <h3 class="subhead">tuyas <span class="count">${defs.length}</span></h3>
      ${dynamic}
      <h3 class="subhead">base <span class="count">${builtins.length}</span></h3>
      ${base}
    </div>`;
}
