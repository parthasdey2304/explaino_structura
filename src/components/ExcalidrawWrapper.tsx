"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Excalidraw,
  serializeAsJSON,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  AppState,
  ActiveTool,
  Zoom,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { saveDrawing, loadDrawing } from "@/lib/firestore";
import CodeEditorPanel from "./CodeEditorPanel";
import DataStructuresPanel from "./DataStructuresPanel";
import CanvasStructureControls, { type ViewportBox } from "./CanvasStructureControls";
import {
  DATA_STRUCTURES,
  applyAction,
  findStructureDef,
  valueCarrier,
  writeSlots,
  type AnyStructureData,
  type ApplyActionOptions,
  type DataStructureDef,
  type StructureId,
} from "@/lib/dataStructures";
import { Moon, Sun, Code, Menu, X, LayoutDashboard, Save, ChevronDown, Boxes, Grid3x3 } from "lucide-react";

/**
 * Metadata attached to every element of an inserted diagram via Excalidraw's
 * `customData`, which round-trips through the scene's JSON. It's what lets
 * the on-canvas controls know "this selection is a stack holding [A,B,C]"
 * and regenerate the drawing from fresh data.
 */
interface DSMeta {
  instanceId: string;
  type: StructureId;
  data: unknown;
  /** Scene position the diagram was last generated at. */
  anchor: { x: number; y: number };
}

interface SceneBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface SelectedInstance {
  meta: DSMeta;
  box: SceneBox;
}

let _dsInstanceCounter = 0;

function readMeta(el: ExcalidrawElement): DSMeta | null {
  const customData = (el as unknown as { customData?: Record<string, unknown> }).customData;
  const ds = customData?.ds as DSMeta | undefined;
  if (!ds || typeof ds.instanceId !== "string" || typeof ds.type !== "string") return null;
  if (!ds.anchor || typeof ds.anchor.x !== "number") return null;
  return ds;
}

/** Tag a freshly generated diagram so it reads as one editable unit. */
function stampInstance(elements: readonly ExcalidrawElement[], meta: DSMeta): void {
  for (const raw of elements) {
    const el = raw as unknown as {
      customData?: Record<string, unknown>;
      groupIds?: string[];
      containerId?: string | null;
    };
    el.customData = { ...(el.customData ?? {}), ds: meta };
    // Bound labels belong to their container, not to the group.
    if (!el.containerId) {
      el.groupIds = [meta.instanceId];
    }
  }
}

function boxOf(elements: readonly ExcalidrawElement[]): SceneBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + w > maxX) maxX = el.x + w;
    if (el.y + h > maxY) maxY = el.y + h;
  }
  return { minX, minY, maxX, maxY };
}

/** Text a user typed into a labelled shape, via its bound text element. */
function readLabel(
  el: ExcalidrawElement,
  byId: Map<string, ExcalidrawElement>
): string {
  const bound = (el as unknown as {
    boundElements?: readonly { id: string; type: string }[] | null;
  }).boundElements;
  const ref = bound?.find((b) => b.type === "text");
  if (!ref) return "";
  const textEl = byId.get(ref.id) as unknown as { text?: string } | undefined;
  return typeof textEl?.text === "string" ? textEl.text : "";
}

/**
 * Read a diagram's current labels off the canvas, in generator order, so
 * inline edits survive the next regeneration.
 */
function harvestLabels(
  type: StructureId,
  members: readonly ExcalidrawElement[],
  byId: Map<string, ExcalidrawElement>
): string[] | null {
  const carrier = valueCarrier(type);
  if (!carrier) return null;
  return members.filter((el) => el.type === carrier).map((el) => readLabel(el, byId));
}

function sameBox(a: SceneBox | null, b: SceneBox | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.round(a.minX) === Math.round(b.minX) &&
    Math.round(a.minY) === Math.round(b.minY) &&
    Math.round(a.maxX) === Math.round(b.maxX) &&
    Math.round(a.maxY) === Math.round(b.maxY)
  );
}

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

const LINEAR_TYPES = new Set(["line", "arrow", "freedraw"]);

function isPointPair(p: unknown): p is [number, number] {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === "number" &&
    Number.isFinite(p[0]) &&
    typeof p[1] === "number" &&
    Number.isFinite(p[1])
  );
}

