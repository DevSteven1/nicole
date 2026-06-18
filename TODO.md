# TODO

Trabajo pendiente de nicole, ordenado por prioridad. Lo hecho esta en el
roadmap del [README](README.md); aca va lo que FALTA.

## Hecho hasta ahora (resumen)

Base completa y probada: conexion WhatsApp (Baileys), motor de macros, read-only
por defecto, capa de IA intercambiable (OpenCode Go / deepseek-v4-flash), memoria
y estado por chat, y la macro de triage de soporte que propone tickets y no los
re-propone (dedup). El handoff del `emit` ya viaja de verdad: detras del flag
`EMIT_ENABLED` hace POST a un webhook generico (con timeout y reintentos); por
defecto sigue solo logueando. nicole observa y propone; los envios por WhatsApp
siguen bloqueados por read-only.

---

## 1. Persistencia

Memoria, estado y tickets abiertos viven en RAM: si nicole reinicia, se pierden
(y podria re-proponer tickets ya abiertos). Las interfaces `ChatMemory` y
`ChatState` ya estan listas para enchufar una implementacion persistente.

- [ ] Elegir store (archivo JSON simple, SQLite, etc.).
- [ ] Implementar `ChatMemory` y `ChatState` persistentes.
- [ ] Persistir la sesion de WhatsApp ya esta (auth_state/), revisar que alcance.

## 2. Ciclo de vida de los tickets

El dedup recuerda tickets abiertos por chat, pero nunca los "cierra": la lista
crece para siempre en cada chat. Falta una nocion de resolucion.

- [ ] Forma de marcar un ticket como cerrado/resuelto (probable: lo informa el
      otro agente, de vuelta hacia nicole).
- [ ] Limpiar o expirar tickets viejos del estado del chat.

## 3. Control de costo del triage

Hoy el triage llama a la IA en CADA mensaje con texto (acordado para arrancar y
ver como razona). En grupos con charla, eso son llamadas de mas.

- [ ] Pre-filtro barato antes de la IA (palabra clave, mencion a nicole,
      heuristica) para no gastar tokens en charla irrelevante.
- [ ] Opcional: limitar frecuencia por chat (rate limit / debounce).

## 4. Accion HTTP para macros (`ctx.http`)

El usuario menciono "hacer una request HTTP a otro servicio" como una accion
posible de las macros. Todavia no existe.

- [ ] Agregar `ctx.http(...)` al contexto (con timeout y manejo de error).
- [ ] Decidir si queda detras del flag read-only (es una salida externa).

## 5. Respuestas automaticas (fase avanzada)

Que nicole responda sola por WhatsApp. Hoy bloqueado por read-only a proposito.

- [ ] Definir que macros pueden responder y bajo que condiciones.
- [ ] Flujo de `propose` -> revision -> `reply` (de propuesta a envio real).
- [ ] Apagar read-only de forma controlada (por chat, por tipo de mensaje).

## 6. Cola de contexto avanzada (continuaciones explicitas)

La version simple (memoria + la IA pide mas data) ya cubre el caso "pedido vago
-> pedir lo que falta". Si hace falta algo mas fuerte:

- [ ] Continuaciones / pending-intent: una macro "espera el dato Y" y captura los
      proximos mensajes hasta cumplir la condicion.

## 7. Robustez y operacion

- [ ] Tests de integracion de la conexion (hoy solo hay unitarios de logica pura).
- [ ] Manejo de medios (imagenes/audio/documentos): hoy solo se mira el texto/caption.
- [ ] Revisar la reconexion: al reconectar se rearma el socket y el messenger; validar que no haya fugas de listeners.
- [ ] Despliegue: como correr nicole de forma persistente (servicio / contenedor).

## 8. Seguridad

- [ ] Usar siempre numero secundario (riesgo de baneo de WhatsApp).
- [ ] No loguear datos sensibles de los clientes mas de lo necesario.
- [ ] Revisar manejo de secretos (.env) en el despliegue.
