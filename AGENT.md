# AGENT.md

Instrucciones y convenciones para cualquier agente de IA (incluido Claude Code)
que trabaje en este repositorio. Lee este archivo completo antes de hacer cambios.

## Sobre el proyecto

nicole es un asistente de WhatsApp con un motor de macros e IA. Escucha los
mensajes entrantes, decide que hacer mediante un sistema de reglas (macros) y
dispara acciones automaticas, opcionalmente apoyandose en un modelo de lenguaje.

El alcance es deliberadamente acotado: solo mensajeria (texto y medios). No hay
soporte para llamadas, estados ni el resto de funciones de un cliente completo.
La idea es quedarse con lo util para automatizar y dejar lugar para meter IA en
profundidad.

El stack es TypeScript (ESM, modo estricto) sobre Node.js >= 20, con pnpm como
gestor. La conexion a WhatsApp es directa via Baileys (WebSocket, sin navegador).
No introduzcas dependencias ni un cambio de estructura grande sin preguntar antes.

### La IA es intercambiable

La capa de IA NO esta atada a ningun proveedor. Se accede siempre a traves de una
interfaz (`LLMProvider`) y cada proveedor (Anthropic, OpenAI, opencode, local,
etc.) es un adapter detras de esa interfaz. El resto del codigo no debe importar
el SDK de un proveedor directamente ni asumir cual esta en uso; todo pasa por la
abstraccion. El proveedor activo se elige por configuracion.

## Reglas de estilo

- Nunca uses emojis. Ni en codigo, ni en commits, ni en documentacion, ni en la
  salida del asistente.
- Escribe en espanol claro y directo en la documentacion del proyecto.
- Prefiere texto plano y simple. Evita adornos innecesarios.
- Comentarios solo cuando aporten valor; explica el "por que", no el "que".
- Manten la coherencia con el codigo existente: nombres, indentacion e idioma.

## Convenciones de commits

Usa Conventional Commits con commits atomicos. Los mensajes de commit se
escriben en ingles.

### Formato

```
<type>(<optional scope>): <description in imperative, lowercase>

<optional body explaining the why>

<optional footer: BREAKING CHANGE, refs, etc.>
```

### Tipos permitidos

- `feat`: nueva funcionalidad
- `fix`: correccion de un error
- `docs`: solo documentacion
- `style`: formato, espacios, sin cambios de logica
- `refactor`: cambio de codigo que no corrige error ni anade funcionalidad
- `perf`: mejora de rendimiento
- `test`: anadir o corregir pruebas
- `build`: cambios en el sistema de build o dependencias
- `ci`: cambios en configuracion de integracion continua
- `chore`: tareas de mantenimiento sin impacto en src
- `revert`: revierte un commit anterior

### Reglas

- Mensajes de commit en ingles.
- Commits atomicos: un commit = un cambio logico completo. Si un cambio toca
  varias cosas independientes, divide en varios commits.
- La descripcion va en imperativo y minuscula: "add validation", no
  "Added validation" ni "Adds validation".
- Sin punto final en la descripcion.
- Maximo 72 caracteres en la primera linea.
- Sin emojis en ningun commit.
- Nunca anadas un pie de coautor (sin `Co-Authored-By:`).
- Los cambios que rompen compatibilidad llevan `BREAKING CHANGE:` en el pie o un
  `!` despues del tipo o ambito (ej. `feat!: ...`).

### Ejemplos

```
feat(whatsapp): add baileys connection with qr pairing
fix(engine): avoid running a macro twice on the same message
docs: document the macro matching semantics
refactor(llm): extract provider selection into its own module
```

## Flujo de trabajo

- Se construye por partes: cada parte es un commit atomico y se revisa antes de
  seguir con la siguiente.
- No hagas commits ni push salvo que se pida explicitamente.
- Nunca hagas commit sin correr los tests antes (`pnpm test`). Todos deben
  pasar. Si algun cambio toca tipos, corre tambien `pnpm typecheck`.
- Antes de hacer commit, deja el arbol de trabajo limpio y revisa el diff.
- Trabaja en ramas con nombre descriptivo cuando aplique: `feat/...`, `fix/...`.
- No subas secretos, claves ni archivos de configuracion local al repositorio.
  La sesion de WhatsApp (`auth_state/`) y el `.env` estan ignorados a proposito.

## Pruebas

- Framework: vitest. Los tests viven en `test/`.
- Apunta a tener unitarios sobre la logica pura (matchers, motor de reglas,
  normalizacion de mensajes) sin depender de la red ni de WhatsApp real.
- Toda funcionalidad nueva debe ir acompanada de pruebas. Cubre tanto el camino
  feliz como los errores.
- Comandos: `pnpm test` (una pasada) y `pnpm test:watch` (modo continuo).

## Arquitectura

El flujo es: WhatsApp -> motor de macros -> acciones (+ IA opcional).

```
WhatsApp (conexion)  ->  Motor de macros  ->  Acciones + IA
   recibe mensaje         decide que hacer      responde / dispara
```

Estructura prevista de `src/` (se completa por partes; no todo existe aun):

- `src/index.ts`: punto de entrada. Arranca la conexion y el motor.
- `src/whatsapp/`: cliente Baileys (conexion, QR, reconexion, sesion) y la
  normalizacion del mensaje crudo a un tipo propio del dominio.
- `src/engine/`: el motor de macros. Define la interfaz `Macro`
  (`match` + `run`), el `Context` que reciben las macros y el registro que las
  evalua. Es el corazon del proyecto.
- `src/llm/`: la abstraccion `LLMProvider` y sus adapters por proveedor.
- `src/rules/`: las macros concretas. Cada una se registra sola.

Como ejecutar: ver [README.md](README.md) (`pnpm dev`, `pnpm build`,
`pnpm test`).
