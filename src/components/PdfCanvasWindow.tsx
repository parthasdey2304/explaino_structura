"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { Zoom } from "@excalidraw/excalidraw/types";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Pencil, Minus, Square, ChevronDown, Undo2, Redo2 } from "lucide-react";
import { savePdfWindow } from "@/lib/pdfWindowStore";

export interface PdfWindowItem { id: string; canvasId: string; file: File; x: number; y: number; width?: number; height?: number; history?: History }
interface Viewport { zoom: Zoom; offsetLeft: number; offsetTop: number; scrollX: number; scrollY: number }
interface Position { x: number; y: number; width: number; height: number }
interface Props { item: PdfWindowItem; viewport: Viewport; onClose: () => void; zIndex: number; onFocusWindow: () => void; visible: boolean; focused: boolean }
type DrawingTool = "pen" | "line" | "rectangle";
interface Point { x: number; y: number }
interface Annotation { tool: DrawingTool; points: Point[] }
interface History { entries: { page: number; annotation: Annotation }[]; index: number }

function PdfPage({ document, number, tool, annotations, onAdd, zoom }: { document: PDFDocumentProxy; number: number; tool: DrawingTool | null; annotations: Annotation[]; onAdd: (number: number, annotation: Annotation) => void; zoom: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const renderQueue = useRef<Promise<void>>(Promise.resolve());
  const [draft, setDraft] = useState<Annotation | null>(null);
  const draftRef = useRef<Annotation | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const visibility = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "800px 0px" });
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resize = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => setWidth(nextWidth), 120);
    });
    visibility.observe(node);
    resize.observe(node);
    return () => { visibility.disconnect(); resize.disconnect(); clearTimeout(resizeTimer); };
  }, []);

  useEffect(() => {
    if (!visible || !width || !canvasRef.current) return;
    let disposed = false;
    let cancelRender: (() => void) | undefined;
    void renderQueue.current.then(() => document.getPage(number)).then((page) => {
      if (disposed || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      // The canvas itself is scaled with the whiteboard, so account for that
      // scale when choosing the backing resolution to keep PDF text sharp.
      const desiredRatio = Math.max(1, (window.devicePixelRatio || 1) * zoom);
      const pixelRatio = Math.min(desiredRatio, 4, Math.sqrt(16000000 / (viewport.width * viewport.height)));
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const task = page.render({ canvas, canvasContext: context, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] });
      cancelRender = () => task.cancel();
      renderQueue.current = task.promise.catch((error: Error) => { if (error.name !== "RenderingCancelledException") console.error("PDF page rendering failed", error); });
    }).catch((error: Error) => { if (!disposed) console.error("PDF page loading failed", error); });
    return () => { disposed = true; cancelRender?.(); };
  }, [document, number, visible, width, zoom]);

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!tool || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointFromEvent(event);
    const next = { tool, points: [point, point] };
    draftRef.current = next;
    setDraft(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = draftRef.current;
    if (!current) return;
    event.preventDefault();
    let point = pointFromEvent(event);
    if (current.tool === "line" && event.shiftKey) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const dx = (point.x - current.points[0].x) * bounds.width;
      const dy = (point.y - current.points[0].y) * bounds.height;
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.hypot(dx, dy);
      point = { x: current.points[0].x + Math.cos(angle) * length / bounds.width, y: current.points[0].y + Math.sin(angle) * length / bounds.height };
    }
    const next = { ...current, points: current.tool === "pen" ? [...current.points, point] : [current.points[0], point] };
    draftRef.current = next;
    setDraft(next);
  };
  const onPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = draftRef.current;
    if (!current) return;
    event.stopPropagation();
    if (event.type === "pointerup") onAdd(number, current);
    draftRef.current = null;
    setDraft(null);
  };
  const shapes = draft ? [...annotations, draft] : annotations;
  return <div ref={containerRef} style={{ position: "relative", width: "100%", minHeight: 120, background: "white", boxShadow: "0 1px 8px rgba(0,0,0,.3)" }}>
    <canvas ref={canvasRef} aria-label={`PDF page ${number}`} style={{ display: "block", maxWidth: "100%" }} />
    <svg aria-label={`Annotations on PDF page ${number}`} viewBox="0 0 1 1" preserveAspectRatio="none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: tool ? "auto" : "none", touchAction: tool ? "none" : "auto", cursor: tool ? "crosshair" : "auto" }}>
      {shapes.map((shape, index) => {
        const start = shape.points[0]; const end = shape.points[shape.points.length - 1];
        if (shape.tool === "rectangle") return <rect key={index} x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)} width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)} fill="none" stroke="#e03131" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
        return <polyline key={index} points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#e03131" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  </div>;
}

