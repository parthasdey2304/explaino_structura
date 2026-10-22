"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  X,
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
  Crosshair,
  ArrowLeft,
  ArrowRight,
  Bookmark,
} from "lucide-react";
import {
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
} from "@excalidraw/excalidraw";
import type { Zoom } from "@excalidraw/excalidraw/types";

/**
 * Interactive mode of the canvas screen.
 * - `interact`: Clicks & keystrokes pass to the iframe (typing code in VS Code, browsing).
 * - `annotate`: Mouse events pass through to Excalidraw canvas (drawing notes & shapes over the screen).
 */
export type CanvasScreenMode = "interact" | "annotate";

export type IframePanelLayout = "center" | "left" | "right" | "top" | "bottom";

export interface CanvasViewport {
  zoom: Zoom;
  offsetLeft: number;
  offsetTop: number;
  scrollX: number;
  scrollY: number;
}

export interface IframePanelProps {
  /** Callback fired when the user clicks the close (X) button in the toolbar. */
  onClose: () => void;
  /** Current canvas viewport state (for panning and zooming in sync with Excalidraw). */
  viewport?: CanvasViewport;
  /** Optional layout preset */
  layout?: IframePanelLayout;
  /** Optional layout change callback */
  onLayoutChange?: (layout: IframePanelLayout) => void;
}

const CODE_SERVER_EXTERNAL_URL = "http://13.49.76.201";
const CODE_SERVER_PROXY_PATH = "/code-server/";
const CODE_SERVER_PWD = "14d26b731d1571af7802cfe5";

export interface SizePreset {
  label: string;
  value: string;
  width: number;
  height: number;
}

const SIZE_PRESETS: SizePreset[] = [
  { label: "Small (680×425)", value: "small", width: 680, height: 425 },
  { label: "Medium (920×575)", value: "medium", width: 920, height: 575 },
  { label: "Large (1120×700)", value: "large", width: 1120, height: 700 },
  { label: "XL (1340×838)", value: "xl", width: 1340, height: 837.5 },
];

const BOOKMARKS = [
  { label: "Google", url: "https://www.google.com" },
  { label: "DuckDuckGo", url: "https://duckduckgo.com" },
  { label: "Code Server", url: "http://13.49.76.201" },
  { label: "Wikipedia", url: "https://en.wikipedia.org" },
  { label: "GitHub", url: "https://github.com" },
];

function isCodeServerTarget(u: string): boolean {
  const s = u.trim();
  return (
    !s ||
    s === CODE_SERVER_PROXY_PATH ||
    s === "/code-server" ||
    s === "/code-server/" ||
    s === "/code-server/login" ||
    s === CODE_SERVER_EXTERNAL_URL ||
    s === CODE_SERVER_EXTERNAL_URL + "/" ||
    s.startsWith(CODE_SERVER_EXTERNAL_URL) ||
    s.startsWith("/code-server")
  );
}

function resolveBrowserNavigation(input: string): { iframeSrc: string; displayUrl: string; isCodeServer: boolean } {
  const trimmed = input.trim();
  if (!trimmed || isCodeServerTarget(trimmed)) {
    return {
      iframeSrc: CODE_SERVER_PROXY_PATH,
      displayUrl: CODE_SERVER_EXTERNAL_URL,
      isCodeServer: true,
    };
  }

  let target = trimmed;
  // If it's a search query (no protocol and no dot)
  if (!target.startsWith("http://") && !target.startsWith("https://") && !target.includes(".")) {
    target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
  } else if (!target.startsWith("http://") && !target.startsWith("https://")) {
    target = "https://" + target;
  }

  return {
    iframeSrc: `/api/proxy?url=${encodeURIComponent(target)}`,
    displayUrl: target,
    isCodeServer: false,
  };
}

