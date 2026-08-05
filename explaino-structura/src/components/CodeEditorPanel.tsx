"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  executeJavaScript,
} from "@/lib/executors/javascript";
import {
  executePython,
  isPyodideLoaded,
} from "@/lib/executors/python";
import {
  executeHTML,
} from "@/lib/executors/html";

const LANGUAGES = [
  { label: "JavaScript", value: "javascript" as const },
  { label: "Python", value: "python" as const },
  { label: "HTML", value: "html" as const },
];

const STARTER_CODE: Record<string, string> = {
  javascript: `// JavaScript — runs in browser, no API needed
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Explaino"));
console.log("2 + 2 =", 2 + 2);

// Canvas demo
const canvas = document.getElementById("c");
if (canvas) {
  canvas.width = 200;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#6965db";
  ctx.fillRect(10, 10, 180, 80);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("Hello!", 60, 55);
}
`,
  python: `# Python 3 — runs via Pyodide (WebAssembly), no API needed
def greet(name):
    return f"Hello, {name}!"

print(greet("Explaino"))

# Math demo
import math
print(f"Pi = {math.pi:.4f}")
print(f"sqrt(144) = {math.sqrt(144)}")

# List comprehension
squares = [x**2 for x in range(1, 11)]
print(f"Squares: {squares}")
`,
  html: `<!-- HTML — renders in sandboxed iframe, no API needed -->
<div style="padding: 20px; font-family: sans-serif;">
  <h2 style="color: #6965db;">Hello from Explaino!</h2>
  <p>This HTML runs entirely in your browser.</p>
  <button onclick="this.textContent='Clicked!'" 
    style="padding: 8px 16px; background: #6965db; color: white; 
           border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
    Click me
  </button>
  <div style="margin-top: 16px; padding: 12px; background: #f0f0ff; border-radius: 8px;">
    <strong>No API key required.</strong> Everything runs locally.
  </div>
</div>
`,
};

type RunStatus = "idle" | "running" | "loading" | "done" | "error" | "timeout";

interface CodeEditorPanelProps {
  onClose: () => void;
}

export default function CodeEditorPanel({ onClose }: CodeEditorPanelProps) {
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [code, setCode] = useState(STARTER_CODE["javascript"]);
  const [output, setOutput] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const lineCount = code.split("\n").length;
  const [execTime, setExecTime] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = LANGUAGES.find((l) => l.value === e.target.value);
    if (lang) {
      setSelectedLang(lang);
      setCode(STARTER_CODE[lang.value] || "");
      setOutput("");
      setRunStatus("idle");
      setExecTime(0);
    }
  };

  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current!;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newCode = code.substring(0, start) + "  " + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  const runCode = useCallback(async () => {
    setRunStatus("running");
    setOutput("");
    setExecTime(0);

    const formatOutput = (stdout: string[], stderr: string[]): string => {
      const lines: string[] = [];
      if (stdout.length > 0) lines.push(stdout.join("\n"));
      if (stderr.length > 0) lines.push("✗ Errors:\n" + stderr.join("\n"));
      return lines.join("\n") || "(no output)";
    };

    try {
      let result;

      switch (selectedLang.value) {
        case "javascript":
          result = await executeJavaScript(code);
          break;

        case "python":
          if (!isPyodideLoaded()) {
            setRunStatus("loading");
            setOutput("Loading Python runtime (~6MB, first time only)...");
          }
          result = await executePython(code);
          break;

        case "html":
          result = await executeHTML(code);
          break;

        default:
          setOutput("Unsupported language");
          setRunStatus("error");
          return;
      }

      setExecTime(result.executionTime);
      setOutput(formatOutput(result.stdout, result.stderr));
      setRunStatus(result.status === "success" ? "done" : result.status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setOutput(`✗ Execution failed: ${msg}`);
      setRunStatus("error");
    }
  }, [code, selectedLang, setExecTime]);

  // Ctrl+Enter to run
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runCode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runCode]);

  return (
    <div className="code-editor-panel excalidraw-island">
      {/* Header */}
      <div className="code-editor__header">
        <div className="code-editor__header-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span className="code-editor__title">Code Editor</span>
          <span className="code-editor__badge">No API Key</span>
        </div>
        <div className="code-editor__header-right">
          <select
            value={selectedLang.value}
            onChange={handleLangChange}
            className="code-editor__lang-select"
            id="language-select"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          <button
            onClick={runCode}
            disabled={runStatus === "running" || runStatus === "loading"}
            className={`code-editor__run-btn${runStatus === "running" || runStatus === "loading" ? " code-editor__run-btn--loading" : ""}`}
            id="run-code-button"
            title="Run code (Ctrl+Enter)"
          >
            {runStatus === "running" || runStatus === "loading" ? (
              <>
                <span className="code-editor__spinner" />
                {runStatus === "loading" ? "Loading…" : "Running…"}
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="tool-icon-btn"
            style={{ width: "1.75rem", height: "1.75rem" }}
            id="close-code-panel-button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor area with line numbers */}
      <div className="code-editor__body">
        <div className="code-editor__editor-wrap">
          <div className="code-editor__line-numbers" ref={lineNumbersRef} aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className="code-editor__line-num">
                {i + 1}
              </div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            className="code-editor__textarea"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleTabKey}
            onScroll={handleScroll}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            id="code-textarea"
          />
        </div>

        {/* Output panel */}
        <div className="code-editor__output">
          <div className="code-editor__output-header">
            <span className="code-editor__output-label">Output</span>
            {runStatus === "done" && (
              <span className="code-editor__output-badge code-editor__output-badge--success">✓ OK</span>
            )}
            {runStatus === "error" && (
              <span className="code-editor__output-badge code-editor__output-badge--error">✗ Error</span>
            )}
            {runStatus === "timeout" && (
              <span className="code-editor__output-badge code-editor__output-badge--timeout">⏱ Timeout</span>
            )}
            {runStatus === "loading" && (
              <span className="code-editor__output-badge code-editor__output-badge--loading">⏳ Loading</span>
            )}
            {execTime > 0 && (
              <span className="code-editor__exec-time">{execTime.toFixed(0)}ms</span>
            )}
            {output && (
              <button
                onClick={() => { setOutput(""); setRunStatus("idle"); setExecTime(0); }}
                className="code-editor__output-clear"
              >
                Clear
              </button>
            )}
          </div>
          <pre
            className={`code-editor__output-pre${runStatus === "error" || runStatus === "timeout" ? " code-editor__output-pre--error" : ""}`}
          >
            {output || (
              <span style={{ color: "var(--color-gray-50)", fontStyle: "italic" }}>
                Press Run (or Ctrl+Enter) to execute your code…
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}