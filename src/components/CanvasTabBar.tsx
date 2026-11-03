"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, X, Share2, Check, Lock, Unlock, Copy } from "lucide-react";
import type { CanvasTabItem } from "@/types/canvas";

export interface CanvasTabBarProps {
  tabs: CanvasTabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onNewTab: (name?: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, newName: string) => void;
  onDuplicateTab?: (id: string) => void;
  isReadOnly?: boolean;
  onToggleReadOnly?: () => void;
  shareUrl?: string;
  onCopyShareUrl?: () => void;
  theme?: "light" | "dark";
}

export default function CanvasTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  onRenameTab,
  onDuplicateTab,
  isReadOnly = false,
  onToggleReadOnly,
  shareUrl,
  onCopyShareUrl,
  theme = "dark",
}: CanvasTabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [copiedFeedback, setCopiedFeedback] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isDark = theme === "dark";

  // Focus and select input on inline rename start
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const handleStartRename = (tab: CanvasTabItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  };

  const handleSaveRename = (tabId: string) => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed.length > 0) {
      onRenameTab(tabId, trimmed);
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename(tabId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingTabId(null);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCopyShareUrl) {
      onCopyShareUrl();
      setCopiedFeedback(true);
      setTimeout(() => setCopiedFeedback(false), 2200);
    } else if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedFeedback(true);
        setTimeout(() => setCopiedFeedback(false), 2200);
      } catch (err) {
        console.warn("Failed to copy share link:", err);
      }
    }
  };

  return (
    <div
      data-canvas-tab-bar="true"
      role="tablist"
      aria-label="Whiteboard Canvas Tabs"
      style={{ height: 40 }}
      className={`canvas-tab-bar flex items-center justify-between h-[40px] px-2 select-none border-b transition-colors z-30 shrink-0 ${
        isDark
          ? "!bg-[#121215] !border-[#27272a] !text-zinc-300"
          : "!bg-[#f4f4f5] !border-[#e4e4e7] !text-zinc-700"
      }`}
    >
      {/* Left: Scrollable tab strip + Add tab button */}
      <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1 flex-1 min-w-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingTabId === tab.id;

          return (
            <div
              key={tab.id}
              role="tab"
              data-tab-id={tab.id}
              data-active-tab={isActive ? "true" : "false"}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={(e) => handleStartRename(tab, e)}
              className={`canvas-tab-item group relative flex items-center h-8 px-3 rounded-t-md text-xs cursor-pointer transition-all border-t-2 max-w-[200px] shrink-0 ${
                isActive
                  ? isDark
                    ? "!bg-[#18181b] !border-indigo-500 !text-white shadow-sm font-semibold"
                    : "!bg-white !border-indigo-600 !text-zinc-900 shadow-sm font-semibold"
                  : isDark
                  ? "font-medium border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#18181b]/50"
                  : "font-medium border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-white/60"
              }`}
            >
              {/* Tab Title or Inline Rename Input */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  data-tab-rename-input="true"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveRename(tab.id)}
                  onKeyDown={(e) => handleKeyDown(e, tab.id)}
                  onClick={(e) => e.stopPropagation()}
                  className={`w-28 px-1.5 py-0.5 rounded text-xs outline-none ring-1 ring-indigo-500 ${
                    isDark ? "bg-[#27272a] text-white" : "bg-zinc-100 text-zinc-900"
                  }`}
                />
              ) : (
                <span
                  title={tab.name}
                  className="max-w-[130px] truncate select-none"
                >
                  {tab.name}
                </span>
              )}

              {/* Dirty Indicator */}
              {tab.isDirty && (
                <span className="w-1.5 h-1.5 ml-1.5 rounded-full bg-amber-400 shrink-0" />
              )}

              {/* Read-Only Badge on tab */}
              {tab.isReadOnly && (
                <span
                  title="Read-Only Canvas"
                  className="ml-1.5 px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0"
                >
                  RO
                </span>
              )}

              {/* Close Tab Button */}
              <button
                type="button"
                data-close-tab="true"
                aria-label="Close tab"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={`ml-2 p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity ${
                  isDark ? "hover:bg-zinc-700 text-zinc-400" : "hover:bg-zinc-200 text-zinc-500"
                }`}
              >
                <X size={13} className="lucide-x" />
              </button>
            </div>
          );
        })}

        {/* Add Tab '+' Button */}
        <button
          type="button"
          data-add-tab="true"
          aria-label="New canvas tab"
          title="New canvas tab"
          onClick={() => onNewTab()}
          className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors text-xs font-semibold ${
            isDark
              ? "hover:bg-zinc-800 text-zinc-400 hover:text-white"
              : "hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900"
          }`}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Right: Quick Share & Read-Only Toggle */}
      <div className="flex items-center space-x-2 shrink-0 pl-2">
        {/* Read-Only Mode Indicator/Toggle */}
        {onToggleReadOnly && (
          <button
            type="button"
            onClick={onToggleReadOnly}
            title={isReadOnly ? "Canvas locked in Read-Only mode" : "Click to lock Canvas as Read-Only"}
            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              isReadOnly
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
            }`}
          >
            {isReadOnly ? <Lock size={12} /> : <Unlock size={12} />}
            <span className="hidden sm:inline">{isReadOnly ? "Read-Only" : "Editable"}</span>
          </button>
        )}

        {/* Copy Student Share Link Button */}
        <button
          type="button"
          data-copy-share-link="true"
          onClick={handleCopy}
          title="Copy Student Share Link (No password needed)"
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
            copiedFeedback
              ? "bg-emerald-600 text-white"
              : isDark
              ? "bg-indigo-600/80 hover:bg-indigo-600 text-white"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {copiedFeedback ? (
            <>
              <Check size={12} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Share2 size={12} />
              <span className="hidden sm:inline">Share</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
