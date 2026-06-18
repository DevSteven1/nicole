# nicole

Asistente de WhatsApp con un motor de macros e IA. Escucha los mensajes
entrantes, decide que hacer mediante un sistema de reglas (macros) y dispara
acciones automaticas, opcionalmente apoyandose en un modelo de lenguaje.

El alcance es acotado a proposito: solo mensajeria (texto y medios). Sin
llamadas, sin estados, sin el resto de un cliente completo. La conexion a
WhatsApp es directa via Baileys, sin navegador.

> Aviso: usa un numero secundario. Cualquier conexion no oficial a WhatsApp
> tiene riesgo de bloqueo de la cuenta.

> Modo seguro: por defecto nicole arranca en **read-only**: observa e ingiere
> mensajes pero NO envia nada. Para habilitar el envio hay que poner
> explicitamente `READ_ONLY=false`.

## Stack

- TypeScript (ESM, estricto) sobre Node.js >= 20, con pnpm.
- WhatsApp: Baileys (WebSocket, sin navegador).
- IA: intercambiable. Se accede por la interfaz `LLMProvider` y cada proveedor
  (Anthropic, OpenAI, opencode, local, ...) es un adapter. El proveedor activo
  se elige por configuracion; el resto del codigo no depende de ninguno.
- Tests: vitest.

## Como correr

```sh
pnpm install      # instalar dependencias
pnpm dev          # desarrollo (recarga en caliente)
pnpm build        # compilar a dist/
pnpm start        # correr el build
pnpm typecheck    # chequeo de tipos sin emitir
pnpm test         # correr las pruebas
```

### Configuracion (variables de entorno)

- `READ_ONLY` (default `true`): en `true` nicole no envia nada. Poner `false`
  para habilitar respuestas.
- `AUTH_DIR` (default `auth_state`): carpeta de la sesion de WhatsApp.
- `LLM_PROVIDER` (default `opencode`): proveedor de IA activo.
- `OPENCODE_API_KEY`: clave de OpenCode Go. Sin ella la IA queda desactivada.
- `OPENCODE_BASE_URL` (default `https://opencode.ai/zen/go/v1`) y
  `OPENCODE_MODEL` (default `kimi-k2.7-code`).
- `EMIT_ENABLED` (default `false`): en `false` el handoff (`ctx.emit`) solo
  loguea la intencion. Poner `true` (mas `EMIT_WEBHOOK_URL`) para mandarla de
  verdad.
- `EMIT_WEBHOOK_URL`: webhook generico (no atado a n8n) que recibe la intencion
  por HTTP POST. Sin url, el handoff sigue solo logueando.
- `EMIT_TIMEOUT_MS` (default `10000`) y `EMIT_RETRIES` (default `2`): timeout y
  reintentos del envio al webhook.
- `WEB_ENABLED` (default `true`): consola web embebida. `WEB_HOST` (default
  `127.0.0.1`) y `WEB_PORT` (default `4321`).
- `LOG_LEVEL` (default `info`) y `BAILEYS_LOG_LEVEL` (default `warn`).

Las variables se pueden poner en un archivo `.env` (ver `.env.example`); nicole
lo carga solo al arrancar.

## Arquitectura

```
WhatsApp (conexion)  ->  Motor de macros  ->  Acciones + IA
   recibe mensaje         decide que hacer      responde / dispara
```

El corazon es el **motor de macros**. Una macro es, en esencia:

```ts
interface Macro {
  name: string
  match: Matcher   // que mensaje me toca
  run:   Handler   // que hago
}
```

Cada macro recibe un `Context` con herramientas y se registra sola. Agregar un
comportamiento nuevo es escribir una macro nueva. Lo que ofrece el contexto:

- `reply` / `send` / `react`: envian (bloqueado en read-only).
- `ai`: razonar con la IA (via `LLMProvider`).
- `propose`: proponer una respuesta sin enviarla (seguro en read-only).
- `emit`: emitir una intencion estructurada para otro agente (handoff
  desacoplado). Por defecto loguea; con `EMIT_ENABLED=true` la manda a un webhook.
