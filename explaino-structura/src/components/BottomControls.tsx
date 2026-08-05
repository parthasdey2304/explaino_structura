"use client";

import React from "react";

interface BottomControlsProps {
  zoomValue: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export default function BottomControls({
  zoomValue,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: BottomControlsProps) {
  return (
    <>
      {/* Bottom-left: zoom + undo/redo */}
      <div className="bottom-controls-left">
        <div className="excalidraw-island zoom-island">
          <button
            onClick={onZoomOut}
            className="tool-icon-btn"
            title="Zoom out (Ctrl+-)"
            id="zoom-out-button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            onClick={onResetZoom}
            className="zoom-label"
            title="Reset zoom (Ctrl+Shift+H)"
            id="zoom-reset-button"
          >
            {Math.round(zoomValue * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            className="tool-icon-btn"
            title="Zoom in (Ctrl++)"
            id="zoom-in-button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <div className="excalidraw-island undo-island">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="tool-icon-btn"
            title="Undo (Ctrl+Z)"
            id="undo-button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="tool-icon-btn"
            title="Redo (Ctrl+Y)"
            id="redo-button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom-right: privacy + help */}
      <div className="bottom-controls-right">
        <button
          className="tool-icon-btn excalidraw-island"
          style={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%" }}
          title="Saved locally"
          id="local-save-indicator"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        </button>
        <button
          className="tool-icon-btn excalidraw-island"
          style={{ width: "2.25rem", height: "2.25rem", borderRadius: "50%" }}
          title="Help"
          id="help-button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>
    </>
  );
}