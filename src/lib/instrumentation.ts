/**
 * JavaScript tracing engine for the on-canvas algorithm visualizer.
 *
 * The previous implementation appended `__captureState(...)` after any line
 * that *looked* like an assignment. That broke on braceless bodies
 * (`if (x) y = 1;` — the injected call became the body), on multi-line
 * expressions, and it read variables through `typeof x !== 'undefined'`,
 * which still throws a ReferenceError for a `let`/`const` sitting in its
 * temporal dead zone.
 *
 * This version instead:
 *  1. Tokenizes the source so strings, template literals, comments and
 *     regex literals are never mistaken for code.
 *  2. Finds genuine *statement boundaries* (after `;`, after `{`/`}` of a
 *     real block — object literals and class bodies are tracked separately)
 *     and inserts `__s(line, ...)` BEFORE each statement. Statements that
 *     sit in a braceless control-flow body are skipped rather than
 *     mis-instrumented.
 *  3. Reads each variable through its own arrow-function thunk called
 *     inside a try/catch, so temporal-dead-zone and out-of-scope names are
 *     silently skipped instead of aborting the trace.
 *  4. Captures console output per step and clones values defensively
 *     (cycle-safe, depth-capped) so linked lists and graphs don't hang the
 *     UI.
 *
 * The traced code also runs with DOM/network globals shadowed to
 * `undefined`, so a traced snippet cannot reach `document`, `fetch`,
 * `localStorage` or `XMLHttpRequest` through the scope chain.
 */

import type { Snapshot, VariableState } from "./visualizerStore";

// ── Budgets ───────────────────────────────────────────────────────────
const MAX_STEPS = 2500;
const TIME_BUDGET_MS = 4000;
const MAX_TRACKED_NAMES = 40;
const MAX_CLONE_DEPTH = 8;
const MAX_ARRAY_ITEMS = 200;
const MAX_OBJECT_KEYS = 40;

// ── Words that can never be a user variable ───────────────────────────
const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "implements", "import", "in",
  "instanceof", "interface", "let", "new", "null", "package", "private",
  "protected", "public", "return", "static", "super", "switch", "this",
  "throw", "true", "try", "typeof", "var", "void", "while", "with",
  "yield", "await", "async", "of", "get", "set", "undefined", "NaN",
  "Infinity", "arguments", "eval", "constructor", "prototype",
]);

/** Tokens that, when they follow a statement boundary, mean "not a new statement". */
const BOUNDARY_STOP_WORDS = new Set([
  "else", "case", "default", "catch", "finally", "while", "from", "as",
]);

/**
 * Values injected into the traced function's scope. Anything listed here
 * shadows the real global of the same name, which is what keeps the
 * traced snippet away from the DOM and the network.
 */
const SANDBOX_GLOBALS: Record<string, unknown> = {
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Date,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Symbol,
  Promise,
  RegExp,
  Error,
  TypeError,
  RangeError,
  BigInt,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  structuredClone: undefined,
  // Timers are stubbed rather than removed: traced code that schedules
  // work keeps running instead of throwing, but nothing leaks after the
  // trace finishes (and nothing is captured inside the callback).
  setTimeout: () => 0,
  setInterval: () => 0,
  clearTimeout: () => undefined,
  clearInterval: () => undefined,
  requestAnimationFrame: () => 0,
  // Blocked: DOM, network, storage and ambient window noise. Shadowing
  // these keeps `() => name`-style probes from resolving to `window.name`
  // and keeps traced code sandboxed.
  window: undefined,
  globalThis: undefined,
  self: undefined,
  document: undefined,
  location: undefined,
  history: undefined,
  navigator: undefined,
  screen: undefined,
  parent: undefined,
  top: undefined,
  frames: undefined,
  opener: undefined,
  closed: undefined,
  origin: undefined,
  event: undefined,
  status: undefined,
  name: undefined,
  length: undefined,
  fetch: undefined,
  XMLHttpRequest: undefined,
  WebSocket: undefined,
  Worker: undefined,
  localStorage: undefined,
  sessionStorage: undefined,
  indexedDB: undefined,
  crypto: undefined,
  alert: undefined,
  confirm: undefined,
  prompt: undefined,
  postMessage: undefined,
  importScripts: undefined,
  Function: undefined,
  process: undefined,
  require: undefined,
};

