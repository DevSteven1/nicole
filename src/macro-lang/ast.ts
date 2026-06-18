// AST del lenguaje de macros de nicole. Una macro se escribe como texto, se
// parsea a este arbol y se interpreta contra el Context del motor. No se ejecuta
// codigo: el set de operaciones es cerrado y seguro.

export class MacroLangError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
  ) {
    super(line ? `linea ${line}: ${message}` : message);
    this.name = "MacroLangError";
  }
}

// Expresiones: se usan en el `when` (solo cosas del mensaje) y en los `if` del
// cuerpo (ahi pueden tocar estado y variables de la IA).
export type Expr =
  | { t: "str"; value: string }
  | { t: "num"; value: number }
  | { t: "bool"; value: boolean }
  | { t: "regex"; value: string; flags: string }
  | { t: "ref"; path: string[] } // text, senderName, r.claro, ...
  | { t: "state"; key: string }
  | { t: "not"; e: Expr }
  | { t: "and"; es: Expr[] }
  | { t: "or"; es: Expr[] }
  | { t: "cmp"; op: CmpOp; l: Expr; r: Expr };

export type CmpOp = "==" | "!=" | "contains" | "matches" | "starts" | "is";

// Pasos del cuerpo, en orden.
export type Step =
  | { t: "say"; kind: "propose" | "reply"; tmpl: string }
  | { t: "react"; emoji: string }
  | { t: "emit"; kind: string }
  | { t: "ai"; prompt: string; json: boolean; var: string }
  | { t: "set"; key: string; expr: Expr }
  | { t: "if"; cond: Expr; then: Step[]; otherwise: Step[] }
  | { t: "stop" };

export interface MacroAst {
  when: Expr | null; // null = siempre matchea
  body: Step[];
}
