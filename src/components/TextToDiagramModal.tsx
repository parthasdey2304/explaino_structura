"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, ArrowRight, Loader2, X, Code2, AlertCircle, RefreshCw } from "lucide-react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

interface TextToDiagramModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (elements: readonly ExcalidrawElement[]) => void;
  theme?: "light" | "dark";
}

const EXAMPLE_PROMPTS = [
  { label: "TCP/IP Handshake", prompt: "tcp/ip handshake" },
  { label: "OAuth 2.0 Flow", prompt: "oauth 2.0 authentication flow with authorization code" },
  { label: "Microservices", prompt: "microservices architecture with api gateway and redis" },
  { label: "Git Branching", prompt: "git feature branch, pull request, squash and merge workflow" },
  { label: "Data Pipeline", prompt: "data pipeline etl from source to data warehouse and dashboard" },
];

const DEFAULT_PROMPT = "tcp/ip handshake";

const INITIAL_MERMAID = [
  "sequenceDiagram",
  "    autonumber",
  "    actor Client",
  "    actor Server",
  "    Client->>Server: SYN",
  "    Note over Server: Server receives SYN",
  "    Server->>Client: SYN-ACK",
  "    Note over Client: Client receives SYN-ACK",
  "    Client->>Server: ACK",
  "    Note over Server: Server receives ACK",
  "    Note over Client,Server: TCP connection established",
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

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === "dark";

  // Re-render Mermaid SVG preview whenever mermaidCode changes
  const updateMermaidPreview = useCallback(async (code: string) => {
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
        theme: isDark ? "dark" : "default",
        fontFamily: 'Assistant, "Segoe UI", sans-serif',
      });

      const uniqueId = `mermaid-render-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const { svg } = await mermaid.render(uniqueId, code.trim());
      setPreviewSvg(svg);
      setRenderError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid Mermaid syntax";
      setRenderError(msg);
      // Clean up stray SVG error elements mermaid might append to document body
      const errorElements = document.querySelectorAll(`[id^="dmermaid-render-"], [id^="mermaid-render-"]`);
      errorElements.forEach((el) => el.remove());
    }
  }, [isDark]);

  // Update preview on tab change or initial open
  useEffect(() => {
    if (isOpen) {
      updateMermaidPreview(mermaidCode);
    }
  }, [isOpen, mermaidCode, updateMermaidPreview]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
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
        setActiveTab("mermaid");
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
      const msg = err instanceof Error ? err.message : "Failed to convert diagram to Excalidraw elements.";
      setInsertError(msg);
    } finally {
      setIsInserting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 border ${
          isDark
            ? "bg-[#18181b] text-gray-100 border-zinc-800"
            : "bg-white text-gray-900 border-gray-200"
        }`}
        style={{ maxHeight: "88vh" }}
      >
        {/* Header Tabs */}
        <div
          className={`flex items-center justify-between px-6 pt-5 pb-3 border-b ${
            isDark ? "border-zinc-800" : "border-gray-100"
          }`}
        >
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("text")}
              className={`pb-2.5 text-base font-semibold transition-all relative ${
                activeTab === "text"
                  ? isDark
                    ? "text-indigo-400 border-b-2 border-indigo-500"
                    : "text-[#6965db] border-b-2 border-[#6965db]"
                  : isDark
                  ? "text-zinc-400 hover:text-zinc-200"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Text to diagram
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mermaid")}
              className={`pb-2.5 text-base font-semibold transition-all relative ${
                activeTab === "mermaid"
                  ? isDark
                    ? "text-indigo-400 border-b-2 border-indigo-500"
                    : "text-[#6965db] border-b-2 border-[#6965db]"
                  : isDark
                  ? "text-zinc-400 hover:text-zinc-200"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Mermaid
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            }`}
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p
            className={`text-xs italic ${
              isDark ? "text-zinc-400" : "text-gray-600"
            }`}
          >
            Currently we use Mermaid as a middle step, so you&apos;ll get best results with system, workflow, flow chart, and similar.
          </p>

          {activeTab === "text" ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="diagram-prompt"
                  className={`block text-sm font-semibold mb-1.5 ${
                    isDark ? "text-zinc-200" : "text-gray-800"
                  }`}
                >
                  Prompt
                </label>
                <textarea
                  id="diagram-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. tcp/ip handshake, user auth flow, microservices architecture..."
                  rows={4}
                  className={`w-full p-3 text-sm rounded-xl border outline-hidden transition focus:ring-2 resize-none ${
                    isDark
                      ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#6965db] focus:ring-[#6965db]/20"
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                />
              </div>

              {/* Suggestions */}
              <div>
                <span className={`text-xs font-medium block mb-2 ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                  Try an example:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => setPrompt(ex.prompt)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        prompt === ex.prompt
                          ? isDark
                            ? "bg-indigo-950/60 border-indigo-700 text-indigo-300"
                            : "bg-indigo-50 border-indigo-300 text-indigo-700"
                          : isDark
                          ? "bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:bg-zinc-700"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview of current Mermaid Code */}
              {previewSvg && (
                <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${isDark ? "text-zinc-400" : "text-gray-500"}`}>
                      Current Diagram Preview
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("mermaid")}
                      className="text-xs text-[#6965db] dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Code2 size={13} /> Edit Mermaid Code
                    </button>
                  </div>
                  <div
                    ref={previewContainerRef}
                    className={`p-4 rounded-xl border flex items-center justify-center overflow-auto max-h-52 ${
                      isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-gray-50/80 border-gray-200"
                    }`}
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="mermaid-code"
                    className={`text-sm font-semibold ${
                      isDark ? "text-zinc-200" : "text-gray-800"
                    }`}
                  >
                    Mermaid Definition
                  </label>
                  <button
                    type="button"
                    onClick={() => updateMermaidPreview(mermaidCode)}
                    className="text-xs text-[#6965db] dark:text-indigo-400 hover:underline flex items-center gap-1"
                    title="Refresh preview"
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
                <textarea
                  id="mermaid-code"
                  value={mermaidCode}
                  onChange={(e) => {
                    setMermaidCode(e.target.value);
                    updateMermaidPreview(e.target.value);
                  }}
                  rows={6}
                  spellCheck={false}
                  className={`w-full p-3 font-mono text-xs rounded-xl border outline-hidden transition focus:ring-2 resize-y ${
                    isDark
                      ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#6965db] focus:ring-[#6965db]/20"
                  }`}
                />
              </div>

              {renderError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                  <AlertCircle size={14} className="shrink-0" />
                  <span className="truncate">{renderError}</span>
                </div>
              )}

              {/* Diagram Preview */}
              <div>
                <span className={`text-xs font-semibold block mb-1.5 ${isDark ? "text-zinc-300" : "text-gray-700"}`}>
                  Diagram Preview
                </span>
                <div
                  ref={previewContainerRef}
                  className={`p-4 rounded-xl border flex items-center justify-center overflow-auto max-h-64 ${
                    isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-gray-50/80 border-gray-200"
                  }`}
                >
                  {previewSvg ? (
                    <div dangerouslySetInnerHTML={{ __html: previewSvg }} />
                  ) : (
                    <div className="text-xs text-gray-400 py-6">Diagram preview will render here</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {insertError && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
              <AlertCircle size={14} className="shrink-0" />
              <span>{insertError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t ${
            isDark ? "border-zinc-800 bg-zinc-900/40" : "border-gray-100 bg-gray-50/40"
          }`}
        >
          {activeTab === "text" ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "#6965db",
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Generating diagram…</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Generate</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab("text")}
              className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                isDark ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              ← Back to prompt
            </button>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                isDark
                  ? "text-zinc-300 hover:bg-zinc-800"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleInsert}
              disabled={isInserting || !mermaidCode.trim() || !!renderError}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-105"
              style={{
                backgroundColor: "#6965db",
              }}
              title="Insert diagram onto Excalidraw canvas"
            >
              {isInserting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Inserting…</span>
                </>
              ) : (
                <>
                  <span>Insert</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
