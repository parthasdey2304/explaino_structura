"use client";

import React, { useEffect, useState } from "react";
import type { ToolType } from "@/types";
import MoreToolsMenu from "./MoreToolsMenu";

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
    label: "Pan",
    shortcut: "H",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 13.5v-8a1.5 1.5 0 0 1 3 0v6.5m0-6.5v-2a1.5 1.5 0 0 1 3 0v8.5m0-6.5a1.5 1.5 0 0 1 3 0v9.5m0-6.5a1.5 1.5 0 0 1 3 0v6.5a6 6 0 0 1-6 6h-2c-2.12 0-4.14-1-5.41-2.73l-4.2-5.74a2 2 0 0 1 2.82-2.82l2.79 2.79" />
      </svg>
    ),
  },
  {
    type: "selection",
    label: "Select",
    shortcut: "1",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 6l4.153 11.793a0.365 .365 0 0 0 .331 .207a0.366 .366 0 0 0 .332 -.207l2.184 -4.793l4.787 -1.994a0.355 .355 0 0 0 .213 -.323a0.355 .355 0 0 0 -.213 -.323l-11.787 -4.36z" />
        <path d="M13.5 13.5l4.5 4.5" />
      </svg>
    ),
  },
  {
    type: "rectangle",
    label: "Rectangle",
    shortcut: "2",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2"></rect>
      </svg>
    ),
  },
  {
    type: "diamond",
    label: "Diamond",
    shortcut: "3",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 20.4l-6.9 -6.9c-.781 -.781 -.781 -2.219 0 -3l6.9 -6.9c.781 -.781 2.219 -.781 3 0l6.9 6.9c.781 .781 .781 2.219 0 3l-6.9 6.9c-.781 .781 -2.219 .781 -3 0z" />
      </svg>
    ),
  },
  {
    type: "ellipse",
    label: "Ellipse",
    shortcut: "4",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"></circle>
      </svg>
    ),
  },
  {
    type: "arrow",
    label: "Arrow",
    shortcut: "5",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <line x1="15" y1="16" x2="19" y2="12" />
        <line x1="15" y1="8" x2="19" y2="12" />
      </svg>
    ),
  },
  {
    type: "line",
    label: "Line",
    shortcut: "6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.167 10h11.666" />
      </svg>
    ),
  },
  {
    type: "freedraw",
    label: "Draw",
    shortcut: "7",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path clipRule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z" />
        <path d="m11.25 5.417 3.333 3.333" />
      </svg>
    ),
  },
  {
    type: "text",
    label: "Text",
    shortcut: "8",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="20" x2="7" y2="20" />
        <line x1="14" y1="20" x2="21" y2="20" />
        <line x1="6.9" y1="15" x2="13.8" y2="15" />
        <line x1="10.2" y1="6.3" x2="16" y2="20" />
        <polyline points="5 20 11 4 13 4 20 20"></polyline>
      </svg>
    ),
  },
  {
    type: "image",
    label: "Image",
    shortcut: "9",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.5 6.667h.01" />
        <path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" />
        <path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166" />
        <path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667" />
      </svg>
    ),
  },
  {
    type: "eraser",
    label: "Eraser",
    shortcut: "0",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
        <path d="M18 13.3l-6.3 -6.3" />
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
  const [showMoreTools, setShowMoreTools] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey) return;
      
      const key = e.key.toUpperCase();
      
      // Handle Shift+X
      if (e.shiftKey && key === "X") {
        setActiveTool("magic");
        return;
      }
      
      if (key === "Q") {
        setIsLocked((prev) => !prev);
        return;
      }
      if (key === "K") {
        setActiveTool("laser");
        return;
      }
      if (key === "B") {
        setActiveTool("bucket");
        return;
      }
      if (key === "F") {
        setActiveTool("frame");
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
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
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
          <div style={{ position: "relative" }}>
            <button 
              className={`tool-icon-btn${showMoreTools || ["laser", "bucket", "frame", "magic", "lasso", "embed"].includes(activeTool) ? " active" : ""}`}
              title="More tools" 
              id="more-tools-button"
              onClick={() => setShowMoreTools(!showMoreTools)}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="5" r="1.2" fill="currentColor" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                <circle cx="12" cy="19" r="1.2" fill="currentColor" />
              </svg>
            </button>
            <MoreToolsMenu 
              isOpen={showMoreTools} 
              onClose={() => setShowMoreTools(false)} 
              activeTool={activeTool} 
              setActiveTool={setActiveTool} 
            />
          </div>
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