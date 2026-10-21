/**
 * @file useScenePersistence.ts
 * @description Custom hook that encapsulates all scene save/load logic for the
 * Excalidraw canvas — both the immediate localStorage backup and the debounced
 * Firestore cloud save. Extracted from ExcalidrawWrapper to reduce its god-node
 * surface area (graphify issue #26).
 *
 * @version 1.1.0
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BinaryFiles, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { saveDrawing, loadDrawing } from "@/lib/firestore";

/** Key used for the localStorage auto-save snapshot. */
const STORAGE_KEY = "explaino-autosave";

/**
 * A Firestore-safe representation of a BinaryFile (only what we persist).
 */
export interface PersistedFile {
  dataURL: string;
  mimeType: string;
}

/**
 * The full scene snapshot that is persisted to Firestore and localStorage.
 */
export interface PersistedScene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, PersistedFile>;
}

/**
 * Return value of `useScenePersistence`.
 */
export interface ScenePersistenceHandle {
  /** Current Firestore document ID, or null before the first cloud save. */
  drawingId: string | null;
  /** Current drawing name (shown in the title). */
  drawingName: string;
  /** Human-readable status string shown in the save toast ("Saving…", "Saved ✓", etc.) */
  saveStatus: string;
  /** Update the drawing name imperatively (e.g. after the user renames). */
  setDrawingName: (name: string) => void;
  /**
   * Call this on every Excalidraw onChange to keep the latest scene in memory
   * and trigger both the localStorage backup and debounced cloud save.
   */
  notifyChange: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => void;
  /** Prompt the user for a name and save immediately to Firestore. */
  handleSaveClick: () => void;
  /**
   * Resolved initial data for Excalidraw, or null while still loading.
   * Pass to `<Excalidraw initialData={...} />`.
   */
  initialData: Record<string, unknown> | null;
  /** True once the initial data load attempt has completed (success or failure). */
  loaded: boolean;
}

/**
 * Strips `undefined` values, `Map`s, `Set`s, and functions so the object can
 * be stored in Firestore, which rejects all of those.
 */
function sanitizeForFirestore(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) obj[String(k)] = sanitizeForFirestore(v);
    return obj;
  }
  if (value instanceof Set) return Array.from(value).map(sanitizeForFirestore);
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) obj[k] = sanitizeForFirestore(v);
    }
    return obj;
  }
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  return value;
}

/**
 * Convert a BinaryFiles map to a Firestore-safe, data-URL-only representation.
 */
function filesToDataURLMap(files: BinaryFiles): Record<string, PersistedFile> {
  const out: Record<string, PersistedFile> = {};
  for (const [id, file] of Object.entries(files)) {
    if (!file.dataURL) continue;
    const isSvg =
      file.mimeType === "image/svg+xml" || file.dataURL.startsWith("data:image/svg");
    out[id] = { dataURL: file.dataURL, mimeType: isSvg ? "image/svg+xml" : file.mimeType || "image/png" };
  }
  return out;
}

/**
 * `useScenePersistence` — manages all save/load lifecycle for the canvas.
 *
 * Responsibilities:
 * - Restore scene from Firestore (`?doc=<id>`) or localStorage on mount
 * - Write a localStorage snapshot on every onChange (synchronous, zero-latency)
 * - Debounce Firestore cloud saves (1.5 s after the last change)
 * - Expose a manual "Save to Cloud" action with a name prompt
 *
 * @returns `ScenePersistenceHandle` — all state and callbacks the component needs
 */
