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
  { label: "OAuth 2.0 Flow", prompt: "oauth 2.0 authentication flow with authorization code", icon: ShieldCheck },
  { label: "Microservices", prompt: "microservices architecture with api gateway, auth service, and redis", icon: Layers },
  { label: "Git Branching", prompt: "git feature branch, pull request, squash and merge workflow", icon: GitBranch },
  { label: "Data Pipeline", prompt: "data pipeline etl from source to data warehouse and dashboard", icon: Database },
];

const DEFAULT_PROMPT = "tcp/ip 3-way handshake sequence diagram";

const INITIAL_MERMAID = [
  "sequenceDiagram",
  "    autonumber",
  "    actor Client",
  "    actor Server",
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
                mainBkg: "#27272a",
                primaryColor: "#312e81",
                primaryTextColor: "#e0e7ff",
                primaryBorderColor: "#6366f1",
                lineColor: "#818cf8",
                secondaryColor: "#1e1b4b",
                tertiaryColor: "#18181b",
                noteBkgColor: "#27272a",
                noteTextColor: "#f4f4f5",
                noteBorderColor: "#6366f1",
                actorBkg: "#1e1e24",
                actorTextColor: "#f4f4f5",
                actorBorder: "#6366f1",
                actorLineColor: "#6366f1",
                signalColor: "#818cf8",
                signalTextColor: "#f4f4f5",
                labelBoxBkgColor: "#1e1e24",
                labelBoxBorderColor: "#3f3f46",
                labelTextColor: "#f4f4f5",
                loopTextColor: "#f4f4f5",
                fontSize: "14px",
                fontFamily: 'Assistant, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }
            : {
                darkMode: false,
                background: "transparent",
                mainBkg: "#f4f4f5",
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
                fontSize: "14px",
                fontFamily: 'Assistant, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setInsertError(null);

    try {
      const res = await fetch("/api/ai/mermaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
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
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm transition-all"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={`w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 border ${
          isDark
            ? "bg-[#18181b] text-zinc-100 border-zinc-800"
            : "bg-white text-zinc-900 border-zinc-200"
        }`}
        style={{
          height: "82vh",
          maxHeight: "680px",
          minHeight: "480px",
          boxShadow: isDark
            ? "0 25px 65px -12px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.1)"
            : "0 25px 65px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Header Bar */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-b shrink-0 ${
            isDark ? "border-zinc-800/90 bg-zinc-900/60" : "border-zinc-200/80 bg-zinc-50/70"
          }`}
        >
          {/* Title & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">Text to Diagram</h2>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                  AI
                </span>
              </div>
              <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                Convert natural descriptions to interactive Excalidraw whiteboard shapes
              </p>
            </div>
          </div>

          {/* Segmented Tab Switch */}
          <div
            className={`inline-flex items-center p-1 rounded-xl border ${
              isDark
                ? "bg-zinc-950/70 border-zinc-800"
                : "bg-zinc-200/60 border-zinc-300/70"
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveTab("text")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "text"
                  ? isDark
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "bg-white text-zinc-900 shadow-xs"
                  : isDark
                  ? "text-zinc-400 hover:text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Sparkles size={13} className={activeTab === "text" ? "text-indigo-400" : ""} />
              <span>Prompt</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mermaid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeTab === "mermaid"
                  ? isDark
                    ? "bg-zinc-800 text-white shadow-xs"
                    : "bg-white text-zinc-900 shadow-xs"
                  : isDark
                  ? "text-zinc-400 hover:text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Code2 size={13} className={activeTab === "mermaid" ? "text-indigo-400" : ""} />
              <span>Mermaid Code</span>
            </button>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
            }`}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body: Split-View on Desktop */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left Column: Prompt Input or Mermaid Editor */}
          <div
            className={`w-full md:w-[42%] flex flex-col p-5 border-b md:border-b-0 md:border-r overflow-y-auto shrink-0 ${
              isDark ? "border-zinc-800 bg-[#18181b]" : "border-zinc-200 bg-white"
            }`}
          >
            {activeTab === "text" ? (
              <div className="flex flex-col h-full space-y-4">
                {/* Prompt Section */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="diagram-prompt"
                      className="text-xs font-semibold tracking-wide uppercase text-indigo-400"
                    >
                      Describe Your Diagram
                    </label>
                    <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      Ctrl + Enter to run
                    </span>
                  </div>

                  <textarea
                    id="diagram-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., tcp/ip handshake, oauth 2.0 flow, microservices architecture with kafka and redis..."
                    rows={4}
                    className={`w-full p-3 text-sm rounded-xl border outline-hidden transition focus:ring-2 resize-none ${
                      isDark
                        ? "bg-zinc-900/90 border-zinc-700/80 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:ring-indigo-500/25"
                        : "bg-zinc-50 border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-[#6965db] focus:ring-[#6965db]/20"
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                </div>

                {/* Example Suggestions */}
                <div className="space-y-2">
                  <span className={`text-[11px] font-medium block ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Try an example:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLE_PROMPTS.map((ex) => {
                      const Icon = ex.icon;
                      const isActive = prompt === ex.prompt;
                      return (
                        <button
                          key={ex.label}
                          type="button"
                          onClick={() => setPrompt(ex.prompt)}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isActive
                              ? isDark
                                ? "bg-indigo-950/70 border-indigo-600 text-indigo-300 font-medium"
                                : "bg-indigo-50 border-indigo-400 text-indigo-700 font-medium"
                              : isDark
                              ? "bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700"
                              : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300"
                          }`}
                        >
                          <Icon size={12} className={isActive ? "text-indigo-400" : "opacity-60"} />
                          <span>{ex.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Generate Action Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    }}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Generating diagram with AI…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Generate Diagram</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Helpful instructions note */}
                <div
                  className={`mt-auto p-3 rounded-xl border text-[11px] leading-relaxed ${
                    isDark
                      ? "bg-zinc-900/40 border-zinc-800/80 text-zinc-400"
                      : "bg-zinc-50 border-zinc-200 text-zinc-600"
                  }`}
                >
                  <p>
                    💡 <strong>Pro Tip:</strong> Supports sequence diagrams, flowcharts, class diagrams, state machines, and system architectures. Once inserted, every element becomes a native Excalidraw shape that you can move, recolor, and annotate!
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="mermaid-code"
                    className="text-xs font-semibold tracking-wide uppercase text-indigo-400 flex items-center gap-1.5"
                  >
                    <FileCode2 size={14} /> Mermaid Definition
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1 transition-colors cursor-pointer ${
                        isDark
                          ? "border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                          : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                      }`}
                      title="Copy code to clipboard"
                    >
                      {copiedCode ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                      <span>{copiedCode ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMermaidPreview(mermaidCode)}
                      className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1 transition-colors cursor-pointer ${
                        isDark
                          ? "border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                          : "border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                      }`}
                      title="Refresh live preview"
                    >
                      <RefreshCw size={12} />
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
                  className={`w-full flex-1 p-3 font-mono text-xs rounded-xl border outline-hidden transition focus:ring-2 resize-none leading-relaxed ${
                    isDark
                      ? "bg-zinc-900 border-zinc-700/80 text-zinc-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                      : "bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-[#6965db] focus:ring-[#6965db]/20"
                  }`}
                />

                {renderError && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{renderError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Live Interactive Diagram Preview */}
          <div
            className={`w-full md:w-[58%] flex flex-col p-5 relative min-h-0 ${
              isDark ? "bg-[#121215]" : "bg-zinc-50/70"
            }`}
          >
            {/* Preview Toolbar */}
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Live Preview
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ready
                </span>
              </div>

              {/* Zoom & View Controls */}
              <div className="flex items-center gap-1 bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-700/60">
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.max(0.4, Number((s - 0.15).toFixed(2))))}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700/60 transition cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  className="px-1.5 py-0.5 text-[11px] font-mono rounded-md text-zinc-300 hover:text-white hover:bg-zinc-700/60 transition cursor-pointer"
                  title="Reset Zoom (100%)"
                >
                  {Math.round(zoomScale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.min(2.5, Number((s + 0.15).toFixed(2))))}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700/60 transition cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700/60 transition cursor-pointer"
                  title="Fit to Frame"
                >
                  <Maximize2 size={13} />
                </button>
              </div>
            </div>

            {/* Diagram Preview Surface */}
            <div
              className={`flex-1 min-h-0 rounded-xl border relative flex items-center justify-center overflow-auto p-4 transition-colors ${
                isDark ? "bg-[#18181c] border-zinc-800" : "bg-white border-zinc-200"
              }`}
              style={{
                backgroundImage: isDark
                  ? "radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)"
                  : "radial-gradient(rgba(0, 0, 0, 0.08) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            >
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center gap-3 text-zinc-400 py-12">
                  <Loader2 size={32} className="animate-spin text-indigo-500" />
                  <span className="text-xs font-medium">Generating visual diagram…</span>
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
                <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 py-12">
                  <Layers size={28} className="opacity-40" />
                  <span className="text-xs">Diagram preview will render here</span>
                </div>
              )}
            </div>

            {insertError && (
              <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle size={14} className="shrink-0" />
                <span>{insertError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-t shrink-0 ${
            isDark ? "border-zinc-800 bg-zinc-900/70" : "border-zinc-200 bg-zinc-50/80"
          }`}
        >
          <div className="text-xs text-zinc-400 hidden sm:block">
            <span>Elements insert directly into your canvas scene</span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer border ${
                isDark
                  ? "text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 border-zinc-700/80"
                  : "text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-100 border-zinc-300"
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleInsert}
              disabled={isInserting || !mermaidCode.trim() || !!renderError}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-medium rounded-xl text-white transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-[0.98]"
              style={{
                backgroundColor: "#6965db",
                boxShadow: "0 4px 12px rgba(105, 101, 219, 0.35)",
              }}
              title="Insert diagram onto Excalidraw canvas"
            >
              {isInserting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Inserting…</span>
                </>
              ) : (
                <>
                  <span>Insert to Canvas</span>
                  <ArrowRight size={14} />
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
          rx: 6px !important;
          ry: 6px !important;
        }
        .mermaid-preview-viewport svg text {
          font-family: inherit !important;
        }
      `}</style>
    </div>
  );
}
