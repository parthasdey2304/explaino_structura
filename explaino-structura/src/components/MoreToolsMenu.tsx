"use client";

import React, { useEffect, useRef } from "react";
import type { ToolType } from "@/types";

interface MoreToolsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
}

export default function MoreToolsMenu({ isOpen, onClose, activeTool, setActiveTool }: MoreToolsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToolSelect = (tool: ToolType) => {
    setActiveTool(tool);
    onClose();
  };

  return (
    <div 
      ref={menuRef}
      className="more-tools-menu"
      style={{
        position: "absolute",
        top: "calc(100% + 12px)",
        right: 0,
        backgroundColor: "var(--island-bg-color)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "8px 0",
        boxShadow: "var(--shadow-popover)",
        zIndex: 100,
        width: "240px",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h16M4 16h16M8 4v16M16 4v16"/></svg>}
        label="Frame tool"
        shortcut="F"
        onClick={() => handleToolSelect("frame")}
        active={activeTool === "frame"}
      />
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
        label="Web Embed"
        onClick={() => handleToolSelect("embed")}
        active={activeTool === "embed"}
      />
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v-2a4 4 0 0 1 4 -4h2"/><path d="M12 4l2 2l-2 2"/><path d="M20 12v2a4 4 0 0 1 -4 4h-2"/><path d="M12 20l-2 -2l2 -2"/><rect x="6" y="6" width="12" height="12" rx="2"/></svg>}
        label="Draw to shape"
        shortcut="Shift+X"
        onClick={() => handleToolSelect("magic")}
        active={activeTool === "magic"}
      />
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 6l6 6l-9 9h-6v-6l9 -9z"/><path d="M16 8l4 -4"/><path d="M20 8l-4 -4"/></svg>}
        label="Laser pointer"
        shortcut="K"
        onClick={() => handleToolSelect("laser")}
        active={activeTool === "laser"}
      />
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 6l6 6l-8.5 8.5h-6v-6l8.5 -8.5"/><path d="M15.5 9l-2 -2"/><path d="M7 17h2v-2"/></svg>}
        label="Bucket fill"
        shortcut="B"
        onClick={() => handleToolSelect("bucket")}
        active={activeTool === "bucket"}
      />
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.028 13.252c-.657 -.972 -1.028 -2.078 -1.028 -3.252c0 -3.866 4.03 -7 9 -7s9 3.134 9 7s-4.03 7 -9 7c-1.913 0 -3.686 -.464 -5.144 -1.255"/><path d="M5 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17c0 1.42 .316 2.805 1 4"/></svg>}
        label="Lasso selection"
        onClick={() => handleToolSelect("lasso")}
        active={activeTool === "lasso"}
      />

      <div style={{ padding: "8px 16px 4px 16px", fontSize: "11px", fontWeight: 700, color: "var(--color-gray-70)", marginTop: "4px" }}>
        Generate
      </div>
      
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c-2.4 0-4-1.6-4-4s1.6-4 4-4"/><path d="M3 12c2.4 0 4-1.6 4-4s-1.6-4-4-4"/><path d="M12 21c0-2.4-1.6-4-4-4s-4 1.6-4 4"/><path d="M12 3c0 2.4 1.6 4 4 4s4-1.6 4-4"/><rect x="8" y="8" width="8" height="8" rx="2"/></svg>}
        label="Text to diagram"
        onClick={() => handleToolSelect("magic")}
        badge="AI"
      />
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3l-6 6l6 6"/><path d="M4 9h16"/><path d="M14 21l6 -6l-6 -6"/></svg>}
        label="Mermaid to Excalidraw"
        onClick={() => handleToolSelect("magic")}
      />
      <MenuItem 
        icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M21 3L3 21"/></svg>}
        label="Wireframe to code"
        onClick={() => handleToolSelect("magic")}
        badge="AI"
      />
    </div>
  );
}

function MenuItem({ icon, label, shortcut, active, badge, onClick }: { icon: React.ReactNode, label: string, shortcut?: string, active?: boolean, badge?: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: active ? "var(--color-primary-light)" : "transparent",
        color: active ? "var(--color-primary)" : "var(--text-color)",
        border: "none",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontSize: "14px",
      }}
      className="more-tools-item"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {badge && (
          <span style={{
            fontSize: "10px",
            background: "var(--color-primary-light)",
            color: "var(--color-primary)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontWeight: 700
          }}>
            {badge}
          </span>
        )}
        {shortcut && (
          <span style={{ fontSize: "12px", color: "var(--color-gray-50)", fontFamily: "monospace" }}>
            {shortcut}
          </span>
        )}
      </div>
    </button>
  );
}
