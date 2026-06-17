# nicole

Asistente de WhatsApp con un motor de macros e IA. Escucha los mensajes
entrantes, decide que hacer mediante un sistema de reglas (macros) y dispara
acciones automaticas, opcionalmente apoyandose en un modelo de lenguaje.

El alcance es acotado a proposito: solo mensajeria (texto y medios). Sin
llamadas, sin estados, sin el resto de un cliente completo. La conexion a
WhatsApp es directa via Baileys, sin navegador.

> Aviso: usa un numero secundario. Cualquier conexion no oficial a WhatsApp
> tiene riesgo de bloqueo de la cuenta.

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

Cada macro recibe un contexto con herramientas (`reply`, `send`, `react`, acceso
a la IA, estado por chat) y se registra sola. Agregar un comportamiento nuevo es
escribir una macro nueva.

## Estado

En construccion, por partes. Cada parte es un commit atomico:

- [x] Scaffold del proyecto (TypeScript + pnpm)
- [x] Documentacion y convenciones
- [ ] Conexion a WhatsApp (Baileys)
- [ ] Motor de macros
- [ ] Abstraccion de IA (`LLMProvider`) y primer adapter
- [ ] Primeras macros de ejemplo

## Convenciones

Ver [AGENT.md](AGENT.md) para el estilo, las convenciones de commits y el flujo
de trabajo del repositorio.
