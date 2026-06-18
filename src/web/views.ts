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

function matchSummary(def: MacroDef): string {
  const m = def.match;
  if (m.kind === "always") return "siempre";
  if (m.kind === "regex") return `regex /${m.value}/${m.flags ?? ""}`;
  return `${m.kind} "${m.value}"`;
}

function actionSummary(def: MacroDef): string {
  const a = def.action;
  switch (a.kind) {
    case "reply":
      return `responder: ${a.text}`;
    case "propose":
      return `proponer: ${a.text}`;
    case "react":
      return `reaccionar ${a.emoji}`;
    case "emit":
      return `emitir ${a.kindName}`;
  }
}

function macroRow(def: MacroDef): string {
  const on = def.enabled;
  return `
    <li class="macro ${on ? "" : "macro--off"}" data-action="${def.action.kind}">
      <div class="macro__head">
        <span class="macro__dot" aria-hidden="true"></span>
        <span class="macro__name">${escapeHtml(def.name)}</span>
        <span class="macro__prio" title="prioridad">p${def.priority}</span>
      </div>
      <div class="macro__rule">
        <span class="macro__when">${escapeHtml(matchSummary(def))}</span>
        <span class="macro__arrow" aria-hidden="true">-&gt;</span>
        <span class="macro__do">${escapeHtml(actionSummary(def))}</span>
      </div>
      <div class="macro__ops">
        <button class="btn btn--ghost" hx-post="/api/macros/${def.id}/toggle"
          hx-target="#macros-panel" hx-swap="innerHTML">
          ${on ? "desactivar" : "activar"}
        </button>
        <button class="btn btn--danger" hx-post="/api/macros/${def.id}/delete"
          hx-target="#macros-panel" hx-swap="innerHTML"
          hx-confirm="Eliminar la macro ${escapeHtml(def.name)}?">
          eliminar
        </button>
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

const form = `
  <form id="macro-form" class="form" hx-post="/api/macros"
    hx-target="#macros-panel" hx-swap="innerHTML">
    <div class="form__row">
      <label class="field field--grow">
        <span class="field__label">nombre</span>
        <input name="name" placeholder="saludo-bienvenida" autocomplete="off" required>
      </label>
      <label class="field field--num">
        <span class="field__label">prioridad</span>
        <input name="priority" type="number" value="0">
      </label>
      <label class="field field--check">
        <input name="stop" type="checkbox" checked>
        <span class="field__label">corta cadena</span>
      </label>
    </div>

    <div class="form__row">
      <label class="field">
        <span class="field__label">cuando</span>
        <select name="matchKind" data-controls="match">
          <option value="contains">el texto contiene</option>
          <option value="equals">el texto es igual a</option>
          <option value="prefix">empieza con</option>
          <option value="regex">regex</option>
          <option value="always">siempre</option>
        </select>
      </label>
      <label class="field field--grow" data-match-value>
        <span class="field__label">valor</span>
        <input name="matchValue" placeholder="hola" autocomplete="off">
      </label>
      <label class="field field--flags" data-match-flags hidden>
        <span class="field__label">flags</span>
        <input name="matchFlags" placeholder="i" autocomplete="off">
      </label>
    </div>

    <div class="form__row">
      <label class="field">
        <span class="field__label">accion</span>
        <select name="actionKind" data-controls="action">
          <option value="propose">proponer respuesta</option>
          <option value="reply">responder</option>
          <option value="react">reaccionar</option>
          <option value="emit">emitir intencion</option>
        </select>
      </label>
      <label class="field field--grow" data-action-text>
        <span class="field__label">texto (usa {{text}}, {{senderName}})</span>
        <input name="actionText" placeholder="Hola {{senderName}}, ya te leo" autocomplete="off">
      </label>
      <label class="field field--flags" data-action-emoji hidden>
        <span class="field__label">emoji</span>
        <input name="actionEmoji" placeholder="ok" autocomplete="off">
      </label>
      <label class="field field--grow" data-action-kind hidden>
        <span class="field__label">tipo de intencion</span>
        <input name="actionKindName" placeholder="ticket.propuesto" autocomplete="off">
      </label>
    </div>

    <div class="form__foot">
      <button class="btn btn--primary" type="submit">crear macro</button>
    </div>
  </form>`;

// Panel completo: form + error opcional + lista de dinamicas + lista de base.
export function renderMacrosPanel(
  store: MacroStore,
  builtins: string[],
  error?: string,
): string {
  const defs = store.list();
  const dynamic = defs.length
    ? `<ul class="macros">${defs.map(macroRow).join("")}</ul>`
    : `<p class="empty">Todavia no creaste ninguna macro. Arma una arriba: nicole la aplica al toque, sin reiniciar.</p>`;

  const base = builtins.length
    ? `<ul class="macros">${builtins.map(builtinRow).join("")}</ul>`
    : "";

  const banner = error
    ? `<p class="banner banner--error" role="alert">${escapeHtml(error)}</p>`
    : "";

  return `
    ${banner}
    ${form}
    <div class="macros-list">
      <h3 class="subhead">tuyas <span class="count">${defs.length}</span></h3>
      ${dynamic}
      <h3 class="subhead">base <span class="count">${builtins.length}</span></h3>
      ${base}
    </div>`;
}
