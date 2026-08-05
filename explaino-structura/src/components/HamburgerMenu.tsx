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
    { label: "Open", shortcut: "Ctrl+O", action: () => alert("Open coming soon!") },
    { label: "Save to...", action: () => alert("Save coming soon!") },
    { label: "Export image...", shortcut: "Ctrl+Shift+E", action: onExportPNG },
    { label: "Live collaboration...", action: () => alert("Collab coming soon!") },
    { label: "Command palette", shortcut: "Ctrl+/", color: "var(--color-primary)", action: () => alert("Command Palette") },
    { label: "Find on canvas", shortcut: "Ctrl+F", action: () => alert("Find") },
    { label: "Help", shortcut: "?", action: () => alert("Help documentation") },
    { label: "Reset the canvas", action: onNewDrawing },
    { divider: true },
    { label: "Excalidraw+", action: () => alert("Excalidraw+") },
    { label: "GitHub", action: () => window.open("https://github.com/excalidraw/excalidraw", "_blank") },
    { label: "Follow us", action: () => alert("Follow us") },
    { label: "Discord chat", action: () => alert("Discord") },
    { label: "Sign up", color: "var(--color-primary)", action: () => alert("Sign up") },
    { divider: true },
    {
      label: appState.theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
      shortcut: "Alt+Shift+D",
      action: toggleTheme,
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="hamburger-menu excalidraw-island" style={{ padding: "8px 0" }}>
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
              style={{ color: item.color || "inherit", padding: "8px 16px" }}
            >
              <span style={{ fontWeight: item.color ? 600 : 400 }}>{item.label}</span>
              {item.shortcut && (
                <span className="hamburger-menu__shortcut" style={{ color: item.color ? "var(--color-primary)" : "var(--color-gray-40)" }}>
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