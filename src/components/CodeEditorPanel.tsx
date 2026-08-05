"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import {
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { X } from "lucide-react";
import { dartLang } from "@/lib/dartMode";
import type { Extension } from "@codemirror/state";
import type { WorkspaceFile, WorkspaceNode } from "@/lib/workspace";
import {
  loadWorkspace,
  saveWorkspace,
  flattenFiles,
  updateFileContent,
  setFileLanguage,
} from "@/lib/workspace";
import { executeJavaScript } from "@/lib/executors/javascript";
import { executePython, isPyodideLoaded } from "@/lib/executors/python";
import { executeHTML } from "@/lib/executors/html";
import { executeC, executeCpp, isClangLoaded } from "@/lib/executors/clang";
import { executeJava } from "@/lib/executors/java";
import { executeDart } from "@/lib/executors/dart";
import FileExplorer from "./FileExplorer";

const LANGUAGES = [
  { label: "JavaScript", value: "javascript" },
  { label: "Python", value: "python" },
  { label: "HTML", value: "html" },
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
  { label: "Java", value: "java" },
  { label: "Dart", value: "dart" },
  { label: "Plain Text", value: "text" },
];

const FILE_ICON_COLORS: Record<string, string> = {
  javascript: "#f1e05a",
  python: "#3572A5",
  html: "#e34c26",
  c: "#555555",
  cpp: "#f34b7d",
  java: "#b07219",
  dart: "#00B4AB",
};

// ── CodeMirror theme (VS Code-like dark, tinted to the app) ──────────────
const cmTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "13px",
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4",
    },
    ".cm-scroller": {
      fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
      lineHeight: "1.5",
    },
    ".cm-content": {
      padding: "10px 0",
      caretColor: "#aeafad",
    },
    ".cm-gutters": {
      backgroundColor: "#1e1e1e",
      color: "#858585",
      borderRight: "1px solid #333",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 8px",
      minWidth: "28px",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.045)" },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255,255,255,0.045)",
      color: "#d4d4d4",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#264f78",
    },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#aeafad" },
    ".cm-matchingBracket": {
      backgroundColor: "#3a3d41",
      outline: "1px solid #9a9a9a",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#333",
      border: "none",
      color: "#ccc",
    },
  },
  { dark: true }
);

const cmHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#6a9955" },
  { tag: tags.keyword, color: "#569cd6" },
  { tag: tags.string, color: "#ce9178" },
  { tag: tags.number, color: "#b5cea8" },
  { tag: tags.typeName, color: "#4ec9b0" },
  { tag: tags.definition(tags.variableName), color: "#9cdcfe" },
  { tag: tags.propertyName, color: "#9cdcfe" },
  { tag: tags.operator, color: "#d4d4d4" },
  { tag: tags.bool, color: "#569cd6" },
  { tag: tags.null, color: "#569cd6" },
]);

function langExtension(language: string): Extension {
  switch (language) {
    case "javascript":
      return javascript();
    case "python":
      return python();
    case "html":
      return html();
    case "c":
    case "cpp":
      return cpp();
    case "java":
      return java();
    case "dart":
      return dartLang;
    default:
      return [];
  }
}

type RunStatus = "idle" | "running" | "loading" | "done" | "error" | "timeout";

interface PanelState {
  tree: WorkspaceNode[];
  tabs: string[];
  activeFileId: string | null;
}

interface CodeEditorPanelProps {
  onClose: () => void;
}

