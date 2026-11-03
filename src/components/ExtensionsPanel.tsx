"use client";

import React, { useEffect, useRef, useState } from "react";
import { getStoredModel, setStoredModel, getModelLabel } from "@/lib/ai/mistral";
import GoogleExtensionIcon from "./GoogleExtensionIcon";
import type { CanvasTabItem } from "@/types/canvas";
import {
  Zap,
  Monitor,
  Sparkles,
  Boxes,
  Grid3x3,
  Mic,
  Bot,
  Clock,
  PanelsRightBottom,
  X,
  ChevronRight,
  Globe,
  Share2,
  Copy,
  Check,
  Lock,
  Unlock,
  Plus,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";

export interface ExtensionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "light" | "dark";
  laserActive: boolean;
  onToggleLaser: () => void;
  showScreen?: boolean;
  showWebPreview?: boolean;
  showDataStructures?: boolean;
  showExplaino?: boolean;
  showAiText?: boolean;
  onOpenScreen: () => void;
  onOpenWebPreview?: () => void;
  onOpenDiagram: () => void;
  onOpenDataStructures: () => void;
  onInsertTable: () => void;
  onOpenExplaino: () => void;
  onOpenAiText: () => void;
  showHandyToolbar?: boolean;
  onToggleHandyToolbar?: () => void;
  showStopwatch?: boolean;
  onToggleStopwatch: () => void;
  // Canvas & Tabs Controls
  tabs?: CanvasTabItem[];
  activeTabId?: string;
  onSelectTab?: (id: string) => void;
  onNewTab?: (name?: string) => void;
  onCloseTab?: (id: string) => void;
  onRenameTab?: (id: string, newName: string) => void;
  onDuplicateTab?: (id: string) => void;
  isReadOnly?: boolean;
  onToggleReadOnly?: () => void;
  shareUrl?: string;
  onCopyShareUrl?: () => void;
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
  onOpenScreen,
  onOpenWebPreview,
  onOpenDiagram,
  onOpenDataStructures,
  onInsertTable,
  onOpenExplaino,
  onOpenAiText,
  showHandyToolbar = true,
  onToggleHandyToolbar,
  showStopwatch = false,
  onToggleStopwatch,
  tabs = [],
  activeTabId = "",
  onSelectTab,
  onNewTab,
  onCloseTab,
  onRenameTab,
  onDuplicateTab,
  isReadOnly = false,
  onToggleReadOnly,
  shareUrl = "",
  onCopyShareUrl,
}: ExtensionsPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDark = theme === "dark";
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [showCanvases, setShowCanvases] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [isOpen]);
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
    const nextModel = e.target.value;
    setSelectedModel(nextModel);
    setStoredModel(nextModel);
  };

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingTabId]);

  const handleStartRename = (tab: CanvasTabItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  };

  const handleSaveRename = (tabId: string) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed.length > 0 && onRenameTab) {
      onRenameTab(tabId, trimmed);
    }
    setEditingTabId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename(tabId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingTabId(null);
    }
  };

  const effectiveShareUrl =
    shareUrl ||
    (typeof window !== "undefined" && activeTabId
      ? `${window.location.origin}/share/${activeTabId}`
      : "");

  const handleCopyShare = async () => {
    if (effectiveShareUrl) {
      try {
        await navigator.clipboard.writeText(effectiveShareUrl);
      } catch {
        // Fallback for headless / restricted contexts
        try {
          const textarea = document.createElement("textarea");
          textarea.value = effectiveShareUrl;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        } catch {
          // Ignore fallback errors
        }
      }
    }
    if (onCopyShareUrl) {
      onCopyShareUrl();
    }
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const items: ExtensionItem[] = [
    {
      id: "laser",
      name: "Laser Pointer",
      description: "Draw transient glowing trails that fade away",
      icon: Zap,
      iconBg: isDark ? "bg-rose-500/20" : "bg-rose-500/10",
      iconColor: isDark ? "text-rose-400" : "text-rose-500",
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
      onClick: () => {
        onOpenScreen();
        onClose();
      },
    },
    ...(onOpenWebPreview
      ? [
          {
            id: "web-preview",
            name: "Live Web Preview",
            description: "Localhost browser window running on port 3000",
            icon: Globe,
            iconBg: isDark ? "bg-emerald-500/20" : "bg-emerald-500/10",
            iconColor: isDark ? "text-emerald-400" : "text-emerald-500",
            onClick: () => {
              onOpenWebPreview();
              onClose();
            },
          },
        ]
      : []),
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
      data-extensions-panel="true"
      className={`fixed top-[54px] right-3 bottom-3 z-40 w-[340px] sm:w-[380px] max-w-[calc(100vw-24px)] flex flex-col transition-all duration-200 ease-out shadow-2xl rounded-2xl border select-none overflow-hidden ${
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
      {/* Header */}
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
              Manage your canvas and tools
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
      <div className="flex flex-col flex-1 overflow-y-auto p-3 gap-2.5">
        {/* Canvases & Tabs Section */}
        <div
          className={`p-3 rounded-xl border space-y-3 ${
            isDark ? "bg-zinc-800/40 border-zinc-700/70" : "bg-zinc-50 border-zinc-200"
          }`}
        >
          <button type="button" className="w-full flex items-center gap-2.5 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-500" aria-expanded={showCanvases} aria-controls="extensions-canvases" onClick={() => setShowCanvases((open) => !open)}>
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isDark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600 border border-indigo-100"}`}><PanelsRightBottom size={18} /></span>
            <span className="min-w-0 flex-1"><span className={`block text-xs font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>Canvases &amp; Tabs</span><span className={`block text-[11px] mt-0.5 truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{tabs.find((tab) => tab.id === activeTabId)?.name || "Manage canvases"} · {tabs.length} {tabs.length === 1 ? "canvas" : "canvases"}</span></span>
            <ChevronRight size={16} className={`shrink-0 text-zinc-400 transition-transform ${showCanvases ? "rotate-90" : ""}`} />
          </button>
          {showCanvases && <div id="extensions-canvases" className="space-y-3">

          {/* Canvases List & Active Tab Switcher */}
          <div className="space-y-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              Open Canvases
            </span>
            <div className="space-y-1 max-h-[160px] overflow-y-auto pr-0.5">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const isEditing = editingTabId === tab.id;

                return (
                  <div
                    key={tab.id}
                    data-tab-switch-item="true"
                    data-tab-id={tab.id}
                    data-active-tab={isActive ? "true" : "false"}
                    className={`group relative flex items-center justify-between p-2 rounded-lg cursor-pointer border text-xs transition-all ${
                      isActive
                        ? isDark
                          ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-semibold shadow-xs"
                          : "bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold shadow-xs"
                        : isDark
                        ? "border-zinc-800 hover:bg-zinc-800/60 text-zinc-300"
                        : "border-zinc-200 hover:bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {/* Tab Title or Inline Rename Input */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
                      {isEditing ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          data-tab-rename-input="true"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleSaveRename(tab.id)}
                          onKeyDown={(e) => handleRenameKeyDown(e, tab.id)}
                          onClick={(e) => e.stopPropagation()}
                          className={`w-full px-1.5 py-0.5 rounded text-xs outline-none border focus:ring-1 focus:ring-indigo-500 ${
                            isDark
                              ? "bg-zinc-900 border-indigo-500 text-white"
                              : "bg-white border-indigo-500 text-zinc-900"
                          }`}
                        />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Switch to ${tab.name}`}
                          aria-current={isActive ? "true" : undefined}
                          onClick={() => onSelectTab?.(tab.id)}
                          onDoubleClick={(e) => handleStartRename(tab, e)}
                          title={`${tab.name} (Double-click to rename)`}
                          className="flex-1 min-w-0 truncate text-left font-medium rounded focus-visible:outline-2 focus-visible:outline-indigo-500"
                        >
                          {tab.name}
                        </button>
                      )}
                      {tab.isReadOnly && (
                        <span
                          title="Read-Only Canvas"
                          className={`text-[9px] px-1 py-0.2 rounded font-bold bg-amber-500/20 border border-amber-500/30 shrink-0 ${isDark ? "text-amber-300" : "text-amber-800"}`}
                        >
                          RO
                        </span>
                      )}
                      {isActive && !isEditing && (
                        <span className={`text-[10px] font-bold shrink-0 ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
                          Active
                        </span>
                      )}
                    </div>

                    {/* Tab Actions: Rename, Duplicate, Delete */}
                    {!isEditing && (
                      <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        {onRenameTab && (
                          <button
                            type="button"
                            data-tab-rename-btn="true"
                            title="Rename Canvas"
                            aria-label="Rename Canvas"
                            onClick={(e) => handleStartRename(tab, e)}
                            className={`p-1 rounded transition-colors ${
                              isDark
                                ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                                : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800"
                            }`}
                          >
                            <Pencil size={12} />
                          </button>
                        )}

                        {onDuplicateTab && (
                          <button
                            type="button"
                            data-tab-duplicate-btn="true"
                            title="Duplicate Canvas"
                            aria-label="Duplicate Canvas"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateTab(tab.id);
                            }}
                            className={`p-1 rounded transition-colors ${
                              isDark
                                ? "hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
                                : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800"
                            }`}
                          >
                            <Copy size={12} />
                          </button>
                        )}

                        {onCloseTab && (
                          <button
                            type="button"
                            data-tab-delete-btn="true"
                            title="Delete Canvas"
                            aria-label="Delete Canvas"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseTab(tab.id);
                            }}
                            className={`p-1 rounded transition-colors ${
                              isDark
                                ? "hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400"
                                : "hover:bg-rose-100 text-zinc-500 hover:text-rose-600"
                            }`}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {onNewTab && (
              <button
                type="button"
                data-new-canvas-btn="true"
                onClick={() => onNewTab()}
                className={`w-full flex items-center justify-center gap-1.5 p-1.5 rounded-lg border border-dashed text-xs font-medium transition-colors ${
                  isDark
                    ? "border-zinc-750 text-zinc-400 hover:text-white hover:border-zinc-600 hover:bg-zinc-800/40"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400 hover:bg-zinc-100"
                }`}
              >
                <Plus size={13} />
                <span>New Canvas</span>
              </button>
            )}
          </div>
          {/* Read-Only Mode Toggle Switch */}
          {onToggleReadOnly && (
            <div
              className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                isReadOnly
                  ? isDark
                    ? "bg-amber-950/20 border-amber-800/40"
                    : "bg-amber-50/80 border-amber-200"
                  : isDark
                  ? "bg-zinc-900/50 border-zinc-800/80"
                  : "bg-white border-zinc-200"
              }`}
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  {isReadOnly ? (
                    <Lock size={13} className="text-amber-400 shrink-0" strokeWidth={2.2} />
                  ) : (
                    <Unlock size={13} className="text-zinc-400 shrink-0" strokeWidth={2.2} />
                  )}
                  <span className={`text-xs font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                    Read-Only Mode
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${
                      isReadOnly
                        ? isDark
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-amber-100 text-amber-800 border-amber-300"
                        : isDark
                        ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                        : "bg-zinc-100 text-zinc-600 border-zinc-200"
                    }`}
                  >
                    {isReadOnly ? "Locked" : "Editable"}
                  </span>
                </div>
                <p className={`text-[11px] truncate mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {isReadOnly ? "Canvas locked to prevent modifications" : "Students view live; click to lock canvas"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                data-readonly-toggle="true"
                aria-checked={isReadOnly}
                aria-label="Read-Only Canvas"
                onClick={onToggleReadOnly}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  isReadOnly ? "bg-amber-600" : isDark ? "bg-zinc-700" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
                    isReadOnly ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Student Read-Only Share Link Card */}
          <div
            data-share-link-card="true"
            className={`p-2.5 rounded-lg border space-y-2.5 ${
              isDark ? "bg-zinc-900/90 border-zinc-700/80" : "bg-white border-zinc-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                <Share2 size={13} className="text-indigo-400 shrink-0" />
                <span>Student Read-Only Share</span>
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/20 ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
                Zero Login
              </span>
            </div>
            <p className={`text-[10px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              Students can view live whiteboard drawings without requiring an account, email, or password.
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                data-share-url-input="true"
                value={effectiveShareUrl}
                placeholder="Share link generating…"
                aria-label="Student Share URL"
                onFocus={(e) => e.target.select()}
                className={`flex-1 min-w-0 px-2 py-1 rounded text-[11px] font-mono outline-none border transition-colors select-all ${
                  isDark
                    ? "bg-zinc-950 border-zinc-800 text-zinc-300 focus:border-indigo-500"
                    : "bg-zinc-50 border-zinc-300 text-zinc-700 focus:border-indigo-500"
                }`}
              />
              <button
                type="button"
                data-copy-share-link="true"
                onClick={handleCopyShare}
                title="Copy Student Share Link"
                aria-label="Copy Student Share Link"
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                  copiedShare
                    ? "bg-emerald-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white"
                }`}
              >
                {copiedShare ? (
                  <>
                    <Check size={12} className="text-white" strokeWidth={2.4} />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={2} />
                    <span>Copy Student Share Link</span>
                  </>
                )}
              </button>
            </div>
            {effectiveShareUrl && (
              <div className="flex items-center justify-between pt-0.5">
                <a
                  href={effectiveShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-open-student-view="true"
                  className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
                    isDark
                      ? "text-indigo-400 hover:text-indigo-300 hover:underline"
                      : "text-indigo-600 hover:text-indigo-700 hover:underline"
                  }`}
                  title="Open Student View in New Tab"
                >
                  <span>Open Student View</span>
                  <ExternalLink size={11} strokeWidth={2} />
                </a>
                <span className={`text-[10px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Opens in new tab
                </span>
              </div>
            )}
          </div>

          </div>}
        </div>

        {/* Handy Extension Toolbar Toggle Card */}
        {onToggleHandyToolbar && (
          <div
            className={`p-3 rounded-xl border transition-all ${
              isDark
                ? "bg-zinc-800/40 border-zinc-700/70"
                : "bg-zinc-50 border-zinc-200/90"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isDark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600 border border-indigo-100"
                  }`}
                >
                  <PanelsRightBottom size={18} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      Handy Toolbar
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        showHandyToolbar
                          ? isDark
                            ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800/60"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                          : isDark
                          ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                          : "bg-zinc-200 text-zinc-600 border border-zinc-300"
                      }`}
                    >
                      {showHandyToolbar ? "Visible" : "Hidden"}
                    </span>
                  </div>
                  <p className={`text-[11px] truncate mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Floating quick tools on laptop & phone
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showHandyToolbar}
                aria-label="Toggle Handy Toolbar visibility"
                onClick={onToggleHandyToolbar}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  showHandyToolbar ? "bg-indigo-600" : isDark ? "bg-zinc-700" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    showHandyToolbar ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Tools & AI section */}
        <div className={`px-2 pt-1 pb-1 text-[10px] font-bold tracking-wider uppercase ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
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
