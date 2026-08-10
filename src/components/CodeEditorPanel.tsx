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
import { X, Eye, Sparkles } from "lucide-react";
import { dartLang } from "@/lib/dartMode";
import type { Extension } from "@codemirror/state";
import type { WorkspaceFile, WorkspaceNode } from "@/lib/workspace";
import {
  loadWorkspace,
  saveWorkspace,
  flattenFiles,
  flattenFilesWithPaths,
  updateFileContent,
  setFileLanguage,
  mergeSandboxFiles,
  starterFor,
  uid,
  detectLanguage,
} from "@/lib/workspace";
import { executeJavaScript } from "@/lib/executors/javascript";
import { executePython, isPyodideLoaded } from "@/lib/executors/python";
import { executeHTML } from "@/lib/executors/html";
import { executeC, executeCpp, isClangLoaded } from "@/lib/executors/clang";
import { executeJava } from "@/lib/executors/java";
import { executeDart } from "@/lib/executors/dart";
import FileExplorer from "./FileExplorer";
import Terminal from "./Terminal";
import VisualizerPanel from "./VisualizerPanel";
import SettingsMenu from "./SettingsMenu";
import AIChatPanel from "./AIChatPanel";
import type { SandboxFileEntry } from "@/lib/terminal/service";
import { createTabKeymap, snippetLanguageData } from "@/lib/emmetExtension";
import { getEditorSettings, subscribeEditorSettings } from "@/lib/editorSettings";

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

function baseLangExtension(language: string): Extension {
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

/**
 * Language mode plus its snippet table (Tab-to-expand shorthand like `syso`,
 * `cl`, `def…`). HTML gets no extra language-data extension here — its
 * Emmet expansion is handled directly by the Tab keymap in emmetExtension.ts.
 */
function langExtension(language: string): Extension {
  return [baseLangExtension(language), snippetLanguageData(language)];
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

const PANEL_STATE_KEY = "explaino-panel-tabs";

function loadPanelState(): { tabs: string[]; activeFileId: string | null } {
  try {
    const raw = localStorage.getItem(PANEL_STATE_KEY);
    if (!raw) return { tabs: [], activeFileId: null };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.tabs) && (parsed.activeFileId === null || typeof parsed.activeFileId === "string")) {
      return { tabs: parsed.tabs, activeFileId: parsed.activeFileId };
    }
    return { tabs: [], activeFileId: null };
  } catch {
    return { tabs: [], activeFileId: null };
  }
}

function savePanelState(tabs: string[], activeFileId: string | null) {
  try {
    localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({ tabs, activeFileId }));
  } catch {
    // quota errors ignored
  }
}