// ── Public result shape ───────────────────────────────────────────────

export interface TraceResult {
  /** Ordered execution steps. */
  snapshots: Snapshot[];
  /** Everything the snippet logged, in order. */
  stdout: string[];
  /** Runtime/syntax error message, if the snippet threw. */
  error: string | null;
  /** True when the step or time budget cut the trace short. */
  truncated: boolean;
}

// ── Tokenizer / analyzer ──────────────────────────────────────────────

interface Insertion {
  index: number;
  line: number;
}

interface Analysis {
  insertions: Insertion[];
  names: string[];
  fatal: string | null;
}

type BraceKind = "block" | "object" | "class";

function isIdentStart(c: string): boolean {
  return /[A-Za-z_$]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$]/.test(c);
}

function readWord(code: string, start: number): string {
  let i = start;
  while (i < code.length && isIdentPart(code[i])) i++;
  return code.slice(start, i);
}

/**
 * Decide whether a `/` starts a regex literal or is a division operator,
 * based on the previous significant token.
 */
function regexCanFollow(prev: string | undefined): boolean {
  if (prev === undefined) return true;
  if (prev === ")" || prev === "]" || prev === "}") return false;
  if (prev === "@ident" || prev === "@num" || prev === "@str") return false;
  if (prev === "this" || prev === "super" || prev === "true" || prev === "false" || prev === "null") {
    return false;
  }
  return true;
}

/**
 * Walk the source once, collecting statement-boundary insertion points and
 * the names of every declared binding.
 */
