import type { Logger } from "pino";
import type { IncomingMessage } from "../whatsapp/types.js";
import { buildContext } from "./context.js";
import type { Macro, Messenger } from "./types.js";

// El motor de macros: mantiene un registro ordenado por prioridad y enruta cada
// mensaje entrante por el.
export class MacroEngine {
  private readonly macros: Macro[] = [];

  constructor(private readonly logger: Logger) {}

  register(macro: Macro): this {
    this.macros.push(macro);
    // Orden por prioridad descendente. Array.sort es estable, asi que las macros
    // con la misma prioridad mantienen el orden de registro.
    this.macros.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return this;
  }

  registerAll(macros: Macro[]): this {
    for (const macro of macros) this.register(macro);
    return this;
  }

  list(): readonly Macro[] {
    return this.macros;
  }

  // Evalua las macros en orden de prioridad. Ejecuta la primera que matchea y
  // corta la cadena, salvo que la macro tenga stop=false (observador pasivo), en
  // cuyo caso sigue evaluando las siguientes. Un error en una macro se loguea y
  // no frena al resto.
  async dispatch(message: IncomingMessage, messenger: Messenger): Promise<void> {
    const ctx = buildContext(message, messenger, this.logger);
    for (const macro of this.macros) {
      if (!macro.match(message)) continue;
      try {
        await macro.run(ctx);
      } catch (err) {
        this.logger.error({ err, macro: macro.name }, "una macro fallo");
      }
      if (macro.stop !== false) break;
    }
  }
}
