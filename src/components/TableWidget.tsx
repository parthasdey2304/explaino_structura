"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus, GripHorizontal } from "lucide-react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type { Zoom } from "@excalidraw/excalidraw/types";

interface TableWidgetProps {
  id: string;
  sceneX: number;
  sceneY: number;
  rows: number;
  cols: number;
  viewport: { zoom: Zoom; offsetLeft: number; offsetTop: number; scrollX: number; scrollY: number };
  isActive: boolean;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onMove: (id: string, sceneX: number, sceneY: number) => void;
  onResize: (id: string, rows: number, cols: number) => void;
  onClose: (id: string) => void;
}

export default function TableWidget({
  id,
  sceneX,
  sceneY,
  rows,
  cols,
  viewport,
  isActive,
  onActivate,
  onDeactivate,
  onMove,
  onResize,
  onClose,
}: TableWidgetProps) {
  const [cells, setCells] = useState<string[][]>(() =>
    Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""))
  );
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCells((prev) =>
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => prev[r]?.[c] ?? "")
      )
    );
  }, [rows, cols]);

  const cellW = 70;
  const cellH = 30;

  const vp = sceneCoordsToViewportCoords({ sceneX, sceneY }, viewport);

  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!isActive) onActivate(id);

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startSceneX = sceneX;
      const startSceneY = sceneY;

      const handleMouseMove = (ev: MouseEvent) => {
        const z = viewport.zoom.value;
        const dx = (ev.clientX - startClientX) / z;
        const dy = (ev.clientY - startClientY) / z;
        onMove(id, startSceneX + dx, startSceneY + dy);
      };

      const handleMouseUp = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [viewport.zoom, sceneX, sceneY, id, onMove, isActive, onActivate]
  );

  const handleCellChange = useCallback((r: number, c: number, value: string) => {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = value;
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    onResize(id, rows + 1, cols);
  }, [id, rows, cols, onResize]);

  const addCol = useCallback(() => {
    onResize(id, rows, cols + 1);
  }, [id, rows, cols, onResize]);

  return (
    <div
      ref={tableRef}
      className="table-widget"
      style={{
        position: "fixed",
        left: vp.x,
        top: vp.y,
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      {/* Drag handle / title — always interactive */}
      <div
        className="table-widget__header"
        onMouseDown={handleHeaderMouseDown}
        style={{ pointerEvents: "auto", cursor: "grab" }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isActive) onActivate(id);
        }}
      >
        <GripHorizontal size={14} />
        <span>Table</span>
        <button
          type="button"
          className="table-widget__close"
          onClick={(e) => {
            e.stopPropagation();
            onClose(id);
          }}
          style={{ pointerEvents: "auto" }}
        >
          <X size={12} />
        </button>
      </div>

      <div className="table-widget__wrapper">
        <div className="table-widget__grid">
          {cells.map((row, r) => (
            <div key={r} className="table-widget__row">
              {row.map((val, c) => (
                <div
                  key={c}
                  className="table-widget__cell"
                  style={{
                    width: cellW,
                    height: cellH,
                    pointerEvents: isActive ? "auto" : "none",
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!isActive) onActivate(id);
                    setEditingCell({ r, c });
                  }}
                >
                  {editingCell?.r === r && editingCell?.c === c ? (
                    <input
                      autoFocus
                      className="table-widget__cell-input"
                      value={val}
                      onChange={(e) => handleCellChange(r, c, e.target.value)}
                      onBlur={() => setEditingCell(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingCell(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="table-widget__cell-text">{val}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          className="table-widget__add-col"
          style={{ pointerEvents: isActive ? "auto" : "none" }}
        >
          <button type="button" className="table-widget__plus" onClick={addCol} title="Add column">
            <Plus size={12} />
          </button>
        </div>

        <div
          className="table-widget__add-row"
          style={{ pointerEvents: isActive ? "auto" : "none" }}
        >
          <button type="button" className="table-widget__plus" onClick={addRow} title="Add row">
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Invisible activation overlay — covers the whole table when inactive.
          Clicking it activates the table. Since the parent has pointer-events: none,
          this is the ONLY part that captures clicks on an inactive table. */}
      {!isActive && (
        <div
          className="table-widget__overlay"
          onClick={(e) => {
            e.stopPropagation();
            onActivate(id);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Click to activate table"
        />
      )}
    </div>
  );
}
