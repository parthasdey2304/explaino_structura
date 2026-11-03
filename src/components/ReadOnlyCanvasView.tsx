"use client";

import React, { startTransition, useEffect, useState, useRef, useCallback, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Lock, AlertCircle, RefreshCw } from "lucide-react";
import { normalizeCanvasBackground } from "@/lib/canvasTheme";

export interface ReadOnlyCanvasViewProps {
  canvasId: string;
}

interface SharedCanvasResponse {
  id?: string;
  name?: string;
  version?: number;
  updated_at?: number;
  elements?: unknown[];
  appState?: {
    viewBackgroundColor?: string;
    theme?: string;
    scrollX?: number;
    scrollY?: number;
    zoom?: { value: number } | number;
    [key: string]: unknown;
  };
  files?: Record<string, unknown>;
  [key: string]: unknown;
}

type UpdateSceneParams = Parameters<ExcalidrawImperativeAPI["updateScene"]>[0];
type UpdateSceneAppState = NonNullable<UpdateSceneParams["appState"]>;

import type ExcalidrawComponent from "./ExcalidrawCanvas";
const CanvasRenderer = dynamic<ComponentProps<typeof ExcalidrawComponent>>(
  () => import("./ExcalidrawCanvas"),
  { ssr: false }
);

const handTool: AppState["activeTool"] = {
  type: "hand",
  customType: null,
  locked: true,
  lastActiveTool: null,
};

