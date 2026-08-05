"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  AppState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { saveDrawing, loadDrawing } from "@/lib/firestore";
import CodeEditorPanel from "./CodeEditorPanel";

// Dynamically import the heavy Excalidraw component client-side only
const ExcalidrawComponent = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-gray-400">Loading canvas…</div>
      </div>
    ),
  }
);

const STORAGE_KEY = "explaino-autosave";

/**
 * Convert a value to a Firestore-safe plain object.
 * Maps -> plain objects, Sets -> arrays, drops functions/symbols.
 */
function sanitizeForFirestore(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = sanitizeForFirestore(v);
    }
    return obj;
  }
  if (value instanceof Set) {
    return Array.from(value).map((v) => sanitizeForFirestore(v));
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForFirestore(v));
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      obj[k] = sanitizeForFirestore(v);
    }
    return obj;
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  return value;
}

export default function ExcalidrawWrapper() {
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [drawingName, setDrawingName] = useState("Untitled");
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Save scene to Firestore (debounced auto-save)
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSceneRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);

  // --- Handle scene changes: auto-save to localStorage immediately, Firestore debounced
  const handleOnChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      latestSceneRef.current = { elements, appState, files };

      // Immediate local backup
      try {
        localStorage.setItem(
          STORAGE_KEY,
          serializeAsJSON(elements, appState, files, "local")
        );
      } catch {
        // ignore quota errors
      }

      // Debounced Firestore save
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(() => {
        const scene = latestSceneRef.current;
        if (!scene) return;
        const filesAsDataURL: Record<string, { dataURL: string; mimeType: string }> =
          {};
        for (const [fileId, file] of Object.entries(scene.files)) {
          if (file.dataURL) {
            filesAsDataURL[fileId] = {
              dataURL: file.dataURL,
              mimeType: file.mimeType || "image/png",
            };
          }
        }
        saveDrawing(
          drawingIdRef.current,
          {
            elements: scene.elements as unknown as unknown[],
            appState: sanitizeForFirestore(
              scene.appState
            ) as Record<string, unknown>,
            files: filesAsDataURL,
          },
          nameRef.current
        )
          .then((id) => {
            drawingIdRef.current = id;
          })
          .catch((err) => {
            console.warn("Firestore save skipped:", err.message);
          });
      }, 1500);
    },
    []
  );

  const drawingIdRef = useRef<string | null>(null);
  const nameRef = useRef<string>("Untitled");

  // --- Restore scene from Firestore on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // First try the last auto-saved drawing from localStorage
      const localScene = localStorage.getItem(STORAGE_KEY);
      const url = new URL(window.location.href);
      const docId = url.searchParams.get("doc");

      if (docId) {
        const saved = await loadDrawing(docId).catch(() => null);
        if (saved && !cancelled) {
          drawingIdRef.current = saved.id;
          nameRef.current = saved.name;
          setDrawingId(saved.id);
          setDrawingName(saved.name);
          setInitialData({
            elements: saved.elements as ExcalidrawElement[],
            appState: saved.appState as Partial<AppState>,
            files: Object.fromEntries(
              Object.entries(saved.files || {}).map(([id, f]) => [
                id,
                {
                  id,
                  dataURL: f.dataURL,
                  mimeType: f.mimeType || "image/png",
                  created: Date.now(),
                },
              ])
            ) as unknown as BinaryFiles,
          });
          return;
        }
      }

      if (localScene && !cancelled) {
        try {
          const parsed = JSON.parse(localScene);
          setInitialData({
            elements: parsed.elements as ExcalidrawElement[],
            appState: parsed.appState as Partial<AppState>,
            files: parsed.files as BinaryFiles,
          });
          return;
        } catch {
          // fall through
        }
      }

      if (!cancelled) {
        setInitialData({});
      }
    }

    load().finally(() => {
      if (!cancelled) setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Manual save with a name (called from menu or button)
  const handleSaveToCloud = useCallback(async () => {
    const scene = latestSceneRef.current;
    if (!scene || !excalidrawAPI.current) return;
    const filesAsDataURL: Record<string, { dataURL: string; mimeType: string }> =
      {};
    for (const [fileId, file] of Object.entries(scene.files)) {
      if (file.dataURL) {
        filesAsDataURL[fileId] = {
          dataURL: file.dataURL,
          mimeType: file.mimeType || "image/png",
        };
      }
    }
    try {
      setSaveStatus("Saving…");
      const id = await saveDrawing(
        drawingIdRef.current,
        {
          elements: scene.elements as unknown as unknown[],
          appState: sanitizeForFirestore(
            scene.appState
          ) as Record<string, unknown>,
          files: filesAsDataURL,
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

  // --- Show the save dialog for naming the drawing
  const handleSaveClick = useCallback(() => {
    const name = window.prompt("Drawing name:", nameRef.current)?.trim();
    if (name) {
      nameRef.current = name;
      setDrawingName(name);
      handleSaveToCloud();
    }
  }, [handleSaveToCloud]);

  return (
    <div className="w-full h-screen overflow-hidden relative" style={{ fontFamily: "var(--ui-font, 'Assistant', sans-serif)" }}>
      <ExcalidrawComponent
        excalidrawAPI={(api) => {
          excalidrawAPI.current = api;
          setApiReady(true);
        }}
        onChange={handleOnChange}
        initialData={initialData}
        name={drawingName}
        theme="light"
        renderTopRightUI={() => (
          <div className="flex items-center gap-2" style={{ marginLeft: 8 }}>
            <button
              type="button"
              onClick={handleSaveClick}
              className="excalidraw-button"
              style={{
                height: "2rem",
                padding: "0 1.25rem",
                minWidth: "5rem",
                fontSize: "0.8rem",
                borderRadius: "0.5rem",
                background: "var(--color-surface-primary-container, #e0dfff)",
                color: "var(--color-on-primary-container, #030064)",
                border: "none",
                cursor: "pointer",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
              title="Save drawing to Firestore"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowCodePanel(!showCodePanel)}
              className="excalidraw-button"
              style={{
                height: "2rem",
                padding: "0 1.25rem",
                minWidth: "5rem",
                fontSize: "0.8rem",
                borderRadius: "0.5rem",
                background: "var(--color-surface-primary-container, #e0dfff)",
                color: "var(--color-on-primary-container, #030064)",
                border: "none",
                cursor: "pointer",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
              title="Open code editor"
            >
              Code
            </button>
          </div>
        )}
      />

      {showCodePanel && (
        <CodeEditorPanel onClose={() => setShowCodePanel(false)} />
      )}

      {saveStatus && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] text-white text-xs font-medium px-4 py-2 rounded-lg shadow-lg"
          style={{ background: "var(--color-gray-90, #1e1e1e)" }}
        >
          {saveStatus}
        </div>
      )}
    </div>
  );
}