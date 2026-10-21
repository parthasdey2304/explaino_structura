/**
 * @file useCanvasShortcuts.ts
 * @description Custom hook that registers global keyboard shortcuts for the canvas:
 * - Ctrl+Shift+P / Cmd+Shift+P / Ctrl+K / Cmd+K: toggles Command Palette
 * - Ctrl+` / Cmd+`: opens Terminal
 * - Ctrl+C / Cmd+C: opens Code editor (when no text input is focused)
 * - Escape: exits Laser pointer mode
 *
 * Extracted from ExcalidrawWrapper (graphify issue #26).
 *
 * @version 1.1.0
 */

import { useEffect } from "react";

export interface CanvasShortcutHandlers {
  onTogglePalette: () => void;
  onOpenTerminal: () => void;
  onOpenCodeEditor: () => void;
  onExitLaser: () => void;
  isCodePanelOpen: boolean;
  isLaserActive: boolean;
}

/**
 * Checks if a keyboard event target is currently an editable text field.
 */
function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    "input, textarea, [contenteditable='true'], .cm-content, select"
  );
}

/**
 * `useCanvasShortcuts` — hooks up all global canvas hotkeys.
 */
export function useCanvasShortcuts({
  onTogglePalette,
  onOpenTerminal,
  onOpenCodeEditor,
  onExitLaser,
  isCodePanelOpen,
  isLaserActive,
}: CanvasShortcutHandlers): void {
  // Command palette toggle (Ctrl/Cmd+Shift+P or Ctrl/Cmd+K)
  useEffect(() => {
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
  }, [onTogglePalette]);

  // Terminal & Code editor hotkeys (Ctrl+` and Ctrl+C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      if (e.key === "`") {
        e.preventDefault();
        onOpenTerminal();
        return;
      }

      if (e.key.toLowerCase() === "c") {
        if (isCodePanelOpen) return;
        if (isEditableElement(e.target)) return;
        e.preventDefault();
        onOpenCodeEditor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCodePanelOpen, onOpenCodeEditor, onOpenTerminal]);

  // Escape to exit laser pointer
  useEffect(() => {
    if (!isLaserActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitLaser();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLaserActive, onExitLaser]);
}