export default function CodeEditorPanel({ onClose }: CodeEditorPanelProps) {
  const [ws, setWs] = useState<PanelState>(() => {
    const tree = loadWorkspace();
    const first = flattenFiles(tree)[0];
    return {
      tree,
      tabs: first ? [first.id] : [],
      activeFileId: first?.id ?? null,
    };
  });
  const { tree, tabs, activeFileId } = ws;

  const [output, setOutput] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [execTime, setExecTime] = useState(0);

  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartmentRef = useRef<Compartment | null>(null);
  const activeFileIdRef = useRef<string | null>(activeFileId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDocChangeRef = useRef<(doc: string) => void>(() => {});

  const files = useMemo(() => flattenFiles(tree), [tree]);
  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? null,
    [files, activeFileId]
  );

  // Persist the workspace to the browser cache only.
  useEffect(() => {
    saveWorkspace(tree);
  }, [tree]);

  // ── CodeMirror wiring ──────────────────────────────────────────────────
  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;

    const langCompartment = new Compartment();
    langCompartmentRef.current = langCompartment;

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          cmTheme,
          basicSetup,
          syntaxHighlighting(cmHighlight),
          EditorView.lineWrapping,
          langCompartment.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onDocChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Keep the doc-change handler pointing at the latest tree updater.
  useEffect(() => {
    onDocChangeRef.current = (doc: string) => {
      const id = activeFileIdRef.current;
      if (!id) return;
      setWs((prev) => ({
        ...prev,
        tree: updateFileContent(prev.tree, id, doc),
      }));
    };
  }, []);

  // Rebuild editor state when switching files or languages.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeFile) return;
    activeFileIdRef.current = activeFile.id;
    const compartment = langCompartmentRef.current;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: activeFile.content,
      },
      effects: compartment
        ? compartment.reconfigure(langExtension(activeFile.language))
        : undefined,
    });
  }, [activeFile?.id, activeFile?.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const openFile = useCallback((id: string) => {
    setWs((prev) => ({
      ...prev,
      activeFileId: id,
      tabs: prev.tabs.includes(id) ? prev.tabs : [...prev.tabs, id],
    }));
    setOutput("");
    setRunStatus("idle");
    setExecTime(0);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setWs((prev) => {
        const idx = prev.tabs.indexOf(id);
        const nextTabs = prev.tabs.filter((t) => t !== id);
        let activeId = prev.activeFileId;
        if (activeId === id) {
          activeId = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
        }
        return { ...prev, tabs: nextTabs, activeFileId: activeId };
      });
    },
    []
  );

  const changeLanguage = useCallback((language: string) => {
    setWs((prev) => {
      if (!prev.activeFileId) return prev;
      return {
        ...prev,
        tree: setFileLanguage(prev.tree, prev.activeFileId, language),
      };
    });
  }, []);

  // ── Run code ───────────────────────────────────────────────────────────
  const runCode = useCallback(async () => {
    if (!activeFile) return;
    const { content: code, language } = activeFile;
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

      switch (language) {
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

        case "c":
          if (!isClangLoaded()) {
            setRunStatus("loading");
            setOutput("Loading C/C++ compiler (~100MB, first time only)...");
          }
          result = await executeC(code);
          break;

        case "cpp":
          if (!isClangLoaded()) {
            setRunStatus("loading");
            setOutput("Loading C/C++ compiler (~100MB, first time only)...");
          }
          result = await executeCpp(code);
          break;

        case "java":
          result = await executeJava(code);
          break;

        case "dart":
          result = await executeDart(code);
          break;

        default:
          setOutput(
            `"${language}" files can't be run. Create a file with a runnable extension (.js, .py, .html, .c, .cpp, .java, .dart).`
          );
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
  }, [activeFile]);

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

  const languageLabel =
    LANGUAGES.find((l) => l.value === activeFile?.language)?.label ??
    activeFile?.language ??
    "—";

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
            value={activeFile?.language ?? ""}
            onChange={(e) => changeLanguage(e.target.value)}
            className="code-editor__lang-select"
            id="language-select"
            disabled={!activeFile}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          <button
            onClick={runCode}
            disabled={runStatus === "running" || runStatus === "loading" || !activeFile}
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

      {/* Body: explorer + editor + output */}
      <div className="code-editor__body">
        <div className="code-editor__main">
          <FileExplorer
            tree={tree}
            activeFileId={activeFileId}
            onOpenFile={openFile}
            onTreeChange={(next) => setWs((prev) => ({ ...prev, tree: next }))}
          />

          <div className="code-editor__right">
            {/* Tabs */}
            <div className="code-editor__tabs">
              {tabs.map((id) => {
                const file: WorkspaceFile | undefined = files.find(
                  (f) => f.id === id
                );
                if (!file) return null;
                return (
                  <div
                    key={id}
                    className={`code-editor__tab${id === activeFileId ? " code-editor__tab--active" : ""}`}
                    onClick={() => openFile(id)}
                  >
                    <span
                      className="code-editor__tab-dot"
                      style={{
                        backgroundColor:
                          FILE_ICON_COLORS[file.language] ?? "#999999",
                      }}
                    />
                    <span className="code-editor__tab-name">{file.name}</span>
                    <button
                      className="code-editor__tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(id);
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
              {tabs.length === 0 && (
                <span className="code-editor__tabs-empty">No file open</span>
              )}
            </div>

            {/* CodeMirror host */}
            <div className="code-editor__editor-host" ref={editorHostRef} />

            {/* Status bar */}
            <div className="code-editor__statusbar">
              <span className="code-editor__statusbar-left">
                {activeFile ? activeFile.name : "No file"}
              </span>
              <span className="code-editor__statusbar-right">{languageLabel}</span>
            </div>

            {/* Output */}
            <div className="code-editor__output">
              <div className="code-editor__output-header">
                <span className="code-editor__output-label">Output</span>
                {execTime > 0 && (
                  <span className="code-editor__exec-time">{execTime.toFixed(0)}ms</span>
                )}
                <span style={{ flex: 1 }} />
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
                  <span style={{ color: "#666", fontStyle: "italic" }}>
                    Press Run (or Ctrl+Enter) to execute your code…
                  </span>
                )}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
