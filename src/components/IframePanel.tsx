"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Monitor,
  Globe,
  RotateCcw,
  Maximize2,
  ChevronDown,
  ExternalLink,
  Code2,
  PenTool,
  GripHorizontal,
  Copy,
  Check,
  Loader2,
} from "lucide-react";

/**
 * Dock placement layout options for the canvas-embedded screen.
 * - `center`: Centered in canvas (matches 16:10 virtual display layout).
 * - `left` / `right`: Aligned to canvas left or right edges.
 * - `top` / `bottom`: Aligned to canvas top or bottom edges.
 */
export type IframePanelLayout = "center" | "left" | "right" | "top" | "bottom";

/**
 * Interactive mode of the canvas screen.
 * - `interact`: Clicks & keystrokes pass to the iframe (typing code in VS Code, browsing).
 * - `annotate`: Mouse events pass through to Excalidraw canvas (drawing notes & shapes over the screen).
 */
export type CanvasScreenMode = "interact" | "annotate";

/**
 * Props passed to the IframePanel component.
 */
export interface IframePanelProps {
  /** Callback fired when the user clicks the close (X) button in the toolbar. */
  onClose: () => void;
  /** Current dock layout placement of the panel. */
  layout: IframePanelLayout;
  /** Callback to change the dock layout (e.g. from center to right). */
  onLayoutChange: (layout: IframePanelLayout) => void;
}

const CODE_SERVER_EXTERNAL_URL = "http://13.49.76.201";
const CODE_SERVER_PROXY_PATH = "/code-server/";
const CODE_SERVER_PWD = "14d26b731d1571af7802cfe5";

export interface SizePreset {
  label: string;
  value: string;
  widthPx: number;
}

const SIZE_PRESETS: SizePreset[] = [
  { label: "Small (680px)", value: "small", widthPx: 680 },
  { label: "Medium (920px)", value: "medium", widthPx: 920 },
  { label: "Large (1120px)", value: "large", widthPx: 1120 },
  { label: "XL (1340px)", value: "xl", widthPx: 1340 },
];

