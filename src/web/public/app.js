// Consola de nicole: lee el stream SSE, pinta la cinta en vivo, deriva el panel
// de chats y mantiene los chips de estado. El editor de macros lo maneja htmx;
// aca solo mejoramos el form (mostrar campos segun la accion elegida).

const GLYPH = {
  message: ">",
  propose: "~",
  emit: "*",
  send: "<",
  react: "+",
  macro: "·",
  system: "=",
};

const feed = document.getElementById("feed");
const followBox = document.getElementById("follow");
const chatsEl = document.getElementById("chats");

let currentFilter = "all";
const chats = new Map(); // chatId -> { last, tickets: [] }

// ---------- helpers ----------
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function shortChat(id) {
  if (!id) return "";
  return id.split("@")[0];
}

function hhmmss(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function ticketTitle(data) {
  if (data && typeof data === "object" && typeof data.titulo === "string") {
    return data.titulo;
  }
  return null;
}

// ---------- cinta ----------
function bodyFor(ev) {
  const body = el("div", "ev__body");
  body.appendChild(el("span", "ev__tag", ev.type));

  if (ev.type === "message") {
    if (ev.senderName || ev.sender) {
      body.appendChild(el("span", "ev__who", `${ev.senderName || shortChat(ev.sender)}: `));
    }
    body.appendChild(el("span", "ev__txt", ev.text || ""));
  } else if (ev.type === "propose" || ev.type === "send") {
    body.appendChild(el("span", "ev__txt", ev.text || ""));
  } else if (ev.type === "emit") {
    body.appendChild(el("span", "ev__txt", ev.kind || "intent"));
    const t = ticketTitle(ev.data);
    if (t) body.appendChild(el("span", "ev__who", ` ${t}`));
  } else if (ev.type === "react") {
    body.appendChild(el("span", "ev__txt", ev.emoji || ""));
  } else if (ev.type === "macro") {
    body.appendChild(el("span", "ev__txt", ev.macro || ""));
  } else {
    body.appendChild(el("span", "ev__txt", ev.message || ""));
  }

  if (ev.chatId) {
    const chat = el("span", "ev__chat", `  ${shortChat(ev.chatId)}`);
    body.appendChild(chat);
  }
  return body;
}

function applyFilter(row) {
  const t = row.dataset.type;
  row.hidden = currentFilter !== "all" && currentFilter !== t;
}

function addEvent(ev, animate) {
  const row = el("li", "ev");
  row.dataset.type = ev.type;
  row.appendChild(el("span", "ev__glyph", GLYPH[ev.type] || "."));
  row.appendChild(el("span", "ev__time", hhmmss(ev.ts)));
  row.appendChild(bodyFor(ev));
  if (animate) row.classList.add("is-new");
  applyFilter(row);
  feed.appendChild(row);

  // Acota el DOM a las ultimas 400 filas.
  while (feed.childElementCount > 400) feed.removeChild(feed.firstElementChild);

  if (followBox.checked) feed.scrollTop = feed.scrollHeight;
  trackChat(ev);
}

// ---------- chats ----------
function trackChat(ev) {
  if (!ev.chatId) return;
  let c = chats.get(ev.chatId);
  if (!c) {
    c = { last: ev.ts, tickets: [] };
    chats.set(ev.chatId, c);
  }
  c.last = ev.ts;
  if (ev.type === "emit") {
    const t = ticketTitle(ev.data) || ev.kind;
    if (t) c.tickets.push(t);
  }
  renderChats();
}

function renderChats() {
  const ordered = [...chats.entries()].sort((a, b) => b[1].last - a[1].last);
  chatsEl.replaceChildren();
  for (const [id, c] of ordered) {
    const card = el("li", "chatcard");
    const top = el("div", "chatcard__top");
    top.appendChild(el("span", "chatcard__id", shortChat(id)));
    if (c.tickets.length) {
      top.appendChild(el("span", "chatcard__count", `${c.tickets.length} ticket${c.tickets.length > 1 ? "s" : ""}`));
    }
    card.appendChild(top);
    if (c.tickets.length) {
      const ul = el("ul", "chatcard__tickets");
      for (const t of c.tickets.slice(-4)) ul.appendChild(el("li", null, t));
      card.appendChild(ul);
    }
    chatsEl.appendChild(card);
  }
}

// ---------- estado ----------
const STATUS = {
  mode: (s) => ({
    text: s.readOnly ? "read-only" : "envio",
    cls: s.readOnly ? "is-warn" : "is-bad",
  }),
  conn: (s) => {
    const ok = s.connection === "abierta";
    return {
      text: s.connection,
      cls: ok ? "is-ok" : s.connection === "cerrada" ? "is-bad" : "is-warn",
    };
  },
  ia: (s) => ({
    text: s.provider || "off",
    cls: s.provider ? "is-ok" : "is-warn",
  }),
  handoff: (s) => ({
    text: s.handoff,
    cls: s.handoff === "webhook" ? "is-ok" : "is-warn",
  }),
};

function renderStatus(s) {
  for (const [k, fn] of Object.entries(STATUS)) {
    const chip = document.querySelector(`.chip[data-k="${k}"]`);
    if (!chip) continue;
    const { text, cls } = fn(s);
    chip.querySelector("em").textContent = text;
    chip.classList.remove("is-ok", "is-warn", "is-bad");
    chip.classList.add(cls);
  }
  const meter = document.getElementById("meter");
  meter.classList.toggle("is-idle", s.connection !== "abierta");
}

async function loadStatus() {
  try {
    const res = await fetch("/api/status");
    renderStatus(await res.json());
  } catch {
    /* el SSE igual va a traer system events */
  }
}

// ---------- arranque ----------
document.getElementById("filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".flt");
  if (!btn) return;
  currentFilter = btn.dataset.f;
  document.querySelectorAll(".flt").forEach((b) => b.classList.toggle("is-on", b === btn));
  document.querySelectorAll(".ev").forEach(applyFilter);
});

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  const name = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-on", b === btn));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("is-on", p.dataset.pane === name));
});

// ---------- chat de autoria ----------
const chatLog = document.getElementById("chat-log");
const authoringForm = document.getElementById("authoring-form");

if (authoringForm && chatLog) {
  const input = authoringForm.querySelector('input[name="message"]');
  authoringForm.addEventListener("htmx:beforeRequest", () => {
    const txt = input.value.trim();
    if (!txt) return;
    const bubble = el("div", "bubble bubble--user");
    bubble.appendChild(el("p", "bubble__text", txt));
    chatLog.appendChild(bubble);
    chatLog.scrollTop = chatLog.scrollHeight;
  });
  authoringForm.addEventListener("htmx:afterRequest", () => {
    input.value = "";
  });
  chatLog.addEventListener("htmx:afterSwap", () => {
    chatLog.scrollTop = chatLog.scrollHeight;
  });
}

// Lo usa el boton "crear esta macro" de una propuesta para saltar al inspector.
window.nicoleShowMacros = () => {
  document.querySelector('.tab[data-tab="macros"]')?.click();
};

function connect() {
  const es = new EventSource("/api/stream");
  let primed = false;
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === "system") loadStatus();
    addEvent(ev, primed);
  };
  // Tras el replay inicial, los proximos eventos son nuevos (se animan).
  es.onopen = () => setTimeout(() => (primed = true), 300);
  es.onerror = () => {
    /* EventSource reintenta solo */
  };
}

loadStatus();
connect();
