"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { Zoom } from "@excalidraw/excalidraw/types";
import {
  buildDirectVpsUrl,
  buildExternalTabUrl,
  parsePort,
  normalizePath,
  DEFAULT_PREVIEW_PORT,
  DEFAULT_PREVIEW_PATH,
  checkVpsPortHealth,
} from "@/lib/vpsProxy";
import {
  ExternalLink,
  RefreshCw,
  RotateCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

export const WEB_PREVIEW_STORAGE_KEY = "explaino-web-preview-state";

export const MIN_PREVIEW_WIDTH = 320;
export const MIN_PREVIEW_HEIGHT = 240;
export const MAX_PREVIEW_WIDTH = 3840;
export const MAX_PREVIEW_HEIGHT = 2160;
export const HEADER_HEIGHT = 38;

export {
  DEFAULT_PREVIEW_PORT,
  DEFAULT_PREVIEW_PATH,
  buildExternalTabUrl,
  buildDirectVpsUrl,
} from "@/lib/vpsProxy";

export interface WebPreviewSavedState {
  isOpen: boolean;
  sceneX?: number;
  sceneY?: number;
  sceneWidth?: number;
  sceneHeight?: number;
  port?: number;
  path?: string;
  shouldRecenter?: boolean;
}

export function loadSavedPreviewState(): WebPreviewSavedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WEB_PREVIEW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePreviewState(partial: Partial<WebPreviewSavedState>): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadSavedPreviewState();
    const next: WebPreviewSavedState = {
      isOpen: existing?.isOpen ?? true,
      sceneX: existing?.sceneX ?? 0,
      sceneY: existing?.sceneY ?? 0,
      sceneWidth: existing?.sceneWidth ?? 768,
      sceneHeight: existing?.sceneHeight ?? 600,
      port: existing?.port ?? DEFAULT_PREVIEW_PORT,
      path: existing?.path ?? DEFAULT_PREVIEW_PATH,
      shouldRecenter: existing?.shouldRecenter ?? false,
      ...partial,
    };
    localStorage.setItem(WEB_PREVIEW_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export interface WebPreviewViewport {
  zoom: number | Zoom | { value: number };
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
}

export interface WebPreviewPanelProps {
  zIndex?: number;
  onFocusWindow?: () => void;
  isOpen: boolean;
  onClose: () => void;
  viewport: WebPreviewViewport;
  initialPort?: number; // defaults to 5500
  initialPath?: string; // defaults to "/"
  siblingWindowPos?: {
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  } | null;
  onCanvasScroll?: (deltaX: number, deltaY: number, isZoom: boolean, isShift: boolean) => void;
  isActive?: boolean;
  onActiveChange?: (active: boolean) => void;
  activeToolType?: string;
  recenterTrigger?: number;
  onScenePosChange?: (pos: { sceneX: number; sceneY: number; sceneWidth: number; sceneHeight: number } | null) => void;
  persistState?: boolean;
  windowOffset?: number;
}

export const BREAKPOINT_PRESETS = [
  { id: "mobile", label: "📱 375px", width: 375, category: "Mobile" },
  { id: "tablet", label: "📟 768px", width: 768, category: "Tablet" },
  { id: "desktop", label: "💻 1024px", width: 1024, category: "Desktop" },
] as const;

export function classifyBreakpoint(width: number): "Mobile" | "Tablet" | "Desktop" {
  if (width < 640) return "Mobile";
  if (width < 1024) return "Tablet";
  return "Desktop";
}

function getZoomValue(zoom: unknown): number {
  if (typeof zoom === "number") return zoom > 0 ? zoom : 1;
  if (zoom && typeof zoom === "object" && "value" in zoom && typeof (zoom as { value: number }).value === "number") {
    const val = (zoom as { value: number }).value;
    return val > 0 ? val : 1;
  }
  return 1;
}

export default function WebPreviewPanel({
  isOpen,
  onClose,
  zIndex = 40,
  onFocusWindow,
  viewport,
  initialPort = DEFAULT_PREVIEW_PORT,
  initialPath = DEFAULT_PREVIEW_PATH,
  siblingWindowPos,
  onCanvasScroll,
  isActive: controlledIsActive,
  onActiveChange,
  activeToolType,
  recenterTrigger,
  onScenePosChange,
  persistState = true,
  windowOffset = 0,
}: WebPreviewPanelProps) {
  // 1. Initial State Loading from LocalStorage
  const [saved] = useState(() => persistState ? loadSavedPreviewState() : null);
  const saveWindowState = useCallback((state: Partial<WebPreviewSavedState>) => {
    if (persistState) savePreviewState(state);
  }, [persistState]);

  const [port, setPort] = useState<number>(() => {
    return saved?.port ? parsePort(saved.port, initialPort) : initialPort;
  });
  const [path, setPath] = useState<string>(() => {
    return saved?.path ? normalizePath(saved.path) : initialPath;
  });
  const [addressInput, setAddressInput] = useState<string>(() => {
    const p = saved?.port ?? initialPort;
    const sub = saved?.path ?? initialPath;
    return `localhost:${p}${sub === "/" ? "" : sub}`;
  });
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(() => [`localhost:${saved?.port ?? initialPort}${(saved?.path ?? initialPath) === "/" ? "" : (saved?.path ?? initialPath)}`]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [iframeKey, setIframeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isServerOffline, setIsServerOffline] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // 2. Active Mode Management
  const [localIsActive, setLocalIsActive] = useState(false);
  const isActive = controlledIsActive !== undefined ? controlledIsActive : localIsActive;

  const setActiveState = useCallback(
    (next: boolean) => {
      setLocalIsActive(next);
      onActiveChange?.(next);
    },
    [onActiveChange]
  );

  // 3. Traffic Lights Hover & Maximize State
  const [isHoveredTraffic, setIsHoveredTraffic] = useState(false);
  const [hoveredTrafficButton, setHoveredTrafficButton] = useState<"close" | "recenter" | "maximize" | null>(null);
  const [preMaximizePos, setPreMaximizePos] = useState<{
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  } | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // 4. Scene Coordinate State (Persistent virtual canvas position)
  const [scenePos, setScenePos] = useState<{
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  }>(() => {
    if (
      saved &&
      typeof saved.sceneX === "number" &&
      typeof saved.sceneY === "number" &&
      saved.sceneWidth &&
      saved.sceneHeight &&
      !saved.shouldRecenter
    ) {
      return {
        sceneX: saved.sceneX,
        sceneY: saved.sceneY,
        sceneWidth: saved.sceneWidth,
        sceneHeight: saved.sceneHeight,
      };
    }

    // Side-by-side positioning alongside sibling window without displacement
    if (siblingWindowPos) {
      return {
        sceneX: siblingWindowPos.sceneX + siblingWindowPos.sceneWidth + 40 + windowOffset * 40,
        sceneY: siblingWindowPos.sceneY + windowOffset * 40,
        sceneWidth: 768,
        sceneHeight: 600,
      };
    }

    // Default centered placement
    const zoom = getZoomValue(viewport?.zoom);
    const winW = typeof window !== "undefined" ? window.innerWidth : 1280;
    const winH = typeof window !== "undefined" ? window.innerHeight : 800;
    const defaultW = 768;
    const defaultH = 600;
    const scrollX = viewport?.scrollX ?? 0;
    const scrollY = viewport?.scrollY ?? 0;
    const offsetLeft = viewport?.offsetLeft ?? 0;
    const offsetTop = viewport?.offsetTop ?? 0;

    const initialSceneX = (winW / 2 - offsetLeft) / zoom - scrollX - defaultW / 2;
    const initialSceneY = (winH / 2 - offsetTop) / zoom - scrollY - defaultH / 2;

    return {
      sceneX: Math.round(initialSceneX + windowOffset * 40),
      sceneY: Math.round(initialSceneY + windowOffset * 40),
      sceneWidth: defaultW,
      sceneHeight: defaultH,
    };
  });

  const latestScenePosRef = useRef(scenePos);

  // Sync scene pos with parent and update ref in effect
  useEffect(() => {
    latestScenePosRef.current = scenePos;
    onScenePosChange?.(scenePos);
  }, [scenePos, onScenePosChange]);

  // Adjust state during render when recenterTrigger changes
  const [prevRecenterTrigger, setPrevRecenterTrigger] = useState(recenterTrigger);
  if (recenterTrigger !== undefined && recenterTrigger !== prevRecenterTrigger) {
    setPrevRecenterTrigger(recenterTrigger);
    if (siblingWindowPos) {
      setScenePos((prev) => ({
        ...prev,
        sceneX: siblingWindowPos.sceneX + siblingWindowPos.sceneWidth + 40,
        sceneY: siblingWindowPos.sceneY,
      }));
    } else {
      const zoom = getZoomValue(viewport?.zoom);
      const winW = typeof window !== "undefined" ? window.innerWidth : 1280;
      const winH = typeof window !== "undefined" ? window.innerHeight : 800;
      const scrollX = viewport?.scrollX ?? 0;
      const scrollY = viewport?.scrollY ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;

      setScenePos((prev) => ({
        ...prev,
        sceneX: Math.round((winW / 2 - offsetLeft) / zoom - scrollX - prev.sceneWidth / 2),
        sceneY: Math.round((winH / 2 - offsetTop) / zoom - scrollY - prev.sceneHeight / 2),
      }));
    }
  }

  // Adjust active state during render when a drawing tool is selected
  const [prevActiveToolType, setPrevActiveToolType] = useState(activeToolType);
  if (activeToolType !== prevActiveToolType) {
    setPrevActiveToolType(activeToolType);
    if (activeToolType && activeToolType !== "selection" && activeToolType !== "hand" && localIsActive) {
      setLocalIsActive(false);
    }
  }

  // 5. Drag & Resize Mechanics
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<"e" | "se">("se");

  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startSceneX: number;
    startSceneY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 6. Coordinate Projection: Map Scene Coordinates to Fixed DOM Pixels via sceneCoordsToViewportCoords
  const viewportCoords = useMemo(() => {
    const zoom = getZoomValue(viewport?.zoom);
    const excalidrawViewport = {
      zoom: typeof viewport.zoom === "object" ? (viewport.zoom as Zoom) : ({ value: zoom } as unknown as Zoom),
      scrollX: viewport.scrollX || 0,
      scrollY: viewport.scrollY || 0,
      offsetLeft: viewport.offsetLeft || 0,
      offsetTop: viewport.offsetTop || 0,
    };

    const screenTopLeft = sceneCoordsToViewportCoords(
      { sceneX: scenePos.sceneX, sceneY: scenePos.sceneY },
      excalidrawViewport
    );

    const screenW = Math.max(MIN_PREVIEW_WIDTH, scenePos.sceneWidth * zoom);
    const screenH = Math.max(MIN_PREVIEW_HEIGHT, scenePos.sceneHeight * zoom);

    return {
      x: screenTopLeft.x,
      y: screenTopLeft.y,
      width: screenW,
      height: screenH,
    };
  }, [scenePos, viewport]);

  // 7. Trackpad Wheel & Swipe Forwarding to Canvas
  const forwardWheelToCanvas = useCallback(
    (e: React.WheelEvent | WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const excalidrawCanvas =
        document.querySelector<HTMLCanvasElement>(".excalidraw canvas.interactive-canvas") ||
        document.querySelector<HTMLCanvasElement>(".excalidraw canvas");

      if (excalidrawCanvas) {
        try {
          const syntheticEvent = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            composed: true,
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ,
            deltaMode: e.deltaMode,
            clientX: e.clientX,
            clientY: e.clientY,
            screenX: e.screenX,
            screenY: e.screenY,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
          });
          excalidrawCanvas.dispatchEvent(syntheticEvent);
          return;
        } catch {}
      }

      // Direct callback fallback
      onCanvasScroll?.(e.deltaX, e.deltaY, e.ctrlKey || e.metaKey, e.shiftKey);
    },
    [onCanvasScroll]
  );

  // Prevent macOS trackpad horizontal swipe history navigation over preview window
  useEffect(() => {
    const preventHistoryNav = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target && panelRef.current?.contains(target)
      ) {
        e.preventDefault();
        e.stopPropagation();
        forwardWheelToCanvas(e);
      }
    };

    window.addEventListener("wheel", preventHistoryNav, { passive: false });
    return () => window.removeEventListener("wheel", preventHistoryNav);
  }, [forwardWheelToCanvas]);

  // Activate window: gives focus to embedded web application
  const handleActivateWindow = useCallback(
    (e?: React.PointerEvent | React.MouseEvent) => {
      e?.stopPropagation();
      setActiveState(true);
      setTimeout(() => {
        iframeRef.current?.focus();
        try {
          iframeRef.current?.contentWindow?.focus();
        } catch {}
      }, 20);
    },
    [setActiveState]
  );

  // Deactivate window: restores focus to whiteboard canvas
  const handleDeactivateWindow = useCallback(
    (e?: React.PointerEvent | React.MouseEvent) => {
      e?.stopPropagation();
      setActiveState(false);
      const container = document.querySelector<HTMLElement>(".excalidraw");
      container?.focus();
    },
    [setActiveState]
  );

  // Escape key deactivates interactive mode and returns to canvas
  useEffect(() => {
    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isActive) {
        e.stopPropagation();
        handleDeactivateWindow();
      }
    };

    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => window.removeEventListener("keydown", handleKeyDownCapture, true);
  }, [isActive, handleDeactivateWindow]);

  // Click outside deactivates interactive mode
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!isActive) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleDeactivateWindow();
      }
    };

    window.addEventListener("pointerdown", handleClickOutside, true);
    return () => window.removeEventListener("pointerdown", handleClickOutside, true);
  }, [isActive, handleDeactivateWindow]);

  // 8. Header Drag Handlers
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, a, .no-drag")) return;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startSceneX: scenePos.sceneX,
      startSceneY: scenePos.sceneY,
      startWidth: scenePos.sceneWidth,
      startHeight: scenePos.sceneHeight,
    };
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  // 9. Resize Start Handlers
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>, direction: "e" | "se") => {
    e.stopPropagation();
    e.preventDefault();
    setResizeDirection(direction);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startSceneX: scenePos.sceneX,
      startSceneY: scenePos.sceneY,
      startWidth: scenePos.sceneWidth,
      startHeight: scenePos.sceneHeight,
    };
    setIsResizing(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  // 10. Pointer Move Handler (Dragging & Resizing with Zoom Delta Scaling)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const zoom = getZoomValue(viewport?.zoom);

    if (isDragging) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      const next = {
        sceneX: Math.round(dragStartRef.current.startSceneX + dx),
        sceneY: Math.round(dragStartRef.current.startSceneY + dy),
        sceneWidth: dragStartRef.current.startWidth,
        sceneHeight: dragStartRef.current.startHeight,
      };
      latestScenePosRef.current = next;
      setScenePos(next);
    } else if (isResizing) {
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;

      let newWidth = dragStartRef.current.startWidth;
      let newHeight = dragStartRef.current.startHeight;

      if (resizeDirection === "e" || resizeDirection === "se") {
        newWidth = Math.max(MIN_PREVIEW_WIDTH, Math.min(MAX_PREVIEW_WIDTH, Math.round(dragStartRef.current.startWidth + dx)));
      }
      if (resizeDirection === "se") {
        newHeight = Math.max(MIN_PREVIEW_HEIGHT, Math.min(MAX_PREVIEW_HEIGHT, Math.round(dragStartRef.current.startHeight + dy)));
      }

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

  // 11. Pointer Up Handler
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging || isResizing) {
      setIsDragging(false);
      setIsResizing(false);
      dragStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}

      const finalPos = latestScenePosRef.current || scenePos;
      saveWindowState({
        sceneX: finalPos.sceneX,
        sceneY: finalPos.sceneY,
        sceneWidth: finalPos.sceneWidth,
        sceneHeight: finalPos.sceneHeight,
        port,
        path,
        shouldRecenter: false,
      });
    }
  };

  // Global safety net for pointer cancellation / blur
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (isDragging || isResizing) {
        setIsDragging(false);
        setIsResizing(false);
        dragStartRef.current = null;
      }
    };

    window.addEventListener("pointerup", handleGlobalRelease);
    window.addEventListener("pointercancel", handleGlobalRelease);
    window.addEventListener("blur", handleGlobalRelease);
    return () => {
      window.removeEventListener("pointerup", handleGlobalRelease);
      window.removeEventListener("pointercancel", handleGlobalRelease);
      window.removeEventListener("blur", handleGlobalRelease);
    };
  }, [isDragging, isResizing]);

  // 12. Traffic Light Action Handlers
  const handleRecenter = useCallback(() => {
    if (siblingWindowPos) {
      const next = {
        sceneX: siblingWindowPos.sceneX + siblingWindowPos.sceneWidth + 40,
        sceneY: siblingWindowPos.sceneY,
        sceneWidth: scenePos.sceneWidth,
        sceneHeight: scenePos.sceneHeight,
      };
      setScenePos(next);
      saveWindowState(next);
    } else {
      const zoom = getZoomValue(viewport?.zoom);
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const scrollX = viewport?.scrollX ?? 0;
      const scrollY = viewport?.scrollY ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;

      const next = {
        sceneX: Math.round((winW / 2 - offsetLeft) / zoom - scrollX - scenePos.sceneWidth / 2),
        sceneY: Math.round((winH / 2 - offsetTop) / zoom - scrollY - scenePos.sceneHeight / 2),
        sceneWidth: scenePos.sceneWidth,
        sceneHeight: scenePos.sceneHeight,
      };
      setScenePos(next);
      saveWindowState(next);
    }
  }, [siblingWindowPos, scenePos, viewport, saveWindowState]);

  const handleToggleMaximize = useCallback(() => {
    if (isMaximized && preMaximizePos) {
      setScenePos(preMaximizePos);
      setIsMaximized(false);
      setPreMaximizePos(null);
      saveWindowState(preMaximizePos);
    } else {
      setPreMaximizePos({ ...scenePos });
      const zoom = getZoomValue(viewport?.zoom);
      const excalidrawViewport = {
        zoom: typeof viewport.zoom === "object" ? (viewport.zoom as Zoom) : ({ value: zoom } as unknown as Zoom),
        scrollX: viewport.scrollX || 0,
        scrollY: viewport.scrollY || 0,
        offsetLeft: viewport.offsetLeft || 0,
        offsetTop: viewport.offsetTop || 0,
      };

      const targetScreenW = Math.max(800, window.innerWidth - 80);
      const targetScreenH = Math.max(540, window.innerHeight - 100);

      const maxSceneW = Math.round(targetScreenW / zoom);
      const maxSceneH = Math.round(targetScreenH / zoom);

      const center = viewportCoordsToSceneCoords(
        { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
        excalidrawViewport
      );

      const next = {
        sceneX: Math.round(center.x - maxSceneW / 2),
        sceneY: Math.round(center.y - maxSceneH / 2),
        sceneWidth: maxSceneW,
        sceneHeight: maxSceneH,
      };
      setScenePos(next);
      setIsMaximized(true);
      saveWindowState(next);
    }
  }, [isMaximized, preMaximizePos, scenePos, viewport, saveWindowState]);

  // 14. Server Health & Reload Probing
  const probeServerHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await checkVpsPortHealth(port, { timeoutMs: 3500 });
      if (res.isOnline) {
        setIsServerOffline(false);
      } else {
        setIsServerOffline(res.isConnectionRefused ?? true);
      }
    } catch {
      setIsServerOffline(true);
    } finally {
      setIsCheckingHealth(false);
    }
  }, [port]);

  const handleReload = useCallback(() => {
    setIsLoading(!externalUrl || !/^https?:\/\/(?:www\.)?(?:google|instagram)\.com(?:[/:?#]|$)/i.test(externalUrl));
    if (!externalUrl) probeServerHealth();
    setIframeKey((prev) => prev + 1);
  }, [probeServerHealth, externalUrl]);

  const handleReloadOrStop = useCallback(() => {
    if (isLoading) {
      setIsLoading(false);
      try {
        iframeRef.current?.contentWindow?.stop();
      } catch {}
    } else {
      handleReload();
    }
  }, [isLoading, handleReload]);

  const navigate = useCallback((input: string, addHistory: boolean) => {
    const clean = input.trim();
    const local = clean.match(/^(?:(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0):|:)?(\d{1,5})([/?#].*)?$/i);
    let display: string;
    if (local || clean.startsWith("/")) {
      const newPort = local ? Number(local[1]) : port;
      if (newPort < 1 || newPort > 65535) { setAddressError("Enter a valid port from 1 to 65535."); return; }
      const newPath = normalizePath(local ? local[2] || "/" : clean);
      display = `localhost:${newPort}${newPath === "/" ? "" : newPath}`;
      setPort(newPort);
      setPath(newPath);
      setExternalUrl(null);
      saveWindowState({ port: newPort, path: newPath });
    } else {
      try {
        const candidate = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(clean) ? clean : `https://${clean}`);
        if (!["http:", "https:"].includes(candidate.protocol) || candidate.username || candidate.password) throw new Error("Invalid address");
        display = candidate.href;
        setExternalUrl(display);
      } catch {
        setAddressError("Enter an http or https website address, or a localhost port.");
        return;
      }
    }
    setAddressError(null);
    setIsServerOffline(false);
    setIsLoading(!/^https?:\/\/(?:www\.)?(?:google|instagram)\.com(?:[/:?#]|$)/i.test(display));
    setAddressInput(display);
    setIframeKey((previous) => previous + 1);
    if (addHistory) {
      const next = [...history.slice(0, historyIndex + 1), display];
      setHistory(next);
      setHistoryIndex(next.length - 1);
    }
  }, [history, historyIndex, port, saveWindowState]);

  const handleAddressSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(addressInput, true);
  };
  const handleGoBack = () => { if (historyIndex > 0) { navigate(history[historyIndex - 1], false); setHistoryIndex(historyIndex - 1); } };
  const handleGoForward = () => { if (historyIndex < history.length - 1) { navigate(history[historyIndex + 1], false); setHistoryIndex(historyIndex + 1); } };

  const handleExternalLaunch = useCallback(() => {
    const url = externalUrl || buildExternalTabUrl(port, path);
    window.open(url, "_blank", "noopener,noreferrer");
  }, [port, path, externalUrl]);

  if (!isOpen) return null;

  const iframeUrl = externalUrl || buildDirectVpsUrl(port, path);
  const blockedHost = externalUrl ? new URL(externalUrl).hostname.toLowerCase() : "";
  const blockedSite = ["google.com", "www.google.com"].includes(blockedHost) ? "Google Search" : ["instagram.com", "www.instagram.com"].includes(blockedHost) ? "Instagram" : null;

  return (
    <>
      {/* Tier 3: Full-Screen Drag Mask Overlay during active resizing/dragging */}
      {(isDragging || isResizing) && (
        <div
          className="web-preview-drag-mask"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            cursor: isDragging ? "grab" : resizeDirection === "e" ? "ew-resize" : "nwse-resize",
            userSelect: "none",
          }}
        />
      )}

      {/* Dedicated macOS Preview Window Container */}
      <div
        ref={panelRef}
        data-testid="web-preview-panel"
        className="web-preview-window"
        onPointerDownCapture={onFocusWindow}
        onFocusCapture={onFocusWindow}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: "fixed",
          left: `${viewportCoords.x}px`,
          top: `${viewportCoords.y}px`,
          width: `${viewportCoords.width}px`,
          height: `${viewportCoords.height}px`,
          background: "#16161a",
          borderRadius: 16,
          border: "1px solid #3b3b41",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          zIndex,
          userSelect: isDragging || isResizing ? "none" : "auto",
          transition: isDragging || isResizing ? "none" : "box-shadow 0.2s ease",
        }}
      >
        {/* macOS Grab Header Bar (38px height) */}
        <div
          onPointerDown={handleHeaderPointerDown}
          style={{
            height: HEADER_HEIGHT,
            background: "#1c1c21",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            gap: 8,
            cursor: isDragging ? "grabbing" : "grab",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          <div className="flex items-center" style={{ gap: isHoveredTraffic ? 6 : 8, transition: "gap .18s ease" }} onMouseEnter={() => setIsHoveredTraffic(true)} onMouseLeave={() => { setIsHoveredTraffic(false); setHoveredTrafficButton(null); }}>
            {([
              { id: "close", label: "Close Web Preview", color: "#ff5f56", glow: "255,95,86", symbol: "×", action: onClose },
              { id: "recenter", label: "Recenter Preview Window", color: "#ffbd2e", glow: "255,189,46", symbol: "−", action: handleRecenter },
              { id: "maximize", label: isMaximized ? "Restore Preview Window" : "Maximize Preview Window", color: "#27c93f", glow: "39,201,63", symbol: isMaximized ? "↙" : "+", action: handleToggleMaximize },
            ] as const).map((button) => (
              <button key={button.id} type="button" className="traffic-light-btn" aria-label={button.label} title={button.label} onClick={button.action} onMouseEnter={() => setHoveredTrafficButton(button.id)} onMouseLeave={() => setHoveredTrafficButton(null)} style={{ width: isHoveredTraffic ? 22 : 12, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: 0, padding: 0, cursor: "pointer", transition: "width .18s ease" }}>
                <span style={{ width: isHoveredTraffic ? (hoveredTrafficButton === button.id ? 18 : 16) : 12, height: isHoveredTraffic ? (hoveredTrafficButton === button.id ? 18 : 16) : 12, borderRadius: "50%", background: button.color, border: "0.5px solid rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,.75)", fontSize: 10, fontWeight: 700, lineHeight: 1, boxShadow: hoveredTrafficButton === button.id ? `0 0 10px rgba(${button.glow}, .75), inset 0 1px 1px rgba(255,255,255,.4)` : "inset 0 1px 1px rgba(255,255,255,.25)", transform: hoveredTrafficButton === button.id ? "scale(1.08)" : "scale(1)", transition: "width .18s ease, height .18s ease, transform .18s ease, box-shadow .18s ease" }}>{isHoveredTraffic && button.symbol}</span>
              </button>
            ))}
            {isHoveredTraffic && <span style={{ whiteSpace: "nowrap", color: "#d4d4d8", fontSize: 10, padding: "2px 8px", border: "1px solid #52525b", borderRadius: 6 }}>{hoveredTrafficButton === "close" ? "Close Window" : hoveredTrafficButton === "recenter" ? "Recenter in Canvas" : hoveredTrafficButton === "maximize" ? (isMaximized ? "Restore Size" : "Maximize Canvas") : "Window Controls"}</span>}
          </div>

          {/* Center: Address Bar & Navigation Controls */}
          <div className="flex items-center gap-1.5 flex-1 justify-center max-w-[620px]">
            {/* Back Navigation Button */}
            <button
              type="button"
              data-testid="preview-back-btn"
              onClick={handleGoBack}
              title="Back"
              aria-label="Back"
              className="no-drag text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-white/5 active:scale-95"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <ChevronLeft size={14} />
            </button>

            {/* Forward Navigation Button */}
            <button
              type="button"
              data-testid="preview-forward-btn"
              onClick={handleGoForward}
              title="Forward"
              aria-label="Forward"
              className="no-drag text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-white/5 active:scale-95"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <ChevronRight size={14} />
            </button>

            {/* Dynamic Reload / Cross (Cancel/Stop) Button */}
            <button
              type="button"
              data-testid="preview-reload-btn"
              onClick={handleReloadOrStop}
              title={isLoading ? "Stop Loading (Cancel)" : "Reload Preview"}
              aria-label={isLoading ? "Stop Loading" : "Reload"}
              className="no-drag text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-white/5 active:scale-95"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              {isLoading ? (
                <X size={14} className="text-red-400 hover:text-red-300" />
              ) : (
                <RotateCw size={13} />
              )}
            </button>

            {/* Address Input (Port & Path) */}
            <form onSubmit={handleAddressSubmit} className="no-drag flex items-center flex-1 max-w-[260px]">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  height: 24,
                  background: "#121216",
                  borderRadius: 6,
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  padding: "0 8px",
                  fontSize: 11,
                  color: "#d4d4d8",
                }}
              >
                <input
                  type="text"
                  data-testid="preview-address-bar"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="localhost:5500 or https://example.com"
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#f4f4f5",
                    width: "100%",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  title="Enter a website URL or localhost port"
                />
              </div>
            </form>

          </div>

          <div className="flex items-center gap-2">
            {/* External Browser Tab Launch Button */}
            <button
              type="button"
              data-testid="external-launch-btn"
              onClick={handleExternalLaunch}
              title="Open in new tab"
              className="no-drag text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* Window Content Body */}
        <div
          style={{
            position: "relative",
            flex: 1,
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: "#09090b",
          }}
        >
          {addressError && <div role="alert" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, padding: 8, color: "#fecaca", background: "#451a1a", fontSize: 12 }}>{addressError}</div>}
          {externalUrl && !blockedSite && <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 26 }}><button type="button" onClick={handleExternalLaunch} title="If this site refuses to load, open it in a browser tab" style={{ border: "1px solid #52525b", borderRadius: 6, padding: "5px 8px", background: "#1c1c21", color: "#e4e4e7", fontSize: 11, cursor: "pointer" }}>Site blocked? Open in browser ↗</button></div>}
          {blockedSite && (
            <div role="status" style={{ position: "absolute", inset: 0, zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, background: "#16161a", color: "#e4e4e7", textAlign: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{blockedSite} cannot be displayed inside this window</span>
              <span style={{ maxWidth: 360, color: "#a1a1aa", fontSize: 12 }}>{blockedSite} blocks other websites from embedding this page. Open it in a browser tab to continue.</span>
              <button type="button" onClick={handleExternalLaunch} style={{ border: "1px solid #52525b", borderRadius: 6, padding: "7px 12px", background: "#27272a", color: "#f4f4f5", cursor: "pointer" }}>Open {blockedSite} in browser ↗</button>
            </div>
          )}
          {/* Offline Standby Overlay if Server is Refused */}
          {!externalUrl && isServerOffline && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 25,
                background: "rgba(18, 18, 24, 0.94)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                textAlign: "center",
                gap: 12,
              }}
            >
              <AlertTriangle size={32} className="text-amber-400" />
              <div style={{ color: "#f4f4f5", fontWeight: 600, fontSize: 14 }}>
                Dev Server Offline on Port {port}
              </div>
              <p style={{ color: "#a1a1aa", fontSize: 12, maxWidth: 360 }}>
                Live Server has not yet started on port {port}. Launch Live Server in Code Server to start previewing.
              </p>
              <button
                type="button"
                onClick={handleReload}
                disabled={isCheckingHealth}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  background: "#27272a",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#f4f4f5",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: isCheckingHealth ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RefreshCw size={13} className={isCheckingHealth ? "animate-spin" : ""} />
                <span>{isCheckingHealth ? "Checking..." : "Retry Connection"}</span>
              </button>
            </div>
          )}

          {/* Embedded Web Preview Iframe */}
          {!blockedSite && <iframe
            key={iframeKey}
            ref={iframeRef}
            src={iframeUrl}
            title="Web Application Preview"
            onLoad={() => setIsLoading(false)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
              pointerEvents: isDragging || isResizing || !isActive ? "none" : "auto",
            }}
            sandbox="allow-scripts allow-forms allow-popups allow-downloads"
            referrerPolicy="no-referrer"
          />}

          {/* Dual-Mode Canvas Mode Wheel & Click-to-Interact Overlay */}
          {!isActive && (!isServerOffline || externalUrl !== null) && !blockedSite && (
            <div
              className="web-preview-scroll-overlay"
              onWheel={forwardWheelToCanvas}
              onPointerDown={handleActivateWindow}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                cursor: "pointer",
                overscrollBehavior: "none",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 24,
                background: "transparent",
              }}
              title="Click to interact directly with web app • Trackpad scrolls canvas"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 20,
                  background: "rgba(18, 18, 24, 0.88)",
                  backdropFilter: "blur(8px)",
                  border: "1px solid rgba(255, 255, 255, 0.14)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
                  color: "#e4e4e7",
                  fontSize: 12,
                  fontWeight: 500,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                <span>⌨️ Click to interact</span>
                <span style={{ color: "#52525b" }}>•</span>
                <span style={{ color: "#a1a1aa", fontSize: 11 }}>Trackpad scrolls canvas</span>
              </div>
            </div>
          )}

          {/* Right-Edge Resize Handle (Isolated Width Sweeping) */}
          <div
            data-testid="preview-resize-handle-e"
            data-direction="e"
            className="resize-handle-e"
            onPointerDown={(e) => handleResizeStart(e, "e")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 28,
              width: 10,
              cursor: "ew-resize",
              zIndex: 20,
              touchAction: "none",
              userSelect: "none",
            }}
            title="Drag to resize width (responsive testing)"
            aria-label="Resize width"
          />

          {/* Bottom-Right Corner Resize Handle (Width & Height) */}
          <div
            data-testid="preview-resize-handle"
            data-testid-alias="preview-resize-handle-se"
            data-direction="se"
            className="resize-handle-se"
            onPointerDown={(e) => handleResizeStart(e, "se")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 28,
              height: 28,
              cursor: "nwse-resize",
              zIndex: 20,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              padding: 5,
              touchAction: "none",
              userSelect: "none",
            }}
            title="Drag to resize preview window"
            aria-label="Resize window"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ opacity: 0.5, pointerEvents: "none" }}
            >
              <path
                d="M10 2L2 10M10 6L6 10M10 10L10 10"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
