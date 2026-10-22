"use client";

import React from "react";
import {
  Zap,
  Monitor,
  Sparkles,
  Boxes,
  Grid3x3,
  Sun,
  Moon,
} from "lucide-react";

export interface RightCanvasToolbarProps {
  laserActive: boolean;
  onToggleLaser: () => void;
  showScreen: boolean;
  onToggleScreen: () => void;
  onOpenDiagram: () => void;
  showDataStructures: boolean;
  onToggleDataStructures: () => void;
  onInsertTable: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

interface ToolItem {
  id: string;
  label: string;
  shortcut?: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  active: boolean;
  onClick: () => void;
  isDividerAfter?: boolean;
}

export default function RightCanvasToolbar({
  laserActive,
  onToggleLaser,
  showScreen,
  onToggleScreen,
  onOpenDiagram,
  showDataStructures,
  onToggleDataStructures,
  onInsertTable,
  theme,
  onToggleTheme,
}: RightCanvasToolbarProps) {
  const isDark = theme === "dark";

  const tools: ToolItem[] = [
    {
      id: "laser",
      label: "Laser Pointer",
      shortcut: "L",
      description: "Draw temporary trails that fade away automatically without altering canvas drawings.",
      icon: Zap,
      active: laserActive,
      onClick: onToggleLaser,
    },
    {
      id: "screen",
      label: "Canvas Screen",
      shortcut: "Browser",
      description: "Interactive 16:10 browser & code-server workspace embedded directly on canvas.",
      icon: Monitor,
      active: showScreen,
      onClick: onToggleScreen,
    },
    {
      id: "diagram",
      label: "Text to Diagram",
      shortcut: "AI",
      description: "Generate editable flowcharts, sequence diagrams, and architecture graphs with AI.",
      icon: Sparkles,
      active: false,
      onClick: onOpenDiagram,
    },
    {
      id: "datastructures",
      label: "Data Structures",
      shortcut: "DS",
      description: "Create interactive visual diagrams for trees, graphs, heaps, and arrays.",
      icon: Boxes,
      active: showDataStructures,
      onClick: onToggleDataStructures,
    },
    {
      id: "table",
      label: "Insert Table",
      shortcut: "Grid",
      description: "Add an editable whiteboard grid table with customizable rows and columns.",
      icon: Grid3x3,
      active: false,
      onClick: onInsertTable,
      isDividerAfter: true,
    },
    {
      id: "theme",
      label: isDark ? "Light Mode" : "Dark Mode",
      shortcut: "Theme",
      description: `Switch canvas to ${isDark ? "light" : "dark"} visual appearance.`,
      icon: isDark ? Sun : Moon,
      active: false,
      onClick: onToggleTheme,
    },
  ];

  return (
    <aside
      aria-label="Canvas Quick Tools"
      className={`fixed right-2 sm:right-3 top-1/2 -translate-y-1/2 z-40 p-1.5 rounded-2xl flex flex-col gap-1.5 shadow-2xl transition-all duration-200 border ${
        isDark
          ? "bg-[#232329]/95 border-zinc-700/60 shadow-black/60"
          : "bg-white/95 border-zinc-200 shadow-zinc-900/15"
      } backdrop-blur-md`}
      style={{
        boxShadow: isDark
          ? "0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)"
          : "0 10px 30px -5px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)",
      }}
    >
      {tools.map((tool) => {
        const Icon = tool.icon;
        const isActive = tool.active;

        return (
          <React.Fragment key={tool.id}>
            <div className="relative group flex items-center justify-center">
              <button
                type="button"
                onClick={tool.onClick}
                aria-label={tool.label}
                aria-pressed={isActive}
                title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}: ${tool.description}`}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer select-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? isDark
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40"
                      : "bg-[#6965db] text-white shadow-md shadow-indigo-500/30"
                    : isDark
                    ? "text-zinc-300 hover:text-white hover:bg-zinc-700/60 active:bg-zinc-700"
                    : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 active:bg-zinc-200"
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2.1} />
              </button>

              {/* Rich Tooltip (Floats to the left of the button) */}
              <div
                role="tooltip"
                className="pointer-events-none absolute right-[calc(100%+10px)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-150 z-50 whitespace-nowrap translate-x-1 group-hover:translate-x-0 group-focus-within:translate-x-0"
              >
                <div
                  className={`flex flex-col gap-1 p-2.5 rounded-xl border shadow-xl ${
                    isDark
                      ? "bg-[#18181c] border-zinc-700 text-zinc-100 shadow-black/80"
                      : "bg-zinc-900 border-zinc-800 text-white shadow-black/40"
                  }`}
                  style={{ minWidth: "160px", maxWidth: "230px" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold tracking-tight">{tool.label}</span>
                    {tool.shortcut && (
                      <kbd
                        className={`px-1.5 py-0.5 text-[10px] font-mono rounded border uppercase ${
                          isDark
                            ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                            : "bg-zinc-800 border-zinc-700 text-zinc-300"
                        }`}
                      >
                        {tool.shortcut}
                      </kbd>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 font-normal leading-snug whitespace-normal">
                    {tool.description}
                  </p>
                </div>

                {/* Triangle pointer */}
                <div
                  className={`absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 rotate-45 border-t border-r ${
                    isDark
                      ? "bg-[#18181c] border-zinc-700"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                />
              </div>
            </div>

            {/* Subtle Divider between groups */}
            {tool.isDividerAfter && (
              <div
                className={`w-5 h-[1px] my-0.5 mx-auto ${
                  isDark ? "bg-zinc-700/60" : "bg-zinc-200"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </aside>
  );
}
