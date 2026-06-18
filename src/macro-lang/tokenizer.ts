import { MacroLangError } from "./ast.js";

// Tokenizador del lenguaje. Trabaja por lineas (la indentacion es significativa,
// como en Python) y dentro de cada linea produce tokens. Las lineas vacias y los
// comentarios (#) se descartan.

export type TokKind = "ident" | "str" | "num" | "regex" | "op";

export interface Tok {
  kind: TokKind;
  value: string;
  flags?: string; // solo para regex
}

export interface Line {
  indent: number;
  tokens: Tok[];
  line: number; // numero de linea (1-based) para errores
}

const TWO_CHAR = new Set(["->", "==", "!="]);
const ONE_CHAR = new Set(["=", ":", "(", ")", "."]);

export function tokenize(source: string): Line[] {
  const lines: Line[] = [];
  const raw = source.split(/\r?\n/);

  for (let i = 0; i < raw.length; i++) {
    const text = raw[i]!;
    const lineNo = i + 1;

    let j = 0;
    let indent = 0;
    while (j < text.length && text[j] === " ") {
      indent++;
      j++;
    }
    if (text[j] === "\t") {
      throw new MacroLangError("usa espacios para indentar, no tabs", lineNo);
    }

    const tokens: Tok[] = [];
    while (j < text.length) {
      const ch = text[j]!;

      if (ch === " ") {
        j++;
        continue;
      }
      if (ch === "#") break; // comentario hasta fin de linea

      if (ch === '"') {
        const [value, next] = readString(text, j, lineNo);
        tokens.push({ kind: "str", value });
        j = next;
        continue;
      }
      if (ch === "/") {
        const [value, flags, next] = readRegex(text, j, lineNo);
        tokens.push({ kind: "regex", value, flags });
        j = next;
        continue;
      }
      if (isDigit(ch) || (ch === "-" && isDigit(text[j + 1] ?? ""))) {
        const [value, next] = readNumber(text, j);
        tokens.push({ kind: "num", value });
        j = next;
        continue;
      }

      const two = text.slice(j, j + 2);
      if (TWO_CHAR.has(two)) {
        tokens.push({ kind: "op", value: two });
        j += 2;
        continue;
      }
      if (ONE_CHAR.has(ch)) {
        tokens.push({ kind: "op", value: ch });
        j++;
        continue;
      }
      if (isIdentStart(ch)) {
        const [value, next] = readIdent(text, j);
        tokens.push({ kind: "ident", value });
        j = next;
        continue;
      }

      throw new MacroLangError(`caracter inesperado: ${ch}`, lineNo);
    }

    if (tokens.length > 0) lines.push({ indent, tokens, line: lineNo });
  }

  return lines;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function readString(text: string, start: number, lineNo: number): [string, number] {
  let out = "";
  let j = start + 1;
  while (j < text.length) {
    const ch = text[j]!;
    if (ch === "\\") {
      const nx = text[j + 1];
      if (nx === '"' || nx === "\\") {
        out += nx;
        j += 2;
        continue;
      }
      if (nx === "n") {
        out += "\n";
        j += 2;
        continue;
      }
    }
    if (ch === '"') return [out, j + 1];
    out += ch;
    j++;
  }
  throw new MacroLangError("cadena sin cerrar", lineNo);
}

function readRegex(
  text: string,
  start: number,
  lineNo: number,
): [string, string, number] {
  let out = "";
  let j = start + 1;
  while (j < text.length) {
    const ch = text[j]!;
    if (ch === "\\") {
      out += ch + (text[j + 1] ?? "");
      j += 2;
      continue;
    }
    if (ch === "/") {
      j++;
      let flags = "";
      while (j < text.length && /[a-z]/.test(text[j]!)) {
        flags += text[j];
        j++;
      }
      return [out, flags, j];
    }
    out += ch;
    j++;
  }
  throw new MacroLangError("expresion regular sin cerrar", lineNo);
}

function readNumber(text: string, start: number): [string, number] {
  let j = start;
  if (text[j] === "-") j++;
  while (j < text.length && (isDigit(text[j]!) || text[j] === ".")) j++;
  return [text.slice(start, j), j];
}

function readIdent(text: string, start: number): [string, number] {
  let j = start;
  while (j < text.length && /[A-Za-z0-9_]/.test(text[j]!)) j++;
  return [text.slice(start, j), j];
}
