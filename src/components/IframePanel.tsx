"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
} from "@excalidraw/excalidraw";
import type { Zoom } from "@excalidraw/excalidraw/types";
import { getHealthCheckIntervalMs } from "@/lib/deviceOptimization";
import VSCodeScreenView from "./VSCodeScreenView";

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
  /** Callback fired when the user clicks the close (red macOS button). */
  onClose: () => void;
  /** Current canvas viewport state (for panning and zooming in sync with Excalidraw). */
  viewport?: CanvasViewport;
  /** Optional layout preset */
  layout?: IframePanelLayout;
  /** Optional layout change callback */
  onLayoutChange?: (layout: IframePanelLayout) => void;
  /** Direct canvas scroll callback for trackpad panning/zooming over the screen */
  onCanvasScroll?: (deltaX: number, deltaY: number, isZoom: boolean, isShift: boolean) => void;
  /** Controlled active state: when true, keyboard and pointer route to code server */
  isActive?: boolean;
  /** Callback when active/focus state changes */
  onActiveChange?: (active: boolean) => void;
  /** Currently active tool in Excalidraw (e.g. 'selection', 'rectangle', 'line', etc.) */
  activeToolType?: string;
  recenterTrigger?: number;
}

export const CODE_SERVER_SECURE_URL = "https://13.49.76.201.sslip.io/?folder=/home/ubuntu/workspace";
export const CANVAS_SCREEN_STORAGE_KEY = "explaino-canvas-screen-state";

export type ServerHealthStatus = "loading" | "online" | "offline";

