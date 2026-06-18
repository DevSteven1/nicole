import {
  type CmpOp,
  type Expr,
  type MacroAst,
  MacroLangError,
  type Step,
} from "./ast.js";
import { type Line, type Tok, tokenize } from "./tokenizer.js";

// Parser de descenso recursivo. Toma el source, lo tokeniza y arma el AST.
// Estructura: una cabecera `on message [when <expr>]:` y un cuerpo indentado de
// pasos. Los `if/else` anidan por indentacion.

const CMP_OPS = new Set(["==", "!=", "contains", "matches", "starts", "is"]);
const STEP_KEYWORDS = new Set([
  "propose",
  "reply",
  "react",
  "emit",
  "ask",
  "set",
  "if",
  "stop",
]);

export function parse(source: string): MacroAst {
  const lines = tokenize(source);
  if (lines.length === 0) {
    throw new MacroLangError("la macro esta vacia");
  }

  const cursor = { i: 0 };
  const header = lines[0]!;
  const when = parseHeader(header);
  cursor.i = 1;

  if (cursor.i >= lines.length) {
    throw new MacroLangError("la macro no tiene cuerpo", header.line);
  }
  const bodyIndent = lines[cursor.i]!.indent;
  if (bodyIndent <= header.indent) {
    throw new MacroLangError("el cuerpo debe ir indentado", lines[cursor.i]!.line);
  }

  const body = parseBlock(lines, cursor, bodyIndent);
  if (cursor.i < lines.length) {
    throw new MacroLangError("indentacion inesperada", lines[cursor.i]!.line);
  }
  return { when, body };
}

function parseHeader(line: Line): Expr | null {
  const ts = new TokenStream(line.tokens, line.line);
  ts.expectIdent("on");
  ts.expectIdent("message");

  let when: Expr | null = null;
  if (ts.peekIdent("when")) {
    ts.next();
    when = parseExpr(ts);
  }
  ts.expectOp(":");
  ts.expectEnd();
  return when;
}

// Lee pasos mientras la indentacion sea exactamente blockIndent.
function parseBlock(
  lines: Line[],
  cursor: { i: number },
  blockIndent: number,
): Step[] {
  const steps: Step[] = [];
  while (cursor.i < lines.length && lines[cursor.i]!.indent === blockIndent) {
    steps.push(parseStep(lines, cursor, blockIndent));
  }
  return steps;
}

function parseStep(
  lines: Line[],
  cursor: { i: number },
  blockIndent: number,
): Step {
  const line = lines[cursor.i]!;
  const head = line.tokens[0]!;
  if (head.kind !== "ident" || !STEP_KEYWORDS.has(head.value)) {
    throw new MacroLangError(`paso desconocido: ${head.value}`, line.line);
  }

  if (head.value === "if") return parseIf(lines, cursor, blockIndent);

  // Pasos de una sola linea.
  cursor.i++;
  const ts = new TokenStream(line.tokens, line.line);
  ts.next(); // consume keyword

  switch (head.value) {
    case "propose":
    case "reply": {
      const tmpl = ts.expectStr();
      ts.expectEnd();
      return { t: "say", kind: head.value, tmpl };
    }
    case "react": {
      const emoji = ts.expectStr();
      ts.expectEnd();
      return { t: "react", emoji };
    }
    case "emit": {
      const kind = ts.expectStr();
      ts.expectEnd();
      return { t: "emit", kind };
    }
    case "stop": {
      ts.expectEnd();
      return { t: "stop" };
    }
    case "set": {
      const key = ts.expectStr();
      ts.expectOp("=");
      const expr = parseExpr(ts);
      ts.expectEnd();
      return { t: "set", key, expr };
    }
    case "ask": {
      ts.expectIdent("ai");
      const json = ts.peekIdent("json");
      if (json) ts.next();
      const prompt = ts.expectStr();
      ts.expectOp("->");
      const variable = ts.expectIdentName();
      ts.expectEnd();
      return { t: "ai", prompt, json, var: variable };
    }
    default:
      throw new MacroLangError(`paso desconocido: ${head.value}`, line.line);
  }
}

function parseIf(
  lines: Line[],
  cursor: { i: number },
  blockIndent: number,
): Step {
  const line = lines[cursor.i]!;
  const ts = new TokenStream(line.tokens, line.line);
  ts.expectIdent("if");
  const cond = parseExpr(ts);
  ts.expectOp(":");
  ts.expectEnd();
  cursor.i++;

  const then = parseIndentedBlock(lines, cursor, blockIndent, line.line, "if");

  let otherwise: Step[] = [];
  const nxt = lines[cursor.i];
  if (
    nxt &&
    nxt.indent === blockIndent &&
    nxt.tokens[0]?.kind === "ident" &&
    nxt.tokens[0].value === "else"
  ) {
    const ets = new TokenStream(nxt.tokens, nxt.line);
    ets.expectIdent("else");
    ets.expectOp(":");
    ets.expectEnd();
    cursor.i++;
    otherwise = parseIndentedBlock(lines, cursor, blockIndent, nxt.line, "else");
  }

  return { t: "if", cond, then, otherwise };
}

