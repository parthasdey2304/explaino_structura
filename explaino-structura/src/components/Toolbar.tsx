"use client";

import React, { useEffect } from "react";
import type { ToolType } from "@/types";

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  onMenuClick: () => void;
  onCodeClick: () => void;
  onPanelToggle: () => void;
  showSidebar: boolean;
  isLocked: boolean;
  setIsLocked: React.Dispatch<React.SetStateAction<boolean>>;
}

const tools: { type: ToolType; label: string; shortcut: string; icon: React.ReactNode }[] = [
  {
    type: "pan",
    label: "Hand",
    shortcut: "H",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 11V6a2 2 0 0 0-4 0v1" />
        <path d="M14 10V4a2 2 0 0 0-4 0v2" />
        <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    ),
  },
  {
    type: "selection",
    label: "Selection",
    shortcut: "V",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        <path d="M13 13l6 6" />
      </svg>
    ),
  },
  {
    type: "rectangle",
    label: "Rectangle",
    shortcut: "R",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    type: "diamond",
    label: "Diamond",
    shortcut: "D",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l10 10-10 10L2 12z" />
      </svg>
    ),
  },
  {
    type: "ellipse",
    label: "Ellipse",
    shortcut: "O",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
      </svg>
    ),
  },
  {
    type: "arrow",
    label: "Arrow",
    shortcut: "A",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="12" x2="20" y2="12" />
        <polyline points="14 6 20 12 14 18" />
      </svg>
    ),
  },
  {
    type: "line",
    label: "Line",
    shortcut: "L",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="20" x2="20" y2="4" />
      </svg>
    ),
  },
  {
    type: "freedraw",
    label: "Draw",
    shortcut: "P",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    ),
  },
  {
    type: "text",
    label: "Text",
    shortcut: "T",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  },
  {
    type: "eraser",
    label: "Eraser",
    shortcut: "E",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
        <path d="M22 21H7" />
      </svg>
    ),
  },
];

export default function Toolbar({
  activeTool,
  setActiveTool,
  onMenuClick,
  onCodeClick,
  onPanelToggle,
  showSidebar,
  isLocked,
  setIsLocked,
}: ToolbarProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey) return;
      const key = e.key.toUpperCase();
      if (key === "Q") {
        setIsLocked((prev) => !prev);
        return;
      }
      const tool = tools.find((t) => t.shortcut === key);
      if (tool) setActiveTool(tool.type);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTool, setIsLocked]);

  return (
    <>
      {/* Top-left: hamburger menu */}
      <div className="toolbar-hamburger">
        <button
          onClick={onMenuClick}
          className="tool-icon-btn excalidraw-island"
          title="Main menu"
          id="menu-button"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Top center: tool island */}
      <div className="toolbar-center">
        <div className="excalidraw-island toolbar-island">
          {/* Lock toggle */}
          <button
            onClick={() => setIsLocked(!isLocked)}
            className={`tool-icon-btn${isLocked ? " active" : ""}`}
            title="Keep selected tool active after drawing (Q)"
            id="lock-button"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              {isLocked ? (
                <>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </>
              ) : (
                <>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </>
              )}
            </svg>
          </button>

          <div className="toolbar-separator" />

          {/* Tool buttons */}
          {tools.map((tool) => (
            <button
              key={tool.type}
              onClick={() => setActiveTool(tool.type)}
              className={`tool-icon-btn${activeTool === tool.type ? " active" : ""}`}
              title={`${tool.label} (${tool.shortcut})`}
              id={`tool-${tool.type}`}
            >
              {tool.icon}
              <span className="tool-shortcut-badge">{tool.shortcut}</span>
            </button>
          ))}

          <div className="toolbar-separator" />

          {/* More options */}
          <button className="tool-icon-btn" title="More tools" id="more-tools-button">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="5" r="1.2" fill="currentColor" />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              <circle cx="12" cy="19" r="1.2" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Top right: Code + sidebar toggle */}
      <div className="toolbar-right">
        <button
          onClick={onCodeClick}
          className="excalidraw-button excalidraw-button--primary"
          id="code-button"
        >
          Code
        </button>
        <button
          onClick={onPanelToggle}
          className={`tool-icon-btn excalidraw-island${showSidebar ? " active" : ""}`}
          title="Toggle sidebar"
          id="sidebar-toggle-button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
      </div>
    </>
  );
}