export default function ReadOnlyCanvasView({ canvasId }: ReadOnlyCanvasViewProps) {
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastVersionRef = useRef<number | null>(null);
  const lastUpdatedAtRef = useRef<number | null>(null);

  const [canvasTitle, setCanvasTitle] = useState<string>("Student View");
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Helper to lock every element so students cannot drag, resize, rotate, or mutate them
  const lockElements = useCallback((elements: unknown[]): ExcalidrawElement[] => {
    if (!Array.isArray(elements)) return [];
    return elements.map((el) => ({
      ...(el as Record<string, unknown>),
      locked: true,
    })) as unknown as ExcalidrawElement[];
  }, []);

  // Excalidraw API callback ref handler
  // Clean reference capture with ZERO synchronous updateScene during mount
  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawAPIRef.current = api;
    // Expose on window for Playwright verification & automated audits
    if (typeof window !== "undefined") {
      (window as unknown as { __EXCALIDRAW_API__?: ExcalidrawImperativeAPI | null }).__EXCALIDRAW_API__ = api;
      (window as unknown as { __excalidrawAPI?: ExcalidrawImperativeAPI | null }).__excalidrawAPI = api;
    }
  }, []);

  // Initial fetch and 3-second live annotation polling
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let requestController: AbortController | undefined;
    let etag: string | null = null;
    setError(null);
    setInitialData(null);
    lastVersionRef.current = null;
    lastUpdatedAtRef.current = null;

    async function fetchCanvasData(isInitial = false) {
      requestController = new AbortController();
      const timeout = setTimeout(() => requestController?.abort(), 20000);
      try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/share`, {
          headers: etag && !isInitial ? { "If-None-Match": etag } : undefined,
          signal: requestController.signal,
          cache: "no-store",
        });
        if (res.status === 304) return true;
        if (res.status === 404) {
          if (!cancelled) {
            setError("Canvas not found or has been deleted by the teacher.");
          }
          return false;
        }

        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.canvas) {
          if (isInitial) {
            setError(data?.error || "Cannot Open Shared Canvas. Please verify the share URL.");
          } else {
            console.warn("[LiveSync] Polling update skipped due to response status:", res.status);
          }
          return;
        }

        const canvas: SharedCanvasResponse = data.canvas;
        setCanvasTitle(canvas.name || "Student View");

        // Initial Load: Build complete initialData state and trigger Excalidraw mount
        if (isInitial) {
          const locked = lockElements(canvas.elements || []);
          lastVersionRef.current = canvas.version ?? null;
          lastUpdatedAtRef.current = canvas.updated_at ?? null;
          etag = res.headers.get("ETag");

          const initialAppState: Partial<AppState> = {
            viewBackgroundColor: normalizeCanvasBackground(canvas.appState?.viewBackgroundColor),
            theme: canvas.appState?.theme === "light" ? "light" : "dark",
            viewModeEnabled: true,
            zenModeEnabled: false,
            activeTool: handTool,
            selectedElementIds: {},
            selectedGroupIds: {},
          };
          if (typeof canvas.appState?.scrollX === "number") {
            initialAppState.scrollX = canvas.appState.scrollX;
          }
          if (typeof canvas.appState?.scrollY === "number") {
            initialAppState.scrollY = canvas.appState.scrollY;
          }
          if (canvas.appState?.zoom !== undefined) {
            initialAppState.zoom = canvas.appState.zoom as unknown as AppState["zoom"];
          }

          startTransition(() => setInitialData({
            elements: locked,
            appState: initialAppState,
            files: (canvas.files || {}) as unknown as BinaryFiles,
            scrollToContent: false,
          }));
          return true;
        }

        // Live Polling Cycle (isInitial === false):
        const api = excalidrawAPIRef.current;
        if (!api) return true;

        const currentSceneCount = api.getSceneElements().length;
        const targetElementCount = canvas.elements?.length ?? 0;

        // Eliminate canvas redraw flicker:
        // Skip updateScene if canvas version and updated_at have not changed,
        // UNLESS the scene is currently empty while the database has elements (Self-Healing Guard).
        const isUnchanged =
          (targetElementCount === 0 || currentSceneCount > 0) &&
          canvas.version !== undefined &&
          canvas.version === lastVersionRef.current &&
          canvas.updated_at === lastUpdatedAtRef.current;

        if (isUnchanged) {
          etag = res.headers.get("ETag");
          return true;
        }

        lastVersionRef.current = canvas.version ?? null;
        lastUpdatedAtRef.current = canvas.updated_at ?? null;

        // 3-Second Background Polling: Update elements ONLY.
        // Strict Viewport Preservation: DO NOT pass scrollX, scrollY, or zoom.
        // Excalidraw preserves the student's active pan and zoom navigation.
        api.updateScene({
          elements: lockElements(canvas.elements || []),
          appState: {
            viewModeEnabled: true,
            zenModeEnabled: false,
            activeTool: handTool,
            selectedElementIds: {},
            selectedGroupIds: {},
          } as unknown as UpdateSceneAppState,
        });

        if (canvas.files && Object.keys(canvas.files).length > 0) {
          api.addFiles(Object.values(canvas.files) as unknown as BinaryFileData[]);
        }
        etag = res.headers.get("ETag");
        return true;
      } catch (err: unknown) {
        if (!cancelled) {
          if (isInitial) {
            const message = err instanceof Error && err.name !== "AbortError" ? err.message : "The connection timed out. Please try again.";
            setError(message);
          } else {
            console.warn("[LiveSync] Polling update skipped due to network glitch:", err);
          }
        }
        return !isInitial;
      } finally {
        clearTimeout(timeout);
      }
    }

    // Schedule after each response, so slow requests cannot pile up.
    const poll = async (isInitial: boolean) => {
      pollTimer = undefined;
      if (!isInitial && document.hidden) {
        pollTimer = setTimeout(() => poll(false), 30000);
        return;
      }
      const shouldContinue = await fetchCanvasData(isInitial);
      if (!cancelled && shouldContinue) pollTimer = setTimeout(() => poll(false), 3000);
    };
    const handleVisibilityChange = () => {
      if (!document.hidden && pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(() => poll(false), 0);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void poll(true);

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      requestController?.abort();
      if (typeof window !== "undefined") {
        (window as unknown as { __EXCALIDRAW_API__?: ExcalidrawImperativeAPI | null }).__EXCALIDRAW_API__ = null;
        (window as unknown as { __excalidrawAPI?: ExcalidrawImperativeAPI | null }).__excalidrawAPI = null;
      }
    };
  }, [canvasId, lockElements, retryCount]);

  // Branch 1: If canvas was not found or error occurred, show clean user-facing error UI
  // Note: Excalidraw bundle is NEVER downloaded on 404, guaranteeing <50ms error card render
  if (error) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0c0c0e] text-zinc-100 p-6">
        <div className="max-w-md w-full bg-[#18181b] border border-red-500/30 rounded-2xl p-6 shadow-2xl text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-xl font-bold mb-2">Cannot Open Shared Canvas</h2>
          <p className="text-sm text-zinc-400 mb-6">{error}</p>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="inline-flex items-center justify-center px-4 py-2 mr-2 rounded-xl text-sm font-semibold bg-zinc-700 hover:bg-zinc-600 text-white">
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            Go to Whiteboard Home
          </Link>
        </div>
      </div>
    );
  }

  // Branch 2: Loading state: Wait for initial canvas fetch before mounting Excalidraw
  if (!initialData) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0c0c0e] text-zinc-400">
        <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
        <span className="text-sm font-medium">Loading student canvas…</span>
      </div>
    );
  }

  // Branch 3: Render Excalidraw mounted with complete initialData
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0c0e]">
      {/* Top Floating Student Read-Only Banner */}
      <div
        data-readonly-banner="true"
        className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-zinc-900/95 border border-zinc-700/80 shadow-xl backdrop-blur-md text-xs select-none pointer-events-auto"
      >
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="font-semibold text-white truncate max-w-[200px]">{canvasTitle}</span>
        <span className="text-zinc-500">•</span>
        <span className="flex items-center text-amber-400 font-medium space-x-1">
          <Lock size={12} />
          <span>Read-Only Student View</span>
        </span>
      </div>

      {/* Excalidraw Canvas in Strict View Mode mounted with initialData */}
      <div className="w-full h-full">
        <CanvasRenderer
          excalidrawAPI={handleExcalidrawAPI}
          viewModeEnabled={true}
          zenModeEnabled={false}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: true,
              saveAsImage: true,
            },
          }}
          initialData={initialData}
        />
      </div>
    </div>
  );
}
