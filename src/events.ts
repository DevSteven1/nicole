// Bus de eventos en memoria para alimentar la interfaz en vivo. El motor y el
// contexto publican aca lo que va pasando (mensajes entrantes, propuestas,
// intenciones emitidas, envios, estado del sistema) y la consola web se
// suscribe. Es solo observabilidad: si nadie escucha, no cuesta nada.
//
// No reemplaza al logger ni al choke point de read-only; es una capa paralela.

export type NicoleEventType =
  | "message" // mensaje entrante de WhatsApp
  | "propose" // respuesta propuesta (no enviada)
  | "emit" // intencion emitida (handoff)
  | "send" // envio real / intento de envio (bloqueado en read-only)
  | "react" // reaccion con emoji
  | "macro" // una macro matcheo y se ejecuto
  | "system"; // estado del sistema (conexion, arranque, etc.)

export interface NicoleEvent {
  id: number;
  ts: number; // epoch en ms
  type: NicoleEventType;
  chatId?: string;
  sender?: string;
  senderName?: string;
  text?: string;
  kind?: string; // para emit: el tipo de intencion
  data?: unknown; // para emit: el payload
  emoji?: string; // para react
  macro?: string; // para macro: nombre
  level?: "info" | "warn" | "error"; // para system
  message?: string; // para system
}

// Lo que se publica: el hub completa id y ts.
export type EventInput = Omit<NicoleEvent, "id" | "ts"> & { ts?: number };

export type EventListener = (event: NicoleEvent) => void;

export interface EventHub {
  publish(input: EventInput): NicoleEvent;
  subscribe(listener: EventListener): () => void;
  // Eventos recientes en orden cronologico (para pintar al conectar).
  recent(): NicoleEvent[];
}

// Hub con un buffer acotado a los ultimos `max` eventos: la consola que recien
// se conecta ve algo de historia sin que la memoria crezca para siempre.
export function createEventHub(max = 200): EventHub {
  const buffer: NicoleEvent[] = [];
  const listeners = new Set<EventListener>();
  let seq = 0;

  return {
    publish(input) {
      const event: NicoleEvent = {
        ...input,
        id: ++seq,
        ts: input.ts ?? Date.now(),
      };
      buffer.push(event);
      if (buffer.length > max) buffer.splice(0, buffer.length - max);
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Un suscriptor roto (ej. SSE que se cerro) no debe frenar al resto.
        }
      }
      return event;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recent() {
      return [...buffer];
    },
  };
}

// Hub nulo: descarta todo. Es el default cuando la consola web esta apagada,
// asi el motor y el contexto no necesitan chequear si hay hub.
export function createNullEventHub(): EventHub {
  return {
    publish: (input) => ({ ...input, id: 0, ts: input.ts ?? 0 }),
    subscribe: () => () => {},
    recent: () => [],
  };
}
