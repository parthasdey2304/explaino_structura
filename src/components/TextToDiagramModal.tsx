"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Sparkles,
  History,
  Trash2,
  Clock,
  ArrowRight,
  Loader2,
  X,
  Code2,
  AlertCircle,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  FileCode2,
  Layers,
  Network,
  GitBranch,
  Database,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { safeParseMermaidToExcalidraw } from "@/lib/mermaidParser";
import { getStoredModel, getModelLabel } from "@/lib/ai/mistral";

interface TextToDiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (elements: readonly ExcalidrawElement[], files?: BinaryFiles) => void;
  theme?: "light" | "dark";
}

interface ExamplePrompt {
  label: string;
  prompt: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { label: "TCP/IP Handshake", prompt: "tcp/ip 3-way handshake sequence diagram", icon: Network },
  { label: "OAuth 2.0 Auth", prompt: "oauth 2.0 authentication flow with authorization code", icon: ShieldCheck },
  { label: "Microservices", prompt: "microservices architecture with api gateway, auth service, and redis", icon: Layers },
  { label: "Git Workflow", prompt: "git feature branch, pull request, squash and merge workflow", icon: GitBranch },
  { label: "Data Pipeline", prompt: "data pipeline etl from source to data warehouse and dashboard", icon: Database },
];

const DEFAULT_PROMPT = "tcp/ip 3-way handshake sequence diagram";

const INITIAL_MERMAID = [
  "sequenceDiagram",
  "    autonumber",
  "    participant Client as 💻 Client",
  "    participant Server as 🖥️ Server",
  "    Client->>Server: SYN (seq=x)",
  "    Note over Server: Server receives SYN",
  "    Server->>Client: SYN-ACK (seq=y, ack=x+1)",
  "    Note over Client: Client receives SYN-ACK",
  "    Client->>Server: ACK (ack=y+1)",
  "    Note over Client,Server: TCP Connection Established",
].join("\n");


function sanitizeSequenceDiagramLifelines(elements: any[]): any[] {
  const rects = elements.filter(
    (el) => el.type === "rectangle" && el.width > 0 && el.height > 0
  );

  const processedElements: any[] = [];
  const linesToReorder: any[] = [];

  for (const el of elements) {
    const isVerticalLine =
      el.type === "line" &&
      (el.width === 0 ||
        (Array.isArray(el.points) &&
          el.points.length === 2 &&
          Math.abs(el.points[0][0] - el.points[1][0]) <= 3)) &&
      (el.height > 30 ||
        (Array.isArray(el.points) &&
          el.points.length === 2 &&
          Math.abs(el.points[0][1] - el.points[1][1]) > 30));

    if (!isVerticalLine) {
      if (el.type === "rectangle") {
        if (!el.backgroundColor || el.backgroundColor === "transparent" || el.backgroundColor === "none") {
          el.backgroundColor = "#fff9db";
        }
        el.fillStyle = "solid";
      }
      processedElements.push(el);
      continue;
    }

    const lineX = el.x;
    const startY = Math.min(el.y, el.y + (el.height ?? 0));
    const totalHeight = Math.abs(el.height ?? (el.points?.[1]?.[1] ?? 0));
    const endY = startY + totalHeight;

    const overlapping = rects.filter((rect) => {
      const rx = rect.x;
      const rw = rect.width;
      const ry = rect.y;
      const rh = rect.height;

      const crossesHorizontally = lineX >= rx - 2 && lineX <= rx + rw + 2;
      const crossesVertically = startY < ry + rh && endY > ry;
      return crossesHorizontally && crossesVertically;
    });

    if (overlapping.length === 0) {
      linesToReorder.push(el);
      continue;
    }

    overlapping.sort((a, b) => a.y - b.y);

    let curY = startY;
    for (let i = 0; i < overlapping.length; i++) {
      const rect = overlapping[i];
      const rectTop = rect.y;
      const rectBottom = rect.y + rect.height;

      if (rectTop > curY + 2) {
        const segHeight = rectTop - curY;
        linesToReorder.push({
          ...el,
          id: el.id ? `${el.id}-seg-${Math.round(curY)}` : undefined,
          y: curY,
          height: segHeight,
          points: [
            [0, 0],
            [0, segHeight],
          ],
        });
      }
      curY = Math.max(curY, rectBottom);
    }

    if (endY > curY + 2) {
      const segHeight = endY - curY;
      linesToReorder.push({
        ...el,
        id: el.id ? `${el.id}-seg-${Math.round(curY)}` : undefined,
        y: curY,
        height: segHeight,
        points: [
          [0, 0],
          [0, segHeight],
        ],
      });
    }
  }

  return [...linesToReorder, ...processedElements];
}


