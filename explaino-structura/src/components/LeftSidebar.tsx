"use client";

import React, { useState } from "react";
import type { AppState, ToolType } from "@/types";
import { HexColorPicker } from "react-colorful";

interface LeftSidebarProps {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  isOpen: boolean;
  activeTool: ToolType;
}

const strokeColors = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const bgColors = [
  { color: "transparent", label: "Transparent" },
  { color: "#ffc9c9", label: "Light red" },
  { color: "#b2f2bb", label: "Light green" },
  { color: "#a5d8ff", label: "Light blue" },
  { color: "#ffec99", label: "Light yellow" },
  { color: "#e9ecef", label: "Light gray" },
];

const strokeWidthOptions = [
  { width: 1, label: "Thin" },
  { width: 2, label: "Bold" },
  { width: 4, label: "Extra Bold" },
];

const roughnessOptions = [
  { value: 0, label: "Architect" },
  { value: 1, label: "Artist" },
  { value: 2, label: "Cartoonist" },
];

const fillStyleOptions = [
  { value: "hachure", label: "Hachure" },
  { value: "cross-hatch", label: "Cross-hatch" },
  { value: "solid", label: "Solid" },
];

const strokeStyleOptions = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

const edgeOptions = [
  { value: 0, label: "Sharp" },
  { value: 3, label: "Round" },
];

