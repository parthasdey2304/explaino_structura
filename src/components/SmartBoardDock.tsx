"use client";

import React, { useState, useEffect } from "react";
import {
  Pen,
  Hand,
  Eraser,
  RotateCcw,
  RotateCw,
  Download,
  ChevronDown,
  ChevronUp,
  Sliders,
} from "lucide-react";

export interface SmartBoardDockProps {
  activeToolType: string;
  onSelectTool: (tool: "pen" | "handDraw" | "pan" | "eraser") => void;
  onUndo: () => void;
  onRedo: () => void;
  theme: "light" | "dark";
  isLowEnd?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function SmartBoardDock({
  activeToolType,
  onSelectTool,
  onUndo,
  onRedo,
  theme,
  isLowEnd = false,
}: SmartBoardDockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  const isDark = theme === "dark";

  // Listen for PWA beforeinstallprompt
  useEffect(() => {
    // Check if already in standalone mode
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstallSuccess(true);
      setTimeout(() => setInstallSuccess(false), 4000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert("To install on this device, tap your browser menu (⋮) and select 'Install app' or 'Add to Home screen'.");
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn("Install prompt error:", err);
    }
  };

  const isPenActive = activeToolType === "freedraw";
  const isPanActive = activeToolType === "hand";
  const isEraserActive = activeToolType === "eraser";

  return (
    <div
      role="toolbar"
      aria-label="Smart Board & Mobile Controls"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 transition-all duration-200 select-none ${
        collapsed ? "translate-y-1" : ""
      }`}
      style={{
        touchAction: "manipulation",
      }}
    >
      <div
        className={`flex items-center gap-1.5 p-1.5 sm:p-2 rounded-2xl shadow-2xl backdrop-blur-md border ${
          isDark
            ? "bg-[#181820]/95 border-zinc-700/70 text-zinc-200 shadow-black/70"
            : "bg-white/95 border-zinc-200 text-zinc-800 shadow-zinc-900/15"
        }`}
        style={{
          boxShadow: isDark
            ? "0 14px 36px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)"
            : "0 14px 36px -4px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Smart Board Badge / Title */}
        <div className="flex items-center gap-1 px-1.5 py-1">
          <div
            className={`w-2 h-2 rounded-full ${
              isLowEnd ? "bg-amber-400" : "bg-emerald-400"
            } animate-pulse`}
            title={isLowEnd ? "Low-RAM Smart Board Mode Active" : "Smart Board Mode Ready"}
          />
          <span className="hidden md:inline text-[11px] font-semibold tracking-wide uppercase opacity-75">
            Board
          </span>
        </div>

        <div className={`w-[1px] h-5 ${isDark ? "bg-zinc-700/60" : "bg-zinc-200"}`} />

        {!collapsed && (
          <>
            {/* 1. Smart Pen Mode */}
            <button
              type="button"
              onClick={() => onSelectTool("pen")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 cursor-pointer min-h-[38px] ${
                isPenActive
                  ? isDark
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40"
                    : "bg-[#6965db] text-white shadow-md shadow-indigo-500/30"
                  : isDark
                  ? "hover:bg-zinc-700/60 text-zinc-300"
                  : "hover:bg-zinc-100 text-zinc-700"
              }`}
              title="Smart Board Pen — fine precision ink for writing and stylus input"
              aria-pressed={isPenActive}
            >
              <Pen size={16} strokeWidth={2.4} />
              <span className="hidden sm:inline">Pen</span>
            </button>

            {/* 2. Hand Draw Mode */}
            <button
              type="button"
              onClick={() => onSelectTool("handDraw")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 cursor-pointer min-h-[38px] ${
                isPenActive
                  ? isDark
                    ? "hover:bg-zinc-700/60 text-zinc-300"
                    : "hover:bg-zinc-100 text-zinc-700"
                  : isDark
                  ? "hover:bg-zinc-700/60 text-zinc-300"
                  : "hover:bg-zinc-100 text-zinc-700"
              }`}
              title="Hand Draw — draw smoothly with your fingers on touchscreen"
            >
              <Sliders size={16} strokeWidth={2.2} />
              <span className="hidden sm:inline">Finger Draw</span>
            </button>

            {/* 3. Hand Pan / Palm Rejection */}
            <button
              type="button"
              onClick={() => onSelectTool("pan")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 cursor-pointer min-h-[38px] ${
                isPanActive
                  ? isDark
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40"
                    : "bg-[#6965db] text-white shadow-md shadow-indigo-500/30"
                  : isDark
                  ? "hover:bg-zinc-700/60 text-zinc-300"
                  : "hover:bg-zinc-100 text-zinc-700"
              }`}
              title="Hand Pan — scroll and navigate without drawing accidental marks"
              aria-pressed={isPanActive}
            >
              <Hand size={16} strokeWidth={2.2} />
              <span className="hidden sm:inline">Pan</span>
            </button>

            {/* 4. Eraser */}
            <button
              type="button"
              onClick={() => onSelectTool("eraser")}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 cursor-pointer min-h-[38px] ${
                isEraserActive
                  ? isDark
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/40"
                    : "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                  : isDark
                  ? "hover:bg-zinc-700/60 text-zinc-300"
                  : "hover:bg-zinc-100 text-zinc-700"
              }`}
              title="Eraser — wipe away ink strokes or whiteboard objects"
              aria-pressed={isEraserActive}
            >
              <Eraser size={16} strokeWidth={2.2} />
              <span className="hidden sm:inline">Eraser</span>
            </button>

            <div className={`w-[1px] h-5 ${isDark ? "bg-zinc-700/60" : "bg-zinc-200"}`} />

            {/* Undo */}
            <button
              type="button"
              onClick={onUndo}
              className={`p-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer min-w-[36px] min-h-[38px] flex items-center justify-center ${
                isDark ? "hover:bg-zinc-700/60 text-zinc-300" : "hover:bg-zinc-100 text-zinc-700"
              }`}
              title="Undo last action"
              aria-label="Undo"
            >
              <RotateCcw size={16} strokeWidth={2.2} />
            </button>

            {/* Redo */}
            <button
              type="button"
              onClick={onRedo}
              className={`p-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer min-w-[36px] min-h-[38px] flex items-center justify-center ${
                isDark ? "hover:bg-zinc-700/60 text-zinc-300" : "hover:bg-zinc-100 text-zinc-700"
              }`}
              title="Redo action"
              aria-label="Redo"
            >
              <RotateCw size={16} strokeWidth={2.2} />
            </button>

            {/* PWA Install Button (Prompt or Standalone Status) */}
            {!isInstalled && (
              <>
                <div className={`w-[1px] h-5 ${isDark ? "bg-zinc-700/60" : "bg-zinc-200"}`} />
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer min-h-[38px] ${
                    isDark
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-700/30 hover:brightness-110"
                      : "bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700"
                  }`}
                  title="Download and install Explaino on this phone or school smart board"
                >
                  <Download size={15} strokeWidth={2.4} />
                  <span>Install App</span>
                </button>
              </>
            )}

            {installSuccess && (
              <span className="text-xs text-emerald-400 font-medium px-2 animate-bounce">
                Installed!
              </span>
            )}
          </>
        )}

        {/* Collapse / Expand Toggle */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={`p-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer min-w-[32px] min-h-[38px] flex items-center justify-center ${
            isDark ? "hover:bg-zinc-700/60 text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"
          }`}
          title={collapsed ? "Expand Smart Board dock" : "Minimize Smart Board dock"}
          aria-label={collapsed ? "Expand Dock" : "Minimize Dock"}
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
    </div>
  );
}
