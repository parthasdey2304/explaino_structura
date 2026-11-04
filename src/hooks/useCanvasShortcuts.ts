/**
 * @file useCanvasShortcuts.ts
 * @description Custom hook that registers global keyboard shortcuts for the canvas:
 * - Ctrl+Shift+P / Cmd+Shift+P / Ctrl+K / Cmd+K: toggles Command Palette
 * - Escape: exits Laser pointer mode
 *
 * When `isScreenActive` is true (user is working inside Code Server), global canvas
 * hotkeys are disabled so all keystrokes route directly to the embedded code-server.
 *
 * Extracted from ExcalidrawWrapper (graphify issue #26).
 *
 * @version 1.2.0
 */

import { useEffect } from "react";

export interface CanvasShortcutHandlers {
  onTogglePalette: () => void;
  onExitLaser: () => void;
  isLaserActive: boolean;
  isScreenActive?: boolean;
}

/**
 * `useCanvasShortcuts` — hooks up all global canvas hotkeys.
 */
export function useCanvasShortcuts({
  onTogglePalette,
  onExitLaser,
  isLaserActive,
  isScreenActive = false,
}: CanvasShortcutHandlers): void {
  // Command palette toggle (Ctrl/Cmd+Shift+P or Ctrl/Cmd+K)
  useEffect(() => {
    if (isScreenActive) return;

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const paletteKey =
        (mod && e.shiftKey && e.key.toLowerCase() === "p") ||
        (mod && !e.shiftKey && e.key.toLowerCase() === "k");
      if (!paletteKey) return;

      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing && e.key.toLowerCase() === "k") return;

      e.preventDefault();
      e.stopPropagation();
      onTogglePalette();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onTogglePalette, isScreenActive]);

  // Escape to exit laser pointer
  useEffect(() => {
    if (!isLaserActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onExitLaser();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isLaserActive, onExitLaser]);
}