export interface DiagramHistoryItem {
  id: string;
  prompt: string;
  mermaidCode: string;
  model?: string;
  timestamp: number;
}

const HISTORY_STORAGE_KEY = "explaino-text-to-diagram-history";
const MAX_HISTORY_ITEMS = 30;

const STARTER_HISTORY_ITEM: DiagramHistoryItem = {
  id: "diag-starter-tcp",
  prompt: "tcp/ip 3-way handshake sequence diagram",
  mermaidCode: INITIAL_MERMAID,
  model: "gemini-3.5-flash",
  timestamp: Date.now() - 3600000,
};

function loadDiagramHistory(): DiagramHistoryItem[] {
  if (typeof window === "undefined") return [STARTER_HISTORY_ITEM];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [STARTER_HISTORY_ITEM];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [STARTER_HISTORY_ITEM];
  } catch {
    return [STARTER_HISTORY_ITEM];
  }
}

function saveDiagramHistory(items: DiagramHistoryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {}
}

function getDiagramType(code: string): string {
  const trimmed = code.trim().toLowerCase();
  if (trimmed.startsWith("sequencediagram")) return "Sequence Diagram";
  if (trimmed.startsWith("flowchart") || trimmed.startsWith("graph")) return "Flowchart";
  if (trimmed.startsWith("classdiagram")) return "Class Diagram";
  if (trimmed.startsWith("statediagram")) return "State Diagram";
  if (trimmed.startsWith("erdiagram")) return "ER Diagram";
  if (trimmed.startsWith("gantt")) return "Gantt Chart";
  if (trimmed.startsWith("pie")) return "Pie Chart";
  if (trimmed.startsWith("mindmap")) return "Mindmap";
  return "Mermaid Diagram";
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 1000 / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TextToDiagramModal({
  isOpen,
  onClose,
  onInsert,
  theme = "light",
}: TextToDiagramModalProps) {
  const [activeTab, setActiveTab] = useState<"text" | "mermaid" | "history">("text");
  const [history, setHistory] = useState<DiagramHistoryItem[]>(() => {
    if (typeof window !== "undefined") {
      return loadDiagramHistory();
    }
    return [STARTER_HISTORY_ITEM];
  });
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>("diag-starter-tcp");
  const [historyToast, setHistoryToast] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [mermaidCode, setMermaidCode] = useState(INITIAL_MERMAID);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const [previewSvg, setPreviewSvg] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [insertError, setInsertError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(1);

  const previewContainerRef = useRef<HTMLDivElement>(null);

  const handleLoadHistory = (item: DiagramHistoryItem, switchTab?: "text" | "mermaid") => {
    setPrompt(item.prompt);
    setMermaidCode(item.mermaidCode);
    updateMermaidPreview(item.mermaidCode);
    setSelectedHistoryId(item.id);
    setZoomScale(1);
    setHistoryToast(`Loaded "${item.prompt.slice(0, 32)}..." into preview and editor`);
    setTimeout(() => setHistoryToast(null), 3000);

    if (switchTab) {
      setActiveTab(switchTab);
    }
  };

  const handleDeleteHistory = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveDiagramHistory(updated);
      return updated;
    });
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveDiagramHistory([]);
    setSelectedHistoryId(null);
  };

  const isDark = theme === "dark";

  // Re-render Mermaid SVG preview with clean theme variables
  const updateMermaidPreview = useCallback(
    async (code: string) => {
      if (typeof window === "undefined" || !code.trim()) {
        setPreviewSvg("");
        setRenderError(null);
        return;
      }

      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables: isDark
            ? {
                darkMode: true,
                background: "transparent",
                mainBkg: "#22222a",
                primaryColor: "#312e81",
                primaryTextColor: "#e0e7ff",
                primaryBorderColor: "#6366f1",
                lineColor: "#818cf8",
                secondaryColor: "#1e1b4b",
                tertiaryColor: "#18181b",
                noteBkgColor: "#1e1b4b",
                noteTextColor: "#e0e7ff",
                noteBorderColor: "#818cf8",
                actorBkg: "#22222a",
                actorTextColor: "#ffffff",
                actorBorder: "#6366f1",
                actorLineColor: "#6366f1",
                signalColor: "#818cf8",
                signalTextColor: "#f4f4f5",
                labelBoxBkgColor: "#1c1c22",
                labelBoxBorderColor: "#3f3f46",
                labelTextColor: "#f4f4f5",
                loopTextColor: "#f4f4f5",
                fontSize: "13.5px",
                fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }
            : {
                darkMode: false,
                background: "transparent",
                mainBkg: "#f4f4f8",
                primaryColor: "#e0dfff",
                primaryTextColor: "#1e1b4b",
                primaryBorderColor: "#6965db",
                lineColor: "#6965db",
                secondaryColor: "#f5f3ff",
                tertiaryColor: "#ffffff",
                noteBkgColor: "#fef9c3",
                noteTextColor: "#713f12",
                noteBorderColor: "#fde047",
                actorBkg: "#ffffff",
                actorTextColor: "#1b1b1f",
                actorBorder: "#6965db",
                actorLineColor: "#6965db",
                signalColor: "#6965db",
                signalTextColor: "#1b1b1f",
                labelBoxBkgColor: "#ffffff",
                labelBoxBorderColor: "#e4e4e7",
                labelTextColor: "#1b1b1f",
                loopTextColor: "#1b1b1f",
                fontSize: "13.5px",
                fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              },
        });

        const uniqueId = `mermaid-preview-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { svg } = await mermaid.render(uniqueId, code.trim());
        setPreviewSvg(svg);
        setRenderError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid Mermaid syntax";
        setRenderError(msg);
        const errorElements = document.querySelectorAll(
          `[id^="dmermaid-preview-"], [id^="mermaid-preview-"]`
        );
        errorElements.forEach((el) => el.remove());
      }
    },
    [isDark]
  );

  // Debounced live preview update when editing Mermaid code
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      updateMermaidPreview(mermaidCode);
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, mermaidCode, updateMermaidPreview]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGenerate = async (customPrompt?: string) => {
    const textToRun = (customPrompt ?? prompt).trim();
    if (!textToRun) return;
    setIsGenerating(true);
    setInsertError(null);

    try {
      const res = await fetch("/api/ai/mermaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: textToRun, model: getStoredModel() }),
      });

      if (!res.ok) {
        throw new Error(`Failed to generate diagram: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.mermaid) {
        setMermaidCode(data.mermaid);
        await updateMermaidPreview(data.mermaid);
        setZoomScale(1);

        // Auto-save to local history cache
        const historyItem: DiagramHistoryItem = {
          id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          prompt: textToRun,
          mermaidCode: data.mermaid,
          model: getStoredModel(),
          timestamp: Date.now(),
        };

        setHistory((prev) => {
          const filtered = prev.filter(
            (h) => h.prompt.trim().toLowerCase() !== textToRun.toLowerCase()
          );
          const updated = [historyItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
          saveDiagramHistory(updated);
          return updated;
        });
        setSelectedHistoryId(historyItem.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error generating diagram";
      setInsertError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectTemplate = (template: ExamplePrompt) => {
    setPrompt(template.prompt);
    handleGenerate(template.prompt);
  };

  const handleInsert = async () => {
    if (!mermaidCode.trim()) return;
    setIsInserting(true);
    setInsertError(null);

    try {
      const { elements, files } = await safeParseMermaidToExcalidraw(mermaidCode.trim(), {
        fontSize: "16px",
      });

      if (!elements || elements.length === 0) {
        throw new Error("No elements generated from this Mermaid diagram.");
      }

      onInsert(elements, files);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to convert diagram to Excalidraw elements.";
      setInsertError(msg);
    } finally {
      setIsInserting(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(mermaidCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10 transition-all duration-200 ${
        isDark ? "bg-black/45" : "bg-black/[0.15]"
      }`}
      style={{
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={`w-full max-w-5xl rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 border ${
          isDark
            ? "bg-[#141418] text-zinc-100 border-zinc-800/90"
            : "bg-white text-zinc-900 border-zinc-200"
        }`}
        style={{
          height: "88vh",
          maxHeight: "820px",
          minHeight: "560px",
          boxShadow: isDark
            ? "0 25px 80px -15px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)"
            : "0 25px 80px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Header Bar */}
        <div
          style={{ padding: "18px 28px" }}
          className={`text-to-diagram-header flex items-center justify-between px-6 py-5 sm:px-8 sm:py-5 border-b shrink-0 ${
            isDark ? "border-zinc-800/90 bg-[#17171d]" : "border-zinc-200/90 bg-zinc-50/90"
          }`}
        >
          {/* Title & Brand */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 shrink-0">
              <Sparkles size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">Text to Diagram</h2>
                <span style={{ padding: "3px 10px", lineHeight: "1.2" }} className="text-to-diagram-ai-badge text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  AI Powered
                </span>
              </div>
              <p className={`text-xs mt-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                Transform natural descriptions into editable Excalidraw whiteboard elements
              </p>
            </div>
          </div>

          {/* Right Header: Segmented Tab Switch & Close */}
          <div className="flex items-center gap-3">
            <div
              style={{ padding: "4px" }}
              className={`text-to-diagram-tab-container inline-flex items-center p-1 rounded-xl border ${
                isDark
                  ? "bg-zinc-950/80 border-zinc-800/90"
                  : "bg-zinc-200/70 border-zinc-300/80"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab("text")}
                style={{ padding: "6px 13px", lineHeight: "1.2" }}
                className={`text-to-diagram-tab-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "text"
                    ? isDark
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40"
                      : "bg-[#6965db] text-white shadow-sm"
                    : isDark
                    ? "text-zinc-400 hover:text-zinc-200"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <Sparkles size={14} />
                <span>Prompt (AI)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mermaid")}
                style={{ padding: "6px 13px", lineHeight: "1.2" }}
                className={`text-to-diagram-tab-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "mermaid"
                    ? isDark
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40"
                      : "bg-[#6965db] text-white shadow-sm"
                    : isDark
                    ? "text-zinc-400 hover:text-zinc-200"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <Code2 size={14} />
                <span>Mermaid Code</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                style={{ padding: "6px 13px", lineHeight: "1.2" }}
                className={`text-to-diagram-tab-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "history"
                    ? isDark
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40"
                      : "bg-[#6965db] text-white shadow-sm"
                    : isDark
                    ? "text-zinc-400 hover:text-zinc-200"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <History size={14} />
                <span>History</span>
                {history.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      activeTab === "history"
                        ? "bg-white/25 text-white"
                        : isDark
                        ? "bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                        : "bg-zinc-300 text-zinc-700"
                    }`}
                  >
                    {history.length}
                  </span>
                )}
              </button>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ml-1 ${
                isDark
                  ? "border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  : "border-zinc-200 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
              }`}
              title="Close (Esc)"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: Split-View */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Prompt Input Studio */}
          <div
            style={{ padding: "24px 28px" }}
            className={`text-to-diagram-sidebar w-full md:w-[44%] flex flex-col p-6 sm:p-7 border-b md:border-b-0 md:border-r overflow-y-auto shrink-0 ${
              isDark ? "border-zinc-800/80 bg-[#16161b]" : "border-zinc-200/80 bg-white"
            }`}
          >
            
            {activeTab === "history" ? (
              <div className="flex flex-col h-full gap-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80 shrink-0">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-indigo-400" />
                    <span className="text-xs font-bold tracking-wider uppercase text-indigo-400">
                      Diagram History
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isDark
                          ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                          : "bg-zinc-100 text-zinc-600 border-zinc-200"
                      }`}
                    >
                      {history.length} {history.length === 1 ? "cached" : "cached"}
                    </span>
                  </div>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      className="text-[11px] text-zinc-400 hover:text-red-400 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer"
                      title="Clear all history from cache"
                    >
                      <Trash2 size={12} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {historyToast && (
                  <div className="px-3 py-2 rounded-xl text-xs bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 animate-in fade-in shrink-0">
                    <CheckCircle2 size={14} className="shrink-0" />
                    <span className="truncate">{historyToast}</span>
                  </div>
                )}

                {history.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 gap-3">
                    <Clock size={36} className="opacity-40" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-400">No cached diagram history</p>
                      <p className="text-[11px] text-zinc-500 mt-1 max-w-[260px]">
                        Diagrams generated from natural prompts or Mermaid code will be automatically saved in your browser cache.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("text")}
                      className="mt-2 text-xs font-medium px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                    >
                      Generate New Diagram
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                    {history.map((item) => {
                      const isSelected = selectedHistoryId === item.id;
                      const diagType = getDiagramType(item.mermaidCode);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleLoadHistory(item)}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative group ${
                            isSelected
                              ? isDark
                                ? "bg-indigo-950/50 border-indigo-500 shadow-md shadow-indigo-950/50"
                                : "bg-indigo-50/80 border-indigo-400 shadow-sm"
                              : isDark
                              ? "bg-zinc-900/70 border-zinc-800/80 hover:bg-zinc-800/60 hover:border-zinc-700 text-zinc-300"
                              : "bg-zinc-50 border-zinc-200/90 hover:bg-zinc-100 hover:border-zinc-300 text-zinc-800"
                          }`}
                        >
                          {/* Card Header: Prompt + Time */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <h4
                              className={`text-xs font-semibold line-clamp-2 leading-snug ${
                                isSelected
                                  ? isDark
                                    ? "text-indigo-200"
                                    : "text-indigo-950 font-bold"
                                  : isDark
                                  ? "text-zinc-200"
                                  : "text-zinc-900"
                              }`}
                            >
                              {item.prompt}
                            </h4>
                            <span className="text-[10px] text-zinc-400 shrink-0 font-medium">
                              {formatTimeAgo(item.timestamp)}
                            </span>
                          </div>

                          {/* Metadata row: Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-2">
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                                isDark
                                  ? "bg-zinc-800/90 text-indigo-300 border-indigo-500/25"
                                  : "bg-white text-indigo-700 border-indigo-200"
                              }`}
                            >
                              {diagType}
                            </span>
                            {item.model && (
                              <span
                                className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                                  isDark
                                    ? "bg-zinc-800/70 text-zinc-400 border-zinc-700/60"
                                    : "bg-white text-zinc-600 border-zinc-200"
                                }`}
                              >
                                {getModelLabel(item.model)}
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 ml-auto">
                                Active in Preview
                              </span>
                            )}
                          </div>

                          {/* Mermaid code snippet */}
                          <pre
                            className={`text-[10px] font-mono p-2 rounded-lg line-clamp-2 overflow-hidden border leading-relaxed ${
                              isDark
                                ? "bg-black/40 border-zinc-800/80 text-zinc-400"
                                : "bg-white border-zinc-200/90 text-zinc-600"
                            }`}
                          >
                            {item.mermaidCode.slice(0, 140)}
                          </pre>

                          {/* Actions on hover/active */}
                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-zinc-200/50 dark:border-zinc-800/60">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadHistory(item, "text");
                                }}
                                className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-400 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span>Edit Prompt</span>
                              </button>
                              <span className="text-zinc-500 text-[10px]">•</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadHistory(item, "mermaid");
                                }}
                                className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-400 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span>Edit Mermaid</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteHistory(item.id, e)}
                              className="text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Delete from history"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeTab === "text" ? (

              <div className="flex flex-col h-full gap-5">
                {/* Prompt Section */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label
                      htmlFor="diagram-prompt"
                      className="text-xs font-bold tracking-wider uppercase text-indigo-400 flex items-center gap-1.5"
                    >
                      <span>Describe Your Diagram</span>
                    </label>
                    <span
                      style={{ padding: "4px 9px", lineHeight: "1.2" }}
                      className={`text-to-diagram-shortcut-badge text-[11px] font-mono px-2.5 py-1 rounded-md border ${
                        isDark
                          ? "bg-zinc-900 border-zinc-800 text-zinc-400"
                          : "bg-zinc-100 border-zinc-200 text-zinc-600"
                      }`}
                    >
                      Ctrl + Enter to run
                    </span>
                  </div>

                  <textarea
                    id="diagram-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. sequence diagram of user authentication, microservices architecture with kafka and redis, database ER schema..."
                    rows={4}
                    style={{ padding: "14px 16px", minHeight: "110px", boxSizing: "border-box" }}
                    className={`text-to-diagram-textarea w-full p-4 text-xs sm:text-sm rounded-xl border outline-none transition-all resize-none leading-relaxed ${
                      isDark
                        ? "bg-zinc-900/90 border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25"
                        : "bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-[#6965db] focus:ring-2 focus:ring-[#6965db]/20"
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                </div>

                {/* Example Quick Templates */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={`text-xs font-bold tracking-wider uppercase ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      Popular Templates
                    </span>
                    {history.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("history")}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer"
                        title="View cached diagram history"
                      >
                        <History size={12} />
                        <span>History ({history.length})</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {EXAMPLE_PROMPTS.map((ex) => {
                      const Icon = ex.icon;
                      const isActive = prompt === ex.prompt;
                      return (
                        <button
                          key={ex.label}
                          type="button"
                          onClick={() => handleSelectTemplate(ex)}
                          style={{ padding: "10px 14px", boxSizing: "border-box" }}
                          className={`text-to-diagram-template-btn flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isActive
                              ? isDark
                                ? "bg-indigo-950/70 border-indigo-500 text-indigo-300 shadow-sm"
                                : "bg-indigo-50 border-indigo-400 text-indigo-800 shadow-sm"
                              : isDark
                              ? "bg-zinc-900/70 border-zinc-800/90 text-zinc-300 hover:bg-zinc-800/80 hover:border-zinc-700 hover:text-white"
                              : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300"
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isActive
                                ? "bg-indigo-500/20 text-indigo-400"
                                : isDark
                                ? "bg-zinc-800 text-zinc-400"
                                : "bg-zinc-200 text-zinc-600"
                            }`}
                          >
                            <Icon size={14} />
                          </div>
                          <span className="text-xs font-medium truncate">{ex.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Generate Action Button */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleGenerate()}
                    disabled={isGenerating || !prompt.trim()}
                    style={{
                      padding: "13px 24px",
                      minHeight: "46px",
                      boxSizing: "border-box",
                      background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    }}
                    className="text-to-diagram-generate-btn w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm text-white transition-all shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99]"
                    
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={17} className="animate-spin" />
                        <span>Generating Diagram with AI…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={17} />
                        <span>Generate Diagram</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("mermaid")}
                    className="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-xl border border-dashed text-indigo-400 hover:text-indigo-300 border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                  >
                    <Code2 size={14} />
                    <span>View & Edit Mermaid Code</span>
                  </button>
                </div>

                {/* Pro Tip Card */}
                <div
                  style={{ padding: "14px 18px" }}
                  className={`text-to-diagram-tip mt-auto p-4 rounded-xl border text-xs leading-relaxed ${
                    isDark
                      ? "bg-indigo-950/25 border-indigo-900/40 text-indigo-300/90"
                      : "bg-indigo-50/60 border-indigo-200/80 text-indigo-900"
                  }`}
                >
                  <p>
                    💡 <strong>Pro Tip:</strong> Supports sequence diagrams, flowcharts, class diagrams, state machines, and architectures. Elements insert as native Excalidraw whiteboard shapes that you can move, recolor, and edit!
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="mermaid-code"
                      className="text-xs font-bold tracking-wider uppercase text-indigo-400 flex items-center gap-1.5"
                    >
                      <FileCode2 size={15} />
                      <span>Mermaid Code</span>
                    </label>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live Editor
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      style={{ padding: "6px 14px", lineHeight: "1.2" }}
                      className={`text-to-diagram-action-btn text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isDark
                          ? "border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                          : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                      }`}
                      title="Copy code to clipboard"
                    >
                      {copiedCode ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      <span>{copiedCode ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMermaidPreview(mermaidCode)}
                      style={{ padding: "6px 14px", lineHeight: "1.2" }}
                      className={`text-to-diagram-action-btn text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isDark
                          ? "border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                          : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                      }`}
                      title="Refresh live preview"
                    >
                      <RefreshCw size={13} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="relative flex-1 flex flex-col min-h-0">
                  <textarea
                    id="mermaid-code"
                    value={mermaidCode}
                    onChange={(e) => {
                      setMermaidCode(e.target.value);
                      setRenderError(null);
                    }}
                    placeholder="Enter Mermaid diagram code here..."
                    spellCheck={false}
                    style={{ padding: "14px 16px", boxSizing: "border-box" }}
                    className={`text-to-diagram-textarea w-full flex-1 p-4 font-mono text-xs rounded-xl border outline-none transition-all resize-none leading-relaxed ${
                      isDark
                        ? "bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        : "bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-[#6965db] focus:ring-2 focus:ring-[#6965db]/20"
                    }`}
                  />
                  <div className="absolute bottom-2.5 right-3 text-[10px] font-mono text-zinc-500 pointer-events-none bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                    {mermaidCode.split("\n").length} lines • {mermaidCode.length} chars
                  </div>
                </div>

                {renderError && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs shrink-0">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{renderError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Live Interactive Diagram Preview */}
          <div
            className={`w-full md:w-[56%] flex flex-col p-6 sm:p-7 relative min-h-0 ${
              isDark ? "bg-[#101014]" : "bg-zinc-50/70"
            }`}
          >
            {/* Preview Toolbar Row */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Interactive Preview
                </span>
                <span style={{ padding: "3px 10px", lineHeight: "1.2" }} className="text-to-diagram-ready-badge text-[11px] font-medium px-2.5 py-0.5 rounded-md bg-zinc-800/90 border border-zinc-700/60 text-zinc-400">
                  Ready to insert
                </span>
              </div>

              {/* Floating Canvas Zoom HUD */}
              <div
                style={{ padding: "4px 8px" }}
                className={`text-to-diagram-zoom-hud flex items-center gap-1.5 p-1 rounded-xl border backdrop-blur-md shadow-sm ${
                  isDark
                    ? "bg-zinc-900/90 border-zinc-700/80"
                    : "bg-white/95 border-zinc-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))))}
                  style={{ padding: "6px 8px", boxSizing: "border-box" }}
                  className={`text-to-diagram-zoom-btn p-1.5 rounded-lg transition cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  style={{ padding: "4px 8px" }}
                  className={`text-to-diagram-zoom-label px-2.5 py-1 text-xs font-mono rounded-lg font-medium transition cursor-pointer ${
                    isDark ? "text-zinc-300 hover:text-white hover:bg-zinc-800" : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                  title="Reset Zoom (100%)"
                >
                  {Math.round(zoomScale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))))}
                  style={{ padding: "6px 8px", boxSizing: "border-box" }}
                  className={`text-to-diagram-zoom-btn p-1.5 rounded-lg transition cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  style={{ padding: "6px 8px", boxSizing: "border-box" }}
                  className={`text-to-diagram-zoom-btn p-1.5 rounded-lg transition cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                  title="Fit to Frame"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>

            {/* Diagram Preview Surface with Whiteboard Dot Grid */}
            <div
              style={{
                padding: "28px",
                backgroundImage: isDark
                  ? "radial-gradient(circle, rgba(255, 255, 255, 0.12) 1.2px, transparent 1.2px)"
                  : "radial-gradient(circle, rgba(0, 0, 0, 0.1) 1.2px, transparent 1.2px)",
                backgroundSize: "20px 20px",
              }}
              className={`text-to-diagram-preview-canvas flex-1 min-h-0 rounded-2xl border relative flex items-center justify-center overflow-auto p-8 sm:p-10 transition-colors shadow-inner ${
                isDark ? "bg-[#17171c] border-zinc-800/90 shadow-black/40" : "bg-white border-zinc-200 shadow-zinc-200/50"
              }`}
            >
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center gap-3.5 text-zinc-400 py-12">
                  <div className="relative">
                    <Loader2 size={38} className="animate-spin text-indigo-500" />
                    <Sparkles size={18} className="absolute inset-0 m-auto text-indigo-400 animate-pulse" />
                  </div>
                  <span className="text-xs font-semibold tracking-wide text-indigo-300">
                    Generating visual diagram with AI…
                  </span>
                </div>
              ) : previewSvg ? (
                <div
                  ref={previewContainerRef}
                  className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out mermaid-preview-viewport"
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "center center",
                  }}
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-zinc-400 py-12">
                  <Layers size={34} className="opacity-40" />
                  <span className="text-xs font-medium">Diagram preview will render here</span>
                </div>
              )}
            </div>

            {insertError && (
              <div className="mt-3.5 flex items-center gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{insertError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{ padding: "18px 28px" }}
          className={`text-to-diagram-footer flex items-center justify-between px-6 py-4 sm:px-8 sm:py-5 border-t shrink-0 ${
            isDark ? "border-zinc-800/90 bg-[#17171d]" : "border-zinc-200/90 bg-zinc-50/90"
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs text-zinc-400 font-medium">
            <CheckCircle2 size={16} className="text-indigo-400 shrink-0" />
            <span className="hidden sm:inline">Diagram inserts as native, editable Excalidraw elements</span>
          </div>

          <div className="flex items-center gap-3.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "10px 22px" }}
              className={`px-5 py-2.5 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer border ${
                isDark
                  ? "text-zinc-300 hover:text-white bg-zinc-800/90 hover:bg-zinc-700/90 border-zinc-700/80"
                  : "text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-100 border-zinc-300"
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleInsert}
              disabled={isInserting || !mermaidCode.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 sm:px-7 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl text-white transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
              style={{
                padding: "12px 28px",
                marginRight: "4px",
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)",
              }}
              title="Insert diagram onto whiteboard canvas"
            >
              {isInserting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Inserting…</span>
                </>
              ) : (
                <>
                  <span>Insert to Canvas</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Scoped CSS to eliminate Mermaid default drop-shadows & style preview nicely */}
      <style jsx global>{`
        .mermaid-preview-viewport svg {
          max-width: 100% !important;
          max-height: 100% !important;
          width: auto !important;
          height: auto !important;
          display: block;
          margin: auto;
        }
        .mermaid-preview-viewport svg .note,
        .mermaid-preview-viewport svg .note rect {
          filter: none !important;
          rx: 8px !important;
          ry: 8px !important;
        }
        .mermaid-preview-viewport svg .actor,
        .mermaid-preview-viewport svg rect.actor {
          rx: 8px !important;
          ry: 8px !important;
          filter: none !important;
        }
        .mermaid-preview-viewport svg text {
          font-family: inherit !important;
        }
      `}</style>
    </div>
  );
}
