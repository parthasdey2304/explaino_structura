/**
 * Fenced-code-block syntax highlighting for Markdown output.
 *
 * Reuses the CodeMirror 6 parsers the editor already ships (no new
 * dependency): the code is parsed with the language's own Lezer grammar and
 * rendered through `classHighlighter`, which emits semantic `tok-*` classes
 * that globals.css colours per theme. Unknown languages fall back to plain
 * escaped text.
 */

import { classHighlighter, highlightCode as runHighlight } from "@lezer/highlight";
import { StreamLanguage, type Language } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { css as cssMode } from "@codemirror/legacy-modes/mode/css";
import { shell as shellMode } from "@codemirror/legacy-modes/mode/shell";
import { yaml as yamlMode } from "@codemirror/legacy-modes/mode/yaml";
import { dartLang } from "@/lib/dartMode";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const JS_LANG = javascript().language;
const JSX_LANG = javascript({ jsx: true }).language;
const TS_LANG = javascript({ typescript: true }).language;
const TSX_LANG = javascript({ typescript: true, jsx: true }).language;
const PY_LANG = python().language;
const HTML_LANG = html().language;
const CPP_LANG = cpp().language;
const JAVA_LANG = java().language;
const CSS_LANG = StreamLanguage.define(cssMode);
const SHELL_LANG = StreamLanguage.define(shellMode);
const YAML_LANG = StreamLanguage.define(yamlMode);

const LANGUAGES: Record<string, Language> = {
  javascript: JS_LANG,
  jsx: JSX_LANG,
  typescript: TS_LANG,
  tsx: TSX_LANG,
  python: PY_LANG,
  html: HTML_LANG,
  cpp: CPP_LANG,
  java: JAVA_LANG,
  dart: dartLang,
  css: CSS_LANG,
  bash: SHELL_LANG,
  yaml: YAML_LANG,
};

const ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  ts: "typescript",
  json: "javascript",
  jsonc: "javascript",
  py: "python",
  python3: "python",
  htm: "html",
  xml: "html",
  svg: "html",
  vue: "html",
  c: "cpp",
  "c++": "cpp",
  h: "cpp",
  hpp: "cpp",
  cc: "cpp",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
};

function resolveLanguage(lang: string | undefined): Language | null {
  const id = (lang ?? "").trim().toLowerCase().split(/[\s,;]+/)[0] ?? "";
  if (!id) return null;
  return LANGUAGES[ALIASES[id] ?? id] ?? null;
}

/**
 * Highlight a fenced code block. Returns HTML: `tok-*`-classed spans around
 * recognised tokens, everything HTML-escaped either way.
 */
export function highlightCode(code: string, lang?: string): string {
  const language = resolveLanguage(lang);
  if (!language) return escapeHtml(code);

  let out = "";
  try {
    const tree = language.parser.parse(code);
    runHighlight(
      code,
      tree,
      classHighlighter,
      (text, classes) => {
        out += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
      },
      () => {
        out += "\n";
      }
    );
  } catch {
    return escapeHtml(code);
  }
  return out;
}