export interface CanvasScreenSavedState {
  isOpen: boolean;
  sceneX?: number;
  sceneY?: number;
  sceneWidth?: number;
  sceneHeight?: number;
  url?: string;
  shouldRecenter?: boolean;
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
      sceneHeight: existing?.sceneHeight ?? 580,
      shouldRecenter: existing?.shouldRecenter ?? false,
      ...partial,
      // Always guarantee persistent URL is locked to secure code server
      url: CODE_SERVER_SECURE_URL,
    };
    localStorage.setItem(CANVAS_SCREEN_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export default function IframePanel({
  onClose,
  viewport,
  onCanvasScroll,
  isActive: controlledIsActive,
  onActiveChange,
  activeToolType,
  recenterTrigger,
}: IframePanelProps) {
  const [saved] = useState(() => loadSavedScreenState());

  const [isLoading, setIsLoading] = useState(true);
  const [isHoveredTraffic, setIsHoveredTraffic] = useState(false);
  const [hoveredTrafficButton, setHoveredTrafficButton] = useState<"close" | "recenter" | "maximize" | null>(null);
  const [isHoveredOverlay, setIsHoveredOverlay] = useState(false);

  // Server health state: 'loading' | 'online' | 'offline'
  const [serverHealth, setServerHealth] = useState<ServerHealthStatus>("loading");
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Local active state with prop synchronization
  const [localIsActive, setLocalIsActive] = useState(false);
  const isActive = controlledIsActive !== undefined ? controlledIsActive : localIsActive;

  const setActiveState = useCallback(
    (next: boolean) => {
      setLocalIsActive(next);
      onActiveChange?.(next);
    },
    [onActiveChange]
  );

  // Track consecutive health check failures to prevent false 502 offline alerts during network jitter
  const failureCountRef = useRef(0);

  // Check code-server health status
  const checkServerHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      // 1. Try our Next.js health endpoint
      const res = await fetch("/api/code-server-health", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.online === true) {
          failureCountRef.current = 0;
          setServerHealth("online");
          setIsCheckingHealth(false);
          return true;
        }
      }

      // 2. Direct fetch fallback with CORS
      const direct = await fetch("https://13.49.76.201.sslip.io/healthz", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).catch(() => null);

      if (direct && direct.ok) {
        const directData = await direct.json().catch(() => null);
        const isDirectAlive =
          directData &&
          (directData.status === "alive" ||
            directData.status === "expired" ||
            Boolean(directData.lastHeartbeat));
        if (isDirectAlive) {
          failureCountRef.current = 0;
          setServerHealth("online");
          setIsCheckingHealth(false);
          return true;
        }
      }

      failureCountRef.current += 1;
      // Require 2 consecutive failures before showing 502 offline overlay
      if (failureCountRef.current >= 2) {
        setServerHealth("offline");
        setIsLoading(false);
      }
      setIsCheckingHealth(false);
      return false;
    } catch {
      failureCountRef.current += 1;
      if (failureCountRef.current >= 2) {
        setServerHealth("offline");
        setIsLoading(false);
      }
      setIsCheckingHealth(false);
      return false;
    }
  }, []);

  // Periodic health check every 15 seconds & on initial mount
  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, getHealthCheckIntervalMs());
    return () => clearInterval(interval);
  }, [checkServerHealth]);

  // Retry connection when server was offline
  const handleRetry = useCallback(async () => {
    setIsLoading(true);
    setServerHealth("loading");
    const ok = await checkServerHealth();
    if (ok) {
      setIframeKey((prev) => prev + 1);
    }
  }, [checkServerHealth]);

  // If a drawing tool is selected (line, arrow, circle, rectangle, draw, text), release active mode
  useEffect(() => {
    if (activeToolType && activeToolType !== "selection" && activeToolType !== "hand" && isActive) {
      setActiveState(false);
    }
  }, [activeToolType, isActive, setActiveState]);

  // Scene-space coordinates: anchored inside the whiteboard canvas so it pans & zooms
  const [scenePos, setScenePos] = useState<{
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  } | null>(() => {
    if (recenterTrigger !== undefined && recenterTrigger > 0) {
      return null;
    }
    if (saved?.shouldRecenter) {
      return null;
    }
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

  const [preMaximizePos, setPreMaximizePos] = useState<{
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
  const latestScenePosRef = useRef(scenePos);
  latestScenePosRef.current = scenePos;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Recenter in current view (Yellow traffic light or on opening Screen)
  const handleRecenter = useCallback(() => {
    if (!viewport) return;
    const zoom = viewport.zoom?.value || 1;
    // Golden ratio window matching screenshot: ~68% width x ~70% height
    const targetViewportW = Math.min(Math.max(window.innerWidth * 0.68, 780), window.innerWidth - 80);
    const targetViewportH = Math.min(Math.max(window.innerHeight * 0.70, 520), window.innerHeight - 100);
    const sceneWidth = targetViewportW / zoom;
    const sceneHeight = targetViewportH / zoom;
    const center = viewportCoordsToSceneCoords(
      { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
      viewport
    );
    const nextPos = {
      sceneX: center.x - sceneWidth / 2,
      sceneY: center.y - sceneHeight / 2,
      sceneWidth,
      sceneHeight,
    };
    latestScenePosRef.current = nextPos;
    setScenePos(nextPos);
    saveScreenState({ ...nextPos, shouldRecenter: false });
  }, [viewport]);

  // Center code server window in current canvas view on initial load if not restored or recenter requested
  useEffect(() => {
    if (scenePos === null && viewport) {
      handleRecenter();
    }
  }, [viewport, scenePos, handleRecenter]);

  // Listen for recenterTrigger prop updates from parent (e.g. clicking Screen in Extensions panel or toolbar)
  const lastRecenterTriggerRef = useRef(recenterTrigger ?? 0);
  useEffect(() => {
    if (recenterTrigger !== undefined && recenterTrigger > 0 && recenterTrigger !== lastRecenterTriggerRef.current) {
      lastRecenterTriggerRef.current = recenterTrigger;
      handleRecenter();
    }
  }, [recenterTrigger, handleRecenter]);

  // Listen for global custom event 'explaino-recenter-screen'
  useEffect(() => {
    const onRecenterEvent = () => {
      handleRecenter();
    };
    window.addEventListener("explaino-recenter-screen", onRecenterEvent);
    return () => {
      window.removeEventListener("explaino-recenter-screen", onRecenterEvent);
    };
  }, [handleRecenter]);

  // Maximize / Restore size (Green traffic light)
  const handleToggleMaximize = useCallback(() => {
    if (!viewport) return;
    if (preMaximizePos) {
      setScenePos(preMaximizePos);
      saveScreenState(preMaximizePos);
      setPreMaximizePos(null);
    } else {
      if (scenePos) {
        setPreMaximizePos(scenePos);
      }
      const zoom = viewport.zoom.value || 1;
      const targetW = Math.max(700, (window.innerWidth - 80) / zoom);
      const targetH = Math.max(480, (window.innerHeight - 80) / zoom);
      const center = viewportCoordsToSceneCoords(
        { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
        viewport
      );
      const maxPos = {
        sceneX: center.x - targetW / 2,
        sceneY: center.y - targetH / 2,
        sceneWidth: targetW,
        sceneHeight: targetH,
      };
      setScenePos(maxPos);
      saveScreenState(maxPos);
    }
  }, [viewport, scenePos, preMaximizePos]);

  // Close window (Red traffic light)
  const handleClose = useCallback(() => {
    setActiveState(false);
    saveScreenState({ isOpen: false });
    onClose();
  }, [onClose, setActiveState]);

  // Forward wheel/trackpad events to canvas so panning and zooming work smoothly over the screen
  const forwardWheelToCanvas = useCallback(
    (e: React.WheelEvent | WheelEvent) => {
      // Prevent parent browser window from scrolling
      e.preventDefault();
      e.stopPropagation();

      // Dispatch directly to Excalidraw's canvas element so it uses native momentum & zoom
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

      // Direct fallback
      onCanvasScroll?.(e.deltaX, e.deltaY, e.ctrlKey || e.metaKey, e.shiftKey);
    },
    [onCanvasScroll]
  );

  // Prevent trackpad horizontal swipe (left/right) from triggering browser back/forward navigation
  useEffect(() => {
    const preventHistoryNav = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest(".canvas-screen-panel") || target.closest(".screen-scroll-overlay"))
      ) {
        // Explicitly prevent default browser gesture (back/forward history navigation)
        e.preventDefault();
        e.stopPropagation();
        forwardWheelToCanvas(e);
      }
    };

    window.addEventListener("wheel", preventHistoryNav, { passive: false });
    return () => window.removeEventListener("wheel", preventHistoryNav);
  }, [forwardWheelToCanvas]);

  // Activate screen: gives keyboard and mouse focus to Code Server
  const handleActivateScreen = useCallback(
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

  // Deactivate screen: returns focus and keyboard commands to whiteboard canvas
  const handleDeactivateScreen = useCallback(
    (e?: React.PointerEvent | React.MouseEvent) => {
      e?.stopPropagation();
      setActiveState(false);
      const container = document.querySelector<HTMLElement>(".excalidraw");
      container?.focus();
    },
    [setActiveState]
  );

  // Dragging handlers: supports mouse, tablet touch, and stylus with pointer capture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, .traffic-light-btn, .screen-badge-btn")) return;
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
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
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
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      const newWidth = Math.max(340, dragStartRef.current.startWidth + dx);
      const newHeight = Math.max(220, dragStartRef.current.startHeight + dy);
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

  // Resize handler (bottom right corner): touch-friendly for tablets and desktop mouse
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
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
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  // Convert scene coordinates to screen viewport coordinates
  const viewportCoords = useMemo(() => {
    if (!scenePos || !viewport) {
      const defaultW = Math.min(Math.max(window.innerWidth * 0.68, 780), window.innerWidth - 80);
      const defaultH = Math.min(Math.max(window.innerHeight * 0.70, 520), window.innerHeight - 100);
      return {
        x: (window.innerWidth - defaultW) / 2,
        y: (window.innerHeight - defaultH) / 2,
        width: defaultW,
        height: defaultH,
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
      height: Math.max(180, scenePos.sceneHeight * zoom),
    };
  }, [scenePos, viewport]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    failureCountRef.current = 0;
    setServerHealth("online");
    checkServerHealth();
  }, [checkServerHealth]);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setServerHealth("offline");
  }, []);

  // Compute indicator dot color and shadow
  const statusColorInfo = useMemo(() => {
    if (serverHealth === "offline") {
      return {
        color: "#ef4444",
        glow: "0 0 8px rgba(239, 68, 68, 0.85)",
        label: "Offline (502 Bad Gateway)",
      };
    }
    if (serverHealth === "loading" || isLoading) {
      return {
        color: "#f59e0b",
        glow: "0 0 8px rgba(245, 158, 11, 0.85)",
        label: "Loading...",
      };
    }
    // Only green when online AND fully visible/loaded
    return {
      color: "#22c55e",
      glow: "0 0 8px rgba(34, 197, 94, 0.85)",
      label: "Online & Connected",
    };
  }, [serverHealth, isLoading]);

  return (
    <div
      ref={panelRef}
      className="canvas-screen-panel"
      onWheel={forwardWheelToCanvas}
      style={{
        position: "fixed",
        left: `${viewportCoords.x}px`,
        top: `${viewportCoords.y}px`,
        width: `${viewportCoords.width}px`,
        height: `${viewportCoords.height}px`,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        background: "#16161a",
        borderRadius: 16,
        border: isActive
          ? "1.5px solid rgba(99, 102, 241, 0.75)"
          : serverHealth === "offline"
          ? "1.5px solid rgba(239, 68, 68, 0.45)"
          : "1.5px solid rgba(255, 255, 255, 0.14)",
        boxShadow: isActive
          ? "0 0 0 2px rgba(99, 102, 241, 0.25), 0 24px 60px -12px rgba(0, 0, 0, 0.85)"
          : serverHealth === "offline"
          ? "0 0 0 1px rgba(239, 68, 68, 0.2), 0 24px 60px -12px rgba(0, 0, 0, 0.8)"
          : "0 24px 60px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
        overscrollBehavior: "none",
        overscrollBehaviorX: "none",
        overscrollBehaviorY: "none",
        userSelect: isDragging || isResizing ? "none" : "auto",
        touchAction: isDragging || isResizing ? "none" : "auto",
        transition: "border 0.18s ease, box-shadow 0.18s ease",
      }}
    >
      {/* macOS Window Header (Drag Handle for desktop mouse & tablet touch/stylus) */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={forwardWheelToCanvas}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 38,
          padding: "0 14px",
          background: isActive ? "#1e1e26" : "#1c1c21",
          borderBottom: isActive
            ? "1px solid rgba(99, 102, 241, 0.28)"
            : serverHealth === "offline"
            ? "1px solid rgba(239, 68, 68, 0.25)"
            : "1px solid rgba(255, 255, 255, 0.08)",
          flexShrink: 0,
          userSelect: "none",
          touchAction: "none",
          cursor: isDragging ? "grabbing" : "grab",
          transition: "background 0.18s ease",
        }}
        title="Drag window anywhere on whiteboard canvas • Trackpad scrolls canvas"
      >
        {/* Left: macOS Traffic Light Buttons */}
        <div
          style={{ display: "flex", alignItems: "center", gap: isHoveredTraffic ? 6 : 8, transition: "gap 0.18s cubic-bezier(0.16, 1, 0.3, 1)" }}
          onMouseEnter={() => setIsHoveredTraffic(true)}
          onMouseLeave={() => {
            setIsHoveredTraffic(false);
            setHoveredTrafficButton(null);
          }}
        >
          {/* Red: Close */}
          <button
            type="button"
            className="traffic-light-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            onMouseEnter={() => setHoveredTrafficButton("close")}
            onMouseLeave={() => setHoveredTrafficButton(null)}
            style={{
              width: isHoveredTraffic ? 22 : 12,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            title="Close window"
            aria-label="Close"
          >
            <span
              style={{
                width: isHoveredTraffic ? (hoveredTrafficButton === "close" ? 18 : 16) : 12,
                height: isHoveredTraffic ? (hoveredTrafficButton === "close" ? 18 : 16) : 12,
                borderRadius: "50%",
                background: "#ff5f56",
                border: "0.5px solid rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.75)",
                lineHeight: 1,
                boxShadow: isHoveredTraffic && hoveredTrafficButton === "close"
                  ? "0 0 10px rgba(255, 95, 86, 0.75), inset 0 1px 1px rgba(255,255,255,0.4)"
                  : "inset 0 1px 1px rgba(255,255,255,0.25)",
                transform: isHoveredTraffic && hoveredTrafficButton === "close" ? "scale(1.08)" : "scale(1)",
                transition: "width 0.18s cubic-bezier(0.16, 1, 0.3, 1), height 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease",
              }}
            >
              {isHoveredTraffic && (
                <svg
                  width={hoveredTrafficButton === "close" ? "9" : "8"}
                  height={hoveredTrafficButton === "close" ? "9" : "8"}
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="rgba(0,0,0,0.75)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M2 2L8 8M8 2L2 8" />
                </svg>
              )}
            </span>
          </button>

          {/* Yellow: Recenter in Canvas View */}
          <button
            type="button"
            className="traffic-light-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleRecenter();
            }}
            onMouseEnter={() => setHoveredTrafficButton("recenter")}
            onMouseLeave={() => setHoveredTrafficButton(null)}
            style={{
              width: isHoveredTraffic ? 22 : 12,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            title="Recenter in canvas view"
            aria-label="Recenter"
          >
            <span
              style={{
                width: isHoveredTraffic ? (hoveredTrafficButton === "recenter" ? 18 : 16) : 12,
                height: isHoveredTraffic ? (hoveredTrafficButton === "recenter" ? 18 : 16) : 12,
                borderRadius: "50%",
                background: "#ffbd2e",
                border: "0.5px solid rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.75)",
                lineHeight: 1,
                boxShadow: isHoveredTraffic && hoveredTrafficButton === "recenter"
                  ? "0 0 10px rgba(255, 189, 46, 0.75), inset 0 1px 1px rgba(255,255,255,0.4)"
                  : "inset 0 1px 1px rgba(255,255,255,0.25)",
                transform: isHoveredTraffic && hoveredTrafficButton === "recenter" ? "scale(1.08)" : "scale(1)",
                transition: "width 0.18s cubic-bezier(0.16, 1, 0.3, 1), height 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease",
              }}
            >
              {isHoveredTraffic && (
                <svg
                  width={hoveredTrafficButton === "recenter" ? "9" : "8"}
                  height={hoveredTrafficButton === "recenter" ? "9" : "8"}
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="rgba(0,0,0,0.75)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M2 5H8" />
                </svg>
              )}
            </span>
          </button>

          {/* Green: Maximize / Restore */}
          <button
            type="button"
            className="traffic-light-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleMaximize();
            }}
            onMouseEnter={() => setHoveredTrafficButton("maximize")}
            onMouseLeave={() => setHoveredTrafficButton(null)}
            style={{
              width: isHoveredTraffic ? 22 : 12,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            title={preMaximizePos ? "Restore size" : "Maximize in canvas"}
            aria-label="Maximize"
          >
            <span
              style={{
                width: isHoveredTraffic ? (hoveredTrafficButton === "maximize" ? 18 : 16) : 12,
                height: isHoveredTraffic ? (hoveredTrafficButton === "maximize" ? 18 : 16) : 12,
                borderRadius: "50%",
                background: "#27c93f",
                border: "0.5px solid rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.75)",
                lineHeight: 1,
                boxShadow: isHoveredTraffic && hoveredTrafficButton === "maximize"
                  ? "0 0 10px rgba(39, 201, 63, 0.75), inset 0 1px 1px rgba(255,255,255,0.4)"
                  : "inset 0 1px 1px rgba(255,255,255,0.25)",
                transform: isHoveredTraffic && hoveredTrafficButton === "maximize" ? "scale(1.08)" : "scale(1)",
                transition: "width 0.18s cubic-bezier(0.16, 1, 0.3, 1), height 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease",
              }}
            >
              {isHoveredTraffic && (
                preMaximizePos ? (
                  <svg
                    width={hoveredTrafficButton === "maximize" ? "9" : "8"}
                    height={hoveredTrafficButton === "maximize" ? "9" : "8"}
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="rgba(0,0,0,0.75)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 4.5V2H4.5M8 5.5V8H5.5" />
                    <path d="M2 2L4.5 4.5M8 8L5.5 5.5" />
                  </svg>
                ) : (
                  <svg
                    width={hoveredTrafficButton === "maximize" ? "9" : "8"}
                    height={hoveredTrafficButton === "maximize" ? "9" : "8"}
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="rgba(0,0,0,0.75)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M5 2V8M2 5H8" />
                  </svg>
                )
              )}
            </span>
          </button>

          {/* Dynamic Action Pill indicating which option is doing what */}
          {isHoveredTraffic && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                marginLeft: 6,
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 600,
                lineHeight: 1.2,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                transition: "all 0.15s ease",
                ...(hoveredTrafficButton === "close"
                  ? {
                      background: "rgba(239, 68, 68, 0.18)",
                      color: "#fca5a5",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                    }
                  : hoveredTrafficButton === "recenter"
                  ? {
                      background: "rgba(245, 158, 11, 0.18)",
                      color: "#fde047",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                    }
                  : hoveredTrafficButton === "maximize"
                  ? {
                      background: "rgba(34, 197, 94, 0.18)",
                      color: "#86efac",
                      border: "1px solid rgba(34, 197, 94, 0.35)",
                    }
                  : {
                      background: "rgba(255, 255, 255, 0.08)",
                      color: "#d4d4d8",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                    }),
              }}
            >
              {hoveredTrafficButton === "close" && "Close Window"}
              {hoveredTrafficButton === "recenter" && "Recenter in Canvas"}
              {hoveredTrafficButton === "maximize" && (preMaximizePos ? "Restore Size" : "Maximize Canvas")}
              {!hoveredTrafficButton && "Window Controls"}
            </div>
          )}
        </div>

        {/* Center / Right: Interactive Mode Status & Code Server Status Dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Active Status Badge */}
          {isActive ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 12,
                background: "rgba(34, 197, 94, 0.14)",
                border: "1px solid rgba(34, 197, 94, 0.35)",
                color: "#4ade80",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#22c55e",
                  boxShadow: "0 0 6px #22c55e",
                }}
              />
              <span>Type in Screen</span>
              <button
                type="button"
                className="screen-badge-btn"
                onClick={handleDeactivateScreen}
                style={{
                  marginLeft: 3,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "none",
                  color: "#e4e4e7",
                  fontSize: 9,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Release keyboard to canvas (Esc)"
              >
                Esc to Canvas
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#a1a1aa",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#71717a",
                }}
              />
              <span>Canvas Mode (Trackpad Scrolls)</span>
            </div>
          )}

          {/* CODE SERVER Label with Dynamic Status Dot (Red when 502/down, Amber when loading, Green ONLY when online & visible) */}
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: isActive ? "#e4e4e7" : "#71717a",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 7,
              cursor: "pointer",
            }}
            onClick={checkServerHealth}
            title={`Code Server: ${statusColorInfo.label}. Click to re-check.`}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: statusColorInfo.color,
                boxShadow: statusColorInfo.glow,
                display: "inline-block",
                transition: "background 0.25s ease, box-shadow 0.25s ease",
              }}
            />
            <span>CODE SERVER</span>
          </div>
        </div>
      </div>

      {/* Main Body: Code Server Environment */}
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
        {/* VS Code Workspace (Always shows active IDE with 60+ line algorithm code, no blank spinner) */}
        {(isLoading || serverHealth === "loading") && serverHealth !== "offline" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <VSCodeScreenView />
          </div>
        )}

        {/* Offline / 502 Error Overlay */}
        {serverHealth === "offline" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "#18181b",
              color: "#f4f4f5",
              zIndex: 6,
              padding: 24,
              textAlign: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ef4444",
                boxShadow: "0 0 16px rgba(239, 68, 68, 0.25)",
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>
                Code Server Offline (502 Bad Gateway)
              </div>
              <div style={{ fontSize: 12, color: "#a1a1aa", maxWidth: 340, lineHeight: 1.5 }}>
                The backend code-server process on the server is currently unreachable.
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              disabled={isCheckingHealth}
              style={{
                marginTop: 6,
                padding: "7px 18px",
                borderRadius: 8,
                background: "#27272a",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                color: "#f4f4f5",
                fontSize: 12,
                fontWeight: 600,
                cursor: isCheckingHealth ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "background 0.15s ease",
              }}
            >
              <RefreshCw size={14} className={isCheckingHealth ? "animate-spin" : ""} />
              <span>{isCheckingHealth ? "Connecting…" : "Retry Connection"}</span>
            </button>
          </div>
        )}

        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={CODE_SERVER_SECURE_URL}
          title="Code Server"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
            pointerEvents: isDragging || isResizing || !isActive ? "none" : "auto",
          }}
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone"
        />

        {/* Canvas Mode Trackpad Scroll & Click-to-Focus Overlay */}
        {!isActive && serverHealth !== "offline" && (
          <div
            className="screen-scroll-overlay"
            onWheel={forwardWheelToCanvas}
            onPointerDown={handleActivateScreen}
            onMouseEnter={() => setIsHoveredOverlay(true)}
            onMouseLeave={() => setIsHoveredOverlay(false)}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 10,
              cursor: "pointer",
              overscrollBehavior: "none",
              overscrollBehaviorX: "none",
              overscrollBehaviorY: "none",
              background: isHoveredOverlay ? "rgba(0, 0, 0, 0.08)" : "transparent",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              paddingBottom: 24,
              transition: "background 0.15s ease",
            }}
            title="Click to work & type in Code Server • Trackpad scrolls canvas normally"
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
                opacity: isHoveredOverlay ? 0.95 : 0.75,
                transform: isHoveredOverlay ? "translateY(0)" : "translateY(2px)",
                transition: "opacity 0.15s ease, transform 0.15s ease",
                userSelect: "none",
              }}
            >
              <span>⌨️ Click to type in Code Server</span>
              <span style={{ color: "#52525b" }}>•</span>
              <span style={{ color: "#a1a1aa", fontSize: 11 }}>Trackpad scrolls canvas</span>
            </div>
          </div>
        )}

        {/* Bottom-Right Touch-Friendly Resize Handle (for tablet finger/stylus and desktop mouse) */}
        <div
          onPointerDown={handleResizeStart}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 32,
            height: 32,
            cursor: "nwse-resize",
            zIndex: 15,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
            padding: 5,
            touchAction: "none",
            userSelect: "none",
          }}
          title="Drag to resize code server window"
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
  );
}