export function useScenePersistence(): ScenePersistenceHandle {
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [drawingName, setDrawingNameState] = useState("Untitled");
  const [saveStatus, setSaveStatus] = useState("");
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false);

  const drawingIdRef = useRef<string | null>(null);
  const nameRef = useRef("Untitled");
  const latestSceneRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDrawingName = useCallback((name: string) => {
    nameRef.current = name;
    setDrawingNameState(name);
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const url = new URL(window.location.href);
      const docId = url.searchParams.get("doc");

      if (docId) {
        const saved = await loadDrawing(docId).catch(() => null);
        if (saved && !cancelled) {
          drawingIdRef.current = saved.id;
          nameRef.current = saved.name;
          setDrawingId(saved.id);
          setDrawingNameState(saved.name);
          setInitialData({
            elements: saved.elements,
            appState: saved.appState,
            files: Object.fromEntries(
              Object.entries((saved.files || {}) as Record<string, PersistedFile>).map(([id, f]) => {
                const isSvg = f.mimeType === "image/svg+xml" || f.dataURL?.startsWith("data:image/svg");
                return [id, { id, dataURL: f.dataURL, mimeType: isSvg ? "image/svg+xml" : f.mimeType || "image/png", created: Date.now() }];
              })
            ),
          });
          return;
        }
      }

      const localScene = localStorage.getItem(STORAGE_KEY);
      if (localScene && !cancelled) {
        try {
          const parsed = JSON.parse(localScene);
          if (!parsed || !Array.isArray(parsed.elements)) throw new Error("Invalid scene");
          const restoredFiles: Record<string, unknown> = {};
          if (parsed.files) {
            for (const [id, f] of Object.entries(parsed.files as Record<string, PersistedFile>)) {
              if (f?.dataURL) {
                const isSvg = f.mimeType === "image/svg+xml" || f.dataURL.startsWith("data:image/svg");
                restoredFiles[id] = { ...f, mimeType: isSvg ? "image/svg+xml" : f.mimeType || "image/png" };
              }
            }
          }
          setInitialData({ elements: parsed.elements, appState: parsed.appState, files: restoredFiles });
          return;
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      if (!cancelled) setInitialData({});
    }

    load().finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // ── onChange notifier ─────────────────────────────────────────────────────

  const notifyChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      latestSceneRef.current = { elements, appState, files };

      // Immediate localStorage backup
      try {
        const { serializeAsJSON } = require("@excalidraw/excalidraw");
        localStorage.setItem(STORAGE_KEY, serializeAsJSON(elements, appState, files, "local"));
      } catch { /* ignore quota errors */ }

      // Debounced Firestore save
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(async () => {
        const scene = latestSceneRef.current;
        if (!scene) return;
        try {
          const id = await saveDrawing(
            drawingIdRef.current,
            {
              elements: sanitizeForFirestore(scene.elements) as unknown[],
              appState: sanitizeForFirestore(scene.appState) as Record<string, unknown>,
              files: filesToDataURLMap(scene.files),
            },
            nameRef.current
          );
          drawingIdRef.current = id;
        } catch (err) {
          console.warn("Firestore auto-save skipped:", (err as Error).message);
        }
      }, 1500);
    },
    []
  );

  // ── Manual save ───────────────────────────────────────────────────────────

  const handleSaveToCloud = useCallback(async () => {
    const scene = latestSceneRef.current;
    if (!scene) return;
    try {
      setSaveStatus("Saving…");
      const id = await saveDrawing(
        drawingIdRef.current,
        {
          elements: sanitizeForFirestore(scene.elements) as unknown[],
          appState: sanitizeForFirestore(scene.appState) as Record<string, unknown>,
          files: filesToDataURLMap(scene.files),
        },
        nameRef.current
      );
      drawingIdRef.current = id;
      setDrawingId(id);
      setSaveStatus("Saved to Firestore ✓");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setSaveStatus(msg);
      setTimeout(() => setSaveStatus(""), 3000);
    }
  }, []);

  const handleSaveClick = useCallback(() => {
    const name = window.prompt("Drawing name:", nameRef.current)?.trim();
    if (name) {
      nameRef.current = name;
      setDrawingNameState(name);
      handleSaveToCloud();
    }
  }, [handleSaveToCloud]);

  return {
    drawingId,
    drawingName,
    saveStatus,
    setDrawingName,
    notifyChange,
    handleSaveClick,
    initialData,
    loaded,
  };
}