function parseIndentedBlock(
  lines: Line[],
  cursor: { i: number },
  parentIndent: number,
  ownerLine: number,
  owner: string,
): Step[] {
  const next = lines[cursor.i];
  if (!next || next.indent <= parentIndent) {
    throw new MacroLangError(`el ${owner} no tiene cuerpo`, ownerLine);
  }
  return parseBlock(lines, cursor, next.indent);
}

// ----- expresiones (precedencia: or < and < not < cmp < primary) -----

function parseExpr(ts: TokenStream): Expr {
  return parseOr(ts);
}

function parseOr(ts: TokenStream): Expr {
  const first = parseAnd(ts);
  const es = [first];
  while (ts.peekIdent("or")) {
    ts.next();
    es.push(parseAnd(ts));
  }
  return es.length === 1 ? first : { t: "or", es };
}

function parseAnd(ts: TokenStream): Expr {
  const first = parseNot(ts);
  const es = [first];
  while (ts.peekIdent("and")) {
    ts.next();
    es.push(parseNot(ts));
  }
  return es.length === 1 ? first : { t: "and", es };
}

function parseNot(ts: TokenStream): Expr {
  if (ts.peekIdent("not")) {
    ts.next();
    return { t: "not", e: parseNot(ts) };
  }
  return parseCmp(ts);
}

function parseCmp(ts: TokenStream): Expr {
  const left = parsePrimary(ts);
  const op = ts.peekCmpOp();
  if (op) {
    ts.next();
    const right = parsePrimary(ts);
    return { t: "cmp", op, l: left, r: right };
  }
  return left;
}

function parsePrimary(ts: TokenStream): Expr {
  const tok = ts.peek();
  if (!tok) throw ts.err("se esperaba una expresion");

  if (tok.kind === "op" && tok.value === "(") {
    ts.next();
    const e = parseExpr(ts);
    ts.expectOp(")");
    return e;
  }
  if (tok.kind === "str") {
    ts.next();
    return { t: "str", value: tok.value };
  }
  if (tok.kind === "num") {
    ts.next();
    return { t: "num", value: Number(tok.value) };
  }
  if (tok.kind === "regex") {
    ts.next();
    return { t: "regex", value: tok.value, flags: tok.flags ?? "" };
  }
  if (tok.kind === "ident") {
    if (tok.value === "true" || tok.value === "false") {
      ts.next();
      return { t: "bool", value: tok.value === "true" };
    }
    if (tok.value === "state") {
      ts.next();
      const key = ts.expectStrOrIdent();
      return { t: "state", key };
    }
    // path: ident ("." ident)*
    ts.next();
    const path = [tok.value];
    while (ts.peekOp(".")) {
      ts.next();
      path.push(ts.expectIdentName());
    }
    return { t: "ref", path };
  }
  throw ts.err(`token inesperado: ${tok.value}`);
}

// Stream de tokens de una sola linea, con helpers de consumo.
class TokenStream {
  private pos = 0;
  constructor(
    private readonly tokens: Tok[],
    private readonly line: number,
  ) {}

  peek(): Tok | undefined {
    return this.tokens[this.pos];
  }
  next(): Tok {
    const t = this.tokens[this.pos];
    if (!t) throw this.err("fin de linea inesperado");
    this.pos++;
    return t;
  }
  err(msg: string): MacroLangError {
    return new MacroLangError(msg, this.line);
  }

  peekIdent(value: string): boolean {
    const t = this.peek();
    return t?.kind === "ident" && t.value === value;
  }
  peekOp(value: string): boolean {
    const t = this.peek();
    return t?.kind === "op" && t.value === value;
  }
  peekCmpOp(): CmpOp | null {
    const t = this.peek();
    if (!t) return null;
    if (t.kind === "op" && (t.value === "==" || t.value === "!=")) {
      return t.value;
    }
    if (t.kind === "ident" && CMP_OPS.has(t.value)) return t.value as CmpOp;
    return null;
  }

  expectIdent(value: string): void {
    const t = this.next();
    if (t.kind !== "ident" || t.value !== value) {
      throw this.err(`se esperaba "${value}"`);
    }
  }
  expectOp(value: string): void {
    const t = this.next();
    if (t.kind !== "op" || t.value !== value) {
      throw this.err(`se esperaba "${value}"`);
    }
  }
  expectStr(): string {
    const t = this.next();
    if (t.kind !== "str") throw this.err("se esperaba una cadena entre comillas");
    return t.value;
  }
  expectIdentName(): string {
    const t = this.next();
    if (t.kind !== "ident") throw this.err("se esperaba un nombre");
    return t.value;
  }
  expectStrOrIdent(): string {
    const t = this.next();
    if (t.kind === "str" || t.kind === "ident") return t.value;
    throw this.err("se esperaba una clave");
  }
  expectEnd(): void {
    if (this.pos < this.tokens.length) {
      throw this.err(`sobra "${this.tokens[this.pos]!.value}" al final`);
    }
  }
}
