"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Excalidraw,
  MainMenu,
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
import AITextSidebar from "./AITextSidebar";
import CanvasTextPanel, { type CanvasTextItem } from "./CanvasTextPanel";
import { chatStreamAuto, MistralError, type ChatMessage } from "@/lib/ai/mistral";
import { createCodeCardSvg } from "@/lib/ai/highlight";
import TodoPanel, { TodoCornerButton } from "./TodoOverlay";
import LaserOverlay from "./LaserOverlay";
import {
  recognizeShape,
  buildShapeElement,
  HOLD_MS as QUICKSHAPE_HOLD_MS,
  HOLD_TOL_PX as QUICKSHAPE_HOLD_TOL_PX,
  type QPoint,
} from "@/lib/quickshape";
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
import { Moon, Sun, Code, Menu, X, LayoutDashboard, Save, ChevronDown, Boxes, Grid3x3, Sparkles, Zap, ListOrdered, List, Send, Loader2 } from "lucide-react";

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

/** Strip common markdown syntax so canvas text renders the readable output. */
function stripMarkdown(md: string): string {
  let s = md;
  s = s.replace(/```[\s\S]*?```/g, "");
  s = s.replace(/^```.*$/gm, "");
  s = s.replace(/^---+$/gm, "");
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/_([^_\n]+)_/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  s = s.replace(/`([^`]*)`/g, "$1");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s*[*+]\s/gm, "• ");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

const REPO_URL = "https://github.com/parthasdey2304/explaino_structura";

/**
 * Shared visual style for the panel launcher buttons ("Code" top-right,
 * "AI Text" bottom-right) so both keep identical typography, border, size
 * and hover behaviour (hover comes from the `excalidraw-button` class).
 */
const PANEL_BUTTON_STYLE: React.CSSProperties = {
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
};

/** GitHub mark, inlined because this lucide version dropped brand icons. */
function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.42.36.79 1.07.79 2.15v3.19c0 .31.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
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
  const [showTodos, setShowTodos] = useState(false);
  const [showAiTextPanel, setShowAiTextPanel] = useState(false);
  const [showTextPanel, setShowTextPanel] = useState(false);
  const [activeTool, setActiveTool] = useState("selection");
  const [textItems, setTextItems] = useState<CanvasTextItem[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const editingTextIdRef = useRef<string | null>(null);
  const [listMode, setListMode] = useState<"ordered" | "bullet" | null>(null);
  const [textAnchor, setTextAnchor] = useState<{
    id: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const [laserActive, setLaserActive] = useState(false);
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

      // Track active tool + canvas text items for the Canvas Text panel.
      const toolType = (appState as unknown as { activeTool?: { type?: string } }).activeTool?.type ?? "selection";
      setActiveTool((prev) => (prev === toolType ? prev : toolType));
      const texts: CanvasTextItem[] = [];
      for (const el of elements) {
        if (el.isDeleted || el.type !== "text") continue;
        const t = el as unknown as { id: string; text?: string; customData?: { markdownRaw?: string } };
        const text = typeof t.text === "string" ? t.text : "";
        texts.push({ id: t.id, text, raw: typeof t.customData?.markdownRaw === "string" ? t.customData.markdownRaw : text });
      }
      setTextItems((prev) => {
        if (prev.length === texts.length && prev.every((p, i) => p.id === texts[i].id && p.text === texts[i].text && p.raw === texts[i].raw)) return prev;
        return texts;
      });

      // Markdown edit lifecycle: show raw markdown while the WYSIWYG editor is
      // open on a text element; strip to rendered text when editing ends.
      const editingId = (appState as unknown as { editingTextElement?: { id?: string } | null }).editingTextElement?.id ?? null;
      const prevEditingId = editingTextIdRef.current;
      if (editingId && editingId !== prevEditingId) {
        const api = excalidrawAPI.current;
        if (api) {
          const target = api.getSceneElements().find((el) => el.id === editingId);
          const raw = target ? (target as unknown as { customData?: { markdownRaw?: string } }).customData?.markdownRaw : undefined;
          if (target && typeof raw === "string" && (target as unknown as { text?: string }).text !== raw) {
            api.updateScene({
              elements: api.getSceneElements().map((el) =>
                el.id === editingId && !el.isDeleted && el.type === "text"
                  ? ({ ...el, text: raw, originalText: raw } as typeof el)
                  : el
              ),
            });
          }
        }
        editingTextIdRef.current = editingId;
      } else if (!editingId && prevEditingId) {
        const api = excalidrawAPI.current;
        if (api) {
          const target = api.getSceneElements().find((el) => el.id === prevEditingId);
          if (target && !target.isDeleted && target.type === "text") {
            const raw = (target as unknown as { text?: string }).text ?? "";
            const rendered = stripMarkdown(raw);
            api.updateScene({
              elements: api.getSceneElements().map((el) =>
                el.id === prevEditingId && !el.isDeleted && el.type === "text"
                  ? ({ ...el, text: rendered, originalText: rendered, customData: { ...((el as any).customData ?? {}), markdownRaw: raw } } as typeof el)
                  : el
              ),
            });
          }
        }
        editingTextIdRef.current = null;
      }

      // Anchor for the in-canvas text toolbar: the editing text element, else
      // the single selected text element.
      const selIds = (appState as unknown as { selectedElementIds?: Record<string, boolean> }).selectedElementIds ?? {};
      const selList = Object.keys(selIds).filter((k) => selIds[k]);
      let anchorId: string | null = editingId;
      if (!anchorId && selList.length === 1) {
        const cand = elements.find((el) => el.id === selList[0]);
        if (cand && !cand.isDeleted && cand.type === "text") anchorId = cand.id;
      }
      if (anchorId) {
        const t = elements.find((el) => el.id === anchorId);
        if (t && !t.isDeleted) {
          const next = {
            id: anchorId,
            minX: t.x,
            minY: t.y,
            maxX: t.x + t.width,
            maxY: t.y + t.height,
          };
          setTextAnchor((prev) =>
            prev && prev.id === next.id && prev.minX === next.minX && prev.minY === next.minY && prev.maxX === next.maxX && prev.maxY === next.maxY
              ? prev
              : next
          );
        }
      } else {
        setTextAnchor((prev) => (prev === null ? prev : null));
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
            const isSvg =
              file.mimeType === "image/svg+xml" ||
              file.dataURL.startsWith("data:image/svg");
            filesAsDataURL[fileId] = {
              dataURL: file.dataURL,
              mimeType: isSvg ? "image/svg+xml" : (file.mimeType || "image/png"),
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
              Object.entries(saved.files || {}).map(([id, f]) => {
                const isSvg =
                  f.mimeType === "image/svg+xml" ||
                  f.dataURL?.startsWith("data:image/svg");
                return [
                  id,
                  {
                    id,
                    dataURL: f.dataURL,
                    mimeType: isSvg ? "image/svg+xml" : (f.mimeType || "image/png"),
                    created: Date.now(),
                  },
                ];
              })
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
          const restoredFiles: Record<string, any> = {};
          if (parsed.files) {
            for (const [id, f] of Object.entries(parsed.files as Record<string, any>)) {
              if (f && f.dataURL) {
                const isSvg =
                  f.mimeType === "image/svg+xml" ||
                  f.dataURL.startsWith("data:image/svg");
                restoredFiles[id] = {
                  ...f,
                  mimeType: isSvg ? "image/svg+xml" : (f.mimeType || "image/png"),
                };
              }
            }
          }
          setInitialData({
            elements: validElements,
            appState: parsed.appState as Partial<AppState>,
            files: restoredFiles as BinaryFiles,
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
        const isSvg =
          file.mimeType === "image/svg+xml" ||
          file.dataURL.startsWith("data:image/svg");
        filesAsDataURL[fileId] = {
          dataURL: file.dataURL,
          mimeType: isSvg ? "image/svg+xml" : (file.mimeType || "image/png"),
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

  // --- Insert syntax-highlighted code card from AI Text panel onto canvas
  const handleInsertCodeToCanvas = useCallback(
    (code: string, lang: string) => {
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

      const isDark =
        theme === "dark" ||
        appState.theme === "dark" ||
        (typeof document !== "undefined" &&
          document.documentElement.classList.contains("dark"));

      const { dataUrl, width, height } = createCodeCardSvg(code, lang, isDark);
      const fileId = `code-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

      const newElements = convertToExcalidrawElements([
        {
          type: "image",
          fileId: fileId as any,
          status: "saved",
          x: Math.round(x - width / 2),
          y: Math.round(y - height / 2),
          width,
          height,
          customData: {
            isCodeCard: true,
            code,
            lang,
          },
        },
      ]);

      const selectedElementIds: Record<string, true> = {};
      for (const el of newElements) {
        selectedElementIds[el.id] = true;
      }

      api.updateScene({
        elements: [...api.getSceneElements(), ...newElements],
        appState: {
          selectedElementIds,
        } as unknown as AppState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      api.addFiles([
        {
          id: fileId as any,
          dataURL: dataUrl as any,
          mimeType: "image/svg+xml",
          created: Date.now(),
        },
      ]);

      api.scrollToContent(newElements, { fitToContent: false });
    },
    [theme]
  );

  // Hide Excalidraw's built-in Library button (its class names drift between
  // versions, so match on the rendered "Library" label text instead).
  useEffect(() => {
    const hide = () => {
      document
        .querySelectorAll(".excalidraw button")
        .forEach((b) => {
          if ((b.textContent ?? "").trim() === "Library") {
            (b as HTMLElement).style.display = "none";
          }
        });
    };
    hide();
    const obs = new MutationObserver(hide);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  // Auto-open the Canvas Text panel when the text tool is active.
  useEffect(() => {
    if (activeTool === "text") setShowTextPanel(true);
  }, [activeTool]);

  const handleUpdateCanvasText = useCallback((id: string, raw: string) => {
    const api = excalidrawAPI.current;
    if (!api) return;
    const rendered = stripMarkdown(raw);
    api.updateScene({
      elements: api.getSceneElements().map((el) =>
        el.id === id && !el.isDeleted && el.type === "text"
          ? ({ ...el, text: rendered, originalText: rendered, customData: { ...((el as any).customData ?? {}), markdownRaw: raw } } as typeof el)
          : el
      ),
    });
  }, []);

  // Ordered/bullet list mode: while writing a canvas text element, Enter adds
  // the next list marker ("2. " / "• ") on a new line automatically.
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

  // Set text content verbatim (markdown kept as-is, e.g. Codestral output).
  const handleSetCanvasTextRaw = useCallback((id: string, text: string) => {
    const api = excalidrawAPI.current;
    if (!api) return;
    api.updateScene({
      elements: api.getSceneElements().map((el) =>
        el.id === id && !el.isDeleted && el.type === "text"
          ? ({ ...el, text, originalText: text, customData: { ...((el as unknown as { customData?: object }).customData ?? {}), markdownRaw: text } } as typeof el)
          : el
      ),
    });
  }, []);

  // Apply ordered ("1. 2. 3.") or bullet ("•") list formatting to one text box.
  const applyListToText = useCallback(
    (id: string, kind: "ordered" | "bullet") => {
      const api = excalidrawAPI.current;
      if (!api) return;
      const target = api.getSceneElements().find((el) => el.id === id);
      if (!target || target.isDeleted || target.type !== "text") return;
      const t = target as unknown as { text?: string; customData?: { markdownRaw?: string } };
      const current = typeof t.customData?.markdownRaw === "string" ? t.customData.markdownRaw : (t.text ?? "");
      const stripped = current.split("\n").map((l) => l.replace(/^\s*(?:\d+\.\s*|[•\-*]\s*)/, "").trimEnd());
      const listed =
        kind === "ordered"
          ? stripped.map((l, i) => (l ? `${i + 1}. ${l}` : "")).join("\n")
          : stripped.map((l) => (l ? `• ${l}` : "")).join("\n");
      handleUpdateCanvasText(id, listed);
      setListMode(kind);
      setSelectedTextId(id);
    },
    [handleUpdateCanvasText]
  );

  // Per-text-box AI: mini chat anchored to the selected text element.
  const [textAiFor, setTextAiFor] = useState<string | null>(null);
  const [textAiMode, setTextAiMode] = useState<"text" | "code">("text");
  const [textAiPrompt, setTextAiPrompt] = useState("");
  const [textAiBusy, setTextAiBusy] = useState(false);
  const [textAiError, setTextAiError] = useState<string | null>(null);
  const textAiAbort = useRef<AbortController | null>(null);

  const sendTextAi = useCallback(async () => {
    const prompt = textAiPrompt.trim();
    if (!prompt || textAiBusy || !textAiFor) return;
    const api = excalidrawAPI.current;
    if (!api) return;
    const target = api.getSceneElements().find((el) => el.id === textAiFor);
    if (!target || target.isDeleted || target.type !== "text") return;
    const t = target as unknown as { text?: string; customData?: { markdownRaw?: string } };
    const current = typeof t.customData?.markdownRaw === "string" ? t.customData.markdownRaw : (t.text ?? "");
    setTextAiBusy(true);
    setTextAiError(null);
    const controller = new AbortController();
    textAiAbort.current = controller;
    const isCode = textAiMode === "code";
    const model = isCode ? "codestral-latest" : "open-mistral-nemo";
    const system = isCode
      ? "You are Explaino Code. Output ONLY raw code Markdown (fenced code blocks) for the requested language(s), no explanations."
      : "You are Explaino Canvas Text Editor. Output ONLY raw markdown content for direct placement on the canvas. No greetings, no explanations.";
    const convo: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: `Current text:\n${current}\n\nInstruction: ${prompt}\n\nRewrite or extend the current text per the instruction. Output only the new content.` },
    ];
    try {
      let acc = "";
      await chatStreamAuto(
        convo,
        model,
        (delta) => {
          acc += delta;
          if (isCode) handleSetCanvasTextRaw(textAiFor, acc);
          else handleUpdateCanvasText(textAiFor, acc);
        },
        controller.signal
      );
      setTextAiPrompt("");
    } catch (err) {
      if (!controller.signal.aborted) {
        setTextAiError(err instanceof MistralError || err instanceof Error ? err.message : "Request failed.");
      }
    } finally {
      setTextAiBusy(false);
      textAiAbort.current = null;
    }
  }, [textAiPrompt, textAiBusy, textAiFor, textAiMode, handleUpdateCanvasText, handleSetCanvasTextRaw]);

  useEffect(() => () => textAiAbort.current?.abort(), []);

  // Viewport position of the in-canvas text toolbar (tracks pan/zoom).
  const textToolbarPos = useMemo(() => {
    if (!textAnchor) return null;
    const p = sceneCoordsToViewportCoords({ sceneX: textAnchor.maxX, sceneY: textAnchor.minY }, viewport);
    return { left: p.x + 8, top: p.y - 8 };
  }, [textAnchor, viewport]);

  // Keep code cards synced with current theme (white border in dark mode, dark border in light mode)
  useEffect(() => {
    const api = excalidrawAPI.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const isDark = theme === "dark";
    const filesToAdd: any[] = [];
    let hasChanges = false;

    const nextElements = elements.map((el) => {
      if (!el.isDeleted && el.type === "image" && (el.customData as any)?.isCodeCard) {
        const data = el.customData as { isCodeCard: boolean; code: string; lang: string };
        if (!data?.code) return el;
        const newFileId = `code-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const { dataUrl } = createCodeCardSvg(data.code, data.lang, isDark);
        filesToAdd.push({
          id: newFileId,
          dataURL: dataUrl,
          mimeType: "image/svg+xml",
          created: Date.now(),
        });
        hasChanges = true;
        return {
          ...el,
          fileId: newFileId,
        };
      }
      return el;
    });

    if (hasChanges && filesToAdd.length > 0) {
      api.updateScene({ elements: nextElements as any });
      api.addFiles(filesToAdd);
    }
  }, [theme]);

  // --- Insert plain text from AI Text panel onto canvas (Excalidraw Text tool T / 8)
  const handleInsertTextToCanvas = useCallback(
    (text: string) => {
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

      const cleanText = text.trim();
      const renderedText = stripMarkdown(cleanText);
      const newElements = convertToExcalidrawElements([
        {
          type: "text",
          x: Math.round(x - 120),
          y: Math.round(y - 40),
          text: renderedText,
          fontSize: 16,
          fontFamily: 3,
          strokeColor: theme === "dark" ? "#e4e4e7" : "#18181b",
          customData: { markdownRaw: cleanText },
        } as any,
      ]);

      const selectedElementIds: Record<string, true> = {};
      for (const el of newElements) {
        selectedElementIds[el.id] = true;
      }

      api.updateScene({
        elements: [...api.getSceneElements(), ...newElements],
        appState: {
          selectedElementIds,
        } as unknown as AppState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      api.scrollToContent(newElements, { fitToContent: false });
    },
    [theme]
  );



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

  // Escape exits laser-pointer mode.
  useEffect(() => {
    if (!laserActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLaserActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [laserActive]);

  // QuickShape: while the freedraw tool is down, a stationary hold
  // (< 5px for ~500ms) snaps the in-progress stroke into a clean geometric
  // shape. The swap goes through updateScene with EVENTUALLY capture, so the
  // pointerup finalize records the whole stroke-to-shape as ONE undo entry.
  // Afterwards Excalidraw's native drag machinery keeps resizing the new
  // shape (generic elements via maybeDragNewGenericElement, lines/arrows via
  // the linear branch) until the pointer is released.
  useEffect(() => {
    const api = excalidrawAPI.current;
    if (!apiReady || !api) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let drawing = false;
    let snapped = false;
    let last: { x: number; y: number } | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const fireHold = () => {
      timer = null;
      if (!drawing || snapped) return;
      const inner = excalidrawAPI.current;
      if (!inner) return;
      const inProgress = (
        inner.getAppState() as unknown as {
          newElement?: ExcalidrawElement | null;
        }
      ).newElement;
      if (!inProgress || inProgress.isDeleted || inProgress.type !== "freedraw") {
        return;
      }
      const raw = inProgress as unknown as {
        x: number;
        y: number;
        points?: readonly (readonly [number, number])[];
      };
      if (!raw.points || raw.points.length < 2) return;
      const scenePts: QPoint[] = [];
      for (const p of raw.points) {
        if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number") {
          continue;
        }
        scenePts.push({ x: raw.x + p[0], y: raw.y + p[1] });
      }
      const recognized = recognizeShape(scenePts);
      if (!recognized) return; // leave ambiguous scribbles as freedraw
      const shape = buildShapeElement(inProgress, recognized);
      const elements = inner.getSceneElements();
      inner.updateScene({
        elements: elements.map((el) => (el.id === inProgress.id ? shape : el)),
        appState: {
          newElement: shape as unknown as AppState["newElement"],
        },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      });
      snapped = true;
    };

    const armTimer = () => {
      clearTimer();
      timer = setTimeout(fireHold, QUICKSHAPE_HOLD_MS);
    };

    const onDown: Parameters<
      ExcalidrawImperativeAPI["onPointerDown"]
    >[0] = (tool, _pointerDownState, e) => {
      if (tool.type !== "freedraw") return;
      drawing = true;
      snapped = false;
      last = { x: e.clientX, y: e.clientY };
      armTimer();
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing || snapped) return;
      if (!last) {
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      if (
        Math.hypot(e.clientX - last.x, e.clientY - last.y) >=
        QUICKSHAPE_HOLD_TOL_PX
      ) {
        last = { x: e.clientX, y: e.clientY };
        armTimer();
      }
    };
    const onUp = () => {
      drawing = false;
      snapped = false;
      last = null;
      clearTimer();
    };

    const unsubs = [api.onPointerDown(onDown), api.onPointerUp(onUp)];
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      unsubs.forEach((unsub) => unsub());
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      clearTimer();
    };
  }, [apiReady]);

  return (
    <div className={`w-full h-screen overflow-hidden relative${laserActive ? " explaino-laser-active" : ""}`} style={{ fontFamily: "var(--ui-font, 'Assistant', sans-serif)" }}>
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
              onClick={() => setLaserActive((v) => !v)}
              className="excalidraw-button"
              style={
                laserActive
                  ? {
                      ...PANEL_BUTTON_STYLE,
                      background: "var(--color-on-primary-container, #030064)",
                      color: "#ffffff",
                    }
                  : PANEL_BUTTON_STYLE
              }
              title="Laser pointer — transient red marks that fade away (never saved, never undoable). Esc to exit."
              aria-pressed={laserActive}
            >
              <Zap size={16} strokeWidth={2.2} />
              <span style={{ marginLeft: 4 }}>Laser</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!showCodePanel && excalidrawAPI.current) {
                  excalidrawAPI.current.updateScene({ appState: { showLibrary: false } as unknown as AppState });
                  if (showDataStructuresPanel) setShowDataStructuresPanel(false);
                }
                if (!showCodePanel) setShowAiTextPanel(false);
                setShowCodePanel(!showCodePanel);
              }}
              className="excalidraw-button"
              style={PANEL_BUTTON_STYLE}
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
              aria-label="Insert editable table"
            >
              <Grid3x3 size={16} strokeWidth={2.2} />
            </button>
          </div>
        )}
      >
        {/* Custom hamburger menu. Supplying our own children replaces
            Excalidraw's default menu, which is how the "Excalidraw links",
            "Follow us" and "Discord chat" entries are dropped: they all come
            from the single <DefaultItems.Socials /> group, which we omit.
            The theme toggle is omitted too, since the toolbar already has a
            sun/moon button and `theme` is a controlled prop here. */}
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.Item
            onSelect={handleSaveClick}
            icon={<Save />}
            className="explaino-menu-item"
            title="Save drawing to cloud (Firebase)"
          >
            Save to Cloud
          </MainMenu.Item>
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.ItemLink
            href={REPO_URL}
            icon={<GithubIcon />}
            rel="noreferrer noopener"
            target="_blank"
          >
            explaino_structura
          </MainMenu.ItemLink>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
        </ExcalidrawComponent>
      {/* Transient laser-pointer layer: screen-space only, never touches the
          scene or the undo/redo history. */}
      <LaserOverlay active={laserActive} />
      {/* Todo toggle — docked top-left, immediately right of the hamburger
          menu button (mirrors its box/border/icon sizing). */}
      <TodoCornerButton
        open={showTodos}
        onToggle={() => setShowTodos((v) => !v)}
      />
      </div>
      )}

      {/* Todo overlay — toggled by the top-left corner button */}
      {showTodos && <TodoPanel onClose={() => setShowTodos(false)} />}

      {/* Canvas Text panel — opens when the text tool is active */}
      {showTextPanel && (
        <CanvasTextPanel
          items={textItems}
          selectedId={selectedTextId}
          onSelect={setSelectedTextId}
          onUpdateText={handleUpdateCanvasText}
          onInsertText={handleInsertTextToCanvas}
          onClose={() => setShowTextPanel(false)}
        />
      )}

      {/* In-canvas text toolbar — anchored to the selected/editing text box */}
      {textAnchor && textToolbarPos && (
        <div
          className="canvas-text-dock excalidraw-island"
          style={{ left: textToolbarPos.left, top: textToolbarPos.top }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="canvas-text-dock__btn"
            onClick={() => setTextAiFor((v) => (v === textAnchor.id ? null : textAnchor.id))}
            title="AI assistant for this text"
            aria-label="AI assistant for this text"
          >
            <Sparkles size={15} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="canvas-text-dock__btn"
            onClick={() => applyListToText(textAnchor.id, "ordered")}
            title="Ordered list"
            aria-label="Ordered list"
          >
            <ListOrdered size={15} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className="canvas-text-dock__btn"
            onClick={() => applyListToText(textAnchor.id, "bullet")}
            title="Unordered list"
            aria-label="Unordered list"
          >
            <List size={15} strokeWidth={2.2} />
          </button>
          {textAiFor === textAnchor.id && (
            <div className="canvas-text-dock__ai">
              <div className="canvas-text-dock__modes" role="tablist" aria-label="AI mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={textAiMode === "text"}
                  className={`canvas-text-dock__mode${textAiMode === "text" ? " canvas-text-dock__mode--active" : ""}`}
                  onClick={() => setTextAiMode("text")}
                >
                  Text
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={textAiMode === "code"}
                  className={`canvas-text-dock__mode${textAiMode === "code" ? " canvas-text-dock__mode--active" : ""}`}
                  onClick={() => setTextAiMode("code")}
                >
                  Code
                </button>
              </div>
              <div className="canvas-text-dock__row">
                <input
                  className="canvas-text-dock__input"
                  value={textAiPrompt}
                  onChange={(e) => setTextAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendTextAi();
                    }
                  }}
                  placeholder={textAiMode === "code" ? "Ask Codestral…" : "Ask Mistral…"}
                  aria-label="AI instruction"
                  autoFocus
                />
                <button
                  type="button"
                  className="canvas-text-dock__btn"
                  disabled={!textAiPrompt.trim() || textAiBusy}
                  onClick={sendTextAi}
                  title="Send"
                  aria-label="Send"
                >
                  {textAiBusy ? <Loader2 size={14} className="ai-text-panel__spin" /> : <Send size={14} />}
                </button>
              </div>
              {textAiError && <div className="canvas-text-dock__error">{textAiError}</div>}
            </div>
          )}
        </div>
      )}

      {/* Code Editor Panel */}
      {showCodePanel && (
        <CodeEditorPanel onClose={() => setShowCodePanel(false)} />
      )}

      {/* AI Text launcher — bottom-right, identical styling to the Code button */}
      <div className="bottom-controls-right ai-text-dock">
        <button
          type="button"
          className="excalidraw-button"
          style={PANEL_BUTTON_STYLE}
          onClick={() => {
            if (!showAiTextPanel) {
              setShowCodePanel(false);
              setShowDataStructuresPanel(false);
            }
            setShowAiTextPanel(!showAiTextPanel);
          }}
          title="Open AI text assistant"
          aria-label="AI Text"
        >
          <Sparkles size={16} strokeWidth={2.2} />
          <span style={{ marginLeft: 4 }}>AI Text</span>
        </button>
      </div>

      {/* AI Text sidebar — slides in from the right at half the Code width */}
      {showAiTextPanel && (
        <AITextSidebar
          onClose={() => setShowAiTextPanel(false)}
          onInsertCode={handleInsertCodeToCanvas}
          onInsertText={handleInsertTextToCanvas}
        />
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