function analyze(code: string): Analysis {
  const insertions: Insertion[] = [];
  const names: string[] = [];
  const nameSet = new Set<string>();

  const addName = (raw: string) => {
    const n = raw.trim();
    if (!n || RESERVED.has(n) || nameSet.has(n)) return;
    if (!isIdentStart(n[0])) return;
    if (Object.prototype.hasOwnProperty.call(SANDBOX_GLOBALS, n)) return;
    nameSet.add(n);
    names.push(n);
  };

  const braceStack: BraceKind[] = [];
  /** Depth of `(` and `[`. A `;` inside a `for (...)` header lives here. */
  let groupDepth = 0;
  /** Source offsets of currently open `(`, so `=>` can find its params. */
  const parenIndexStack: number[] = [];
  /** Last few significant tokens, newest last. */
  const sig: string[] = [];
  let line = 1;
  let i = 0;
  /** The start of the file is itself a statement boundary. */
  let pendingBoundary = true;
  let fatal: string | null = null;

  const prevSig = (back = 0): string | undefined => sig[sig.length - 1 - back];

  const pushSig = (t: string) => {
    sig.push(t);
    if (sig.length > 8) sig.shift();
  };

  /** Advance past a quoted string, counting newlines. */
  const skipString = (quote: string) => {
    i++;
    while (i < code.length) {
      const ch = code[i];
      if (ch === "\\") {
        if (code[i + 1] === "\n") line++;
        i += 2;
        continue;
      }
      if (ch === "\n") line++;
      if (ch === quote) {
        i++;
        return;
      }
      i++;
    }
  };

  /**
   * Advance past a template literal, including nested `${}` expressions and
   * nested templates. Statement boundaries inside a template expression are
   * deliberately ignored — only expressions are legal there.
   */
  const skipTemplate = () => {
    i++;
    let depth = 0;
    while (i < code.length) {
      const ch = code[i];
      if (ch === "\\") {
        if (code[i + 1] === "\n") line++;
        i += 2;
        continue;
      }
      if (ch === "\n") {
        line++;
        i++;
        continue;
      }
      if (depth === 0) {
        if (ch === "`") {
          i++;
          return;
        }
        if (ch === "$" && code[i + 1] === "{") {
          depth = 1;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (ch === "`") {
        skipTemplate();
        continue;
      }
      if (ch === '"' || ch === "'") {
        skipString(ch);
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          continue;
        }
      }
      i++;
    }
  };

  const skipRegex = () => {
    i++;
    let inClass = false;
    while (i < code.length) {
      const ch = code[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "\n") {
        // Unterminated regex — bail out of the scan rather than loop.
        line++;
        i++;
        return;
      }
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) {
        i++;
        while (i < code.length && isIdentPart(code[i])) i++;
        return;
      }
      i++;
    }
  };

  /** Classify a `{` as a real block, an object literal, or a class body. */
  const classifyBrace = (): BraceKind => {
    const p1 = prevSig();
    const p2 = prevSig(1);
    if (p1 === undefined) return "block";
    if (p1 === "class" || p2 === "class" || p2 === "extends") return "class";
    if (p1 === ")" || p1 === "{" || p1 === "}" || p1 === ";" || p1 === "=>") return "block";
    if (p1 === "else" || p1 === "do" || p1 === "try" || p1 === "finally") return "block";
    return "object";
  };

  /**
   * Harvest binding names from a comma-separated head such as a
   * `let`/`const`/`var` declaration list or a parameter list. Identifiers
   * that appear after an `=` at the top level of the head are initializer
   * values, not bindings, so they're skipped. Over-collecting inside
   * destructuring patterns is harmless: unresolvable names are dropped at
   * runtime.
   */
  const harvestBindings = (text: string) => {
    let depth = 0;
    let afterEq = false;
    let j = 0;
    while (j < text.length) {
      const ch = text[j];
      if (ch === "(" || ch === "[" || ch === "{") {
        depth++;
        j++;
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        depth--;
        j++;
        continue;
      }
      if (ch === "," && depth === 0) {
        afterEq = false;
        j++;
        continue;
      }
      if (ch === "=" && depth === 0 && text[j + 1] !== "=" && text[j - 1] !== "=" &&
          text[j - 1] !== "!" && text[j - 1] !== "<" && text[j - 1] !== ">") {
        afterEq = true;
        j++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        j++;
        while (j < text.length && text[j] !== q) {
          if (text[j] === "\\") j++;
          j++;
        }
        j++;
        continue;
      }
      if (isIdentStart(ch)) {
        const word = readWord(text, j);
        j += word.length;
        // Skip object-pattern keys: `{ a: b }` binds `b`, not `a`.
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        const isPatternKey = depth > 0 && text[k] === ":";
        if (!afterEq && !isPatternKey) addName(word);
        continue;
      }
      j++;
    }
  };

  /** Find the source text inside the paren group that ends at `closeIdx`. */
  const parenBodyEndingAt = (openIdx: number, closeIdx: number): string =>
    code.slice(openIdx + 1, closeIdx);

  /** Offset of the `)` most recently closed, for arrow-param harvesting. */
  let lastCloseParen = -1;
  let lastOpenParen = -1;

  while (i < code.length) {
    const c = code[i];

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v") {
      i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) {
        if (code[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    // A real token starts here, so resolve any pending statement boundary.
    if (pendingBoundary) {
      pendingBoundary = false;
      const word = isIdentStart(c) ? readWord(code, i) : "";
      const enclosing = braceStack[braceStack.length - 1];
      const blocked =
        enclosing === "class" ||
        c === "}" ||
        c === ")" ||
        c === "]" ||
        c === "," ||
        c === ";" ||
        c === ":" ||
        BOUNDARY_STOP_WORDS.has(word);
      if (!blocked) insertions.push({ index: i, line });
    }

    if (c === '"' || c === "'") {
      skipString(c);
      pushSig("@str");
      continue;
    }
    if (c === "`") {
      skipTemplate();
      pushSig("@str");
      continue;
    }
    if (c === "/") {
      if (regexCanFollow(prevSig())) {
        skipRegex();
        pushSig("@str");
      } else {
        i++;
        pushSig("/");
      }
      continue;
    }
    if (c === "{") {
      const kind = classifyBrace();
      braceStack.push(kind);
      pushSig("{");
      i++;
      if (kind === "block" && groupDepth === 0) pendingBoundary = true;
      continue;
    }
    if (c === "}") {
      const kind = braceStack.pop();
      pushSig("}");
      i++;
      if (kind === "block" && groupDepth === 0) pendingBoundary = true;
      continue;
    }
    if (c === "(" || c === "[") {
      if (c === "(") parenIndexStack.push(i);
      groupDepth++;
      pushSig(c);
      i++;
      continue;
    }
    if (c === ")" || c === "]") {
      if (c === ")") {
        lastOpenParen = parenIndexStack.pop() ?? -1;
        lastCloseParen = i;
      }
      groupDepth = Math.max(0, groupDepth - 1);
      pushSig(c);
      i++;
      continue;
    }
    if (c === ";") {
      pushSig(";");
      i++;
      if (groupDepth === 0) pendingBoundary = true;
      continue;
    }
    if (c === "=" && code[i + 1] === ">") {
      // Arrow function: harvest its parameter bindings.
      const p1 = prevSig();
      if (p1 === ")" && lastOpenParen >= 0 && lastCloseParen > lastOpenParen) {
        harvestBindings(parenBodyEndingAt(lastOpenParen, lastCloseParen));
      } else if (p1 === "@ident") {
        // Single unparenthesized parameter: `x => ...`
        const before = code.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/);
        if (before) addName(before[1]);
      }
      pushSig("=>");
      i += 2;
      continue;
    }

    if (isIdentStart(c)) {
      const word = readWord(code, i);
      i += word.length;

      if (word === "import" || word === "export") {
        // Traced code runs inside `new Function`, which has no module scope.
        fatal =
          "`import` / `export` aren't supported in the visualizer. Paste plain script code instead.";
      }

      if (word === "let" || word === "const" || word === "var") {
        // Harvest up to the end of the declaration: a `;` at depth 0, the
        // `)` that closes a `for (...)` header, or `of`/`in`.
        let j = i;
        let depth = 0;
        while (j < code.length) {
          const ch = code[j];
          if (ch === "(" || ch === "[" || ch === "{") depth++;
          else if (ch === ")" || ch === "]" || ch === "}") {
            if (depth === 0) break;
            depth--;
          } else if (ch === ";" && depth === 0) break;
          else if (ch === "\n" && depth === 0) {
            // Stop at a newline only when the statement clearly ended.
            const rest = code.slice(i, j).trimEnd();
            if (!/[=,({[+\-*/%&|?:]$/.test(rest)) break;
          } else if (ch === '"' || ch === "'" || ch === "`") {
            const q = ch;
            j++;
            while (j < code.length && code[j] !== q) {
              if (code[j] === "\\") j++;
              j++;
            }
          } else if (depth === 0 && isIdentStart(ch)) {
            const w = readWord(code, j);
            if (w === "of" || w === "in") break;
            j += w.length;
            continue;
          }
          j++;
        }
        harvestBindings(code.slice(i, j));
      } else if (word === "function") {
        const open = code.indexOf("(", i);
        if (open !== -1) {
          const nameText = code.slice(i, open).replace(/\*/g, "").trim();
          if (nameText) addName(nameText);
          // Match the closing paren of the parameter list.
          let depth = 0;
          let j = open;
          for (; j < code.length; j++) {
            if (code[j] === "(") depth++;
            else if (code[j] === ")") {
              depth--;
              if (depth === 0) break;
            }
          }
          if (j < code.length) harvestBindings(code.slice(open + 1, j));
        }
      } else if (word === "catch") {
        const open = code.indexOf("(", i);
        const close = open === -1 ? -1 : code.indexOf(")", open);
        if (open !== -1 && close !== -1 && close - open < 120) {
          harvestBindings(code.slice(open + 1, close));
        }
      } else if (word === "class") {
        const rest = code.slice(i).match(/^\s+([A-Za-z_$][\w$]*)/);
        if (rest) addName(rest[1]);
      }

      pushSig(RESERVED.has(word) ? word : "@ident");
      continue;
    }

    if (/[0-9]/.test(c)) {
      while (i < code.length && /[0-9a-fA-FxXoObBeE._n+-]/.test(code[i])) {
        // Stop at an exponent sign that isn't part of the number.
        if ((code[i] === "+" || code[i] === "-") && !/[eE]/.test(code[i - 1])) break;
        i++;
      }
      pushSig("@num");
      continue;
    }

    pushSig(c);
    i++;
  }

  return { insertions, names: names.slice(0, MAX_TRACKED_NAMES), fatal };
}

// ── Code generation ───────────────────────────────────────────────────

/**
 * Splice `__s(line, [...thunks])` in front of every statement boundary.
 * Insertions are applied back-to-front so earlier offsets stay valid.
 */
export function instrumentCode(code: string): { source: string; names: string[]; fatal: string | null } {
  const { insertions, names, fatal } = analyze(code);
  if (fatal) return { source: "", names, fatal };

  const probe =
    names.length === 0
      ? "[]"
      : `[${names.map((n) => `[${JSON.stringify(n)},()=>${n}]`).join(",")}]`;

  let out = code;
  for (let k = insertions.length - 1; k >= 0; k--) {
    const { index, line } = insertions[k];
    out = out.slice(0, index) + `__s(${line},${probe});` + out.slice(index);
  }

  // A trailing probe at top level so the final state — after the last
  // statement actually ran — is the last thing the user steps to.
  const lastLine = code.split("\n").length;
  out += `\n__s(${lastLine},${probe});`;

  return { source: out, names, fatal: null };
}

// ── Value cloning ─────────────────────────────────────────────────────

function typeOf(value: unknown): VariableState["type"] {
  if (value === null || value === undefined) return "primitive";
  if (Array.isArray(value)) return "array";
  if (typeof value === "function") return "function";
  if (typeof value === "object") return "object";
  return "primitive";
}

/**
 * Depth-capped, cycle-safe clone. Snapshots must never share references
 * with the running program, or every step would show the final state.
 */
function safeClone(value: unknown, depth = 0, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") return "\u0192()";
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "symbol") return value.toString();
    return value;
  }
  if (depth >= MAX_CLONE_DEPTH) return "\u2026";
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((v) => safeClone(v, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) items.push(`+${value.length - MAX_ARRAY_ITEMS} more`);
      return items;
    }
    if (value instanceof Map) {
      const obj: Record<string, unknown> = {};
      let n = 0;
      for (const [k, v] of value.entries()) {
        if (n++ >= MAX_OBJECT_KEYS) break;
        obj[String(k)] = safeClone(v, depth + 1, seen);
      }
      return obj;
    }
    if (value instanceof Set) {
      return Array.from(value).slice(0, MAX_ARRAY_ITEMS).map((v) => safeClone(v, depth + 1, seen));
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>).slice(0, MAX_ARRAY_ITEMS);
    }
    const obj: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n++ >= MAX_OBJECT_KEYS) {
        obj["\u2026"] = "more keys";
        break;
      }
      obj[k] = safeClone(v, depth + 1, seen);
    }
    return obj;
  } finally {
    seen.delete(value as object);
  }
}

