"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Sparkles,
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
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

interface TextToDiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (elements: readonly ExcalidrawElement[]) => void;
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

export default function TextToDiagramModal({
  isOpen,
  onClose,
  onInsert,
  theme = "light",
}: TextToDiagramModalProps) {
  const [activeTab, setActiveTab] = useState<"text" | "mermaid">("text");
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

  useEffect(() => {
    if (isOpen) {
      updateMermaidPreview(mermaidCode);
      setZoomScale(1);
    }
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
        body: JSON.stringify({ prompt: textToRun }),
      });

      if (!res.ok) {
        throw new Error(`Failed to generate diagram: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.mermaid) {
        setMermaidCode(data.mermaid);
        await updateMermaidPreview(data.mermaid);
        setZoomScale(1);
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
      const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
      const { elements } = await parseMermaidToExcalidraw(mermaidCode.trim(), {
        themeVariables: { fontSize: "16px" },
      });

      if (!elements || elements.length === 0) {
        throw new Error("No elements generated from this Mermaid diagram.");
      }

      const excalidrawElements = convertToExcalidrawElements(elements);
      onInsert(excalidrawElements);
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
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10 bg-black/80 backdrop-blur-md transition-all duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          className={`flex items-center justify-between px-6 py-5 sm:px-8 sm:py-5 border-b shrink-0 ${
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
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
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
              className={`inline-flex items-center p-1 rounded-xl border ${
                isDark
                  ? "bg-zinc-950/80 border-zinc-800/90"
                  : "bg-zinc-200/70 border-zinc-300/80"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveTab("text")}
                className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
                className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
            className={`w-full md:w-[44%] flex flex-col p-6 sm:p-7 border-b md:border-b-0 md:border-r overflow-y-auto shrink-0 ${
              isDark ? "border-zinc-800/80 bg-[#16161b]" : "border-zinc-200/80 bg-white"
            }`}
          >
            {activeTab === "text" ? (
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
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-md border ${
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
                    className={`w-full p-4 text-xs sm:text-sm rounded-xl border outline-none transition-all resize-none leading-relaxed ${
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
                  <span className={`text-xs font-bold tracking-wider uppercase block mb-2.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Popular Templates
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {EXAMPLE_PROMPTS.map((ex) => {
                      const Icon = ex.icon;
                      const isActive = prompt === ex.prompt;
                      return (
                        <button
                          key={ex.label}
                          type="button"
                          onClick={() => handleSelectTemplate(ex)}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
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
                    className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm text-white transition-all shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.99]"
                    style={{
                      background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    }}
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
                </div>

                {/* Pro Tip Card */}
                <div
                  className={`mt-auto p-4 rounded-xl border text-xs leading-relaxed ${
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
              <div className="flex flex-col h-full gap-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="mermaid-code"
                    className="text-xs font-bold tracking-wider uppercase text-indigo-400 flex items-center gap-1.5"
                  >
                    <FileCode2 size={15} />
                    <span>Mermaid Definition</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
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
                      className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
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

                <textarea
                  id="mermaid-code"
                  value={mermaidCode}
                  onChange={(e) => {
                    setMermaidCode(e.target.value);
                    updateMermaidPreview(e.target.value);
                  }}
                  rows={14}
                  spellCheck={false}
                  className={`w-full flex-1 p-4 font-mono text-xs rounded-xl border outline-none transition-all resize-none leading-relaxed ${
                    isDark
                      ? "bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      : "bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-[#6965db] focus:ring-2 focus:ring-[#6965db]/20"
                  }`}
                />

                {renderError && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
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
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-md bg-zinc-800/90 border border-zinc-700/60 text-zinc-400">
                  Ready to insert
                </span>
              </div>

              {/* Floating Canvas Zoom HUD */}
              <div
                className={`flex items-center gap-1.5 p-1 rounded-xl border backdrop-blur-md shadow-sm ${
                  isDark
                    ? "bg-zinc-900/90 border-zinc-700/80"
                    : "bg-white/95 border-zinc-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))))}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-lg font-medium transition cursor-pointer ${
                    isDark ? "text-zinc-300 hover:text-white hover:bg-zinc-800" : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                  title="Reset Zoom (100%)"
                >
                  {Math.round(zoomScale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))))}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                  }`}
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
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
              className={`flex-1 min-h-0 rounded-2xl border relative flex items-center justify-center overflow-auto p-8 sm:p-10 transition-colors shadow-inner ${
                isDark ? "bg-[#17171c] border-zinc-800/90 shadow-black/40" : "bg-white border-zinc-200 shadow-zinc-200/50"
              }`}
              style={{
                backgroundImage: isDark
                  ? "radial-gradient(circle, rgba(255, 255, 255, 0.12) 1.2px, transparent 1.2px)"
                  : "radial-gradient(circle, rgba(0, 0, 0, 0.1) 1.2px, transparent 1.2px)",
                backgroundSize: "20px 20px",
              }}
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
          className={`flex items-center justify-between px-6 py-4 sm:px-8 sm:py-5 border-t shrink-0 ${
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
              disabled={isInserting || !mermaidCode.trim() || !!renderError}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 sm:px-7 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl text-white transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
              style={{
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