/**
 * Sanitize a raw scene element array so corrupt/incompatible entries can
 * never crash Excalidraw's linear-element editor.
 *  - drops entries that aren't objects with a string id/type
 *  - for line/arrow elements: requires >=2 valid point pairs and shifts
 *    points so the first point is [0, 0] (Excalidraw's normalization
 *    requirement, mirrored by an x/y translation so geometry is preserved)
 */
function sanitizeElements(elements: unknown[]): ExcalidrawElement[] {
  const out: ExcalidrawElement[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== "object") continue;
    const el = raw as Record<string, unknown>;
    if (typeof el.type !== "string" || typeof el.id !== "string") continue;

    if (LINEAR_TYPES.has(el.type)) {
      const points = el.points;
      if (!Array.isArray(points)) continue;
      const clean: [number, number][] = points.filter((p) => isPointPair(p));
      if (clean.length < 2) continue;
      const [dx, dy] = clean[0];
      if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) {
        el.x = (typeof el.x === "number" ? el.x : 0) + dx;
        el.y = (typeof el.y === "number" ? el.y : 0) + dy;
        el.points = clean.map(([px, py]) => [px - dx, py - dy]);
      } else {
        el.points = clean;
      }
    }

    out.push(el as ExcalidrawElement);
  }
  return out;
}

/**
 * Normalize any line/arrow/freedraw element whose first point is not [0, 0]
 * so selecting it never trips Excalidraw's LinearElementEditor guard.
 */