export default function CodeEditorPanel({ onClose }: CodeEditorPanelProps) {
  const [ws, setWs] = useState<PanelState>(() => {
    const tree = loadWorkspace();
    const files = flattenFiles(tree);
    const saved = loadPanelState();
    // Restore saved tabs, but only keep IDs that still exist in the tree
    const validTabIds = saved.tabs.filter((id) => files.some((f) => f.id === id));
    const activeFileId = saved.activeFileId && files.some((f) => f.id === saved.activeFileId)
      ? saved.activeFileId
      : (validTabIds[0] ?? null);
    return {
      tree,
      tabs: validTabIds.length > 0 ? validTabIds : (files[0] ? [files[0].id] : []),
      activeFileId: activeFileId ?? files[0]?.id ?? null,
    };
  });
  const { tree, tabs, activeFileId } = ws;
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);

  const [output, setOutput] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [execTime, setExecTime] = useState(0);
  const [panelTab, setPanelTab] = useState<"output" | "terminal">("output");
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [bottomHeight, setBottomHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = Number(window.localStorage.getItem("explaino-panel-height"));
      if (Number.isFinite(saved) && saved >= 120) return saved;
    }
    return 220;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  // Persist the resized output panel height
  useEffect(() => {
    try {
      window.localStorage.setItem("explaino-panel-height", String(bottomHeight));
    } catch {
      // ignore quota errors
    }
  }, [bottomHeight]);

  // ── Output / terminal panel resize (VS Code style) ────────────────────
  const onResizerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    resizeDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: bottomHeight,
    };
    setIsResizing(true);
  };

  const onResizerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = resizeDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const delta = d.startY - e.clientY;
    setBottomHeight(Math.min(Math.max(110, d.startHeight + delta), 900));
  };

  const onResizerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = resizeDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    resizeDragRef.current = null;
    setIsResizing(false);
  };

  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartmentRef = useRef<Compartment | null>(null);
  const activeFileIdRef = useRef<string | null>(activeFileId);
  const activeLanguageRef = useRef<string>("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDocChangeRef = useRef<(doc: string) => void>(() => {});
  const [aiWriteMode, setAiWriteMode] = useState<"manual" | "ai" | "pair">("manual");
  const [showAIChat, setShowAIChat] = useState(false);
  const [settingsSnapshot, setSettingsSnapshot] = useState(() => getEditorSettings());

  useEffect(() => subscribeEditorSettings(setSettingsSnapshot), []);

  // Fall back to the Output tab if the terminal gets disabled while it's
  // the active bottom-panel tab.
  useEffect(() => {
    if (!settingsSnapshot.terminalEnabled && panelTab === "terminal") {
      setPanelTab("output");
    }
  }, [settingsSnapshot.terminalEnabled, panelTab]);

  const files = useMemo(() => flattenFiles(tree), [tree]);
  const filesWithPaths = useMemo(() => flattenFilesWithPaths(tree), [tree]);
  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? null,
    [files, activeFileId]
  );

  // Persist the workspace to the browser cache only.
  useEffect(() => {
    saveWorkspace(tree);
  }, [tree]);

  // Persist open tabs and active file so they survive panel close/reopen.
  useEffect(() => {
    savePanelState(tabs, activeFileId);
  }, [tabs, activeFileId]);

  // Files created/changed inside the sandbox terminal show up in the
  // explorer in real time by being merged into the workspace tree.
  const handleSandboxFilesChange = useCallback((sandboxFiles: SandboxFileEntry[]) => {
    setWs((prev) => {
      const nextTree = mergeSandboxFiles(prev.tree, sandboxFiles);
      if (nextTree === prev.tree) return prev;
      return { ...prev, tree: nextTree };
    });
  }, []);

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
          // Registered once, outside the per-file language Compartment, so
          // it survives file switches. Reads the current language through
          // a ref rather than being rebuilt per file.
          createTabKeymap(() => activeLanguageRef.current),
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
    activeLanguageRef.current = activeFile.language;
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

  // ── Drag-to-reorder tabs ────────────────────────────────────────────────
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleTabDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggedTabId(id);
    e.dataTransfer.effectAllowed = "move";
    // Firefox requires data to be set for the drag to start at all.
    e.dataTransfer.setData("text/plain", id);
  }, []);

  const handleTabDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      if (!draggedTabId || draggedTabId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetId(id);
    },
    [draggedTabId]
  );

  const handleTabDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = draggedTabId;
      setDraggedTabId(null);
      setDropTargetId(null);
      if (!sourceId || sourceId === targetId) return;
      setWs((prev) => {
        const from = prev.tabs.indexOf(sourceId);
        const to = prev.tabs.indexOf(targetId);
        if (from === -1 || to === -1) return prev;
        const nextTabs = [...prev.tabs];
        nextTabs.splice(from, 1);
        nextTabs.splice(to, 0, sourceId);
        return { ...prev, tabs: nextTabs };
      });
    },
    [draggedTabId]
  );

  const handleTabDragEnd = useCallback(() => {
    setDraggedTabId(null);
    setDropTargetId(null);
  }, []);

  const changeLanguage = useCallback((language: string) => {
    setWs((prev) => {
      if (!prev.activeFileId) return prev;
      return {
        ...prev,
        tree: setFileLanguage(prev.tree, prev.activeFileId, language),
      };
    });
  }, []);

  // Lets the AI panel write a generated snippet straight into the active
  // file: replaces the CodeMirror doc directly (so the user sees it land)
  // and updateFileContent keeps the workspace tree as the source of truth.
  const applyCodeToActiveFile = useCallback((code: string) => {
    const id = activeFileIdRef.current;
    const view = viewRef.current;
    if (!id || !view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: code },
    });
    setWs((prev) => ({ ...prev, tree: updateFileContent(prev.tree, id, code) }));
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

  // Ctrl+` opens the terminal panel and focuses it.
  useEffect(() => {
    const handler = () => {
      setPanelTab("terminal");
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("explaino:focus-terminal-input"));
      }, 50);
    };
    window.addEventListener("explaino:open-terminal", handler);
    return () => window.removeEventListener("explaino:open-terminal", handler);
  }, []);

  // Ctrl+C opens the code editor and focuses it.
  useEffect(() => {
    const handler = () => {
      viewRef.current?.focus();
    };
    window.addEventListener("explaino:focus-editor", handler);
    return () => window.removeEventListener("explaino:focus-editor", handler);
  }, []);

  // Listen for new file creation from welcome screen
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const lang = e.detail?.language ?? "javascript";
      const extMap: Record<string, string> = {
        javascript: "js",
        python: "py",
        html: "html",
        c: "c",
        cpp: "cpp",
        java: "java",
        dart: "dart",
      };
      const nameMap: Record<string, string> = {
        javascript: "main.js",
        python: "main.py",
        html: "index.html",
        c: "main.c",
        cpp: "main.cpp",
        java: "Main.java",
        dart: "main.dart",
      };
      const name = nameMap[lang] ?? `main.${extMap[lang] ?? "txt"}`;
      const newFile = {
        type: "file" as const,
        id: uid(),
        name,
        language: lang,
        content: starterFor(lang, name),
      };
      setWs((prev) => ({
        ...prev,
        tree: [...prev.tree, newFile],
        tabs: [...prev.tabs, newFile.id],
        activeFileId: newFile.id,
      }));
    };
    window.addEventListener("explaino:new-file", handler as EventListener);
    return () => window.removeEventListener("explaino:new-file", handler as EventListener);
  }, []);

  const languageLabel =
    LANGUAGES.find((l) => l.value === activeFile?.language)?.label ??
    activeFile?.language ??
    "—";

  return (
    <div className="code-editor-panel excalidraw-island">
      {/* Header */}
      <div className="code-editor__header">
        <div className="code-editor__header-left">
          <button
            type="button"
            className={`code-editor__explorer-toggle${isExplorerOpen ? " code-editor__explorer-toggle--active" : ""}`}
            onClick={() => setIsExplorerOpen(!isExplorerOpen)}
            title={isExplorerOpen ? "Hide Explorer" : "Show Explorer"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span>Explorer</span>
          </button>
          <span className="code-editor__title">Code Editor</span>
        </div>
        <div className="code-editor__header-right">
          <SettingsMenu />
          {settingsSnapshot.aiEnabled && (
            <button
              onClick={() => setShowAIChat(!showAIChat)}
              className={`code-editor__ai-btn${showAIChat ? " code-editor__ai-btn--active" : ""}`}
              id="ai-chat-button"
              title="AI assistant (Mistral)"
            >
              <Sparkles size={14} />
              <span>AI</span>
            </button>
          )}
          <button
            onClick={() => setShowVisualizer(!showVisualizer)}
            disabled={!activeFile || activeFile.language !== "javascript"}
            className={`code-editor__visualize-btn${showVisualizer ? " code-editor__visualize-btn--active" : ""}`}
            id="visualize-button"
            title="Visualize code execution (JavaScript only)"
          >
            <Eye size={14} />
            <span>Visualize</span>
          </button>
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
          {isExplorerOpen && (
            <FileExplorer
              tree={tree}
              activeFileId={activeFileId}
              onOpenFile={openFile}
              onTreeChange={(next) => setWs((prev) => ({ ...prev, tree: next }))}
            />
          )}

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
                    draggable
                    onDragStart={(e) => handleTabDragStart(e, id)}
                    onDragOver={(e) => handleTabDragOver(e, id)}
                    onDrop={(e) => handleTabDrop(e, id)}
                    onDragEnd={handleTabDragEnd}
                    className={`code-editor__tab${id === activeFileId ? " code-editor__tab--active" : ""}${draggedTabId === id ? " code-editor__tab--dragging" : ""}${dropTargetId === id ? " code-editor__tab--drop-target" : ""}`}
                    onClick={() => openFile(id)}
                    title="Drag to reorder"
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

            {/* CodeMirror host or Welcome Screen */}
            {!activeFile ? (
              <div className="code-editor__welcome">
                <div className="code-editor__welcome-content">
                  <svg className="code-editor__welcome-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="64" height="64" rx="12" fill="currentColor" opacity="0.1"/>
                    <path d="M16 22h32M16 32h24M16 42h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5"/>
                  </svg>
                  <h2 className="code-editor__welcome-title">Welcome to Explaino Code</h2>
                  <p className="code-editor__welcome-subtitle">Open a file from the explorer or create a new one to start coding</p>
                  <div className="code-editor__welcome-actions">
                    <button
                      type="button"
                      className="code-editor__welcome-btn code-editor__welcome-btn--primary"
                      onClick={() => {
                        // Trigger new file creation via the explorer's new file button
                        const event = new CustomEvent("explaino:new-file", { detail: { language: "javascript" } });
                        window.dispatchEvent(event);
                      }}
                    >
                      <span>New File</span>
                      <span className="code-editor__welcome-btn-shortcut">Ctrl+N</span>
                    </button>
                    <button
                      type="button"
                      className="code-editor__welcome-btn"
                      onClick={() => {
                        const event = new CustomEvent("explaino:new-file", { detail: { language: "python" } });
                        window.dispatchEvent(event);
                      }}
                    >
                      <span>New Python File</span>
                    </button>
                    <button
                      type="button"
                      className="code-editor__welcome-btn"
                      onClick={() => {
                        const event = new CustomEvent("explaino:new-file", { detail: { language: "java" } });
                        window.dispatchEvent(event);
                      }}
                    >
                      <span>New Java File</span>
                    </button>
                    <button
                      type="button"
                      className="code-editor__welcome-btn"
                      onClick={() => {
                        const event = new CustomEvent("explaino:new-file", { detail: { language: "cpp" } });
                        window.dispatchEvent(event);
                      }}
                    >
                      <span>New C++ File</span>
                    </button>
                    <button
                      type="button"
                      className="code-editor__welcome-btn"
                      onClick={() => {
                        const event = new CustomEvent("explaino:new-file", { detail: { language: "dart" } });
                        window.dispatchEvent(event);
                      }}
                    >
                      <span>New Dart File</span>
                    </button>
                  </div>
                  <div className="code-editor__welcome-tips">
                    <span className="code-editor__welcome-tip">💡 <strong>Ctrl+Enter</strong> to run code</span>
                    <span className="code-editor__welcome-tip">💡 <strong>Ctrl+N</strong> for new file</span>
                    <span className="code-editor__welcome-tip">💡 Supports JS, Python, HTML, C, C++, Java, Dart</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="code-editor__editor-host" ref={editorHostRef} />
                {/* Status bar */}
                <div className="code-editor__statusbar">
                  <span className="code-editor__statusbar-left">
                    {activeFile ? activeFile.name : "No file"}
                  </span>
                  <span className="code-editor__statusbar-right">{languageLabel}</span>
                </div>
              </>
            )}

            {/* Output / Terminal bottom panel (resizable) */}
            <div className="code-editor__bottom" style={{ height: bottomHeight }}>
              <div
                className={`code-editor__resizer${isResizing ? " code-editor__resizer--active" : ""}`}
                onPointerDown={onResizerPointerDown}
                onPointerMove={onResizerPointerMove}
                onPointerUp={onResizerPointerUp}
                title="Drag to resize output panel"
              >
                <div className="code-editor__resizer-grip" />
              </div>
              <div className="code-editor__panel-tabs">
                <button
                  type="button"
                  className={`code-editor__panel-tab${panelTab === "output" ? " code-editor__panel-tab--active" : ""}`}
                  onClick={() => setPanelTab("output")}
                >
                  Output
                </button>
                {settingsSnapshot.terminalEnabled && (
                  <button
                    type="button"
                    className={`code-editor__panel-tab${panelTab === "terminal" ? " code-editor__panel-tab--active" : ""}`}
                    onClick={() => setPanelTab("terminal")}
                  >
                    Terminal
                  </button>
                )}
              </div>

              {/* Output Panel */}
              {panelTab === "output" && (
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
            )}

            {/* Terminal Panel */}
            {panelTab === "terminal" && settingsSnapshot.terminalEnabled && (
              <Terminal workspaceFiles={filesWithPaths} onFilesChange={handleSandboxFilesChange} />
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Algorithm Visualizer Panel */}
      {showVisualizer && activeFile && (
        <VisualizerPanel
          code={activeFile.content}
          onClose={() => setShowVisualizer(false)}
          highlightLine={(line) => setHighlightedLine(line)}
        />
      )}

      {/* AI Assistant Panel (Mistral) */}
      {showAIChat && settingsSnapshot.aiEnabled && (
        <AIChatPanel
          onClose={() => setShowAIChat(false)}
          activeFile={activeFile}
          writeMode={aiWriteMode}
          onWriteModeChange={setAiWriteMode}
          onApplyCode={applyCodeToActiveFile}
        />
      )}
    </div>
  );
}
