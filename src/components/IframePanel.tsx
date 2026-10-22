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
  Smartphone,
  Monitor,
  RotateCw,
  Lock,
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

export interface AspectRatioOption {
  key: string;
  label: string;
  sublabel: string;
  ratioW: number;
  ratioH: number;
  orientation: "landscape" | "portrait";
  flipKey: string;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  // Landscape Ratios
  {
    key: "16:10",
    label: "16:10",
    sublabel: "Laptop / Default",
    ratioW: 16,
    ratioH: 10,
    orientation: "landscape",
    flipKey: "10:16",
  },
  {
    key: "16:9",
    label: "16:9",
    sublabel: "Widescreen",
    ratioW: 16,
    ratioH: 9,
    orientation: "landscape",
    flipKey: "9:16",
  },
  {
    key: "20:9",
    label: "20:9",
    sublabel: "Ultrawide",
    ratioW: 20,
    ratioH: 9,
    orientation: "landscape",
    flipKey: "9:20",
  },

  // Portrait Ratios
  {
    key: "10:16",
    label: "10:16",
    sublabel: "Tablet Portrait",
    ratioW: 10,
    ratioH: 16,
    orientation: "portrait",
    flipKey: "16:10",
  },
  {
    key: "9:16",
    label: "9:16",
    sublabel: "Mobile Portrait",
    ratioW: 9,
    ratioH: 16,
    orientation: "portrait",
    flipKey: "16:9",
  },
  {
    key: "9:20",
    label: "9:20",
    sublabel: "Tall Mobile (20:9)",
    ratioW: 9,
    ratioH: 20,
    orientation: "portrait",
    flipKey: "20:9",
  },
];

export function getSizePresetsForRatio(ratio: AspectRatioOption): SizePreset[] {
  if (ratio.orientation === "portrait") {
    const baseWidths = [
      { key: "small", label: "Small", w: 340 },
      { key: "medium", label: "Medium", w: 420 },
      { key: "large", label: "Large", w: 500 },
      { key: "xl", label: "XL", w: 580 },
    ];
    return baseWidths.map(({ key, label, w }) => {
      const h = Math.round((w * ratio.ratioH) / ratio.ratioW);
      return {
        label: `${label} (${w}×${h})`,
        value: key,
        width: w,
        height: h,
      };
    });
  }

  // Landscape
  const baseWidths = [
    { key: "small", label: "Small", w: 680 },
    { key: "medium", label: "Medium", w: 920 },
    { key: "large", label: "Large", w: 1120 },
    { key: "xl", label: "XL", w: 1340 },
  ];
  return baseWidths.map(({ key, label, w }) => {
    const h = Math.round((w * ratio.ratioH) / ratio.ratioW);
    return {
      label: `${label} (${w}×${h})`,
      value: key,
      width: w,
      height: h,
    };
  });
}

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

export const CANVAS_SCREEN_STORAGE_KEY = "explaino-canvas-screen-state";

export interface CanvasScreenSavedState {
  isOpen: boolean;
  sceneX?: number;
  sceneY?: number;
  sceneWidth?: number;
  sceneHeight?: number;
  url?: string;
  sizeKey?: string;
  mode?: CanvasScreenMode;
  aspectRatioKey?: string;
}

