import {
  always,
  and,
  contains,
  not,
  or,
  prefix,
  regex,
  text as textEquals,
} from "../engine/matchers.js";
import type { Context, Matcher } from "../engine/types.js";
import { type Expr, MacroLangError, type Step } from "./ast.js";

// Senal interna para cortar la ejecucion del cuerpo (paso `stop`).
const STOP = Symbol("stop");

// Scope de ejecucion: variables del mensaje mas las que crea `ask ai ... -> var`.
type Scope = Map<string, unknown>;

// ----- compilar el `when` a un Matcher del motor -----
// El matcher es sincrono y solo ve el mensaje, asi que el `when` se limita a
// condiciones sobre el texto. Estado y variables van en los `if` del cuerpo.
export function compileWhen(when: Expr | null): Matcher {
  if (!when) return always();
  return toMatcher(when);
}

function toMatcher(e: Expr): Matcher {
  switch (e.t) {
    case "and":
      return and(...e.es.map(toMatcher));
    case "or":
      return or(...e.es.map(toMatcher));
    case "not":
      return not(toMatcher(e.e));
    case "cmp": {
      if (e.l.t !== "ref" || e.l.path.length !== 1 || e.l.path[0] !== "text") {
        throw new MacroLangError(
          'el "when" solo soporta condiciones sobre "text"',
        );
      }
      if (e.op === "contains" && e.r.t === "str") return contains(e.r.value);
      if ((e.op === "is" || e.op === "==") && e.r.t === "str") {
        return textEquals(e.r.value);
      }
      if (e.op === "starts" && e.r.t === "str") return prefix(e.r.value);
      if (e.op === "matches" && e.r.t === "regex") {
        return regex(new RegExp(e.r.value, e.r.flags));
      }
      throw new MacroLangError('condicion no valida en el "when"');
    }
    default:
      throw new MacroLangError('el "when" solo soporta condiciones sobre "text"');
  }
}

// ----- ejecutar el cuerpo contra el Context -----
export function runBody(body: Step[]): (ctx: Context) => Promise<void> {
  return async (ctx) => {
    const scope: Scope = new Map([
      ["text", ctx.message.text],
      ["sender", ctx.message.sender],
      ["senderName", ctx.message.senderName ?? ctx.message.sender],
      ["chatId", ctx.message.chatId],
    ]);
    try {
      await runSteps(body, scope, ctx);
    } catch (err) {
      if (err === STOP) return;
      throw err;
    }
  };
}

async function runSteps(steps: Step[], scope: Scope, ctx: Context): Promise<void> {
  for (const step of steps) await runStep(step, scope, ctx);
}

async function runStep(step: Step, scope: Scope, ctx: Context): Promise<void> {
  switch (step.t) {
    case "say":
      await ctx[step.kind](render(step.tmpl, scope, ctx));
      return;
    case "react":
      await ctx.react(step.emoji);
      return;
    case "emit":
      await ctx.emit(step.kind, { text: ctx.message.text });
      return;
    case "set":
      ctx.state.set(step.key, evalExpr(step.expr, scope, ctx));
      return;
    case "stop":
      throw STOP;
    case "ai": {
      const out = await ctx.ai(render(step.prompt, scope, ctx));
      scope.set(step.var, step.json ? parseJsonTolerant(out) : out);
      return;
    }
    case "if": {
      const branch = truthy(evalExpr(step.cond, scope, ctx))
        ? step.then
        : step.otherwise;
      await runSteps(branch, scope, ctx);
      return;
    }
  }
}

// ----- evaluacion de expresiones (en runtime, scope completo) -----
function evalExpr(e: Expr, scope: Scope, ctx: Context): unknown {
  switch (e.t) {
    case "str":
      return e.value;
    case "num":
      return e.value;
    case "bool":
      return e.value;
    case "regex":
      return new RegExp(e.value, e.flags);
    case "ref":
      return resolvePath(e.path, scope);
    case "state":
      return ctx.state.get(e.key);
    case "not":
      return !truthy(evalExpr(e.e, scope, ctx));
    case "and":
      return e.es.every((x) => truthy(evalExpr(x, scope, ctx)));
    case "or":
      return e.es.some((x) => truthy(evalExpr(x, scope, ctx)));
    case "cmp":
      return evalCmp(e, scope, ctx);
  }
}

function evalCmp(
  e: Extract<Expr, { t: "cmp" }>,
  scope: Scope,
  ctx: Context,
): boolean {
  const l = evalExpr(e.l, scope, ctx);
  switch (e.op) {
    case "==":
    case "is":
      return looseEq(l, evalExpr(e.r, scope, ctx));
    case "!=":
      return !looseEq(l, evalExpr(e.r, scope, ctx));
    case "contains":
      return str(l).toLowerCase().includes(str(evalExpr(e.r, scope, ctx)).toLowerCase());
    case "starts":
      return str(l).toLowerCase().startsWith(str(evalExpr(e.r, scope, ctx)).toLowerCase());
    case "matches": {
      const r = evalExpr(e.r, scope, ctx);
      return r instanceof RegExp ? r.test(str(l)) : false;
    }
  }
}

function resolvePath(path: string[], scope: Scope): unknown {
  let cur: unknown = scope.has(path[0]!) ? scope.get(path[0]!) : undefined;
  for (let i = 1; i < path.length; i++) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[path[i]!];
  }
  return cur;
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.length > 0;
  return Boolean(v);
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === typeof b) return a === b;
  return str(a) === str(b);
}

function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Reemplaza {{ path }} con el valor del scope, stringificado.
function render(tmpl: string, scope: Scope, _ctx: Context): string {
  return tmpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_whole, raw: string) =>
    str(resolvePath(raw.split("."), scope)),
  );
}

// Extrae JSON de la respuesta de la IA, tolerando ```json y texto alrededor.
// Si no se puede parsear, devuelve el texto crudo (mejor que romper la macro).
function parseJsonTolerant(rawText: string): unknown {
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return rawText;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return rawText;
  }
}