- `memory`: historial reciente del chat.
- `state`: estado clave-valor por chat (para recordar entre mensajes).

### Macros actuales

- `log`: observador, registra todo mensaje entrante (no corta la cadena).
- `ping`: responde `pong` a `ping` / `!ping` (canario de extremo a extremo).
- `triage`: lee la conversacion de soporte y, si hay un pedido claro, emite un
  ticket propuesto (`ticket.propuesto`); si es vago, propone que falta preguntar.
  No re-propone tickets ya abiertos en el chat (dedup por estado).

## Consola web

nicole trae una consola embebida (sin build, htmx + SSE) para observar en vivo y
crear macros. Por defecto en `http://127.0.0.1:4321` (se apaga con
`WEB_ENABLED=false`). Ofrece:

- Cinta de eventos en vivo, codificada por color: mensajes entrantes, propuestas
  (`propose`), intenciones emitidas (`emit`), envios y estado del sistema.
- Vista por chat con los tickets que nicole fue proponiendo.
- Chat de autoria: describis en lenguaje natural la macro que queres y la IA la
  arma en el lenguaje de macros; vos la revisas y, si te sirve, la creas (la IA
  propone, vos aprobas).
- Inspector de macros: ves/editas el codigo de cada macro y la activas, desactivas
  o eliminas. El motor las aplica en caliente, sin reiniciar. Las macros base
  (codigo) se listan como solo lectura.

Es solo observabilidad y configuracion: no saltea el read-only ni el handoff.

## Lenguaje de macros

Las macros que se crean desde la consola se escriben en un DSL propio (texto que
nicole parsea e interpreta; no se ejecuta codigo arbitrario). Un ejemplo:

```
on message when text contains "factura":
  ask ai json "clasifica este pedido: {{text}}" -> r
  if r.claro:
    emit "ticket.propuesto"
  else:
    propose "Falta info: {{r.faltaInfo}}"
```

- Cabecera `on message when <condicion>:` (el `when` es opcional y solo mira el
  texto del mensaje).
- Cuerpo indentado con pasos: `propose` / `reply` / `react` / `emit`,
  `ask ai [json] "..." -> var`, `set "clave" = <expr>`, `if/else`, `stop`.
- Expresiones en los `if` con variables de la IA (`r.claro`), `state "clave"`,
  comparadores y `and`/`or`/`not`; plantillas `{{text}}`, `{{senderName}}`,
  `{{var.campo}}`.

## Estado

En construccion, por partes. Cada parte es un commit atomico:

- [x] Scaffold del proyecto (TypeScript + pnpm)
- [x] Documentacion y convenciones
- [x] Conexion a WhatsApp (Baileys)
- [x] Motor de macros
- [x] Abstraccion de IA (`LLMProvider`) y adapter opencode
- [x] Primeras macros de ejemplo e integracion motor <-> WhatsApp

Fase de soporte (en curso):

- [x] Memoria por chat + IA en el contexto (`ai` / `propose` / `emit`)
- [x] Macro de triage: propone tickets a partir de pedidos de soporte
- [x] Dedup: no re-proponer un ticket ya emitido en el mismo chat
- [x] Handoff real: emitir la intencion a un webhook (detras de `EMIT_ENABLED`)
- [x] Consola web: observacion en vivo y editor de macros
- [x] Lenguaje de macros (DSL) + chat de autoria con IA
- [ ] Respuestas automaticas (fase avanzada)

## Pendientes

El trabajo que falta esta en [TODO.md](TODO.md) (handoff real del emit,
persistencia, ciclo de vida de tickets, control de costo, respuestas automaticas,
y mas).

## Convenciones

Ver [AGENT.md](AGENT.md) para el estilo, las convenciones de commits y el flujo
de trabajo del repositorio.