const fontFamilyOptions = [
  { value: 1, label: "Hand-drawn" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Code" },
];

const fontSizeOptions = [
  { value: 16, label: "S" },
  { value: 20, label: "M" },
  { value: 28, label: "L" },
  { value: 36, label: "XL" },
];

const textAlignOptions = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export default function LeftSidebar({ appState, setAppState, isOpen, activeTool }: LeftSidebarProps) {
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);

  if (!isOpen) return null;
  if (activeTool === "selection" || activeTool === "pan" || activeTool === "eraser" || activeTool === "laser") {
    return null;
  }

  const showStroke = true; // All drawing tools have stroke
  const showBackground = ["rectangle", "ellipse", "diamond"].includes(activeTool);
  const showFillStyle = ["rectangle", "ellipse", "diamond"].includes(activeTool);
  const showStrokeWidth = ["rectangle", "ellipse", "diamond", "line", "arrow", "freedraw"].includes(activeTool);
  const showStrokeStyle = ["rectangle", "ellipse", "diamond", "line", "arrow"].includes(activeTool);
  const showSloppiness = ["rectangle", "ellipse", "diamond", "line", "arrow", "freedraw"].includes(activeTool);
  const showEdges = ["rectangle", "diamond", "line", "arrow"].includes(activeTool);
  const showTextProperties = activeTool === "text";
  const showOpacity = true;

  return (
    <div className="left-sidebar excalidraw-island" style={{ overflowY: "auto", maxHeight: "calc(100vh - 120px)" }}>
      
      {/* Stroke Color */}
      {showStroke && (
        <div>
          <div className="sidebar-section-label">Stroke</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {strokeColors.map((color) => (
              <button
                key={color}
                onClick={() => setAppState((prev) => ({ ...prev, currentItemStrokeColor: color }))}
                className={`color-swatch${appState.currentItemStrokeColor === color ? " selected" : ""}`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            <button onClick={() => setShowStrokePicker(!showStrokePicker)} className="color-swatch color-swatch--custom" title="Custom color">
              <div className="color-swatch__rainbow" />
            </button>
          </div>
          {showStrokePicker && (
            <div style={{ marginTop: "10px", padding: "8px", background: "white", borderRadius: "8px", border: "1px solid #e0dfff", boxShadow: "var(--shadow-popover)" }}>
              <HexColorPicker color={appState.currentItemStrokeColor} onChange={(color) => setAppState((prev) => ({ ...prev, currentItemStrokeColor: color }))} />
              <input type="text" value={appState.currentItemStrokeColor} onChange={(e) => setAppState((prev) => ({ ...prev, currentItemStrokeColor: e.target.value }))} className="color-hex-input" />
            </div>
          )}
        </div>
      )}

      {/* Background Color */}
      {showBackground && (
        <div>
          <div className="sidebar-section-label">Background</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {bgColors.map((bg) => (
              <button
                key={bg.color}
                onClick={() => setAppState((prev) => ({ ...prev, currentItemBackgroundColor: bg.color }))}
                className={`color-swatch${appState.currentItemBackgroundColor === bg.color ? " selected" : ""}`}
                title={bg.label}
              >
                {bg.color === "transparent" ? (
                  <div className="color-swatch__transparent"><div className="color-swatch__transparent-line" /></div>
                ) : (
                  <div style={{ width: "100%", height: "100%", backgroundColor: bg.color }} />
                )}
              </button>
            ))}
            <button onClick={() => setShowBgPicker(!showBgPicker)} className="color-swatch color-swatch--custom" title="Custom background color">
              <div className="color-swatch__rainbow" />
            </button>
          </div>
          {showBgPicker && (
            <div style={{ marginTop: "10px", padding: "8px", background: "white", borderRadius: "8px", border: "1px solid #e0dfff", boxShadow: "var(--shadow-popover)" }}>
              <HexColorPicker color={appState.currentItemBackgroundColor === "transparent" ? "#ffffff" : appState.currentItemBackgroundColor} onChange={(color) => setAppState((prev) => ({ ...prev, currentItemBackgroundColor: color }))} />
            </div>
          )}
        </div>
      )}

      {/* Fill Style */}
      {showFillStyle && (
        <div>
          <div className="sidebar-section-label">Fill</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {fillStyleOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAppState((prev) => ({ ...prev, currentItemFillStyle: opt.value as AppState["currentItemFillStyle"] }))}
                className={`tool-icon-btn${appState.currentItemFillStyle === opt.value ? " active" : ""}`}
                style={{ flex: 1, fontSize: "11px", fontWeight: 600 }}
                title={opt.label}
              >
                {opt.label.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stroke width */}
      {showStrokeWidth && (
        <div>
          <div className="sidebar-section-label">Stroke width</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {strokeWidthOptions.map((opt) => (
              <button
                key={opt.width}
                onClick={() => setAppState((prev) => ({ ...prev, currentItemStrokeWidth: opt.width }))}
                className={`tool-icon-btn${appState.currentItemStrokeWidth === opt.width ? " active" : ""}`}
                style={{ flex: 1 }}
                title={opt.label}
              >
                <div style={{ width: 16, height: opt.width, borderRadius: 9999, backgroundColor: "currentColor" }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stroke style */}
      {showStrokeStyle && (
        <div>
          <div className="sidebar-section-label">Stroke style</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {strokeStyleOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAppState((prev) => ({ ...prev, currentItemStrokeStyle: opt.value as AppState["currentItemStrokeStyle"] }))}
                className={`tool-icon-btn${appState.currentItemStrokeStyle === opt.value ? " active" : ""}`}
                style={{ flex: 1 }}
                title={opt.label}
              >
                <svg width="24" height="6" viewBox="0 0 24 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  {opt.value === "solid" && <line x1="2" y1="3" x2="22" y2="3" />}
                  {opt.value === "dashed" && <line x1="2" y1="3" x2="22" y2="3" strokeDasharray="6 4" />}
                  {opt.value === "dotted" && <line x1="2" y1="3" x2="22" y2="3" strokeDasharray="2 4" />}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sloppiness */}
      {showSloppiness && (
        <div>
          <div className="sidebar-section-label">Sloppiness</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {roughnessOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAppState((prev) => ({ ...prev, currentItemRoughness: opt.value }))}
                className={`tool-icon-btn${appState.currentItemRoughness === opt.value ? " active" : ""}`}
                style={{ flex: 1 }}
                title={opt.label}
              >
                <svg width="20" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  {opt.value === 0 && <path d="M1 6c2-4 4 4 6 0s4 4 6 0 4 4 6 0" />}
                  {opt.value === 1 && <path d="M1 6c2-6 3 6 5-1s3 7 5-1 3 7 5-1" />}
                  {opt.value === 2 && <path d="M1 6c2-8 3 8 5-2s3 9 5-2 3 9 5-2" />}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Edges */}
      {showEdges && (
        <div>
          <div className="sidebar-section-label">Edges</div>
          <div style={{ display: "flex", gap: "6px" }}>
            {edgeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAppState((prev) => ({ ...prev, currentItemRoundness: opt.value }))}
                className={`tool-icon-btn${appState.currentItemRoundness === opt.value || (appState.currentItemRoundness === null && opt.value === 0) ? " active" : ""}`}
                style={{ flex: 1 }}
                title={opt.label}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  {opt.value === 0 ? (
                    <polyline points="4 20 4 4 20 4" />
                  ) : (
                    <path d="M4 20V8a4 4 0 0 1 4-4h12" />
                  )}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Text Properties */}
      {showTextProperties && (
        <>
          <div>
            <div className="sidebar-section-label">Font family</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {fontFamilyOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAppState((prev) => ({ ...prev, currentItemFontFamily: opt.value }))}
                  className={`tool-icon-btn${appState.currentItemFontFamily === opt.value ? " active" : ""}`}
                  style={{ flex: 1, fontSize: "11px", fontWeight: 600 }}
                  title={opt.label}
                >
                  {opt.label.substring(0, 4)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="sidebar-section-label">Font size</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {fontSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAppState((prev) => ({ ...prev, currentItemFontSize: opt.value }))}
                  className={`tool-icon-btn${appState.currentItemFontSize === opt.value ? " active" : ""}`}
                  style={{ flex: 1, fontSize: "12px", fontWeight: 600 }}
                  title={opt.label}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="sidebar-section-label">Text align</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {textAlignOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAppState((prev) => ({ ...prev, currentItemTextAlign: opt.value as AppState["currentItemTextAlign"] }))}
                  className={`tool-icon-btn${appState.currentItemTextAlign === opt.value ? " active" : ""}`}
                  style={{ flex: 1 }}
                  title={opt.label}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {opt.value === "left" && <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="19" y2="18"/></>}
                    {opt.value === "center" && <><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></>}
                    {opt.value === "right" && <><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="5" y1="18" x2="21" y2="18"/></>}
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Opacity */}
      {showOpacity && (
        <div>
          <div className="sidebar-section-label">Opacity</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="range"
              min="0"
              max="100"
              value={appState.currentItemOpacity}
              onChange={(e) => setAppState((prev) => ({ ...prev, currentItemOpacity: Number(e.target.value) }))}
              className="opacity-slider"
            />
            <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-gray-70)", minWidth: "26px", textAlign: "right" }}>
              {appState.currentItemOpacity}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}