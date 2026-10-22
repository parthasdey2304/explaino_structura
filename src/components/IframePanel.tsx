"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
} from "@excalidraw/excalidraw";
import type { Zoom } from "@excalidraw/excalidraw/types";

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
}

export const CODE_SERVER_SECURE_URL = "https://13.49.76.201.sslip.io/";
export const CANVAS_SCREEN_STORAGE_KEY = "explaino-canvas-screen-state";

export interface CanvasScreenSavedState {
  isOpen: boolean;
  sceneX?: number;
  sceneY?: number;
  sceneWidth?: number;
  sceneHeight?: number;
  url?: string;
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
      ...partial,
      // Always guarantee persistent URL is locked to secure code server
      url: CODE_SERVER_SECURE_URL,
    };
    localStorage.setItem(CANVAS_SCREEN_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export default function IframePanel({ onClose, viewport }: IframePanelProps) {
  const [saved] = useState(() => loadSavedScreenState());

  const [isLoading, setIsLoading] = useState(true);
  const [isHoveredTraffic, setIsHoveredTraffic] = useState(false);

  // Scene-space coordinates: anchored inside the whiteboard canvas so it pans & zooms
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

  // Center code server window in current canvas view on initial load if not restored
  useEffect(() => {
    if (scenePos === null && viewport) {
      const center = viewportCoordsToSceneCoords(
        { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
        viewport
      );
      const defaultWidth = 920;
      const defaultHeight = 580;
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

  // Recenter in current view (Yellow traffic light)
  const handleRecenter = useCallback(() => {
    if (!viewport) return;
    const center = viewportCoordsToSceneCoords(
      { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
      viewport
    );
    const width = scenePos?.sceneWidth ?? 920;
    const height = scenePos?.sceneHeight ?? 580;
    const nextPos = {
      sceneX: center.x - width / 2,
      sceneY: center.y - height / 2,
      sceneWidth: width,
      sceneHeight: height,
    };
    setScenePos(nextPos);
    saveScreenState(nextPos);
  }, [viewport, scenePos]);

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
    saveScreenState({ isOpen: false });
    onClose();
  }, [onClose]);

  // Dragging handlers: supports mouse, tablet touch, and stylus with pointer capture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, .traffic-light-btn")) return;
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
      return {
        x: window.innerWidth / 2 - 460,
        y: window.innerHeight / 2 - 290,
        width: 920,
        height: 580,
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
  }, []);

  return (
    <div
      ref={panelRef}
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
        border: "1.5px solid rgba(255, 255, 255, 0.14)",
        boxShadow:
          "0 24px 60px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
        userSelect: isDragging || isResizing ? "none" : "auto",
        touchAction: isDragging || isResizing ? "none" : "auto",
      }}
    >
      {/* macOS Window Header (Drag Handle for desktop mouse & tablet touch/stylus) */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 38,
          padding: "0 14px",
          background: "#1c1c21",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          flexShrink: 0,
          userSelect: "none",
          touchAction: "none",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        title="Drag window anywhere on whiteboard canvas"
      >
        {/* macOS Traffic Light Buttons */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 8 }}
          onMouseEnter={() => setIsHoveredTraffic(true)}
          onMouseLeave={() => setIsHoveredTraffic(false)}
        >
          {/* Red: Close */}
          <button
            type="button"
            className="traffic-light-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
            title="Close window"
            aria-label="Close"
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#ff5f56",
                border: "0.5px solid rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.6)",
                fontSize: 9,
                fontWeight: 900,
                lineHeight: 1,
                boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2)",
              }}
            >
              {isHoveredTraffic && "×"}
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
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
            title="Recenter in canvas view"
            aria-label="Recenter"
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#ffbd2e",
                border: "0.5px solid rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.6)",
                fontSize: 9,
                fontWeight: 900,
                lineHeight: 1,
                boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2)",
              }}
            >
              {isHoveredTraffic && "–"}
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
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
            title={preMaximizePos ? "Restore size" : "Maximize in canvas"}
            aria-label="Maximize"
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#27c93f",
                border: "0.5px solid rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(0,0,0,0.6)",
                fontSize: 8,
                fontWeight: 900,
                lineHeight: 1,
                boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2)",
              }}
            >
              {isHoveredTraffic && "+"}
            </span>
          </button>
        </div>

        {/* Right Label (macOS code server window) */}
        <div
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            color: "#71717a",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#22c55e",
              display: "inline-block",
            }}
          />
          <span>CODE SERVER</span>
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
              gap: 12,
              zIndex: 5,
            }}
          >
            <Loader2 size={24} className="animate-spin text-indigo-400" />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f4f5", marginBottom: 2 }}>
                Loading Code Server…
              </div>
              <div style={{ fontSize: 11, color: "#71717a" }}>
                Connecting to VS Code workspace
              </div>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={CODE_SERVER_SECURE_URL}
          title="Code Server"
          onLoad={handleIframeLoad}
          onError={() => setIsLoading(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
            pointerEvents: isDragging || isResizing ? "none" : "auto",
          }}
          allow="clipboard-read; clipboard-write; fullscreen; camera; microphone"
        />

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