export default function PdfCanvasWindow({ item, viewport, onClose, zIndex, onFocusWindow, visible, focused }: Props) {
  const [position, setPosition] = useState<Position>({ x: item.x, y: item.y, width: item.width ?? 760, height: item.height ?? 600 });
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverGroup, setHoverGroup] = useState(false);
  const [hoverButton, setHoverButton] = useState<"close" | "recenter" | "maximize" | null>(null);
  const [restorePosition, setRestorePosition] = useState<Position | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool | null>(null);
  const [history, setHistory] = useState<History>(item.history ?? { entries: [], index: 0 });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      void savePdfWindow({ ...item, ...position, history }).then(() => setStorageError(false)).catch(() => setStorageError(true));
    }, 400);
    return () => clearTimeout(timer);
  }, [item, position, history]);
  const annotations = useMemo(() => {
    const result: Record<number, Annotation[]> = {};
    for (const entry of history.entries.slice(0, history.index)) (result[entry.page] ||= []).push(entry.annotation);
    return result;
  }, [history]);
  const undo = () => setHistory((current) => ({ ...current, index: Math.max(0, current.index - 1) }));
  const redo = () => setHistory((current) => ({ ...current, index: Math.min(current.entries.length, current.index + 1) }));
  useEffect(() => {
    if (!visible || !focused) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (key === "y" || event.shiftKey) redo(); else undo();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [visible, focused]);
  const gesture = useRef<{ mode: "move" | "resize"; x: number; y: number; position: Position } | null>(null);

  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const data = await item.file.arrayBuffer();
      if (disposed) return;
      const task = pdfjs.getDocument({ data });
      destroy = () => { void task.destroy(); };
      const loaded = await task.promise;
      if (!disposed) setDocument(loaded);
    })().catch((reason: Error) => { if (!disposed) setError(reason.message || "Unable to open this PDF."); });
    return () => { disposed = true; destroy?.(); };
  }, [item.file]);

  const screen = useMemo(() => {
    const point = sceneCoordsToViewportCoords({ sceneX: position.x, sceneY: position.y }, viewport);
    return { x: point.x, y: point.y, width: position.width * viewport.zoom.value, height: position.height * viewport.zoom.value };
  }, [position, viewport]);
  const start = (event: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize") => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault(); event.stopPropagation();
    gesture.current = { mode, x: event.clientX, y: event.clientY, position };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = (event.clientX - current.x) / viewport.zoom.value;
    const dy = (event.clientY - current.y) / viewport.zoom.value;
    setPosition(current.mode === "move" ? { ...current.position, x: current.position.x + dx, y: current.position.y + dy } : { ...current.position, width: Math.max(340, current.position.width + dx), height: Math.max(240, current.position.height + dy) });
  };
  const center = () => {
    const point = viewportCoordsToSceneCoords({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }, viewport);
    setPosition((previous) => ({ ...previous, x: point.x - previous.width / 2, y: point.y - previous.height / 2 }));
  };
  const toggleMaximize = () => {
    if (restorePosition) { setPosition(restorePosition); setRestorePosition(null); return; }
    const point = viewportCoordsToSceneCoords({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }, viewport);
    const width = Math.max(340, (window.innerWidth - 80) / viewport.zoom.value);
    const height = Math.max(240, (window.innerHeight - 100) / viewport.zoom.value);
    setRestorePosition(position);
    setPosition({ x: point.x - width / 2, y: point.y - height / 2, width, height });
  };

  return (
    <div data-testid="pdf-canvas-window" onPointerDownCapture={onFocusWindow} onFocusCapture={onFocusWindow} style={{ position: "fixed", left: screen.x, top: screen.y, width: screen.width, height: screen.height, zIndex, display: visible ? "flex" : "none", flexDirection: "column", overflow: "hidden", borderRadius: 16, border: "1px solid #3b3b41", background: "#16161a", boxShadow: "0 24px 60px -12px rgba(0,0,0,.8)" }}>
      <div onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} style={{ height: 38, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 13px", background: "#202026", borderBottom: "1px solid #37373e", cursor: "grab", touchAction: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: hoverGroup ? 6 : 8, transition: "gap .18s ease" }} onMouseEnter={() => setHoverGroup(true)} onMouseLeave={() => { setHoverGroup(false); setHoverButton(null); }}>
          {([
            { id: "close", label: "Close PDF", color: "#ff5f56", glow: "255,95,86", symbol: "×", action: onClose },
            { id: "recenter", label: "Recenter PDF", color: "#ffbd2e", glow: "255,189,46", symbol: "−", action: center },
            { id: "maximize", label: restorePosition ? "Restore PDF" : "Maximize PDF", color: "#27c93f", glow: "39,201,63", symbol: restorePosition ? "↙" : "+", action: toggleMaximize },
          ] as const).map((button) => <button key={button.id} type="button" title={button.label} aria-label={button.label} onClick={button.action} onMouseEnter={() => setHoverButton(button.id)} onMouseLeave={() => setHoverButton(null)} style={{ width: hoverGroup ? 22 : 12, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: 0, padding: 0, cursor: "pointer", transition: "width .18s ease" }}><span style={{ width: hoverGroup ? (hoverButton === button.id ? 18 : 16) : 12, height: hoverGroup ? (hoverButton === button.id ? 18 : 16) : 12, borderRadius: "50%", background: button.color, border: "0.5px solid rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,.75)", fontSize: 10, fontWeight: 700, lineHeight: 1, boxShadow: hoverButton === button.id ? `0 0 10px rgba(${button.glow},.75), inset 0 1px 1px rgba(255,255,255,.4)` : "inset 0 1px 1px rgba(255,255,255,.25)", transform: hoverButton === button.id ? "scale(1.08)" : "scale(1)", transition: "width .18s ease, height .18s ease, transform .18s ease, box-shadow .18s ease" }}>{hoverGroup && button.symbol}</span></button>)}
          {hoverGroup && <span style={{ whiteSpace: "nowrap", color: "#d4d4d8", fontSize: 10, padding: "2px 8px", border: "1px solid #52525b", borderRadius: 6 }}>{hoverButton === "close" ? "Close Window" : hoverButton === "recenter" ? "Recenter in Canvas" : hoverButton === "maximize" ? (restorePosition ? "Restore Size" : "Maximize Canvas") : "Window Controls"}</span>}
        </div>
        <span title={item.file.name} style={{ marginLeft: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#d5d5dc", fontSize: 12 }}>{item.file.name}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}>
          <button type="button" title="PDF drawing tools" aria-label="PDF drawing tools" aria-expanded={toolsOpen} onClick={() => setToolsOpen((open) => !open)} style={{ display: "flex", alignItems: "center", gap: 3, border: 0, borderRadius: 5, padding: 5, background: toolsOpen || drawingTool ? "#514e83" : "transparent", color: "#e4e4e7", cursor: "pointer" }}><Pencil size={15} /><ChevronDown size={13} /></button>
        </div>
      </div>
      {toolsOpen && <div role="group" aria-label="PDF drawing tools" onPointerDown={(event) => event.stopPropagation()} style={{ position: "absolute", top: 39, right: 8, zIndex: 2, padding: 7, background: "#25252c", border: "1px solid #45454d", borderRadius: 8, boxShadow: "0 8px 24px #0008" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #45454d", paddingBottom: 5, marginBottom: 5 }}>
          <button type="button" title="Undo (Ctrl+Z)" aria-label="Undo PDF annotation" disabled={history.index === 0} onClick={undo} style={{ color: "#e4e4e7", background: "transparent", border: 0, opacity: history.index === 0 ? .35 : 1, cursor: history.index === 0 ? "default" : "pointer", padding: 5 }}><Undo2 size={16} /></button>
          <button type="button" title="Redo (Ctrl+Y)" aria-label="Redo PDF annotation" disabled={history.index === history.entries.length} onClick={redo} style={{ color: "#e4e4e7", background: "transparent", border: 0, opacity: history.index === history.entries.length ? .35 : 1, cursor: history.index === history.entries.length ? "default" : "pointer", padding: 5 }}><Redo2 size={16} /></button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>{([{ id: "pen", label: "Draw on PDF", icon: Pencil }, { id: "line", label: "Draw straight line on PDF (hold Shift to snap)", icon: Minus }, { id: "rectangle", label: "Draw rectangle on PDF", icon: Square }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" title={label} aria-label={label} aria-pressed={drawingTool === id} onClick={() => setDrawingTool((current) => current === id ? null : id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 27, height: 27, borderRadius: 5, border: 0, background: drawingTool === id ? "#514e83" : "transparent", color: "#e4e4e7", cursor: "pointer" }}><Icon size={15} /></button>)}</div>
      </div>}
      {storageError && <div role="alert" style={{ color: "#fecaca", padding: "4px 12px", fontSize: 12 }}>Could not save this PDF on this device. Check browser storage space.</div>}
      <div data-testid="pdf-pages" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: 8, background: "#292a2d" }}>
        {error ? <p role="alert" style={{ color: "#fecaca", padding: 16 }}>{error}</p> : document ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{Array.from({ length: document.numPages }, (_, index) => <PdfPage key={index} document={document} number={index + 1} tool={drawingTool} zoom={viewport.zoom.value} annotations={annotations[index + 1] || []} onAdd={(page, annotation) => setHistory((current) => ({ entries: [...current.entries.slice(0, current.index), { page, annotation }], index: current.index + 1 }))} />)}</div> : <p style={{ color: "#d4d4d8", padding: 16 }}>Loading PDF…</p>}
      </div>
      <div role="separator" aria-label="Resize PDF window" onPointerDown={(event) => start(event, "resize")} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} style={{ position: "absolute", right: 0, bottom: 0, width: 25, height: 25, cursor: "nwse-resize", touchAction: "none", background: "linear-gradient(135deg, transparent 55%, #777 57%, transparent 62%, #777 65%, transparent 70%)" }} />
    </div>
  );
}