export function loadSavedScreenState(): CanvasScreenSavedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CANVAS_SCREEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveScreenState(partial: Partial<CanvasScreenSavedState>): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadSavedScreenState();
    const next: CanvasScreenSavedState = {
      isOpen: existing?.isOpen ?? true,
      sceneX: existing?.sceneX ?? 0,
      sceneY: existing?.sceneY ?? 0,
      sceneWidth: existing?.sceneWidth ?? 920,
      sceneHeight: existing?.sceneHeight ?? 575,
      sizeKey: existing?.sizeKey ?? "medium",
      mode: existing?.mode ?? "interact",
      aspectRatioKey: existing?.aspectRatioKey ?? "16:10",
      ...partial,
      // Always guarantee persistent saved URL is locked to code-server
      url: CODE_SERVER_EXTERNAL_URL,
    };
    localStorage.setItem(CANVAS_SCREEN_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export default function IframePanel({ onClose, viewport }: IframePanelProps) {
  const [saved] = useState(() => loadSavedScreenState());
  // The screen must always default to code-server on open and reload
  const initialResolved = resolveBrowserNavigation(CODE_SERVER_EXTERNAL_URL);

  const [iframeSrc, setIframeSrc] = useState(CODE_SERVER_PROXY_PATH);
  const [inputUrl, setInputUrl] = useState(CODE_SERVER_EXTERNAL_URL);
  const [currentDisplayUrl, setCurrentDisplayUrl] = useState(CODE_SERVER_EXTERNAL_URL);
  const [sizeKey, setSizeKey] = useState<string>(saved?.sizeKey || "medium");
  const [mode, setMode] = useState<CanvasScreenMode>(saved?.mode || "interact");
  const [aspectRatioKey, setAspectRatioKey] = useState<string>(saved?.aspectRatioKey || "16:10");
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showBookmarksMenu, setShowBookmarksMenu] = useState(false);
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Scene-space coordinates: anchored inside the canvas so it pans & zooms with drawings
  const [scenePos, setScenePos] = useState<{
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  } | null>(() => {
    if (
      saved &&
      typeof saved.sceneX === "number" &&
      typeof saved.sceneY === "number" &&
      saved.sceneWidth &&
      saved.sceneHeight
    ) {
      return {
        sceneX: saved.sceneX,
        sceneY: saved.sceneY,
        sceneWidth: saved.sceneWidth,
        sceneHeight: saved.sceneHeight,
      };
    }
    return null;
  });

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
  const latestScenePosRef = useRef(scenePos);
  latestScenePosRef.current = scenePos;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Log diagnostic info to help users identify iframe/proxy status
  useEffect(() => {
    console.log(
      "%c[Canvas Screen]%c Initialized — Full script execution, Web Workers, and session cookies active.",
      "color: #6965db; font-weight: bold",
      "color: inherit"
    );
  }, []);

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

  // Initialize scene coordinates centered in the current canvas viewport if not restored
  useEffect(() => {
    if (scenePos === null && viewport) {
      const center = viewportCoordsToSceneCoords(
        { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
        viewport
      );
      const defaultWidth = 920;
      const defaultHeight = (defaultWidth * 10) / 16;
      const initialPos = {
        sceneX: center.x - defaultWidth / 2,
        sceneY: center.y - defaultHeight / 2,
        sceneWidth: defaultWidth,
        sceneHeight: defaultHeight,
      };
      setScenePos(initialPos);
      saveScreenState(initialPos);
    }
  }, [viewport, scenePos]);

  const activeRatio = useMemo(
    () => ASPECT_RATIOS.find((r) => r.key === aspectRatioKey) || ASPECT_RATIOS[0],
    [aspectRatioKey]
  );

  const sizePresets = useMemo(
    () => getSizePresetsForRatio(activeRatio),
    [activeRatio]
  );

  const currentSize = useMemo(
    () => sizePresets.find((s) => s.value === sizeKey) ?? sizePresets[1],
    [sizePresets, sizeKey]
  );

  const handleSelectAspectRatio = useCallback(
    (targetKey: string) => {
      const targetRatio = ASPECT_RATIOS.find((r) => r.key === targetKey);
      if (!targetRatio) return;

      setAspectRatioKey(targetRatio.key);
      setShowAspectMenu(false);

      setScenePos((prev) => {
        if (!prev) return null;

        let nextWidth: number;
        let nextHeight: number;

        if (targetRatio.orientation !== activeRatio.orientation) {
          // Flip between Landscape and Portrait
          if (targetRatio.orientation === "portrait") {
            // Keep height proportional to view, compute narrower portrait width
            const targetH = Math.max(540, Math.min(800, prev.sceneHeight));
            nextHeight = targetH;
            nextWidth = Math.round((targetH * targetRatio.ratioW) / targetRatio.ratioH);
          } else {
            // Keep height proportional to view, compute wider landscape width
            const targetH = Math.max(450, Math.min(650, prev.sceneHeight));
            nextHeight = targetH;
            nextWidth = Math.round((targetH * targetRatio.ratioW) / targetRatio.ratioH);
          }
        } else {
          // Same orientation, maintain width and adjust height
          nextWidth = prev.sceneWidth;
          nextHeight = Math.round((nextWidth * targetRatio.ratioH) / targetRatio.ratioW);
        }

        const next = {
          ...prev,
          sceneWidth: nextWidth,
          sceneHeight: nextHeight,
        };
        latestScenePosRef.current = next;

        saveScreenState({
          aspectRatioKey: targetRatio.key,
          sceneWidth: nextWidth,
          sceneHeight: nextHeight,
        });

        return next;
      });
    },
    [activeRatio]
  );

  const handleFlipOrientation = useCallback(() => {
    handleSelectAspectRatio(activeRatio.flipKey);
  }, [activeRatio, handleSelectAspectRatio]);

  // Close menus on outside click or escape
  useEffect(() => {
    const handleGlobalClick = () => {
      setShowAspectMenu(false);
      setShowSizeMenu(false);
      setShowBookmarksMenu(false);
    };
    if (showAspectMenu || showSizeMenu || showBookmarksMenu) {
      window.addEventListener("click", handleGlobalClick);
      return () => window.removeEventListener("click", handleGlobalClick);
    }
  }, [showAspectMenu, showSizeMenu, showBookmarksMenu]);
  const isCodeServerActive = isCodeServerTarget(currentDisplayUrl);

  const autoLoginCodeServer = useCallback(async () => {
    setIsLoggingIn(true);
    try {
      // 1. Primary server-side authentication proxy (sets SameSite=Lax cookie at path=/)
      const apiReq = fetch("/api/code-server-login", {
        method: "POST",
        credentials: "include",
      }).catch((err) => {
        console.warn("[CodeServer] /api/code-server-login error:", err);
      });

      // 2. Direct upstream proxied authentication as secondary fallback
      const body = new URLSearchParams({
        password: CODE_SERVER_PWD,
        base: ".",
      });
      const proxyReq = fetch("/code-server/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        credentials: "include",
      }).catch((err) => {
        console.warn("[CodeServer] /code-server/login error:", err);
      });

      await Promise.allSettled([apiReq, proxyReq]);
      console.log("[CodeServer] Auto-login credentials submitted.");
      return true;
    } catch (err) {
      console.warn("[CodeServer] Auto-login error:", err);
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  // Proactively auto-login on initial mount before rendering iframe
  useEffect(() => {
    let active = true;
    autoLoginCodeServer().finally(() => {
      if (active) {
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [autoLoginCodeServer]);

  const navigateTo = useCallback((target: string) => {
    setIsLoading(true);
    const resolved = resolveBrowserNavigation(target);
    setIframeSrc(resolved.iframeSrc);
    setInputUrl(resolved.displayUrl);
    setCurrentDisplayUrl(resolved.displayUrl);
    // Keep saved URL locked to code-server so reloads always open code-server
    saveScreenState({ url: CODE_SERVER_EXTERNAL_URL });
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

  const handleReload = useCallback(async () => {
    setIsLoading(true);
    if (isCodeServerActive) {
      await autoLoginCodeServer();
    }
    if (iframeRef.current) {
      // eslint-disable-next-line no-self-assign
      iframeRef.current.src = iframeRef.current.src;
    }
  }, [isCodeServerActive, autoLoginCodeServer]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    try {
      const loc = iframeRef.current?.contentWindow?.location;
      if (loc) {
        // If code-server landed or redirected to a login path inside the iframe
        if (loc.pathname.includes("/login") || loc.pathname === "/login") {
          console.log("[CodeServer] Login page detected in iframe, auto-authenticating...");
          autoLoginCodeServer().then(() => {
            if (iframeRef.current) {
              iframeRef.current.src = CODE_SERVER_PROXY_PATH;
            }
          });
          return;
        }
        // If code-server accidentally landed on the root whiteboard app instead of /code-server/
        if ((loc.pathname === "/" || loc.pathname === "") && isCodeServerActive) {
          setIframeSrc(CODE_SERVER_PROXY_PATH);
          return;
        }
      }

      // Check if code-server presented a password input in the same-origin DOM
      const doc = iframeRef.current?.contentDocument;
      if (doc && doc.querySelector('input[type="password"]')) {
        console.log("[CodeServer] Password field detected in iframe DOM, auto-authenticating...");
        autoLoginCodeServer().then(() => {
          if (iframeRef.current) {
            iframeRef.current.src = CODE_SERVER_PROXY_PATH;
          }
        });
      }
    } catch {}
  }, [isCodeServerActive, autoLoginCodeServer]);

  const handleResetCodeServer = useCallback(async () => {
    setIsLoading(true);
    await autoLoginCodeServer();
    setIframeSrc(CODE_SERVER_PROXY_PATH);
    setInputUrl(CODE_SERVER_EXTERNAL_URL);
    setCurrentDisplayUrl(CODE_SERVER_EXTERNAL_URL);
    saveScreenState({ url: CODE_SERVER_EXTERNAL_URL });
  }, [autoLoginCodeServer]);

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
    const nextPos = {
      sceneX: center.x - width / 2,
      sceneY: center.y - height / 2,
      sceneWidth: width,
      sceneHeight: height,
    };
    setScenePos(nextPos);
    saveScreenState(nextPos);
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
    if (!dragStartRef.current) return;
    const zoom = viewport?.zoom.value ?? 1;

    if (isDragging) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      const next = {
        sceneX: dragStartRef.current.startSceneX + dx,
        sceneY: dragStartRef.current.startSceneY + dy,
        sceneWidth: dragStartRef.current.startWidth,
        sceneHeight: dragStartRef.current.startHeight,
      };
      latestScenePosRef.current = next;
      setScenePos(next);
    } else if (isResizing) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;

      const minWidth = activeRatio.orientation === "portrait" ? 280 : 420;
      const newWidth = Math.max(minWidth, dragStartRef.current.startWidth + dx);
      const newHeight = Math.round((newWidth * activeRatio.ratioH) / activeRatio.ratioW);
      const next = {
        sceneX: dragStartRef.current.startSceneX,
        sceneY: dragStartRef.current.startSceneY,
        sceneWidth: newWidth,
        sceneHeight: newHeight,
      };
      latestScenePosRef.current = next;
      setScenePos(next);
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
      const finalPos = latestScenePosRef.current || scenePos;
      if (finalPos) {
        saveScreenState({
          sceneX: finalPos.sceneX,
          sceneY: finalPos.sceneY,
          sceneWidth: finalPos.sceneWidth,
          sceneHeight: finalPos.sceneHeight,
        });
      }
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

        </div>

        {/* Aspect Ratio Selector & Orientation Toggle */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 3 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAspectMenu((v) => !v);
              setShowSizeMenu(false);
              setShowAspectMenu(false);
              setShowBookmarksMenu(false);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10.5,
              fontWeight: 600,
              color: activeRatio.orientation === "portrait" ? "#c7d2fe" : "#e4e4e7",
              padding: "2px 6px",
              background:
                activeRatio.orientation === "portrait"
                  ? "rgba(129, 140, 248, 0.22)"
                  : "rgba(255,255,255,0.08)",
              border: `1px solid ${
                activeRatio.orientation === "portrait"
                  ? "rgba(129, 140, 248, 0.45)"
                  : "rgba(255,255,255,0.12)"
              }`,
              borderRadius: 4,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title={`Aspect ratio: ${activeRatio.label} (${activeRatio.sublabel}). Click to select 16:10, 10:16, 16:9, 9:16, 20:9, 9:20.`}
            aria-label="Select screen aspect ratio"
          >
            {activeRatio.orientation === "portrait" ? (
              <Smartphone size={11} style={{ color: "#a5b4fc" }} />
            ) : (
              <Monitor size={11} style={{ opacity: 0.85 }} />
            )}
            <span>{activeRatio.key}</span>
            <ChevronDown size={10} style={{ opacity: 0.7 }} />
          </button>

          {/* Quick Flip Orientation Button (Landscape ↔ Portrait) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleFlipOrientation();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              padding: 0,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              color: "#a1a1aa",
              cursor: "pointer",
            }}
            title={`Rotate screen to ${
              activeRatio.orientation === "landscape" ? "Portrait" : "Landscape"
            } (${activeRatio.flipKey})`}
            aria-label="Rotate screen orientation"
          >
            <RotateCw size={11} />
          </button>

          {/* Aspect Ratio Dropdown Menu */}
          {showAspectMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                zIndex: 220,
                background: "#242427",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 8,
                minWidth: 210,
                boxShadow: "0 12px 28px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.2)",
                overflow: "hidden",
                padding: "4px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Landscape section */}
              <div
                style={{
                  padding: "5px 8px 3px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#a1a1aa",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Monitor size={11} />
                <span>Landscape</span>
              </div>
              {ASPECT_RATIOS.filter((r) => r.orientation === "landscape").map((item) => {
                const isActive = item.key === activeRatio.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectAspectRatio(item.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 5,
                      background: isActive ? "rgba(129, 140, 248, 0.22)" : "transparent",
                      color: isActive ? "#c7d2fe" : "#e4e4e7",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontSize: 10, color: "#a1a1aa" }}>{item.sublabel}</span>
                    </div>
                    {isActive && <Check size={12} color="#818cf8" strokeWidth={2.5} />}
                  </button>
                );
              })}

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />

              {/* Portrait section */}
              <div
                style={{
                  padding: "5px 8px 3px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#a1a1aa",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Smartphone size={11} />
                <span>Portrait</span>
              </div>
              {ASPECT_RATIOS.filter((r) => r.orientation === "portrait").map((item) => {
                const isActive = item.key === activeRatio.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectAspectRatio(item.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 5,
                      background: isActive ? "rgba(129, 140, 248, 0.22)" : "transparent",
                      color: isActive ? "#c7d2fe" : "#e4e4e7",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontSize: 10, color: "#a1a1aa" }}>{item.sublabel}</span>
                    </div>
                    {isActive && <Check size={12} color="#818cf8" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
          )}


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
          onClick={() => {
            const nextMode: CanvasScreenMode = mode === "interact" ? "annotate" : "interact";
            setMode(nextMode);
            saveScreenState({ mode: nextMode });
          }}
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
            title={`Change ${activeRatio.key} display size`}
          >
            <Maximize2 size={13} />
            <span style={{ marginLeft: 3, fontSize: 11 }}>{currentSize.label.split(" ")[0]}</span>
            <ChevronDown size={11} style={{ marginLeft: 1 }} />
          </button>
          {showSizeMenu && (
            <DropdownMenu
              items={sizePresets.map((p) => ({
                label: p.label,
                active: sizeKey === p.value,
                onClick: () => {
                  setSizeKey(p.value);
                  setScenePos((prev) => {
                    if (!prev) return null;
                    const next = {
                      ...prev,
                      sceneWidth: p.width,
                      sceneHeight: p.height,
                    };
                    saveScreenState({
                      sizeKey: p.value,
                      sceneWidth: p.width,
                      sceneHeight: p.height,
                    });
                    return next;
                  });
                  setShowSizeMenu(false);
              setShowAspectMenu(false);
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
              setShowAspectMenu(false);
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

        {/* Code Server Auto-Login & Password Helper */}
        {isCodeServerActive && (
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <button
              type="button"
              onClick={async () => {
                setIsLoading(true);
                await autoLoginCodeServer();
                if (iframeRef.current) {
                  iframeRef.current.src = CODE_SERVER_PROXY_PATH;
                }
              }}
              disabled={isLoggingIn}
              style={{
                ...toolbarBtnStyle,
                fontSize: 10.5,
                color: "#c7d2fe",
                background: "rgba(99, 102, 241, 0.2)",
                borderColor: "rgba(129, 140, 248, 0.4)",
                fontWeight: 600,
              }}
              title="Automatically log into Code Server with saved credentials"
            >
              {isLoggingIn ? (
                <Loader2 size={11} className="animate-spin text-indigo-300" />
              ) : (
                <Lock size={11} className="text-indigo-300" />
              )}
              <span style={{ marginLeft: 2 }}>{isLoggingIn ? "Logging In…" : "Auto Login"}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyPassword}
              style={{
                ...toolbarBtnStyle,
                fontSize: 10.5,
                color: copiedPwd ? "#86efac" : "#d4d4d8",
                borderColor: copiedPwd ? "rgba(34, 197, 94, 0.4)" : undefined,
              }}
              title={`Copy code-server password (${CODE_SERVER_PWD})`}
            >
              {copiedPwd ? <Check size={11} /> : <Copy size={11} />}
              <span style={{ marginLeft: 2 }}>{copiedPwd ? "Copied" : "Pwd"}</span>
            </button>
          </div>
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
        {/* Loading Spinner & Authenticating State */}
        {(!authReady || isLoading) && (
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
              gap: 10,
              zIndex: 5,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 42,
                height: 42,
                borderRadius: 12,
                background: "rgba(99, 102, 241, 0.12)",
                border: "1px solid rgba(129, 140, 248, 0.3)",
              }}
            >
              <Code2 size={22} style={{ color: "#a5b4fc" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f4f5", marginBottom: 3 }}>
                {!authReady ? "Authenticating Code Server…" : "Loading Code Server…"}
              </div>
              <div style={{ fontSize: 11, color: "#a1a1aa" }}>
                {!authReady ? "Connecting with environment credentials" : "Initializing VS Code workspace"}
              </div>
            </div>
            <Loader2 size={20} className="animate-spin text-indigo-400" />
          </div>
        )}

        {authReady && (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title={`Canvas Browser (${activeRatio.key})`}
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
          />
        )}

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
          title={`Drag to resize ${activeRatio.key} screen on canvas`}
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
          <span>{activeRatio.key} Canvas Browser ({activeRatio.orientation})</span>
          <span>•</span>
          <span>{isCodeServerActive ? "Code Server Active (Auto-Auth Enabled)" : currentDisplayUrl}</span>
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