const LAYOUT_OPTIONS: { value: IframePanelLayout; label: string }[] = [
  { value: "center", label: "Center (Canvas)" },
  { value: "left", label: "Left Edge" },
  { value: "right", label: "Right Edge" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

function isCodeServerUrl(u: string): boolean {
  const s = u.trim();
  return (
    !s ||
    s === CODE_SERVER_PROXY_PATH ||
    s === "/code-server" ||
    s === CODE_SERVER_EXTERNAL_URL ||
    s === CODE_SERVER_EXTERNAL_URL + "/" ||
    s.startsWith(CODE_SERVER_EXTERNAL_URL) ||
    s.startsWith("/code-server")
  );
}

export default function IframePanel({ onClose, layout, onLayoutChange }: IframePanelProps) {
  const [url, setUrl] = useState(CODE_SERVER_PROXY_PATH);
  const [inputUrl, setInputUrl] = useState(CODE_SERVER_EXTERNAL_URL);
  const [sizeKey, setSizeKey] = useState<string>("medium");
  const [mode, setMode] = useState<CanvasScreenMode>("interact");
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [isHttpsHost, setIsHttpsHost] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Dragging state
  const [customPos, setCustomPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isHttps = window.location.protocol === "https:";
      setIsHttpsHost(isHttps);
      // On HTTPS, use the proxy path so browsers never block it as Mixed-Content
      if (isHttps) {
        setUrl(CODE_SERVER_PROXY_PATH);
      } else {
        setUrl(CODE_SERVER_EXTERNAL_URL);
      }
    }
  }, []);

  const currentSize = SIZE_PRESETS.find((s) => s.value === sizeKey) ?? SIZE_PRESETS[1];

  const handleNavigate = useCallback(() => {
    setIsLoading(true);
    let nav = inputUrl.trim();
    if (!nav || isCodeServerUrl(nav)) {
      const resolved =
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? CODE_SERVER_PROXY_PATH
          : CODE_SERVER_EXTERNAL_URL;
      setUrl(resolved);
      setInputUrl(CODE_SERVER_EXTERNAL_URL);
      return;
    }
    if (!nav.startsWith("http://") && !nav.startsWith("https://") && !nav.startsWith("/")) {
      nav = "https://" + nav;
    }
    setUrl(nav);
    setInputUrl(nav);
  }, [inputUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleNavigate();
    },
    [handleNavigate]
  );

  const handleReload = useCallback(() => {
    setIsLoading(true);
    if (iframeRef.current) {
      // eslint-disable-next-line no-self-assign
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const handleResetCodeServer = useCallback(() => {
    setIsLoading(true);
    const resolved =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? CODE_SERVER_PROXY_PATH
        : CODE_SERVER_EXTERNAL_URL;
    setUrl(resolved);
    setInputUrl(CODE_SERVER_EXTERNAL_URL);
  }, []);

  const handleCopyPassword = useCallback(() => {
    navigator.clipboard.writeText(CODE_SERVER_PWD);
    setCopiedPwd(true);
    setTimeout(() => setCopiedPwd(false), 2000);
  }, []);

  // Drag handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, select, a")) return;
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: rect.left,
      startY: rect.top,
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;
    const maxX = Math.max(10, window.innerWidth - 120);
    const maxY = Math.max(10, window.innerHeight - 80);
    setCustomPos({
      x: Math.max(10, Math.min(maxX, dragStartRef.current.startX + dx)),
      y: Math.max(10, Math.min(maxY, dragStartRef.current.startY + dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  // Compute position styling
  const getPositionStyle = (): React.CSSProperties => {
    if (customPos) {
      return {
        position: "fixed",
        left: `${customPos.x}px`,
        top: `${customPos.y}px`,
        transform: "none",
      };
    }
    switch (layout) {
      case "left":
        return {
          position: "fixed",
          left: "2.5rem",
          top: "50%",
          transform: "translateY(-50%)",
        };
      case "right":
        return {
          position: "fixed",
          right: "2.5rem",
          top: "50%",
          transform: "translateY(-50%)",
        };
      case "top":
        return {
          position: "fixed",
          left: "50%",
          top: "4.5rem",
          transform: "translateX(-50%)",
        };
      case "bottom":
        return {
          position: "fixed",
          left: "50%",
          bottom: "2.5rem",
          transform: "translateX(-50%)",
        };
      case "center":
      default:
        return {
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        };
    }
  };

  const panelStyle: React.CSSProperties = {
    ...getPositionStyle(),
    width: `min(${currentSize.widthPx}px, 86vw, calc((100vh - 110px) * 16 / 10))`,
    aspectRatio: "16 / 10",
    zIndex: 60,
    display: "flex",
    flexDirection: "column",
    background: "#18181b",
    borderRadius: 14,
    border:
      mode === "annotate"
        ? "2px solid #818cf8"
        : "1px solid rgba(255, 255, 255, 0.16)",
    boxShadow:
      mode === "annotate"
        ? "0 0 0 4px rgba(129, 140, 248, 0.28), 0 25px 65px rgba(0, 0, 0, 0.85)"
        : "0 22px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    userSelect: isDragging ? "none" : "auto",
  };

  const isHttpOnHttps = isHttpsHost && url.startsWith("http://");
  const externalHref = isCodeServerUrl(url) ? CODE_SERVER_EXTERNAL_URL : url;

  return (
    <div ref={panelRef} style={panelStyle}>
      {/* Sleek Top Header / Toolbar & Drag Handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          background: "#202023",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          userSelect: "none",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        title="Drag header to move screen anywhere on canvas"
      >
        {/* Drag handle icon & title */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#a1a1aa", marginRight: 2 }}>
          <GripHorizontal size={14} style={{ opacity: 0.7 }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.02em", color: "#e4e4e7" }}>
            Screen
          </span>
          <span style={{ fontSize: 10, color: "#71717a", padding: "1px 4px", background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
            16:10
          </span>
        </div>

        {/* Mode Toggle: Code / Interact vs Draw on Canvas */}
        <button
          type="button"
          onClick={() => setMode((m) => (m === "interact" ? "annotate" : "interact"))}
          style={{
            ...toolbarBtnStyle,
            background:
              mode === "annotate"
                ? "rgba(129, 140, 248, 0.25)"
                : "rgba(34, 197, 94, 0.16)",
            borderColor:
              mode === "annotate" ? "#818cf8" : "rgba(34, 197, 94, 0.4)",
            color: mode === "annotate" ? "#c7d2fe" : "#86efac",
            fontWeight: 600,
          }}
          title={
            mode === "annotate"
              ? "Drawing mode active: Pen strokes draw onto canvas over this screen. Click to switch to Code / Interact mode."
              : "Interact mode active: Clicks & keys go to VS Code/website. Click to switch to Draw mode to annotate."
          }
        >
          {mode === "annotate" ? (
            <>
              <PenTool size={13} />
              <span style={{ marginLeft: 3 }}>Draw on Canvas</span>
            </>
          ) : (
            <>
              <Code2 size={13} />
              <span style={{ marginLeft: 3 }}>Interact & Code</span>
            </>
          )}
        </button>

        {/* Position picker */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setShowLayoutMenu((v) => !v);
              setShowSizeMenu(false);
            }}
            style={toolbarBtnStyle}
            title="Change screen position on canvas"
          >
            <Monitor size={13} />
            <span style={{ marginLeft: 3, fontSize: 11 }}>
              {customPos ? "Custom" : LAYOUT_OPTIONS.find((o) => o.value === layout)?.label ?? layout}
            </span>
            <ChevronDown size={11} style={{ marginLeft: 1 }} />
          </button>
          {showLayoutMenu && (
            <DropdownMenu
              items={[
                ...LAYOUT_OPTIONS.map((o) => ({
                  label: o.label,
                  active: !customPos && o.value === layout,
                  onClick: () => {
                    setCustomPos(null);
                    onLayoutChange(o.value);
                    setShowLayoutMenu(false);
                  },
                })),
                ...(customPos
                  ? [
                      {
                        label: "Reset to Center",
                        active: false,
                        onClick: () => {
                          setCustomPos(null);
                          onLayoutChange("center");
                          setShowLayoutMenu(false);
                        },
                      },
                    ]
                  : []),
              ]}
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
            title="Change 16:10 display size"
          >
            <Maximize2 size={13} />
            <span style={{ marginLeft: 3, fontSize: 11 }}>{currentSize.label.split(" ")[0]}</span>
            <ChevronDown size={11} style={{ marginLeft: 1 }} />
          </button>
          {showSizeMenu && (
            <DropdownMenu
              items={SIZE_PRESETS.map((p) => ({
                label: p.label,
                active: sizeKey === p.value,
                onClick: () => {
                  setSizeKey(p.value);
                  setShowSizeMenu(false);
                },
              }))}
            />
          )}
        </div>

        {/* URL bar */}
        <Globe size={13} style={{ color: "#a1a1aa", flexShrink: 0 }} />
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter website URL or load code-server"
          style={{
            flex: 1,
            height: 24,
            padding: "0 8px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(0,0,0,0.25)",
            color: "#f4f4f5",
            fontSize: 11,
            outline: "none",
            fontFamily: "monospace",
            minWidth: 0,
          }}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={handleNavigate}
          style={{ ...toolbarBtnStyle, padding: "0 8px", fontSize: 11 }}
          title="Navigate"
        >
          Go
        </button>
        <button
          type="button"
          onClick={handleReload}
          style={toolbarBtnStyle}
          title="Reload screen"
        >
          <RotateCcw size={13} />
        </button>
        <button
          type="button"
          onClick={handleResetCodeServer}
          style={toolbarBtnStyle}
          title="Reset to code-server"
        >
          <Code2 size={13} />
        </button>
        <a
          href={externalHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...toolbarBtnStyle, textDecoration: "none" }}
          title="Open in new tab (direct link)"
        >
          <ExternalLink size={13} />
        </a>
        <button
          type="button"
          onClick={handleCopyPassword}
          style={{
            ...toolbarBtnStyle,
            fontSize: 11,
            color: copiedPwd ? "#86efac" : "#d4d4d8",
            borderColor: copiedPwd ? "rgba(34, 197, 94, 0.4)" : undefined,
          }}
          title={`Copy code-server password (${CODE_SERVER_PWD})`}
        >
          {copiedPwd ? <Check size={12} /> : <Copy size={12} />}
          <span style={{ marginLeft: 2 }}>{copiedPwd ? "Copied" : "Pwd"}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ ...toolbarBtnStyle, marginLeft: 2 }}
          title="Close screen"
        >
          <X size={14} />
        </button>
      </div>

      {/* Mixed Content Notice Banner (only shown if a raw external HTTP URL is explicitly opened on HTTPS) */}
      {isHttpOnHttps && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(234, 88, 12, 0.15)",
            borderBottom: "1px solid rgba(234, 88, 12, 0.3)",
            padding: "3px 10px",
            fontSize: 11,
            color: "#fdba74",
          }}
        >
          <span>
            ⚠️ Browser Mixed-Content: External HTTP sites may be restricted by the browser on HTTPS.
          </span>
          <a
            href={externalHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              color: "#fb923c",
              textDecoration: "underline",
              fontWeight: 500,
              marginLeft: 8,
            }}
          >
            Open in new tab ↗
          </a>
        </div>
      )}

      {/* Main Screen / Iframe Container */}
      <div
        style={{
          flex: 1,
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#18181b",
        }}
      >
        {/* Loading Spinner */}
        {isLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "#18181b",
              color: "#a1a1aa",
              gap: 8,
              zIndex: 5,
            }}
          >
            <Loader2 size={24} className="animate-spin text-indigo-400" />
            <span style={{ fontSize: 11 }}>Connecting to screen…</span>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={url}
          title="Canvas Screen (16:10)"
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
            pointerEvents: mode === "annotate" ? "none" : "auto",
          }}
          allow="clipboard-read; clipboard-write; fullscreen"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-top-navigation allow-top-navigation-by-user-activation"
        />

        {/* Annotate mode badge indicator over iframe */}
        {mode === "annotate" && (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(30, 27, 75, 0.92)",
              color: "#c7d2fe",
              border: "1px solid rgba(129, 140, 248, 0.4)",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <PenTool size={12} />
            <span>Draw Mode Active: Pen strokes draw onto whiteboard canvas over screen</span>
          </div>
        )}
      </div>

      {/* Bottom Status / Aspect Info Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "3px 10px",
          fontSize: 10,
          color: "rgba(255,255,255,0.4)",
          background: "#1c1c1f",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>16 : 10 Virtual Display</span>
          <span>•</span>
          <span>Mode: {mode === "interact" ? "💻 Interact (Click to Code)" : "✏️ Draw (Click to Code)"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>code-server password:</span>
          <code style={{ color: "#a1a1aa", background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 2 }}>
            {CODE_SERVER_PWD}
          </code>
        </div>
      </div>
    </div>
  );
}

// ── Shared mini styles ──────────────────────────────────────────────────────

const toolbarBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 24,
  padding: "0 6px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "#d4d4d4",
  cursor: "pointer",
  fontSize: 11,
  gap: 2,
  flexShrink: 0,
  transition: "all 0.15s ease",
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
        background: "#27272a",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 6,
        minWidth: 140,
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
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
            padding: "7px 12px",
            background: item.active ? "rgba(129, 140, 248, 0.22)" : "transparent",
            color: item.active ? "#c7d2fe" : "#d4d4d4",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 11,
            fontWeight: item.active ? 600 : 400,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
