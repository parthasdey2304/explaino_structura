/**
 * @file useListMode.ts
 * @description Custom hook that manages ordered/bullet list formatting for
 * Excalidraw canvas text elements. While `listMode` is active, pressing Enter
 * inside a text area automatically continues the list with the appropriate
 * marker. Extracted from ExcalidrawWrapper (graphify issue #26).
 *
 * @version 1.1.0
 */

import { useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** The two supported list kinds, or `null` when list mode is off. */
export type ListMode = "ordered" | "bullet" | null;

/**
 * Return value of `useListMode`.
 */
export interface ListModeHandle {
  /** The currently active list mode (null = off). */
  listMode: ListMode;
  /**
   * Toggle ordered or bullet list formatting for a specific text element.
   * Calling with the same `kind` as the current mode removes the formatting.
   *
   * @param id   - Excalidraw element ID of the target text element.
   * @param kind - List style to apply or toggle off.
   */
  applyListToText: (id: string, kind: "ordered" | "bullet") => void;
  /** Directly set the list mode (e.g. to turn it off after element deselect). */
  setListMode: React.Dispatch<React.SetStateAction<ListMode>>;
}

/**
 * `useListMode` — manages canvas-text list mode lifecycle.
 *
 * @param excalidrawAPI     - Ref to the Excalidraw imperative API.
 * @param handleUpdateText  - Callback that writes updated text back to the canvas.
 */
export function useListMode(
  excalidrawAPI: React.MutableRefObject<ExcalidrawImperativeAPI | null>,
  handleUpdateText: (id: string, raw: string) => void
): ListModeHandle {
  const [listMode, setListMode] = useState<ListMode>(null);

  // Auto-continue the list on Enter while a text area is focused.
  useEffect(() => {
    if (!listMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const ta = document.querySelector<HTMLTextAreaElement>(".excalidraw textarea");
      if (!ta || document.activeElement !== ta) return;
      e.preventDefault();
      const v = ta.value;
      const pos = ta.selectionStart ?? v.length;
      let marker: string;
      if (listMode === "ordered") {
        let n = 0;
        for (const line of v.split("\n")) if (/^\s*\d+\.\s/.test(line)) n++;
        marker = `${n + 1}. `;
      } else {
        marker = "• ";
      }
      const next = v.slice(0, pos) + "\n" + marker + v.slice(ta.selectionEnd ?? pos);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (!setter) return;
      setter.call(ta, next);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      const np = pos + 1 + marker.length;
      ta.setSelectionRange(np, np);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listMode]);

  const applyListToText = useCallback(
    (id: string, kind: "ordered" | "bullet") => {
      const api = excalidrawAPI.current;
      if (!api) return;
      const target = api.getSceneElements().find((el) => el.id === id);
      if (!target || target.isDeleted || target.type !== "text") return;
      const t = target as unknown as { text?: string; customData?: { markdownRaw?: string } };
      const current =
        typeof t.customData?.markdownRaw === "string" ? t.customData.markdownRaw : (t.text ?? "");
      const lines = current.split("\n");
      const nonEmpty = lines.filter((l) => l.trim());
      const stripLine = (l: string) => l.replace(/^\s*(?:\d+[.)]\s*|[•\-*]\s*)/, "").trimEnd();
      const isOrdered = nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*\d+[.)]\s/.test(l));
      const isBulleted = nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*[•\-*]\s/.test(l));
      let listed: string;
      if ((kind === "ordered" && isOrdered) || (kind === "bullet" && isBulleted)) {
        listed = lines.map(stripLine).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      } else if (kind === "ordered") {
        let n = 0;
        listed = lines.map((l) => { const s = stripLine(l); if (!s) return ""; n += 1; return `${n}. ${s}`; }).join("\n");
      } else {
        listed = lines.map((l) => { const s = stripLine(l); return s ? `• ${s}` : ""; }).join("\n");
      }
      handleUpdateText(id, listed);
      setListMode(kind);
    },
    [excalidrawAPI, handleUpdateText]
  );

  return { listMode, applyListToText, setListMode };
}
