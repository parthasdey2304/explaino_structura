"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  AppState,
  ActiveTool,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { saveDrawing, loadDrawing } from "@/lib/firestore";
import CodeEditorPanel from "./CodeEditorPanel";
import { Moon, Sun, Code, Menu, X, LayoutDashboard, Save, ChevronDown } from "lucide-react";

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
  const showCodePanelRef = useRef(false);
  const [drawingName, setDrawingName] = useState("Untitled");
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("explaino-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  // Mobile responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileCodePanelOpen, setMobileCodePanelOpen] = useState(false);

  const drawingIdRef = useRef<string | null>(null);
  const nameRef = useRef<string>("Untitled");

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

      // Close code panel if Excalidraw library opens
      if ((appState as unknown as Record<string, unknown>).showLibrary && showCodePanelRef.current) {
        setShowCodePanel(false);
        showCodePanelRef.current = false;
      }

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

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    localStorage.setItem("explaino-theme", theme);
  }, [theme]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Keep ref in sync with showCodePanel state
  useEffect(() => {
    showCodePanelRef.current = showCodePanel;
  }, [showCodePanel]);

  // Close code panel when Excalidraw's library button is clicked
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute("aria-label") === "Library" && showCodePanelRef.current) {
        setShowCodePanel(false);
        showCodePanelRef.current = false;
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return (
    <div className="w-full h-screen overflow-hidden relative" style={{ fontFamily: "var(--ui-font, 'Assistant', sans-serif)" }}>
      {!loaded || initialData === null ? (
        <div className="w-full h-screen flex items-center justify-center" style={{ background: "var(--default-bg-color)" }}>
          <div className="text-sm text-gray-400">Loading canvas…</div>
        </div>
      ) : (
      <ExcalidrawComponent
        excalidrawAPI={(api) => {
          excalidrawAPI.current = api;
          setApiReady(true);
        }}
        onChange={handleOnChange}
        initialData={initialData}
        name={drawingName}
        theme={theme}
        renderTopRightUI={() => (
          <div className="flex items-center gap-2" style={{ marginLeft: 8 }}>
            <button
              type="button"
              onClick={() => {
                if (!showCodePanel && excalidrawAPI.current) {
                  excalidrawAPI.current.updateScene({ appState: { showLibrary: false } as unknown as AppState });
                }
                if (isMobile) {
                  setMobileCodePanelOpen(true);
                } else {
                  setShowCodePanel(!showCodePanel);
                }
              }}
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
              <Code size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="excalidraw-button"
              style={{
                height: "2rem",
                padding: "0 0.6rem",
                minWidth: "2.6rem",
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
              }}
              title="Toggle dark mode"
            >
              {theme === "dark" ? (
                <Sun size={16} strokeWidth={2.2} />
              ) : (
                <Moon size={16} strokeWidth={2.2} />
              )}
            </button>
          </div>
        )}
      />
      )}

      {/* Mobile bottom toolbar */}
      {isMobile && (
        <div className="mobile-toolbar" role="toolbar" aria-label="Mobile tools">
          <div className="mobile-toolbar__main">
            <div className="mobile-toolbar__tools">
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Selection"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "selection", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <LayoutDashboard size={22} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Rectangle"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "rectangle", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              </button>
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Ellipse"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "ellipse", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="9" ry="9"/></svg>
              </button>
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Arrow"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "arrow", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="3" x2="21" y2="21"/><path d="M16 21l5-5-5-5"/></svg>
              </button>
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Line"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "line", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="3" x2="21" y2="21"/></svg>
              </button>
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Text"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "text", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/></svg>
              </button>
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Draw"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "freedraw", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4H7.5"/><path d="M11 21.95V12a2.828 2.828 0 1 0-5.657 0"/><path d="M7 17l-4 4h16l-4-4"/></svg>
              </button>
              <button
                type="button"
                className="mobile-toolbar__tool-btn"
                title="Eraser"
                onClick={() => excalidrawAPI.current?.updateScene({ appState: { activeTool: { type: "eraser", customType: null } as unknown as AppState["activeTool"] } })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7"/><path d="M16 4a2 2 0 0 1 2 2v12"/><path d="M12 4a2 2 0 0 1 2 2v8"/><path d="M8 4a2 2 0 0 1 2 2v4"/></svg>
              </button>
            </div>
            <div className="mobile-toolbar__actions">
              <button
                type="button"
                className="mobile-toolbar__action-btn"
                title="Library"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu size={22} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="mobile-toolbar__action-btn"
                title="Code"
                onClick={() => setMobileCodePanelOpen(true)}
              >
                <Code size={22} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="mobile-toolbar__action-btn"
                title="Theme"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={22} strokeWidth={2.2} /> : <Moon size={22} strokeWidth={2.2} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile sidebar drawer */}
      {isMobile && mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      {isMobile && (
        <div className={`left-sidebar ${mobileSidebarOpen ? "open" : ""}`}>
          <div className="flex items-center justify-between mb-4">
            <span className="sidebar-section-label">Library</span>
            <button
              type="button"
              className="tool-icon-btn"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close"
            >
              <X size={22} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {/* Excalidraw's built-in library will render here when triggered */}
          </div>
        </div>
      )}

      {/* Code Editor Panel - Desktop */}
      {!isMobile && showCodePanel && (
        <CodeEditorPanel onClose={() => setShowCodePanel(false)} />
      )}

      {/* Code Editor Panel - Mobile Drawer */}
      {isMobile && (
        <div className={`code-editor-panel ${mobileCodePanelOpen ? "open" : ""}`}>
          <div className="code-editor__header">
            <div className="code-editor__header-left">
              <span className="code-editor__title">Code Editor</span>
            </div>
            <div className="code-editor__header-right">
              <button
                type="button"
                className="tool-icon-btn"
                onClick={() => setMobileCodePanelOpen(false)}
                aria-label="Close code editor"
              >
                <X size={20} strokeWidth={2.2} />
              </button>
            </div>
          </div>
          <CodeEditorPanel onClose={() => setMobileCodePanelOpen(false)} />
        </div>
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