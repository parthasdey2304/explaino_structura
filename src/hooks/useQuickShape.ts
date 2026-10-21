/**
 * @file useQuickShape.ts
 * @description Custom hook that wraps the QuickShape hold-detection pipeline.
 * While the freedraw tool is active, a stationary pointer hold (<5 px for ~500 ms)
 * snaps the in-progress stroke into a clean geometric shape. Extracted from
 * ExcalidrawWrapper to fix the god-node cohesion problem (graphify issue #26).
 *
 * @version 1.1.0
 */

import { useEffect } from "react";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  recognizeShape,
  buildShapeElement,
  HOLD_MS,
  HOLD_TOL_PX,
  type QPoint,
} from "@/lib/quickshape";

/**
 * Attaches the QuickShape hold-detection logic to an Excalidraw API instance.
 *
 * The effect is a no-op until `apiReady` becomes `true`. It cleans up all event
 * listeners and timers on unmount or when `apiReady` changes.
 *
 * @param excalidrawAPI - Ref-held reference to the Excalidraw imperative API.
 * @param apiReady      - Whether the API has been initialised yet.
 */
export function useQuickShape(
  excalidrawAPI: React.MutableRefObject<ExcalidrawImperativeAPI | null>,
  apiReady: boolean
): void {
  useEffect(() => {
    const api = excalidrawAPI.current;
    if (!apiReady || !api) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let drawing = false;
    let snapped = false;
    let last: { x: number; y: number } | null = null;

    const clearTimer = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    const fireHold = () => {
      timer = null;
      if (!drawing || snapped) return;
      const inner = excalidrawAPI.current;
      if (!inner) return;

      const inProgress = (
        inner.getAppState() as unknown as { newElement?: ExcalidrawElement | null }
      ).newElement;
      if (!inProgress || inProgress.isDeleted || inProgress.type !== "freedraw") return;

      const raw = inProgress as unknown as {
        x: number; y: number;
        points?: readonly (readonly [number, number])[];
      };
      if (!raw.points || raw.points.length < 2) return;

      const scenePts: QPoint[] = [];
      for (const p of raw.points) {
        if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number") continue;
        scenePts.push({ x: raw.x + p[0], y: raw.y + p[1] });
      }

      const recognized = recognizeShape(scenePts);
      if (!recognized) return;

      const shape = buildShapeElement(inProgress, recognized);
      const elements = inner.getSceneElements();
      inner.updateScene({
        elements: elements.map((el) => (el.id === inProgress.id ? shape : el)),
        appState: { newElement: shape as unknown as AppState["newElement"] },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      });
      snapped = true;
    };

    const armTimer = () => { clearTimer(); timer = setTimeout(fireHold, HOLD_MS); };

    const onDown: Parameters<ExcalidrawImperativeAPI["onPointerDown"]>[0] = (tool, _state, e) => {
      if (tool.type !== "freedraw") return;
      drawing = true; snapped = false; last = { x: e.clientX, y: e.clientY };
      armTimer();
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing || snapped) return;
      if (!last) { last = { x: e.clientX, y: e.clientY }; return; }
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) >= HOLD_TOL_PX) {
        last = { x: e.clientX, y: e.clientY };
        armTimer();
      }
    };

    const onUp = () => { drawing = false; snapped = false; last = null; clearTimer(); };

    const unsubs = [api.onPointerDown(onDown), api.onPointerUp(onUp)];
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      clearTimer();
    };
  }, [apiReady, excalidrawAPI]);
}
