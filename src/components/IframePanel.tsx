"use client";

import React, { useState, useRef, useCallback } from "react";
import { X, Monitor, Globe, RotateCcw, Maximize2, ChevronDown } from "lucide-react";

export type IframePanelLayout = "right" | "left" | "top" | "bottom";

interface IframePanelProps {
  onClose: () => void;
  layout: IframePanelLayout;
  onLayoutChange: (layout: IframePanelLayout) => void;
}

const CODE_SERVER_URL = "http://13.49.76.201";

const SIZE_PRESETS = [
  { label: "Small", value: 35 },
  { label: "Medium", value: 50 },
  { label: "Large", value: 65 },
  { label: "XL", value: 80 },
];

const LAYOUT_OPTIONS: { value: IframePanelLayout; label: string }[] = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

export default function IframePanel({ onClose, layout, onLayoutChange }: IframePanelProps) {
  const [url, setUrl] = useState(CODE_SERVER_URL);
  const [inputUrl, setInputUrl] = useState(CODE_SERVER_URL);
  const [sizePercent, setSizePercent] = useState(50);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isVertical = layout === "left" || layout === "right";

  // Panel style based on layout
  const panelStyle: React.CSSProperties = isVertical
    ? {
        position: "fixed",
        top: 0,
        [layout]: 0,
        width: `${sizePercent}%`,
        height: "100vh",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        background: "#1e1e1e",
        borderLeft: layout === "right" ? "2px solid rgba(255,255,255,0.1)" : undefined,
        borderRight: layout === "left" ? "2px solid rgba(255,255,255,0.1)" : undefined,
        boxShadow:
          layout === "right"
            ? "-4px 0 24px rgba(0,0,0,0.35)"
            : "4px 0 24px rgba(0,0,0,0.35)",
      }
    : {
        position: "fixed",
        left: 0,
        [layout]: 0,
        width: "100vw",
        height: `${sizePercent}%`,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        background: "#1e1e1e",
        borderTop: layout === "bottom" ? "2px solid rgba(255,255,255,0.1)" : undefined,
        borderBottom: layout === "top" ? "2px solid rgba(255,255,255,0.1)" : undefined,
        boxShadow:
          layout === "bottom"
            ? "0 -4px 24px rgba(0,0,0,0.35)"
            : "0 4px 24px rgba(0,0,0,0.35)",
      };

  // Compute iframe wrapper style to preserve 16:10 aspect ratio when in vertical split
  const iframeWrapperStyle: React.CSSProperties = isVertical
    ? { flex: 1, overflow: "hidden", position: "relative" }
    : { flex: 1, overflow: "hidden", position: "relative" };

  const handleNavigate = useCallback(() => {
    let nav = inputUrl.trim();
    if (nav && !nav.startsWith("http://") && !nav.startsWith("https://")) {
      nav = "https://" + nav;
    }
    setUrl(nav);
  }, [inputUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleNavigate();
    },
    [handleNavigate]
  );

  const handleReload = useCallback(() => {
    // Reload by re-setting same src
    if (iframeRef.current) {
      // eslint-disable-next-line no-self-assign
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  return (
    <div style={panelStyle}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          background: "#252526",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {/* Layout picker */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setShowLayoutMenu((v) => !v);
              setShowSizeMenu(false);
            }}
            style={toolbarBtnStyle}
            title="Change layout"
          >
            <Monitor size={14} />
            <span style={{ marginLeft: 4, fontSize: 11 }}>
              {LAYOUT_OPTIONS.find((o) => o.value === layout)?.label ?? layout}
            </span>
            <ChevronDown size={12} style={{ marginLeft: 2 }} />
          </button>
          {showLayoutMenu && (
            <DropdownMenu
              items={LAYOUT_OPTIONS.map((o) => ({
                label: o.label,
                active: o.value === layout,
                onClick: () => {
                  onLayoutChange(o.value);
                  setShowLayoutMenu(false);
                },
              }))}
            />
          )}
        </div>

        {/* Size picker */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setShowSizeMenu((v) => !v);
              setShowLayoutMenu(false);
            }}
            style={toolbarBtnStyle}
            title="Change size"
          >
            <Maximize2 size={14} />
            <span style={{ marginLeft: 4, fontSize: 11 }}>{sizePercent}%</span>
            <ChevronDown size={12} style={{ marginLeft: 2 }} />
          </button>
          {showSizeMenu && (
            <DropdownMenu
              items={[
                ...SIZE_PRESETS.map((p) => ({
                  label: `${p.label} (${p.value}%)`,
                  active: sizePercent === p.value,
                  onClick: () => {
                    setSizePercent(p.value);
                    setShowSizeMenu(false);
                  },
                })),
              ]}
            />
          )}
        </div>

        {/* URL bar */}
        <Globe size={14} style={{ color: "#aaa", flexShrink: 0 }} />
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL or leave blank for code-server"
          style={{
            flex: 1,
            height: 26,
            padding: "0 8px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "#e4e4e7",
            fontSize: 12,
            outline: "none",
            fontFamily: "monospace",
            minWidth: 0,
          }}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={handleNavigate}
          style={{ ...toolbarBtnStyle, padding: "0 10px" }}
          title="Navigate"
        >
          Go
        </button>
        <button
          type="button"
          onClick={handleReload}
          style={toolbarBtnStyle}
          title="Reload"
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...toolbarBtnStyle, marginLeft: "auto" }}
          title="Close"
        >
          <X size={15} />
        </button>
      </div>

      {/* Iframe area */}
      <div style={iframeWrapperStyle}>
        {/* 16:10 aspect ratio container when in a side split */}
        {isVertical ? (
          <iframe
            ref={iframeRef}
            src={url}
            title="Iframe Panel"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
            allow="clipboard-read; clipboard-write; fullscreen"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation allow-top-navigation-by-user-activation"
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            title="Iframe Panel"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
            }}
            allow="clipboard-read; clipboard-write; fullscreen"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation allow-top-navigation-by-user-activation"
          />
        )}
      </div>

      {/* 16:10 aspect hint bar (only in side layouts) */}
      {isVertical && (
        <div
          style={{
            textAlign: "center",
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
            padding: "3px 0",
            flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          16 : 10 display
        </div>
      )}
    </div>
  );
}

// ── tiny shared styles ──────────────────────────────────────────────────────

const toolbarBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 26,
  padding: "0 7px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "#d4d4d4",
  cursor: "pointer",
  fontSize: 12,
  gap: 2,
  flexShrink: 0,
  transition: "background 0.15s",
};

function DropdownMenu({
  items,
}: {
  items: { label: string; active: boolean; onClick: () => void }[];
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        zIndex: 200,
        background: "#2d2d2d",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 6,
        minWidth: 140,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          style={{
            display: "block",
            width: "100%",
            padding: "8px 14px",
            background: item.active ? "rgba(100,100,255,0.2)" : "transparent",
            color: item.active ? "#a5b4fc" : "#d4d4d4",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 12,
            fontWeight: item.active ? 600 : 400,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
