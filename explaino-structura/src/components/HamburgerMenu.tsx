"use client";

import React from "react";

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNewDrawing: () => void;
  onExportPNG: () => void;
}

export default function HamburgerMenu({
  isOpen,
  onClose,
  onNewDrawing,
  onExportPNG,
}: HamburgerMenuProps) {
  if (!isOpen) return null;

  const menuItems = [
    {
      label: "Export image…",
      shortcut: "Ctrl+Shift+E",
      action: onExportPNG,
    },
    { divider: true },
    { label: "Reset the canvas", action: onNewDrawing },
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