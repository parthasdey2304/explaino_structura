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

function toBase64(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf-8").toString("base64");
  }
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    if (typeof TextEncoder !== "undefined") {
      const bytes = new TextEncoder().encode(str);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    }
    return window.btoa(unescape(encodeURIComponent(str)));
  }
  return "";
}

/**
 * Generate a standalone syntax-highlighted code card as an SVG data URL for
 * embedding on the Excalidraw canvas as an image element.
 */
export function createCodeCardSvg(
  code: string,
  lang: string,
  isDark: boolean = false
): { dataUrl: string; width: number; height: number } {
  const language = resolveLanguage(lang);
  const cleanCode = code.replace(/\r\n/g, "\n");
  const rawLines = cleanCode.split("\n");

  interface TokenChunk {
    text: string;
    classes: string;
  }
  const lineTokens: TokenChunk[][] = [[]];

  if (language) {
    try {
      const tree = language.parser.parse(cleanCode);
      runHighlight(
        cleanCode,
        tree,
        classHighlighter,
        (text, classes) => {
          const parts = text.split("\n");
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
              lineTokens.push([]);
            }
            if (parts[i]) {
              lineTokens[lineTokens.length - 1].push({
                text: parts[i],
                classes: classes || "",
              });
            }
          }
        },
        () => {
          lineTokens.push([]);
        }
      );
    } catch {
      // Fallback to raw lines below
    }
  }

  const finalLines: TokenChunk[][] =
    lineTokens.length > 0 && lineTokens.some((l) => l.length > 0)
      ? lineTokens
      : rawLines.map((l) => [{ text: l, classes: "" }]);

  let maxCols = 1;
  for (const l of finalLines) {
    const len = l.reduce((acc, t) => acc + t.text.length, 0);
    if (len > maxCols) maxCols = len;
  }

  const charWidth = 8.4;
  const paddingX = 22;
  const headerHeight = 40;
  const lineHeight = 21;
  const paddingBottom = 18;

  const cardWidth = Math.max(
    340,
    Math.min(1200, Math.round(maxCols * charWidth + paddingX * 2))
  );
  const cardHeight = Math.round(
    headerHeight + finalLines.length * lineHeight + paddingBottom
  );

  const displayLang = (lang || "code").toUpperCase();

  function escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Excalidraw draws the scene on a canvas that carries the CSS filter
   * `invert(93%) hue-rotate(180deg)` in dark mode, so a dark-authored card
   * would display light. Pre-transform every card color through the exact
   * inverse of that filter so the displayed card always matches the intended
   * dark look (black background, theme-independent token colors).
   */
  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    const v =
      h.length === 3
        ? h.split("").map((c) => c + c).join("")
        : h.slice(0, 6);
    return [
      parseInt(v.slice(0, 2), 16),
      parseInt(v.slice(2, 4), 16),
      parseInt(v.slice(4, 6), 16),
    ];
  }

  function rgbToHex(r: number, g: number, b: number): string {
    const c = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  // 3x3 inverse of the hue-rotate(180deg) matrix (CSS filter-effects-1).
  const HUE180: [number, number, number][] = [
    [-0.574, 1.43, 0.144],
    [0.426, 0.43, 0.144],
    [0.426, 1.43, -0.856],
  ];

  function invert3x3(m: [number, number, number][]): [number, number, number][] {
    const [a, b, c] = m[0];
    const [d, e, f] = m[1];
    const [g, h, i] = m[2];
    const A = e * i - f * h;
    const B = f * g - d * i;
    const C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!det) return m;
    return [
      [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
      [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
      [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
    ];
  }

  const HUE180_INV = invert3x3(HUE180);

  function compensateForDarkCanvas(hex: string): string {
    const [r, g, b] = hexToRgb(hex);
    // Undo hue-rotate(180deg).
    const v: [number, number, number] = [r, g, b].map((_, row) =>
      HUE180_INV[row][0] * r + HUE180_INV[row][1] * g + HUE180_INV[row][2] * b
    ) as [number, number, number];
    // Undo invert(93%): displayed = 237.15 - 0.86 * src.
    const src = v.map((x) => (237.15 - x) / 0.86);
    return rgbToHex(src[0], src[1], src[2]);
  }

  const fix = (hex: string): string => (isDark ? compensateForDarkCanvas(hex) : hex);

  function getDarkTokenColor(classes: string): string {
    if (!classes) return "#d4d4d4";
    if (classes.includes("tok-comment")) return "#6a9955";
    if (classes.includes("tok-keyword")) return "#569cd6";
    if (classes.includes("tok-string")) return "#ce9178";
    if (classes.includes("tok-number")) return "#b5cea8";
    if (
      classes.includes("tok-bool") ||
      classes.includes("tok-atom") ||
      classes.includes("tok-literal")
    )
      return "#569cd6";
    if (classes.includes("tok-meta")) return "#c586c0";
    if (
      classes.includes("tok-typeName") ||
      classes.includes("tok-className") ||
      classes.includes("tok-namespace")
    )
      return "#4ec9b0";
    if (
      classes.includes("tok-variableName") &&
      classes.includes("tok-definition")
    )
      return "#dcdcaa";
    if (
      classes.includes("tok-variableName") ||
      classes.includes("tok-propertyName")
    )
      return "#9cdcfe";
    if (classes.includes("tok-operator") || classes.includes("tok-punctuation"))
      return "#d4d4d4";
    return "#d4d4d4";
  }

  let textSvg = "";
  for (let idx = 0; idx < finalLines.length; idx++) {
    const l = finalLines[idx];
    const y = headerHeight + 18 + idx * lineHeight;
    let lineContent = "";
    for (const t of l) {
      const color = fix(getDarkTokenColor(t.classes));
      lineContent += `<tspan fill="${color}">${escapeXml(t.text)}</tspan>`;
    }
    textSvg += `  <text x="${paddingX}" y="${y}" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="13" xml:space="preserve">${lineContent}</text>\n`;
  }

  const borderColor = isDark ? "rgba(255, 255, 255, 0.85)" : "#3f3f46";
  const borderWidth = isDark ? 1.5 : 1.2;
  // The canvas filter inverts the border too, so target a white border by
  // authoring its pre-image (dark) — it displays white in dark mode.
  const borderStroke = isDark
    ? `rgba(${hexToRgb(compensateForDarkCanvas("#ffffff")).join(", ")}, 0.85)`
    : borderColor;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}">
  <rect x="0.75" y="0.75" width="${cardWidth - 1.5}" height="${cardHeight - 1.5}" rx="16" ry="16" fill="${fix("#18181b")}" stroke="${borderStroke}" stroke-width="${borderWidth}" />
  <circle cx="20" cy="20" r="5" fill="${fix("#ef4444")}" />
  <circle cx="35" cy="20" r="5" fill="${fix("#eab308")}" />
  <circle cx="50" cy="20" r="5" fill="${fix("#22c55e")}" />
  <text x="${cardWidth - 18}" y="24" text-anchor="end" font-family="ui-monospace, monospace" font-size="11" font-weight="700" fill="${fix("#a1a1aa")}" letter-spacing="0.05em">${escapeXml(displayLang)}</text>
  <line x1="0" y1="${headerHeight}" x2="${cardWidth}" y2="${headerHeight}" stroke="${fix("#27272a")}" stroke-width="1" />
${textSvg}</svg>`;

  const base64 = toBase64(svg);
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  return { dataUrl, width: cardWidth, height: cardHeight };
}
