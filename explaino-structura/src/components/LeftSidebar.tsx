"use client";

import React, { useState } from "react";
import type { AppState } from "@/types";
import { HexColorPicker } from "react-colorful";

interface LeftSidebarProps {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  isOpen: boolean;
}

const strokeColors = [
  "#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00",
];

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
  { width: 2, label: "Normal" },
  { width: 4, label: "Bold" },
];

const roughnessOptions = [
  { value: 0, label: "Architect" },
  { value: 1, label: "Artist" },
];

export default function LeftSidebar({
  appState,
  setAppState,
  isOpen,
}: LeftSidebarProps) {
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="left-sidebar excalidraw-island">
      {/* Stroke Color */}
      <div>
        <div className="sidebar-section-label">Stroke</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {strokeColors.map((color) => (
            <button
              key={color}
              onClick={() =>
                setAppState((prev) => ({ ...prev, currentItemStrokeColor: color }))
              }
              className={`color-swatch${appState.currentItemStrokeColor === color ? " selected" : ""}`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <button
            onClick={() => setShowStrokePicker(!showStrokePicker)}
            className="color-swatch color-swatch--custom"
            title="Custom color"
          >
            <div className="color-swatch__rainbow" />
          </button>
        </div>
        {showStrokePicker && (
          <div style={{ marginTop: "10px", padding: "8px", background: "white", borderRadius: "8px", border: "1px solid #e0dfff", boxShadow: "var(--shadow-popover)" }}>
            <HexColorPicker
              color={appState.currentItemStrokeColor}
              onChange={(color) =>
                setAppState((prev) => ({ ...prev, currentItemStrokeColor: color }))
              }
            />
            <input
              type="text"
              value={appState.currentItemStrokeColor}
              onChange={(e) =>
                setAppState((prev) => ({ ...prev, currentItemStrokeColor: e.target.value }))
              }
              className="color-hex-input"
            />
          </div>
        )}
      </div>

      {/* Background Color */}
      <div>
        <div className="sidebar-section-label">Background</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {bgColors.map((bg) => (
            <button
              key={bg.color}
              onClick={() =>
                setAppState((prev) => ({ ...prev, currentItemBackgroundColor: bg.color }))
              }
              className={`color-swatch${appState.currentItemBackgroundColor === bg.color ? " selected" : ""}`}
              title={bg.label}
            >
              {bg.color === "transparent" ? (
                <div className="color-swatch__transparent">
                  <div className="color-swatch__transparent-line" />
                </div>
              ) : (
                <div style={{ width: "100%", height: "100%", backgroundColor: bg.color }} />
              )}
            </button>
          ))}
          <button
            onClick={() => setShowBgPicker(!showBgPicker)}
            className="color-swatch color-swatch--custom"
            title="Custom background color"
          >
            <div className="color-swatch__rainbow" />
          </button>
        </div>
        {showBgPicker && (
          <div style={{ marginTop: "10px", padding: "8px", background: "white", borderRadius: "8px", border: "1px solid #e0dfff", boxShadow: "var(--shadow-popover)" }}>
            <HexColorPicker
              color={
                appState.currentItemBackgroundColor === "transparent"
                  ? "#ffffff"
                  : appState.currentItemBackgroundColor
              }
              onChange={(color) =>
                setAppState((prev) => ({ ...prev, currentItemBackgroundColor: color }))
              }
            />
          </div>
        )}
      </div>

      {/* Stroke width */}
      <div>
        <div className="sidebar-section-label">Stroke width</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {strokeWidthOptions.map((opt) => (
            <button
              key={opt.width}
              onClick={() =>
                setAppState((prev) => ({ ...prev, currentItemStrokeWidth: opt.width }))
              }
              className={`tool-icon-btn${appState.currentItemStrokeWidth === opt.width ? " active" : ""}`}
              style={{ flex: 1 }}
              title={opt.label}
            >
              <div
                style={{
                  width: 16,
                  height: opt.width,
                  borderRadius: 9999,
                  backgroundColor: "currentColor",
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Pressure / Roughness */}
      <div>
        <div className="sidebar-section-label">Pressure</div>
        <div style={{ display: "flex", gap: "6px" }}>
          {roughnessOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                setAppState((prev) => ({ ...prev, currentItemRoughness: opt.value }))
              }
              className={`tool-icon-btn${appState.currentItemRoughness === opt.value ? " active" : ""}`}
              style={{ flex: 1 }}
              title={opt.label}
            >
              <svg width="20" height="12" viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {opt.value === 0 && <path d="M1 6c2-4 4 4 6 0s4 4 6 0 4 4 6 0" />}
                {opt.value === 1 && <path d="M1 6c2-6 3 6 5-1s3 7 5-1 3 7 5-1" />}
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div>
        <div className="sidebar-section-label">Opacity</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="range"
            min="0"
            max="100"
            value={appState.currentItemOpacity}
            onChange={(e) =>
              setAppState((prev) => ({ ...prev, currentItemOpacity: Number(e.target.value) }))
            }
            className="opacity-slider"
          />
          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-gray-70)", minWidth: "26px", textAlign: "right" }}>
            {appState.currentItemOpacity}
          </span>
        </div>
      </div>
    </div>
  );
}