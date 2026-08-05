"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

// Supported languages and their Judge0 language IDs
const LANGUAGES = [
  { id: 71, label: "Python 3", value: "python" },
  { id: 63, label: "JavaScript", value: "javascript" },
  { id: 54, label: "C++", value: "cpp" },
  { id: 51, label: "C#", value: "csharp" },
  { id: 62, label: "Java", value: "java" },
  { id: 73, label: "Rust", value: "rust" },
  { id: 60, label: "Go", value: "go" },
  { id: 72, label: "Ruby", value: "ruby" },
  { id: 74, label: "TypeScript", value: "typescript" },
  { id: 68, label: "PHP", value: "php" },
];

const STARTER_CODE: Record<string, string> = {
  python: `# Python 3
def greet(name):
    return f"Hello, {name}!"

print(greet("Explaino"))
`,
  javascript: `// JavaScript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Explaino"));
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, Explaino!" << endl;
    return 0;
}
`,
  csharp: `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, Explaino!");
    }
}
`,
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Explaino!");
    }
}
`,
  rust: `fn main() {
    println!("Hello, Explaino!");
}
`,
  go: `package main

import "fmt"

func main() {
    fmt.Println("Hello, Explaino!")
}
`,
  ruby: `puts "Hello, Explaino!"
`,
  typescript: `const greet = (name: string): string => {
  return \`Hello, \${name}!\`;
};

console.log(greet("Explaino"));
`,
  php: `<?php
echo "Hello, Explaino!\\n";
?>
`,
};

interface CodeEditorPanelProps {
  onClose: () => void;
}

type RunStatus = "idle" | "running" | "done" | "error";

export default function CodeEditorPanel({ onClose }: CodeEditorPanelProps) {
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [code, setCode] = useState(STARTER_CODE["python"]);
  const [output, setOutput] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [lineCount, setLineCount] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Update line count whenever code changes
  useEffect(() => {
    setLineCount(code.split("\n").length);
  }, [code]);

  // Sync scroll between textarea and line numbers
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

    try {
      // Use Judge0 CE public API (no auth required for basic usage)
      const submitRes = await fetch(
        "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
            "X-RapidAPI-Key": "demo", // Public demo key
          },
          body: JSON.stringify({
            language_id: selectedLang.id,
            source_code: code,
            stdin: "",
          }),
        }
      );

      if (!submitRes.ok) {
        throw new Error("API request failed. Using local execution fallback.");
      }

      const result = await submitRes.json();
      const stdout = result.stdout || "";
      const stderr = result.stderr || "";
      const compileOutput = result.compile_output || "";
      const statusDesc = result.status?.description || "";

      if (compileOutput) {
        setOutput(`⚠ Compilation Error:\n${compileOutput}`);
        setRunStatus("error");
      } else if (stderr) {
        setOutput(`✗ Runtime Error:\n${stderr}`);
        setRunStatus("error");
      } else if (statusDesc && statusDesc !== "Accepted") {
        setOutput(`Status: ${statusDesc}\n${stdout}`);
        setRunStatus("error");
      } else {
        setOutput(stdout || "(no output)");
        setRunStatus("done");
      }
    } catch {
      // Fallback: execute JavaScript locally in browser
      if (selectedLang.value === "javascript") {
        try {
          const logs: string[] = [];
          const origLog = console.log;
          const origError = console.error;
          console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
          console.error = (...args: unknown[]) => logs.push("Error: " + args.map(String).join(" "));
          try {
            // eslint-disable-next-line no-new-func
            new Function(code)();
            setOutput(logs.join("\n") || "(no output)");
            setRunStatus("done");
          } catch (err) {
            setOutput(`✗ Error: ${String(err)}`);
            setRunStatus("error");
          } finally {
            console.log = origLog;
            console.error = origError;
          }
        } catch {
          setOutput("✗ Execution failed.");
          setRunStatus("error");
        }
      } else {
        setOutput(
          `ℹ Note: Code execution requires an internet connection to the Judge0 API.\n\nFor JavaScript, code runs locally in the browser.\nFor other languages, please ensure you have network access.`
        );
        setRunStatus("error");
      }
    }
  }, [code, selectedLang]);

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
        </div>
        <div className="code-editor__header-right">
          {/* Language selector */}
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

          {/* Run button */}
          <button
            onClick={runCode}
            disabled={runStatus === "running"}
            className={`code-editor__run-btn${runStatus === "running" ? " code-editor__run-btn--loading" : ""}`}
            id="run-code-button"
            title="Run code (Ctrl+Enter)"
          >
            {runStatus === "running" ? (
              <>
                <span className="code-editor__spinner" />
                Running…
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

          {/* Close */}
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
          {/* Line numbers */}
          <div className="code-editor__line-numbers" ref={lineNumbersRef} aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className="code-editor__line-num">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code textarea */}
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
              <span className="code-editor__output-badge code-editor__output-badge--success">✓ Success</span>
            )}
            {runStatus === "error" && (
              <span className="code-editor__output-badge code-editor__output-badge--error">✗ Error</span>
            )}
            {output && (
              <button
                onClick={() => { setOutput(""); setRunStatus("idle"); }}
                className="code-editor__output-clear"
              >
                Clear
              </button>
            )}
          </div>
          <pre
            className={`code-editor__output-pre${runStatus === "error" ? " code-editor__output-pre--error" : ""}`}
          >
            {output || (
              <span style={{ color: "var(--color-gray-50)", fontStyle: "italic" }}>
                Press Run to execute your code…
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