function normalizeLinearElements(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  for (const raw of elements) {
    if (!LINEAR_TYPES.has(raw.type)) continue;
    const el = raw as unknown as {
      x: number;
      y: number;
      points?: readonly (readonly [number, number])[] | null;
    };
    const points = el.points;
    if (!points || points.length < 2) continue;
    const p0 = points[0];
    if (!isPointPair(p0)) continue;
    if (Math.abs(p0[0]) > 1e-9 || Math.abs(p0[1]) > 1e-9) {
      const dx = p0[0];
      const dy = p0[1];
      el.x += dx;
      el.y += dy;
      el.points = points.map((p) => [p[0] - dx, p[1] - dy]);
    }
  }
  return elements as ExcalidrawElement[];
}

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
  const [showDataStructuresPanel, setShowDataStructuresPanel] = useState(false);
  const showDataStructuresPanelRef = useRef(false);
  const [drawingName, setDrawingName] = useState("Untitled");
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<SelectedInstance | null>(null);
  const selectedInstanceRef = useRef<SelectedInstance | null>(null);
  const [viewport, setViewport] = useState<{ zoom: Zoom; offsetLeft: number; offsetTop: number; scrollX: number; scrollY: number }>({
    zoom: { value: 1 as unknown as Zoom["value"] },
    offsetLeft: 0,
    offsetTop: 0,
    scrollX: 0,
    scrollY: 0,
  });
  const viewportRef = useRef(viewport);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("explaino-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  // Removed unused mobile state

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

      // Track viewport for HTML widget positioning (handles pan + zoom)
      // Only update state when values actually change to avoid render loops
      const vp = viewportRef.current;
      if (
        vp.scrollX !== appState.scrollX ||
        vp.scrollY !== appState.scrollY ||
        vp.offsetLeft !== appState.offsetLeft ||
        vp.offsetTop !== appState.offsetTop ||
        vp.zoom.value !== appState.zoom.value
      ) {
        const next = {
          zoom: appState.zoom,
          offsetLeft: appState.offsetLeft,
          offsetTop: appState.offsetTop,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        };
        viewportRef.current = next;
        setViewport(next);
      }

      // Track which data-structure diagram (if any) is selected, so its
      // on-canvas controls can be anchored to it. Guarded against no-op
      // updates because onChange fires on every pointer move.
      let hit: DSMeta | null = null;
      for (const el of elements) {
        if (el.isDeleted || !appState.selectedElementIds[el.id]) continue;
        const meta = readMeta(el);
        if (meta) {
          hit = meta;
          break;
        }
      }

      const prev = selectedInstanceRef.current;
      if (!hit) {
        if (prev) {
          selectedInstanceRef.current = null;
          setSelectedInstance(null);
        }
      } else {
        // Bound to a const so it stays narrowed inside the filter closure.
        const found = hit;
        const members = elements.filter(
          (el) => !el.isDeleted && readMeta(el)?.instanceId === found.instanceId
        );
        const box = boxOf(members);
        if (
          !prev ||
          prev.meta.instanceId !== found.instanceId ||
          prev.meta.data !== found.data ||
          !sameBox(prev.box, box)
        ) {
          const next: SelectedInstance = { meta: found, box };
          selectedInstanceRef.current = next;
          setSelectedInstance(next);
        }
      }

      // Close code panel / data structures panel if Excalidraw library opens
      if ((appState as unknown as Record<string, unknown>).showLibrary) {
        if (showCodePanelRef.current) {
          setShowCodePanel(false);
          showCodePanelRef.current = false;
        }
        if (showDataStructuresPanelRef.current) {
          setShowDataStructuresPanel(false);
          showDataStructuresPanelRef.current = false;
        }
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
            // Elements now carry diagram metadata in `customData`, so they
            // go through the same sanitizer as appState: Firestore rejects
            // `undefined` anywhere in the payload.
            elements: sanitizeForFirestore(scene.elements) as unknown[],
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
            elements: sanitizeElements(saved.elements as unknown[]),
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
          if (!parsed || !Array.isArray(parsed.elements)) throw new Error("Invalid scene");
          // Sanitize elements to avoid Excalidraw normalization crashes
          const validElements = sanitizeElements(parsed.elements);
          setInitialData({
            elements: validElements,
            appState: parsed.appState as Partial<AppState>,
            files: parsed.files as BinaryFiles,
          });
          return;
        } catch {
          // Corrupted scene — clear it
          localStorage.removeItem(STORAGE_KEY);
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
          elements: sanitizeForFirestore(scene.elements) as unknown[],
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

  // Mobile responsive listener removed (handled by CSS now)

  // Keep ref in sync with showCodePanel state
  useEffect(() => {
    showCodePanelRef.current = showCodePanel;
  }, [showCodePanel]);

  // Keep ref in sync with showDataStructuresPanel state
  useEffect(() => {
    showDataStructuresPanelRef.current = showDataStructuresPanel;
  }, [showDataStructuresPanel]);

  // Close code panel / data structures panel when Excalidraw's library button is clicked
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute("aria-label") === "Library") {
        if (showCodePanelRef.current) {
          setShowCodePanel(false);
          showCodePanelRef.current = false;
        }
        if (showDataStructuresPanelRef.current) {
          setShowDataStructuresPanel(false);
          showDataStructuresPanelRef.current = false;
        }
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  // ── Global shortcuts ──────────────────────────────────────────────────
  // Ctrl+` opens the code panel on the Terminal tab (VS Code style).
  // Ctrl+C opens the code editor when no text field is focused.
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return !!target.closest(
        "input, textarea, [contenteditable='true'], .cm-content, select"
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      if (e.key === "`") {
        e.preventDefault();
        setShowCodePanel(true);
        showCodePanelRef.current = true;
        // Let the panel mount, then switch to the terminal tab and focus it.
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("explaino:open-terminal"));
        }, 60);
        return;
      }

      if (e.key.toLowerCase() === "c") {
        // Only hijack Ctrl+C when the code panel is closed and the user
        // isn't typing in an input/editor, so copy still works normally.
        if (showCodePanelRef.current) return;
        if (isEditable(e.target)) return;
        e.preventDefault();
        setShowCodePanel(true);
        showCodePanelRef.current = true;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("explaino:focus-editor"));
        }, 60);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Insert a data-structure diagram into the scene at a given scene position
  const insertDataStructure = useCallback(
    (def: DataStructureDef, data: unknown, sceneX: number, sceneY: number) => {
      const api = excalidrawAPI.current;
      if (!api) return;
      try {
        const skeleton = def.generate(sceneX, sceneY, data);
        const newElements = normalizeLinearElements(
          convertToExcalidrawElements(skeleton)
        );
        const meta: DSMeta = {
          instanceId: `ds-${Date.now().toString(36)}-${++_dsInstanceCounter}`,
          type: def.id,
          data,
          anchor: { x: sceneX, y: sceneY },
        };
        stampInstance(newElements, meta);

        // Select the new diagram so its editing controls appear right away.
        const selectedElementIds: Record<string, true> = {};
        for (const el of newElements) {
          if (!(el as { containerId?: string | null }).containerId) {
            selectedElementIds[el.id] = true;
          }
        }

        api.updateScene({
          elements: [...api.getSceneElements(), ...newElements],
          appState: {
            selectedElementIds,
            selectedGroupIds: { [meta.instanceId]: true },
          } as unknown as AppState,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        api.scrollToContent(newElements, { fitToContent: false });
      } catch (err) {
        console.warn(`Failed to insert ${def.name}:`, err);
      }
    },
    []
  );

  /**
   * Re-draw a diagram from changed data, keeping it where the user put it.
   *
   * The stored anchor is where the diagram was last generated, but the user
   * may have dragged it since. Comparing a baseline re-generation at that
   * anchor against the elements actually on the canvas recovers the drag
   * offset, so edits never teleport the drawing back to its origin.
   */
  const applyStructureAction = useCallback(
    (actionId: string, opts: ApplyActionOptions) => {
      const api = excalidrawAPI.current;
      const selected = selectedInstanceRef.current;
      if (!api || !selected) return;

      const { meta } = selected;
      const def = findStructureDef(meta.type);
      if (!def) return;

      const all = api.getSceneElements();
      const mine = all.filter((el) => readMeta(el)?.instanceId === meta.instanceId);
      if (mine.length === 0) return;

      // Pick up any text the user typed straight into the shapes before
      // redrawing, otherwise the redraw would throw those edits away.
      const byId = new Map(all.map((el) => [el.id, el] as const));
      const labels = harvestLabels(meta.type, mine, byId);
      const currentData = labels
        ? writeSlots(meta.type, meta.data as AnyStructureData, labels)
        : (meta.data as AnyStructureData);

      const nextData = applyAction(meta.type, currentData, actionId, opts);
      // `applyAction` hands back the same object when the edit can't apply
      // (popping an empty stack, no tree node chosen, and so on).
      if (nextData === currentData) return;

      try {
        const baseline = convertToExcalidrawElements(
          def.generate(meta.anchor.x, meta.anchor.y, meta.data)
        );
        const baseBox = boxOf(baseline);
        const liveBox = boxOf(mine);

        let anchorX = meta.anchor.x + (liveBox.minX - baseBox.minX);
        let anchorY = meta.anchor.y + (liveBox.minY - baseBox.minY);

        let fresh = normalizeLinearElements(
          convertToExcalidrawElements(def.generate(anchorX, anchorY, nextData))
        );

        if (def.growthAnchor === "bottom-left") {
          // A stack should look like it grows upward from a fixed base, so
          // pin the bottom edge instead of the top.
          const freshBox = boxOf(fresh);
          const dy = liveBox.maxY - freshBox.maxY;
          if (Math.abs(dy) > 0.5) {
            anchorY += dy;
            fresh = normalizeLinearElements(
              convertToExcalidrawElements(def.generate(anchorX, anchorY, nextData))
            );
          }
        }

        const nextMeta: DSMeta = {
          instanceId: meta.instanceId,
          type: meta.type,
          data: nextData,
          anchor: { x: anchorX, y: anchorY },
        };
        stampInstance(fresh, nextMeta);

        const replacedIds = new Set(mine.map((el) => el.id));
        const selectedElementIds: Record<string, true> = {};
        for (const el of fresh) {
          if (!(el as { containerId?: string | null }).containerId) {
            selectedElementIds[el.id] = true;
          }
        }

        api.updateScene({
          elements: [...all.filter((el) => !replacedIds.has(el.id)), ...fresh],
          appState: {
            selectedElementIds,
            selectedGroupIds: { [meta.instanceId]: true },
          } as unknown as AppState,
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        const nextSelected: SelectedInstance = { meta: nextMeta, box: boxOf(fresh) };
        selectedInstanceRef.current = nextSelected;
        setSelectedInstance(nextSelected);
      } catch (err) {
        console.warn(`Failed to update ${def.name}:`, err);
      }
    },
    []
  );

  const removeStructure = useCallback(() => {
    const api = excalidrawAPI.current;
    const selected = selectedInstanceRef.current;
    if (!api || !selected) return;
    const { instanceId } = selected.meta;
    api.updateScene({
      elements: api
        .getSceneElements()
        .filter((el) => readMeta(el)?.instanceId !== instanceId),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    selectedInstanceRef.current = null;
    setSelectedInstance(null);
  }, []);

  // --- Click-to-insert fallback: places the diagram near the viewport center
  const handleInsertDataStructure = useCallback(
    (def: DataStructureDef, data: unknown) => {
      const api = excalidrawAPI.current;
      if (!api) return;
      const appState = api.getAppState();
      const { x, y } = viewportCoordsToSceneCoords(
        { clientX: appState.width / 2, clientY: appState.height / 2 },
        {
          zoom: appState.zoom,
          offsetLeft: appState.offsetLeft,
          offsetTop: appState.offsetTop,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        }
      );
      insertDataStructure(def, data, x - 140, y - 100);
    },
    [insertDataStructure]
  );

  // --- Insert a table. It's an ordinary data-structure diagram now: real
  // canvas cells that drag, scale, undo and save like anything else drawn.
  const handleInsertTable = useCallback(() => {
    const def = findStructureDef("table");
    if (def) handleInsertDataStructure(def, def.defaultData());
  }, [handleInsertDataStructure]);



  // --- Drag-and-drop from the Data Structures panel onto the canvas
  const handleCanvasDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("application/x-data-structure")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const dsId = e.dataTransfer.getData("application/x-data-structure");
      if (!dsId) return;
      const def = DATA_STRUCTURES.find((d) => d.id === dsId);
      const api = excalidrawAPI.current;
      if (!def || !api) return;
      e.preventDefault();
      const appState = api.getAppState();
      const { x, y } = viewportCoordsToSceneCoords(
        { clientX: e.clientX, clientY: e.clientY },
        {
          zoom: appState.zoom,
          offsetLeft: appState.offsetLeft,
          offsetTop: appState.offsetTop,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        }
      );
      insertDataStructure(def, def.defaultData(), x, y);
    },
    [insertDataStructure]
  );

  // Scene-space box of the selected diagram, projected into screen pixels so
  // the controls track the shape through panning and zooming.
  const structureControlsBox = useMemo<ViewportBox | null>(() => {
    if (!selectedInstance) return null;
    const { minX, minY, maxX, maxY } = selectedInstance.box;
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
    const topLeft = sceneCoordsToViewportCoords(
      { sceneX: minX, sceneY: minY },
      viewport
    );
    const bottomRight = sceneCoordsToViewportCoords(
      { sceneX: maxX, sceneY: maxY },
      viewport
    );
    return {
      left: topLeft.x,
      top: topLeft.y,
      right: bottomRight.x,
      bottom: bottomRight.y,
    };
  }, [selectedInstance, viewport]);

  return (
    <div className="w-full h-screen overflow-hidden relative" style={{ fontFamily: "var(--ui-font, 'Assistant', sans-serif)" }}>
      {!loaded || initialData === null ? (
        <div className="w-full h-screen flex items-center justify-center" style={{ background: "var(--default-bg-color)" }}>
          <div className="text-sm text-gray-400">Loading canvas…</div>
        </div>
      ) : (
      <div
        className="w-full h-full"
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
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
                  if (showDataStructuresPanel) setShowDataStructuresPanel(false);
                }
                setShowCodePanel(!showCodePanel);
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
              <span style={{ marginLeft: 4 }}>Code</span>
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
            <button
              type="button"
              onClick={() => {
                const api = excalidrawAPI.current;
                if (!showDataStructuresPanel && api) {
                  api.updateScene({ appState: { showLibrary: false } as unknown as AppState });
                  if (showCodePanel) setShowCodePanel(false);
                }
                setShowDataStructuresPanel(!showDataStructuresPanel);
              }}
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
              title="Data structure diagrams"
            >
              <Boxes size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={handleInsertTable}
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
              title="Insert editable table"
            >
              <Grid3x3 size={16} strokeWidth={2.2} />
            </button>
          </div>
        )}
      />
      </div>
      )}

      {/* Code Editor Panel */}
      {showCodePanel && (
        <CodeEditorPanel onClose={() => setShowCodePanel(false)} />
      )}

      {/* Data Structures Panel */}
      {showDataStructuresPanel && (
        <DataStructuresPanel
          onClose={() => setShowDataStructuresPanel(false)}
          onInsert={handleInsertDataStructure}
        />
      )}

      {/* Editing controls for the selected diagram, floating just outside it */}
      {selectedInstance && structureControlsBox && (
        <CanvasStructureControls
          instanceId={selectedInstance.meta.instanceId}
          type={selectedInstance.meta.type}
          data={selectedInstance.meta.data}
          box={structureControlsBox}
          onAction={applyStructureAction}
          onRemove={removeStructure}
        />
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