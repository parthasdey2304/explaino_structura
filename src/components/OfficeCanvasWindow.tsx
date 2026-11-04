"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { Zoom } from "@excalidraw/excalidraw/types";
import { Download, Minus, MoveUpRight, X } from "lucide-react";
import { openOfficeFile, type OfficePackage, type OfficeWindowItem } from "@/lib/officeFiles";
import { saveOfficeWindow } from "@/lib/officeWindowStore";
import OfficeFileContent from "./OfficeFileContent";

interface Viewport { zoom: Zoom; offsetLeft: number; offsetTop: number; scrollX: number; scrollY: number }
interface Position { x: number; y: number; width: number; height: number }
interface Props { item: OfficeWindowItem; viewport: Viewport; onClose: () => void; onFocusWindow: () => void; zIndex: number; visible: boolean }
class ContentBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <p role="alert" style={{ color: "#fecaca", padding: 20 }}>{this.state.error}</p> : this.props.children; }
}

export default function OfficeCanvasWindow({ item, viewport, onClose, onFocusWindow, zIndex, visible }: Props) {
  const [position, setPosition] = useState<Position>({ x: item.x, y: item.y, width: item.width ?? 850, height: item.height ?? 620 });
  const [document, setDocument] = useState<OfficePackage | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>(item.edits ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [restore, setRestore] = useState<Position | null>(null);
  const openedDocument = useRef<OfficePackage | null>(null);
  const gesture = useRef<{ mode: "move" | "resize"; x: number; y: number; position: Position } | null>(null);
  useEffect(() => {
    if (!visible || openedDocument.current) return;
    let disposed = false;
    void openOfficeFile(item.file).then((file) => { if (disposed) file.destroy(); else { openedDocument.current = file; setDocument(file); } }).catch((reason: Error) => { if (!disposed) setError(reason.message); });
    return () => { disposed = true; };
  }, [item.file, visible]);
  useEffect(() => () => { openedDocument.current?.destroy(); }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void saveOfficeWindow({ ...item, ...position, edits }).then(() => setSaveError(false)).catch(() => setSaveError(true)); }, 250);
    return () => clearTimeout(timer);
  }, [item, position, edits]);
  const screen = useMemo(() => {
    const point = sceneCoordsToViewportCoords({ sceneX: position.x, sceneY: position.y }, viewport);
    return { x: point.x, y: point.y, width: position.width * viewport.zoom.value, height: position.height * viewport.zoom.value };
  }, [position, viewport]);
  const start = (event: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize") => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault(); event.stopPropagation(); gesture.current = { mode, x: event.clientX, y: event.clientY, position }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = gesture.current; if (!state) return;
    const dx = (event.clientX - state.x) / viewport.zoom.value; const dy = (event.clientY - state.y) / viewport.zoom.value;
    setPosition(state.mode === "move" ? { ...state.position, x: state.position.x + dx, y: state.position.y + dy } : { ...state.position, width: Math.max(400, state.position.width + dx), height: Math.max(260, state.position.height + dy) });
  };
  const maximize = () => {
    if (restore) { setPosition(restore); setRestore(null); return; }
    setRestore(position); const point = viewportCoordsToSceneCoords({ clientX: 40, clientY: 70 }, viewport);
    setPosition({ x: point.x, y: point.y, width: (window.innerWidth - 80) / viewport.zoom.value, height: (window.innerHeight - 110) / viewport.zoom.value });
  };
  const center = () => {
    const point = viewportCoordsToSceneCoords({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }, viewport);
    setPosition((state) => ({ ...state, x: point.x - state.width / 2, y: point.y - state.height / 2 }));
  };
  const download = async () => {
    if (!document) return; setExporting(true);
    try {
      const bytes = await document.export(edits); const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: item.file.type || "application/octet-stream" }));
      const link = window.document.createElement("a"); link.href = url; link.download = item.file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (reason) { setError((reason as Error).message); } finally { setExporting(false); }
  };
  return <section aria-label={`${item.kind.toUpperCase()} window: ${item.file.name}`} data-testid="office-canvas-window" onPointerDownCapture={onFocusWindow} onFocusCapture={onFocusWindow} style={{ position: "fixed", left: screen.x, top: screen.y, width: screen.width, height: screen.height, zIndex, display: visible ? "flex" : "none", flexDirection: "column", overflow: "hidden", borderRadius: 16, border: "1px solid #3b3b41", background: "#202026", boxShadow: "0 24px 60px -12px #000c" }}>
    <div onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} style={{ height: 38, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 13px", background: "#202026", borderBottom: "1px solid #37373e", cursor: "grab", touchAction: "none", color: "#d5d5dc" }}>
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ display: "flex", gap: 7, alignItems: "center" }}>
        {([{ label: "Close window", color: "#ff5f56", Icon: X, action: onClose }, { label: "Recenter in canvas", color: "#ffbd2e", Icon: Minus, action: center }, { label: restore ? "Restore window" : "Maximize window", color: "#27c93f", Icon: MoveUpRight, action: maximize }]).map(({ label, color, Icon, action }) => <button key={color} type="button" title={label} aria-label={label} onClick={action} style={{ width: hovered ? 20 : 12, height: hovered ? 20 : 12, border: 0, padding: 0, borderRadius: "50%", background: color, color: "#202026", display: "flex", alignItems: "center", justifyContent: "center", transition: "width .18s, height .18s", cursor: "pointer" }}>{hovered && <Icon size={12} />}</button>)}
      </div>
      <span title={item.file.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, marginLeft: 10 }}>{item.file.name}</span>
      <button type="button" aria-label="Download edited file" title="Download edited file" disabled={!document || exporting} onClick={() => void download()} style={{ marginLeft: "auto", background: "transparent", color: "inherit", border: 0, padding: 4, cursor: "pointer" }}><Download size={16} /></button>
    </div>
    {saveError && <p role="alert" style={{ color: "#fecaca", padding: 8 }}>Could not save on this device. Download your edited file before closing.</p>}
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", overscrollBehavior: "contain", padding: item.kind === "docx" ? 12 : 0, background: "#303138" }}>
      {error ? <p role="alert" style={{ color: "#fecaca", padding: 20 }}>{error}</p> : document ? <ContentBoundary><OfficeFileContent document={document} kind={item.kind} edits={edits} onEdit={(key, value) => setEdits((previous) => ({ ...previous, [key]: value }))} /></ContentBoundary> : <p style={{ color: "#d4d4d8", padding: 20 }}>Opening {item.file.name}…</p>}
    </div>
    <div style={{ padding: "5px 12px", fontSize: 11, color: "#c4c4cc", flexShrink: 0 }}>Text and cell editing · Advanced layouts may differ · Recovery is saved on this browser</div>
    <div role="separator" aria-label="Resize document window" onPointerDown={(event) => start(event, "resize")} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} style={{ position: "absolute", right: 0, bottom: 0, width: 24, height: 24, cursor: "nwse-resize", touchAction: "none", background: "linear-gradient(135deg, transparent 55%, #777 57%, transparent 62%, #777 65%, transparent 70%)" }} />
  </section>;
}