/** Render a value the way `console.log` would. */
function formatLogArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "function") return "\u0192()";
  if (typeof value === "object") {
    try {
      return JSON.stringify(safeClone(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ── Runner ────────────────────────────────────────────────────────────

class TraceBudgetError extends Error {}

const AsyncFunctionCtor = Object.getPrototypeOf(async function () {}).constructor as
  new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

/**
 * Instrument and run a JavaScript snippet, returning one snapshot per
 * executed statement. Never throws: syntax and runtime failures come back
 * on `error`, with whatever steps were captured before the failure.
 */
export async function traceJavaScript(code: string): Promise<TraceResult> {
  const stdout: string[] = [];
  const snapshots: Snapshot[] = [];
  let truncated = false;

  if (!code.trim()) {
    return { snapshots: [], stdout: [], error: null, truncated: false };
  }

  const { source, names, fatal } = instrumentCode(code);
  if (fatal) {
    return { snapshots: [], stdout: [], error: fatal, truncated: false };
  }

  const startedAt = Date.now();
  let steps = 0;

  const step = (lineNumber: number, probes: [string, () => unknown][]) => {
    steps++;
    if (steps > MAX_STEPS) {
      truncated = true;
      throw new TraceBudgetError(
        `Stopped after ${MAX_STEPS} steps — the snippet may loop forever.`
      );
    }
    if ((steps & 63) === 0 && Date.now() - startedAt > TIME_BUDGET_MS) {
      truncated = true;
      throw new TraceBudgetError(
        `Stopped after ${TIME_BUDGET_MS / 1000}s — the snippet ran too long.`
      );
    }

    const variables: VariableState[] = [];
    for (let k = 0; k < probes.length; k++) {
      const name = probes[k][0];
      let raw: unknown;
      try {
        raw = probes[k][1]();
      } catch {
        // Not yet declared, in its temporal dead zone, or out of scope.
        continue;
      }
      if (typeof raw === "function") continue;
      variables.push({ name, value: safeClone(raw), type: typeOf(raw) });
    }

    snapshots.push({
      lineNumber,
      variables,
      code,
      outIndex: stdout.length,
      description: `Line ${lineNumber}`,
    });
  };

  const log = (...args: unknown[]) => {
    stdout.push(args.map(formatLogArg).join(" "));
  };

  const sandboxConsole = {
    log,
    info: log,
    debug: log,
    warn: log,
    error: log,
    table: log,
    trace: log,
    dir: log,
    group: log,
    groupEnd: () => undefined,
    time: () => undefined,
    timeEnd: () => undefined,
    assert: () => undefined,
    count: () => undefined,
    clear: () => {
      stdout.length = 0;
    },
  };

  const globalNames = Object.keys(SANDBOX_GLOBALS);
  const argNames = ["__s", "console", ...globalNames];
  const argValues: unknown[] = [step, sandboxConsole, ...globalNames.map((k) => SANDBOX_GLOBALS[k])];

  const usesAwait = /(^|[^\w$.])await[\s(]/.test(code);
  const body = `"use strict";\n${source}\n`;

  let error: string | null = null;
  try {
    const Ctor = usesAwait ? AsyncFunctionCtor : Function;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new (Ctor as new (...a: string[]) => (...a: unknown[]) => unknown)(
      ...argNames,
      body
    );
    const returned = fn(...argValues);
    if (returned instanceof Promise) await returned;
  } catch (err) {
    if (err instanceof TraceBudgetError) {
      error = err.message;
    } else if (err instanceof SyntaxError) {
      error = `Syntax error: ${err.message}`;
    } else {
      error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
  }

  if (snapshots.length === 0 && !error) {
    snapshots.push({
      lineNumber: 1,
      variables: [],
      code,
      outIndex: stdout.length,
      description: "No traceable statements",
    });
  }

  // The trailing top-level probe already recorded the end state; just
  // label it so the playback UI can say the program is done.
  const last = snapshots[snapshots.length - 1];
  if (last) {
    last.outIndex = stdout.length;
    last.description = error ? "Stopped here" : "Finished";
  }

  return { snapshots, stdout, error, truncated };
}
