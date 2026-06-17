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
- `emit`: emitir una intencion estructurada para otro agente (handoff desacoplado).
- `memory`: historial reciente del chat.
- `state`: estado clave-valor por chat (para recordar entre mensajes).

### Macros actuales

- `log`: observador, registra todo mensaje entrante (no corta la cadena).
- `ping`: responde `pong` a `ping` / `!ping` (canario de extremo a extremo).
- `triage`: lee la conversacion de soporte y, si hay un pedido claro, emite un
  ticket propuesto (`ticket.propuesto`); si es vago, propone que falta preguntar.
  No re-propone tickets ya abiertos en el chat (dedup por estado).

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
- [ ] Handoff real: emitir la intencion al agente que crea el ticket
- [ ] Respuestas automaticas (fase avanzada)

## Pendientes

El trabajo que falta esta en [TODO.md](TODO.md) (handoff real del emit,
persistencia, ciclo de vida de tickets, control de costo, respuestas automaticas,
y mas).

## Convenciones

Ver [AGENT.md](AGENT.md) para el estilo, las convenciones de commits y el flujo
de trabajo del repositorio.
