"use client";

import React, { useEffect, useRef, useState } from "react";
import { getStoredModel, setStoredModel, getModelLabel } from "@/lib/ai/mistral";
import GoogleExtensionIcon from "./GoogleExtensionIcon";
import {
  Zap,
  Monitor,
  Sparkles,
  Boxes,
  Grid3x3,
  Mic,
  Bot,
  Clock,
  X,
  ChevronRight,
} from "lucide-react";

export interface ExtensionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "light" | "dark";
  laserActive: boolean;
  onToggleLaser: () => void;
  showScreen?: boolean;
  showDataStructures?: boolean;
  showExplaino?: boolean;
  showAiText?: boolean;
  onOpenScreen: () => void;
  onOpenDiagram: () => void;
  onOpenDataStructures: () => void;
  onInsertTable: () => void;
  onOpenExplaino: () => void;
  onOpenAiText: () => void;
  showStopwatch?: boolean;
  onToggleStopwatch: () => void;
}

interface ExtensionItem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  badge?: {
    text: string;
    variant?: "active" | "brand" | "neutral";
  };
  onClick: () => void;
}

export default function ExtensionsPanel({
  isOpen,
  onClose,
  theme = "light",
  laserActive,
  onToggleLaser,
  showScreen = false,
  onOpenScreen,
  onOpenDiagram,
  onOpenDataStructures,
  onInsertTable,
  onOpenExplaino,
  onOpenAiText,
  showStopwatch = false,
  onToggleStopwatch,
}: ExtensionsPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDark = theme === "dark";

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window !== "undefined") return getStoredModel();
    return "gemini-3.8-flash";
  });

  useEffect(() => {
    const handleModelChange = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail) {
        setSelectedModel(custom.detail);
      } else {
        setSelectedModel(getStoredModel());
      }
    };
    window.addEventListener("explaino-model-changed", handleModelChange);
    return () => window.removeEventListener("explaino-model-changed", handleModelChange);
  }, []);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    setStoredModel(newModel);
    window.dispatchEvent(new CustomEvent("explaino-model-changed", { detail: newModel }));
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Close on outside pointer click
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // If click landed inside this panel or on the extensions toggle button, don't close here
      if (
        panelRef.current?.contains(target) ||
        target.closest("[data-extensions-toggle='true']")
      ) {
        return;
      }
      onClose();
    };
    // Use capture: true so we intercept before canvas drag starts
    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, [isOpen, onClose]);

  const items: ExtensionItem[] = [
    {
      id: "laser",
      name: "Laser Pointer",
      description: "Draw transient glowing trails that fade away",
      icon: Zap,
      iconBg: isDark ? "bg-red-500/20" : "bg-red-500/10",
      iconColor: isDark ? "text-red-400" : "text-red-500",
      badge: {
        text: laserActive ? "Active" : "Ready",
        variant: laserActive ? "active" : "neutral",
      },
      onClick: () => {
        onToggleLaser();
        onClose();
      },
    },
    {
      id: "screen",
      name: "Screen (VS Code Server)",
      description: "Show embedded VS Code server in canvas center",
      icon: Monitor,
      iconBg: isDark ? "bg-blue-500/20" : "bg-blue-500/10",
      iconColor: isDark ? "text-blue-400" : "text-blue-500",
      badge: showScreen
        ? {
            text: "Active",
            variant: "active",
          }
        : undefined,
      onClick: () => {
        onOpenScreen();
        onClose();
      },
    },
    {
      id: "diagram",
      name: "Text to Diagram",
      description: "Generate diagrams from AI prompt or Mermaid code",
      icon: Sparkles,
      iconBg: isDark ? "bg-purple-500/20" : "bg-purple-500/10",
      iconColor: isDark ? "text-purple-400" : "text-purple-500",
      onClick: () => {
        onOpenDiagram();
        onClose();
      },
    },
    {
      id: "data-structures",
      name: "Data Structures",
      description: "Insert arrays, trees, graphs, linked lists, & stacks",
      icon: Boxes,
      iconBg: isDark ? "bg-emerald-500/20" : "bg-emerald-500/10",
      iconColor: isDark ? "text-emerald-400" : "text-emerald-500",
      onClick: () => {
        onOpenDataStructures();
        onClose();
      },
    },
    {
      id: "table",
      name: "Editable Table",
      description: "Insert customizable structured table onto canvas",
      icon: Grid3x3,
      iconBg: isDark ? "bg-cyan-500/20" : "bg-cyan-500/10",
      iconColor: isDark ? "text-cyan-400" : "text-cyan-500",
      onClick: () => {
        onInsertTable();
        onClose();
      },
    },
    {
      id: "explaino",
      name: "Explaino Notes",
      description: "Record audio voice notes linked to canvas snapshot",
      icon: Mic,
      iconBg: isDark ? "bg-rose-500/20" : "bg-rose-500/10",
      iconColor: isDark ? "text-rose-400" : "text-rose-500",
      onClick: () => {
        onOpenExplaino();
        onClose();
      },
    },
    {
      id: "ai-text",
      name: "AI Text",
      description: `Canvas text generation powered by ${getModelLabel(selectedModel)}`,
      icon: Bot,
      iconBg: isDark ? "bg-amber-500/20" : "bg-amber-500/10",
      iconColor: isDark ? "text-amber-400" : "text-amber-500",
      onClick: () => {
        onOpenAiText();
        onClose();
      },
    },
    {
      id: "stopwatch",
      name: "Stopwatch & Timer",
      description: "Interactive canvas stopwatch and countdown session",
      icon: Clock,
      iconBg: isDark ? "bg-orange-500/20" : "bg-orange-500/10",
      iconColor: isDark ? "text-orange-400" : "text-orange-500",
      badge: {
        text: showStopwatch ? "Visible" : "Hidden",
        variant: showStopwatch ? "active" : "neutral",
      },
      onClick: () => {
        onToggleStopwatch();
        onClose();
      },
    },
  ];

  if (!isOpen) return null;

  return (
    <aside
      ref={panelRef}
      className={`fixed top-[54px] right-3 bottom-3 z-40 w-[340px] sm:w-[360px] max-w-[calc(100vw-24px)] flex flex-col transition-all duration-200 ease-out shadow-2xl rounded-2xl border select-none overflow-hidden ${
        isDark
          ? "bg-[#18181b] text-zinc-100 border-zinc-800"
          : "bg-white text-zinc-900 border-zinc-200"
      }`}
      style={{
        fontFamily: "var(--ui-font, 'Assistant', sans-serif)",
      }}
      aria-label="Extensions side panel"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header — mirrors Excalidraw's Library panel header */}
      <div
        className={`flex items-center justify-between px-4 py-3.5 border-b flex-shrink-0 ${
          isDark ? "border-zinc-800 bg-[#1e1e24]" : "border-zinc-200/70 bg-zinc-50/90"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isDark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600 border border-indigo-100"
            }`}
          >
            <GoogleExtensionIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-sm font-semibold tracking-tight ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                Extensions
              </h2>
              <span
                className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                  isDark
                    ? "bg-indigo-950/70 text-indigo-300 border border-indigo-800/60"
                    : "bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                }`}
              >
                {items.length} Tools
              </span>
            </div>
            <p className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              Click an option to launch & close
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`p-1.5 rounded-md transition-colors ${
            isDark
              ? "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800"
          }`}
          title="Close Extensions (Esc)"
          aria-label="Close Extensions"
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      {/* Extension Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        <div className={`px-2 pt-1 pb-1.5 text-[10px] font-bold tracking-wider uppercase ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          Tools & AI
        </div>

        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={`w-full group flex items-center gap-3 p-2.5 rounded-xl text-left transition-all border ${
                isDark
                  ? "border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-800/50 active:bg-zinc-800"
                  : "border-zinc-200/60 hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100"
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${item.iconBg} ${item.iconColor}`}
              >
                <Icon size={18} strokeWidth={2.2} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold truncate transition-colors ${isDark ? "text-zinc-200 group-hover:text-indigo-400" : "text-zinc-800 group-hover:text-indigo-600"}`}>
                    {item.name}
                  </span>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        item.badge.variant === "active"
                          ? isDark
                            ? "bg-emerald-950/70 text-emerald-300 border-emerald-800/60"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                          : item.badge.variant === "brand"
                          ? isDark
                            ? "bg-amber-950/70 text-amber-300 border-amber-800/60"
                            : "bg-amber-50 text-amber-800 border-amber-200/80"
                          : isDark
                          ? "bg-zinc-800 text-zinc-300 border-zinc-700/60"
                          : "bg-zinc-100 text-zinc-600 border-zinc-200/80"
                      }`}
                    >
                      {item.badge.text}
                    </span>
                  )}
                </div>
                <p className={`text-[11px] truncate mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {item.description}
                </p>
              </div>

              <ChevronRight
                size={14}
                className={`flex-shrink-0 group-hover:translate-x-0.5 transition-all ${
                  isDark
                    ? "text-zinc-600 group-hover:text-zinc-400"
                    : "text-zinc-400 group-hover:text-zinc-600"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className={`px-4 py-2 border-t text-[11px] flex items-center justify-between flex-shrink-0 ${
          isDark
            ? "border-zinc-800 bg-[#161619] text-zinc-400"
            : "border-zinc-200/70 bg-zinc-50/90 text-zinc-600"
        }`}
      >
        <span className="font-medium">Explaino Structura</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
              selectedModel === "gemini-3.5-flash"
                ? isDark
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                  : "bg-emerald-600"
                : selectedModel.startsWith("mistral") || selectedModel.includes("codestral") || selectedModel.includes("nemo")
                ? isDark
                  ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                  : "bg-amber-600"
                : isDark
                ? "bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.6)]"
                : "bg-indigo-600"
            }`}
          />
          <select
            value={selectedModel}
            onChange={handleModelChange}
            aria-label="Select AI Model"
            title="Select AI Model"
            className={`text-[10px] font-semibold py-1 px-2 rounded-md outline-none cursor-pointer transition-colors ${
              isDark
                ? "bg-zinc-800/95 text-zinc-200 border border-zinc-700/80 hover:border-zinc-600 focus:border-indigo-500"
                : "bg-white text-zinc-800 border border-zinc-300 hover:border-zinc-400 focus:border-indigo-500 shadow-2xs"
            }`}
          >
            <optgroup label="Google Gemini" className={isDark ? "bg-zinc-900 text-zinc-300 font-semibold" : "bg-zinc-100 text-zinc-700 font-semibold"}>
              <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
            </optgroup>
            <optgroup label="Mistral AI" className={isDark ? "bg-zinc-900 text-zinc-300 font-semibold" : "bg-zinc-100 text-zinc-700 font-semibold"}>
              <option value="mistral-small-latest">Mistral Small</option>
              <option value="codestral-latest">Codestral</option>
              <option value="open-mistral-nemo">Mistral Nemo</option>
            </optgroup>
          </select>
        </div>
      </div>
    </aside>
  );
}
