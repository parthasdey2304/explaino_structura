"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import type {
  ExcalidrawElement,
  AppState,
  ToolType,
  PointerCoords,
} from "@/types";
import {
  createNewElement,
  updateElementSize,
  updateElementPoints,
  updateElementPosition,
} from "@/lib/elements";
import {
  renderElements,
  renderSelectionBound,
  renderGrid,
} from "@/lib/render";
import { getElementAtPoint } from "@/lib/utils";

interface CanvasProps {
  elements: ExcalidrawElement[];
  setElements: React.Dispatch<React.SetStateAction<ExcalidrawElement[]>>;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  activeTool: ToolType;
}

export default function Canvas({
  elements,
  setElements,
  appState,
  setAppState,
  activeTool,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const isPanning = useRef(false);

  // Keep live refs for state values used inside pointer handlers
  // This prevents stale closure bugs where scroll/zoom values are out-of-date
  const scrollXRef = useRef(appState.scrollX);
  const scrollYRef = useRef(appState.scrollY);
  const zoomRef = useRef(appState.zoom.value);
  useEffect(() => {
    scrollXRef.current = appState.scrollX;
    scrollYRef.current = appState.scrollY;
    zoomRef.current = appState.zoom.value;
  }, [appState.scrollX, appState.scrollY, appState.zoom.value]);

  const dragStart = useRef<{ canvasX: number; canvasY: number } | null>(null);
  const currentElementId = useRef<string | null>(null);
  const dragOffsets = useRef<Map<string, { x: number; y: number }>>(new Map());
  const panStart = useRef<{ scrollX: number; scrollY: number; x: number; y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Always use live refs for coordinate conversion — never stale closure values
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): PointerCoords => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: clientX, y: clientY };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - scrollXRef.current) / zoomRef.current,
        y: (clientY - rect.top - scrollYRef.current) / zoomRef.current,
      };
    },
    [] // intentionally empty — reads from refs, not state
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, width, height);
    
    const bgColor = appState.theme === "dark" && appState.viewBackgroundColor === "#ffffff"
      ? "#121212"
      : appState.viewBackgroundColor;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    renderGrid(ctx, width, height, appState.scrollX, appState.scrollY, appState.zoom.value);
    renderElements(ctx, elements, appState.scrollX, appState.scrollY, appState.zoom.value);

    for (const id of selectedIds) {
      const el = elements.find((e) => e.id === id);
      if (el && !el.isDeleted) {
        renderSelectionBound(ctx, el, appState.scrollX, appState.scrollY, appState.zoom.value);
      }
    }
  }, [elements, appState, selectedIds]);

  useEffect(() => {
    const animId = requestAnimationFrame(function loop() {
      render();
      requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(animId);
  }, [render]);

  useEffect(() => {
    const handleResize = () => render();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [render]);

  // Prevent browser default pinch-zoom and Ctrl+Scroll page zoom
  // Must be non-passive to call preventDefault()
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        // Pinch / Ctrl+scroll → zoom toward cursor
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setAppState((prev) => {
          const newZoom = Math.min(10, Math.max(0.1, prev.zoom.value * delta));
          const ratio = newZoom / prev.zoom.value;
          return {
            ...prev,
            zoom: { value: newZoom },
            scrollX: mouseX - (mouseX - prev.scrollX) * ratio,
            scrollY: mouseY - (mouseY - prev.scrollY) * ratio,
          };
        });
      } else {
        // Regular scroll → pan
        setAppState((prev) => ({
          ...prev,
          scrollX: prev.scrollX - e.deltaX,
          scrollY: prev.scrollY - e.deltaY,
        }));
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [setAppState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          setElements((prev) =>
            prev.map((el) =>
              selectedIds.includes(el.id) ? { ...el, isDeleted: true } : el
            )
          );
          setSelectedIds([]);
        }
      }
      if (e.ctrlKey && e.key === "a") {
        e.preventDefault();
        setSelectedIds(elements.filter((el) => !el.isDeleted).map((el) => el.id));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, elements, editingTextId, setElements]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);

      const pos = screenToCanvas(e.clientX, e.clientY);

      if (activeTool === "pan" || e.button === 1 || (e.button === 0 && e.altKey)) {
        isPanning.current = true;
        panStart.current = {
          scrollX: scrollXRef.current,
          scrollY: scrollYRef.current,
          x: e.clientX,
          y: e.clientY,
        };
        return;
      }

      if (activeTool === "selection") {
        const hitElement = getElementAtPoint(elements, pos.x, pos.y);
        if (hitElement) {
          if (e.shiftKey) {
            setSelectedIds((prev) =>
              prev.includes(hitElement.id)
                ? prev.filter((id) => id !== hitElement.id)
                : [...prev, hitElement.id]
            );
          } else if (!selectedIds.includes(hitElement.id)) {
            setSelectedIds([hitElement.id]);
          }
          dragOffsets.current.clear();
          const idsToDrag = e.shiftKey
            ? selectedIds.includes(hitElement.id)
              ? selectedIds.filter((id) => id !== hitElement.id)
              : [...selectedIds, hitElement.id]
            : selectedIds.includes(hitElement.id)
            ? selectedIds
            : [hitElement.id];
          for (const id of idsToDrag) {
            const el = elements.find((e) => e.id === id);
            if (el) {
              dragOffsets.current.set(id, { x: pos.x - el.x, y: pos.y - el.y });
            }
          }
          isDrawing.current = true;
        } else {
          setSelectedIds([]);
        }
        return;
      }

      if (activeTool === "eraser") {
        const hitElement = getElementAtPoint(elements, pos.x, pos.y);
        if (hitElement) {
          setElements((prev) =>
            prev.map((el) =>
              el.id === hitElement.id ? { ...el, isDeleted: true } : el
            )
          );
        }
        isDrawing.current = true;
        return;
      }

      if (activeTool === "text") {
        const existingHit = getElementAtPoint(elements, pos.x, pos.y);
        if (existingHit && existingHit.type === "text") {
          setEditingTextId(existingHit.id);
          return;
        }
        const newElement = createNewElement("text", pos.x, pos.y, appState);
        newElement.text = "";
        newElement.originalText = "";
        setElements((prev) => [...prev, newElement]);
        setEditingTextId(newElement.id);
        return;
      }

      // Drawing tools — record the canvas-space start position
      isDrawing.current = true;
      dragStart.current = { canvasX: pos.x, canvasY: pos.y };
      const newElement = createNewElement(
        activeTool as "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "freedraw",
        pos.x,
        pos.y,
        appState
      );
      currentElementId.current = newElement.id;
      setElements((prev) => [...prev, newElement]);
    },
    [activeTool, appState, elements, selectedIds, screenToCanvas, setElements]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning.current && panStart.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        const startScrollX = panStart.current.scrollX;
        const startScrollY = panStart.current.scrollY;
        setAppState((prev) => ({
          ...prev,
          scrollX: startScrollX + dx,
          scrollY: startScrollY + dy,
        }));
        return;
      }

      if (!isDrawing.current) return;

      // Always compute current canvas position using live refs (no stale closure)
      const pos = screenToCanvas(e.clientX, e.clientY);

      if (activeTool === "selection" && selectedIds.length > 0) {
        setElements((prev) =>
          prev.map((el) => {
            const offset = dragOffsets.current.get(el.id);
            if (offset && selectedIds.includes(el.id)) {
              return updateElementPosition(el, pos.x - offset.x, pos.y - offset.y);
            }
            return el;
          })
        );
        return;
      }

      if (activeTool === "eraser") {
        const hitElement = getElementAtPoint(elements, pos.x, pos.y);
        if (hitElement) {
          setElements((prev) =>
            prev.map((el) =>
              el.id === hitElement.id ? { ...el, isDeleted: true } : el
            )
          );
        }
        return;
      }

      if (!currentElementId.current || !dragStart.current) return;
      const start = dragStart.current;

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== currentElementId.current) return el;

          if (el.type === "freedraw") {
            const lastPoint = el.points![el.points!.length - 1];
            const dx = pos.x - (el.x + lastPoint[0]);
            const dy = pos.y - (el.y + lastPoint[1]);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 2) return el;
            return updateElementPoints(el, [...el.points!, [pos.x - el.x, pos.y - el.y]]);
          }

          if (el.type === "line" || el.type === "arrow") {
            // End point is relative to the element's origin (start point)
            return updateElementPoints(el, [
              [0, 0],
              [pos.x - start.canvasX, pos.y - start.canvasY],
            ]);
          }

          const width = pos.x - start.canvasX;
          const height = pos.y - start.canvasY;

          if (width < 0 && height < 0) {
            return updateElementSize(
              updateElementPosition(el, pos.x, pos.y),
              start.canvasX - pos.x,
              start.canvasY - pos.y
            );
          } else if (width < 0) {
            return updateElementSize(
              updateElementPosition(el, pos.x, el.y),
              start.canvasX - pos.x,
              height
            );
          } else if (height < 0) {
            return updateElementSize(
              updateElementPosition(el, el.x, pos.y),
              width,
              start.canvasY - pos.y
            );
          }

          return updateElementSize(el, width, height);
        })
      );
    },
    [activeTool, elements, screenToCanvas, selectedIds, setElements, setAppState]
  );

  const handlePointerUp = useCallback(
    () => {
      isPanning.current = false;
      panStart.current = null;

      if (!isDrawing.current) return;
      isDrawing.current = false;
      dragStart.current = null;
      currentElementId.current = null;
      dragOffsets.current.clear();

      setElements((prev) =>
        prev.filter((el) => {
          if (el.type === "text") return true;
          if (el.type === "freedraw" || el.type === "line" || el.type === "arrow") {
            return el.points && el.points.length >= 2;
          }
          return el.width !== 0 || el.height !== 0;
        })
      );
    },
    [setElements]
  );

  useEffect(() => {
    if (editingTextId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingTextId]);

  const handleTextBlur = useCallback(() => {
    if (!editingTextId) return;
    setElements((prev) =>
      prev.map((el) => {
        if (el.id === editingTextId && el.type === "text") {
          if (!el.text || el.text.trim() === "") {
            return { ...el, isDeleted: true };
          }
          return { ...el, originalText: el.text };
        }
        return el;
      })
    );
    setEditingTextId(null);
  }, [editingTextId, setElements]);

  const getCursorStyle = (): string => {
    if (activeTool === "pan") return "grab";
    if (activeTool === "selection") return "default";
    if (activeTool === "eraser") return "crosshair";
    if (activeTool === "text") return "text";
    return "crosshair";
  };

  const editingElement = editingTextId
    ? elements.find((el) => el.id === editingTextId)
    : null;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: getCursorStyle() }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      {editingElement && editingElement.type === "text" && (
        <textarea
          ref={textareaRef}
          style={{
            position: "absolute",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            overflow: "hidden",
            left: editingElement.x * appState.zoom.value + appState.scrollX,
            top: editingElement.y * appState.zoom.value + appState.scrollY,
            fontSize: (editingElement.fontSize || 20) * appState.zoom.value,
            color: editingElement.strokeColor,
            fontFamily: "Virgil, Segoe UI Emoji, sans-serif",
            lineHeight: "1.25",
            minWidth: 100,
            minHeight: 30,
          }}
          value={editingElement.text || ""}
          onChange={(e) => {
            const text = e.target.value;
            setElements((prev) =>
              prev.map((el) =>
                el.id === editingTextId
                  ? { ...el, text, originalText: text }
                  : el
              )
            );
          }}
          onBlur={handleTextBlur}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              textareaRef.current?.blur();
            }
          }}
        />
      )}
    </div>
  );
}