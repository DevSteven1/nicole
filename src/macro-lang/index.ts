import type { Context, Matcher } from "../engine/types.js";
import type { MacroAst } from "./ast.js";
import { compileWhen, runBody } from "./interpreter.js";
import { parse } from "./parser.js";

export { MacroLangError } from "./ast.js";
export type { MacroAst } from "./ast.js";
export { parse } from "./parser.js";

// Una macro compilada: el matcher y el handler listos para el motor. El motor no
// sabe nada del lenguaje; recibe estas dos funciones como cualquier otra macro.
export interface CompiledMacro {
  match: Matcher;
  run: (ctx: Context) => Promise<void>;
}

// Parsea y compila el source a matcher + run. Lanza MacroLangError si el source
// no es valido (con numero de linea), util para validar antes de guardar.
export function compile(source: string): CompiledMacro {
  return fromAst(parse(source));
}

export function fromAst(ast: MacroAst): CompiledMacro {
  return {
    match: compileWhen(ast.when),
    run: runBody(ast.body),
  };
}
