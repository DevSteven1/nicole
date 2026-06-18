import type { Logger } from "pino";
import { type EventHub, createNullEventHub } from "../events.js";
import type { LLMProvider } from "../llm/types.js";
import type { IncomingMessage } from "../whatsapp/types.js";
import { createLoggingSink } from "../handoff/sink.js";
import { buildContext } from "./context.js";
import { type ChatMemory, entryFromMessage } from "./memory.js";
import { type ChatState, createInMemoryState } from "./state.js";
import type { HandoffSink, Macro, Messenger } from "./types.js";

export interface MacroEngineOptions {
  llm?: LLMProvider | null;
  memory?: ChatMemory;
  state?: ChatState;
  handoff?: HandoffSink;
  events?: EventHub;
}

// El motor de macros: mantiene un registro ordenado por prioridad y enruta cada
// mensaje entrante por el.
export class MacroEngine {
  private readonly macros: Macro[] = [];
  private readonly llm: LLMProvider | null;
  private readonly memory: ChatMemory | null;
  private readonly state: ChatState;
  private readonly handoff: HandoffSink;
  private readonly events: EventHub;

  constructor(
    private readonly logger: Logger,
    opts: MacroEngineOptions = {},
  ) {
    this.llm = opts.llm ?? null;
    this.memory = opts.memory ?? null;
    this.state = opts.state ?? createInMemoryState();
    // Default seguro: si no se inyecta sink, el handoff solo loguea.
    this.handoff = opts.handoff ?? createLoggingSink(logger);
    // Sin hub real, los eventos se descartan (consola web apagada).
    this.events = opts.events ?? createNullEventHub();
  }

  register(macro: Macro): this {
    this.macros.push(macro);
    this.sort();
    return this;
  }

  registerAll(macros: Macro[]): this {
    for (const macro of macros) this.macros.push(macro);
    this.sort();
    return this;
  }

  // Quita una macro por nombre. Devuelve true si existia.
  unregister(name: string): boolean {
    const i = this.macros.findIndex((m) => m.name === name);
    if (i === -1) return false;
    this.macros.splice(i, 1);
    return true;
  }

  // Reemplaza el set de macros dinamicas (las creadas desde la consola). Borra
  // las anteriores que matcheen el prefijo y registra las nuevas. Las macros
  // base (codigo) no llevan prefijo, asi que no se tocan.
  replaceDynamic(macros: Macro[], prefix = "dyn:"): this {
    for (let i = this.macros.length - 1; i >= 0; i--) {
      if (this.macros[i]!.name.startsWith(prefix)) this.macros.splice(i, 1);
    }
    this.macros.push(...macros);
    this.sort();
    return this;
  }

  // Orden por prioridad descendente. Array.sort es estable, asi que las macros
  // con la misma prioridad mantienen el orden de registro.
  private sort(): void {
    this.macros.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  list(): readonly Macro[] {
    return this.macros;
  }

  // Evalua las macros en orden de prioridad. Ejecuta la primera que matchea y
  // corta la cadena, salvo que la macro tenga stop=false (observador pasivo), en
  // cuyo caso sigue evaluando las siguientes. Un error en una macro se loguea y
  // no frena al resto.
  async dispatch(message: IncomingMessage, messenger: Messenger): Promise<void> {
    // Acumula el contexto del chat en cada mensaje (gratis, sin IA).
    if (this.memory) {
      this.memory.append(message.chatId, entryFromMessage(message));
    }

    this.events.publish({
      type: "message",
      chatId: message.chatId,
      sender: message.sender,
      senderName: message.senderName,
      text: message.text || `[${message.type}]`,
    });

    const ctx = buildContext({
      message,
      messenger,
      logger: this.logger,
      llm: this.llm,
      memory: this.memory ? this.memory.get(message.chatId) : [],
      state: this.state,
      handoff: this.handoff,
      events: this.events,
    });

    for (const macro of this.macros) {
      if (!macro.match(message)) continue;
      this.events.publish({
        type: "macro",
        chatId: message.chatId,
        macro: macro.name,
      });
      try {
        await macro.run(ctx);
      } catch (err) {
        this.logger.error({ err, macro: macro.name }, "una macro fallo");
      }
      if (macro.stop !== false) break;
    }
  }
}
