"use client";

import React from "react";
import type { AppState } from "@/types";

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNewDrawing: () => void;
  onExportPNG: () => void;
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
}

export default function HamburgerMenu({
  isOpen,
  onClose,
  onNewDrawing,
  onExportPNG,
  appState,
  setAppState,
}: HamburgerMenuProps) {
  if (!isOpen) return null;

  const toggleTheme = () => {
    setAppState((prev) => ({
      ...prev,
      theme: prev.theme === "dark" ? "light" : "dark",
    }));
  };

  const menuItems = [
    { label: "Open...", action: () => alert("Open functionality coming soon!") },
    { label: "Save to...", action: () => alert("Save functionality coming soon!") },
    { label: "Export image...", shortcut: "Ctrl+Shift+E", action: onExportPNG },
    { divider: true },
    { label: "Help", action: () => alert("Help documentation coming soon!") },
    { label: "Reset the canvas", action: onNewDrawing },
    { divider: true },
    {
      label: appState.theme === "dark" ? "Light mode" : "Dark mode",
      shortcut: "Alt+Shift+D",
      action: toggleTheme,
    },
    { divider: true },
    {
      label: "GitHub",
      action: () =>
        window.open("https://github.com/excalidraw/excalidraw", "_blank"),
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="hamburger-menu excalidraw-island">
        {menuItems.map((item, i) => {
          if (item.divider) {
            return <div key={i} className="hamburger-menu__divider" />;
          }
          return (
            <button
              key={i}
              onClick={() => {
                item.action?.();
                onClose();
              }}
              className="hamburger-menu__item"
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="hamburger-menu__shortcut">
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}