export default function IframePanel({ onClose, viewport }: IframePanelProps) {
  const [iframeSrc, setIframeSrc] = useState(CODE_SERVER_PROXY_PATH);
  const [inputUrl, setInputUrl] = useState(CODE_SERVER_EXTERNAL_URL);
  const [currentDisplayUrl, setCurrentDisplayUrl] = useState(CODE_SERVER_EXTERNAL_URL);
  const [sizeKey, setSizeKey] = useState<string>("medium");
  const [mode, setMode] = useState<CanvasScreenMode>("interact");
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showBookmarksMenu, setShowBookmarksMenu] = useState(false);
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Scene-space coordinates: anchored inside the canvas so it pans & zooms with drawings
  const [scenePos, setScenePos] = useState<{
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startSceneX: number;
    startSceneY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Listen to navigation events from the proxy-injected script inside iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "canvas-browser:navigate" && typeof e.data.url === "string") {
        setInputUrl(e.data.url);
        setCurrentDisplayUrl(e.data.url);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Initialize scene coordinates centered in the current canvas viewport
  useEffect(() => {
    if (scenePos === null && viewport) {
      const center = viewportCoordsToSceneCoords(
        { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
        viewport
      );
      const defaultWidth = 920;
      const defaultHeight = (defaultWidth * 10) / 16;
      setScenePos({
        sceneX: center.x - defaultWidth / 2,
        sceneY: center.y - defaultHeight / 2,
        sceneWidth: defaultWidth,
        sceneHeight: defaultHeight,
      });
    }
  }, [viewport, scenePos]);

  const currentSize = SIZE_PRESETS.find((s) => s.value === sizeKey) ?? SIZE_PRESETS[1];

  const navigateTo = useCallback((target: string) => {
    setIsLoading(true);
    const resolved = resolveBrowserNavigation(target);
    setIframeSrc(resolved.iframeSrc);
    setInputUrl(resolved.displayUrl);
    setCurrentDisplayUrl(resolved.displayUrl);
  }, []);

  const handleNavigate = useCallback(() => {
    navigateTo(inputUrl);
  }, [inputUrl, navigateTo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleNavigate();
    },
    [handleNavigate]
  );

  const handleBack = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {}
  }, []);

  const handleForward = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {}
  }, []);

  const handleReload = useCallback(() => {
    setIsLoading(true);
    if (iframeRef.current) {
      // eslint-disable-next-line no-self-assign
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    try {
      const pathname = iframeRef.current?.contentWindow?.location?.pathname;
      if (pathname === "/" || pathname === "") {
        setIframeSrc(CODE_SERVER_PROXY_PATH);
      }
    } catch {}
  }, []);

  const handleResetCodeServer = useCallback(() => {
    navigateTo(CODE_SERVER_EXTERNAL_URL);
  }, [navigateTo]);

  const handleCopyPassword = useCallback(() => {
    navigator.clipboard.writeText(CODE_SERVER_PWD);
    setCopiedPwd(true);
    setTimeout(() => setCopiedPwd(false), 2000);
  }, []);

  // Recenter screen in the user's current view on canvas
  const handleRecenter = useCallback(() => {
    if (!viewport) return;
    const center = viewportCoordsToSceneCoords(
      { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
      viewport
    );
    const width = scenePos?.sceneWidth ?? 920;
    const height = scenePos?.sceneHeight ?? (width * 10) / 16;
    setScenePos({
      sceneX: center.x - width / 2,
      sceneY: center.y - height / 2,
      sceneWidth: width,
      sceneHeight: height,
    });
  }, [viewport, scenePos]);

  // Dragging handlers (moving screen across canvas)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, select, a, .screen-resize-handle")) return;
    if (!scenePos) return;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startSceneX: scenePos.sceneX,
      startSceneY: scenePos.sceneY,
      startWidth: scenePos.sceneWidth,
      startHeight: scenePos.sceneHeight,
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scenePos || !dragStartRef.current) return;
    const zoom = viewport?.zoom.value ?? 1;

    if (isDragging) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      setScenePos((prev) =>
        prev
          ? {
              ...prev,
              sceneX: dragStartRef.current!.startSceneX + dx,
              sceneY: dragStartRef.current!.startSceneY + dy,
            }
          : null
      );
    } else if (isResizing) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const newWidth = Math.max(480, dragStartRef.current.startWidth + dx);
      const newHeight = (newWidth * 10) / 16; // Maintain strict 16:10
      setScenePos((prev) =>
        prev
          ? {
              ...prev,
              sceneWidth: newWidth,
              sceneHeight: newHeight,
            }
          : null
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging || isResizing) {
      setIsDragging(false);
      setIsResizing(false);
      dragStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!scenePos) return;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startSceneX: scenePos.sceneX,
      startSceneY: scenePos.sceneY,
      startWidth: scenePos.sceneWidth,
      startHeight: scenePos.sceneHeight,
    };
    setIsResizing(true);
    if (panelRef.current) {
      panelRef.current.setPointerCapture?.(e.pointerId);
    }
  };

  // Convert scene coordinates to screen viewport coordinates
  const viewportCoords = useMemo(() => {
    if (!scenePos || !viewport) {
      return {
        x: window.innerWidth / 2 - 460,
        y: window.innerHeight / 2 - 287.5,
        width: 920,
        height: 575,
      };
    }
    const screenTopLeft = sceneCoordsToViewportCoords(
      { sceneX: scenePos.sceneX, sceneY: scenePos.sceneY },
      viewport
    );
    const zoom = viewport.zoom.value;
    return {
      x: screenTopLeft.x,
      y: screenTopLeft.y,
      width: Math.max(280, scenePos.sceneWidth * zoom),
      height: Math.max(175, scenePos.sceneHeight * zoom),
    };
  }, [scenePos, viewport]);

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    left: `${viewportCoords.x}px`,
    top: `${viewportCoords.y}px`,
    width: `${viewportCoords.width}px`,
    height: `${viewportCoords.height}px`,
    zIndex: 3, // Above canvas drawings, below Excalidraw UI & menus
    display: "flex",
    flexDirection: "column",
    background: "#18181b",
    borderRadius: 14,
    border:
      mode === "annotate"
        ? "2px solid #818cf8"
        : "1px solid rgba(255, 255, 255, 0.18)",
    boxShadow:
      mode === "annotate"
        ? "0 0 0 4px rgba(129, 140, 248, 0.28), 0 25px 65px rgba(0, 0, 0, 0.85)"
        : "0 22px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    userSelect: isDragging || isResizing ? "none" : "auto",
  };

  const isCodeServerActive = isCodeServerTarget(currentDisplayUrl);

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
          gap: 5,
          padding: "6px 10px",
          background: "#202023",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          userSelect: "none",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        title="Drag header to move screen anywhere on the whiteboard canvas"
      >
        {/* Drag handle icon & title */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#a1a1aa", marginRight: 2 }}>
          <GripHorizontal size={14} style={{ opacity: 0.7 }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.02em", color: "#e4e4e7" }}>
            Browser
          </span>
          <span style={{ fontSize: 10, color: "#71717a", padding: "1px 4px", background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
            16:10
          </span>
        </div>

        {/* Browser History Buttons: Back & Forward */}
        <button
          type="button"
          onClick={handleBack}
          style={toolbarBtnStyle}
          title="Back"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          type="button"
          onClick={handleForward}
          style={toolbarBtnStyle}
          title="Forward"
        >
          <ArrowRight size={13} />
        </button>
        <button
          type="button"
          onClick={handleReload}
          style={toolbarBtnStyle}
          title="Reload"
        >
          <RotateCcw size={13} />
        </button>

        {/* Mode Toggle: Code/Browse vs Draw on Canvas */}
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
              ? "Drawing mode active: Pen strokes draw onto canvas over this screen. Click to switch to Browse / Interact mode."
              : "Interact mode active: Clicks & keys go to web page/VS Code. Click to switch to Draw mode to annotate."
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
              <span style={{ marginLeft: 3 }}>Interact & Browse</span>
            </>
          )}
        </button>

        {/* Recenter on Canvas */}
        <button
          type="button"
          onClick={handleRecenter}
          style={toolbarBtnStyle}
          title="Recenter screen in current canvas view"
        >
          <Crosshair size={13} />
          <span style={{ marginLeft: 3, fontSize: 11 }}>Center</span>
        </button>

        {/* Size picker */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setShowSizeMenu((v) => !v);
              setShowBookmarksMenu(false);
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
                  setScenePos((prev) =>
                    prev
                      ? {
                          ...prev,
                          sceneWidth: p.width,
                          sceneHeight: p.height,
                        }
                      : null
                  );
                  setShowSizeMenu(false);
                },
              }))}
            />
          )}
        </div>

        {/* Quick Bookmarks / Search Presets */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setShowBookmarksMenu((v) => !v);
              setShowSizeMenu(false);
            }}
            style={toolbarBtnStyle}
            title="Bookmarks & quick sites"
          >
            <Bookmark size={13} />
            <ChevronDown size={11} style={{ marginLeft: 1 }} />
          </button>
          {showBookmarksMenu && (
            <DropdownMenu
              items={BOOKMARKS.map((b) => ({
                label: b.label,
                active: currentDisplayUrl === b.url,
                onClick: () => {
                  navigateTo(b.url);
                  setShowBookmarksMenu(false);
                },
              }))}
            />
          )}
        </div>

        {/* Omnibox / Search & URL bar */}
        <Globe size={13} style={{ color: "#a1a1aa", flexShrink: 0 }} />
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter website URL or search (e.g. google.com, react, binary tree)"
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
          title="Go / Search"
        >
          Go
        </button>
        <button
          type="button"
          onClick={handleResetCodeServer}
          style={toolbarBtnStyle}
          title="Quick switch to Code Server"
        >
          <Code2 size={13} />
        </button>
        <a
          href={currentDisplayUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...toolbarBtnStyle, textDecoration: "none" }}
          title="Open in external browser tab"
        >
          <ExternalLink size={13} />
        </a>

        {/* Code Server Password Helper (only visible when code-server is active) */}
        {isCodeServerActive && (
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
        )}

        <button
          type="button"
          onClick={onClose}
          style={{ ...toolbarBtnStyle, marginLeft: 2 }}
          title="Close browser"
        >
          <X size={14} />
        </button>
      </div>

      {/* Main Browser / Iframe Container */}
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
            <span style={{ fontSize: 11 }}>Loading page…</span>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="Canvas Browser (16:10)"
          onLoad={handleIframeLoad}
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
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone"
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

        {/* Interactive 16:10 Corner Resize Handle */}
        <div
          onPointerDown={handleResizeStart}
          className="screen-resize-handle"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 18,
            height: 18,
            cursor: "nwse-resize",
            zIndex: 15,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            padding: 3,
          }}
          title="Drag to resize 16:10 screen on canvas"
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRight: "2px solid rgba(255,255,255,0.4)",
              borderBottom: "2px solid rgba(255,255,255,0.4)",
            }}
          />
        </div>
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
          <span>16:10 Canvas Browser</span>
          <span>•</span>
          <span>{isCodeServerActive ? "Code Server Active" : currentDisplayUrl}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>Mode: {mode === "interact" ? "💻 Interact (Click to Code/Browse)" : "✏️ Draw (Click to Browse)"}</span>
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
