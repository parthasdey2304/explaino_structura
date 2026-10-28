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
import IframePanel, {
  type IframePanelLayout,
  loadSavedScreenState,
  saveScreenState,
} from "./IframePanel";
import DataStructuresPanel from "./DataStructuresPanel";
import CanvasStructureControls, { type ViewportBox } from "./CanvasStructureControls";
import AITextSidebar from "./AITextSidebar";
import ExplainoPanel from "./ExplainoPanel";
import CommandPalette, { type PaletteCommand } from "./CommandPalette";
import { chatStreamAuto, MistralError, type ChatMessage } from "@/lib/ai/mistral";
import { createCodeCardSvg } from "@/lib/ai/highlight";
import TodoPanel from "./TodoOverlay";
import Stopwatch from "./Stopwatch";
import LaserOverlay from "./LaserOverlay";
import RightCanvasToolbar from "./RightCanvasToolbar";
import { getOptimalSaveDebounceMs, getDeviceProfile } from "@/lib/deviceOptimization";

const TextToDiagramModal = dynamic(() => import("./TextToDiagramModal"), {
  ssr: false,
});
import { useQuickShape, useListMode, useCanvasShortcuts } from "@/hooks";
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
import { Moon, Sun, Code, Check, Clock, Menu, X, LayoutDashboard, Save, ChevronDown, Boxes, Grid3x3, Sparkles, Zap, ListOrdered, List, Send, Loader2, Mic, ListTodo, Monitor, LogOut, Terminal, MessageSquare, Layers, GitBranch, MousePointer, Square, Circle, Diamond, ArrowRight, Minus, PenTool, Type, Eraser, ZoomIn, ZoomOut, Maximize2, RotateCcw, Trash2, Download, RefreshCw, Hand, Sliders } from "lucide-react";
import { performClientLogout } from "./AuthGate";

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
const CREATOR_GITHUB_URL = "https://github.com/parthasdey2304";
const CREATOR_AVATAR_URL = "https://github.com/parthasdey2304.png";

/** Creator profile avatar icon for MainMenu. */
function CreatorAvatarIcon() {
  return (
    <img
      src={CREATOR_AVATAR_URL}
      alt="Parth Vastavik"
      width={16}
      height={16}
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "middle",
        border: "1px solid rgba(255, 255, 255, 0.2)",
      }}
    />
  );
}

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
    const item = raw as Record<string, unknown>;
    if (typeof item.type !== "string" || typeof item.id !== "string") continue;

    const el = { ...item };

    if (LINEAR_TYPES.has(el.type as string)) {
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

    out.push(el as unknown as ExcalidrawElement);
  }
  return out;
}

/**
 * Normalize any line/arrow/freedraw element whose first point is not [0, 0]
 * so selecting it never trips Excalidraw's LinearElementEditor guard.
 * Returns newly constructed objects to avoid mutating frozen element states.
 */
function normalizeLinearElements(elements: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  return elements.map((raw) => {
    if (!LINEAR_TYPES.has(raw.type)) return raw;
    const el = raw as unknown as {
      x: number;
      y: number;
      points?: readonly (readonly [number, number])[] | null;
    };
    const points = el.points;
    if (!points || points.length < 2) return raw;
    const p0 = points[0];
    if (!isPointPair(p0)) return raw;
    if (Math.abs(p0[0]) > 1e-9 || Math.abs(p0[1]) > 1e-9) {
      const dx = p0[0];
      const dy = p0[1];
      return {
        ...raw,
        x: (typeof el.x === "number" ? el.x : 0) + dx,
        y: (typeof el.y === "number" ? el.y : 0) + dy,
        points: points.map((p) => [p[0] - dx, p[1] - dy]),
      } as ExcalidrawElement;
    }
    return raw;
  });
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
  const [showIframePanel, setShowIframePanel] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return Boolean(loadSavedScreenState()?.isOpen);
    } catch {
      return false;
    }
  });
  const [iframePanelLayout, setIframePanelLayout] = useState<IframePanelLayout>("center");
  const [isScreenActive, setIsScreenActive] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  } | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true)
    ) {
      setIsPwaInstalled(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as typeof deferredPrompt);
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallPwa = useCallback(async () => {
    if (!deferredPrompt) {
      alert("To install Explaino as a Web App on this device, tap your browser menu (⋮ or Share) and select 'Install app' or 'Add to Home screen'.");
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsPwaInstalled(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn("PWA install error:", err);
    }
  }, [deferredPrompt]);
  const [deviceProfile, setDeviceProfile] = useState(() => getDeviceProfile());
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeToolType, setActiveToolType] = useState<string>("selection");
  const [showDataStructuresPanel, setShowDataStructuresPanel] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showStopwatch, setShowStopwatch] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("explaino-show-stopwatch");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("explaino-show-stopwatch", String(showStopwatch));
    } catch {
      // Ignore write errors
    }
  }, [showStopwatch]);
  const [showAiTextPanel, setShowAiTextPanel] = useState(false);
  const [showExplaino, setShowExplaino] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showTextToDiagramModal, setShowTextToDiagramModal] = useState(false);
  const editingTextIdRef = useRef<string | null>(null);
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

  // Responsive breakpoint for mobile/tablet/narrow screens
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const drawingIdRef = useRef<string | null>(null);
  const nameRef = useRef<string>("Untitled");

  // Save scene to Firestore (debounced auto-save)
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDeviceProfile(getDeviceProfile());
  }, []);

  // Hardware pen / stylus auto-detection for smart boards & tablets
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "pen") {
        const api = excalidrawAPI.current;
        if (!api) return;
        const currentTool = api.getAppState().activeTool?.type;
        if (currentTool !== "freedraw" && currentTool !== "eraser") {
          api.setActiveTool({ type: "freedraw" });
          setActiveToolType("freedraw");
        }
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, []);

  const handleSmartBoardToolSelect = useCallback(
    (tool: "pen" | "handDraw" | "pan" | "eraser") => {
      const api = excalidrawAPI.current;
      if (!api) return;

      if (tool === "pen") {
        api.setActiveTool({ type: "freedraw" });
        api.updateScene({
          appState: {
            currentItemStrokeWidth: 1.5,
            currentItemRoughness: 0,
          } as unknown as AppState,
        });
        setActiveToolType("freedraw");
      } else if (tool === "handDraw") {
        api.setActiveTool({ type: "freedraw" });
        api.updateScene({
          appState: {
            currentItemStrokeWidth: 3.5,
            currentItemRoughness: 1,
          } as unknown as AppState,
        });
        setActiveToolType("freedraw");
      } else if (tool === "pan") {
        api.setActiveTool({ type: "hand" });
        setActiveToolType("hand");
      } else if (tool === "eraser") {
        api.setActiveTool({ type: "eraser" });
        setActiveToolType("eraser");
      }
    },
    []
  );

  const handleCanvasUndo = useCallback(() => {
    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    document.querySelector(".excalidraw")?.dispatchEvent(event);
  }, []);

  const handleCanvasRedo = useCallback(() => {
    const event = new KeyboardEvent("keydown", {
      key: "y",
      code: "KeyY",
      ctrlKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    document.querySelector(".excalidraw")?.dispatchEvent(event);
  }, []);

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

      if (appState.activeTool?.type) {
        setActiveToolType(appState.activeTool.type);
        if (
          appState.activeTool.type !== "selection" &&
          appState.activeTool.type !== "hand" &&
          isScreenActive
        ) {
          setIsScreenActive(false);
        }
      }

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
            queueMicrotask(() => {
              const currentApi = excalidrawAPI.current;
              if (!currentApi) return;
              currentApi.updateScene({
                elements: currentApi.getSceneElements().map((el) =>
                  el.id === editingId && !el.isDeleted && el.type === "text"
                    ? ({ ...el, text: raw, originalText: raw } as typeof el)
                    : el
                ),
              });
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
            if (raw !== rendered) {
              queueMicrotask(() => {
                const currentApi = excalidrawAPI.current;
                if (!currentApi) return;
                currentApi.updateScene({
                  elements: currentApi.getSceneElements().map((el) =>
                    el.id === prevEditingId && !el.isDeleted && el.type === "text"
                      ? ({ ...el, text: rendered, originalText: rendered, customData: { ...((el as any).customData ?? {}), markdownRaw: raw } } as typeof el)
                      : el
                  ),
                });
              });
            }
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

      // Debounced local backup (optimized for low-RAM 1GB Android smart boards)
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
      localSaveTimerRef.current = setTimeout(() => {
        try {
          const s = latestSceneRef.current;
          if (s) {
            localStorage.setItem(
              STORAGE_KEY,
              serializeAsJSON(s.elements, s.appState, s.files, "local")
            );
          }
        } catch {
          // ignore quota errors
        }
      }, getOptimalSaveDebounceMs());

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

  // Firebase connectivity self-test (logs to console once).
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/firebase").then(({ checkFirebaseConnection }) => {
      if (!cancelled) void checkFirebaseConnection();
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // --- Insert native diagram elements (from Text-to-Diagram / Mermaid) onto canvas
  const handleInsertDiagramElements = useCallback((elements: readonly ExcalidrawElement[]) => {
    const api = excalidrawAPI.current;
    if (!api || elements.length === 0) return;

    const appState = api.getAppState();
    const { x: targetCenterX, y: targetCenterY } = viewportCoordsToSceneCoords(
      { clientX: appState.width / 2, clientY: appState.height / 2 },
      {
        zoom: appState.zoom,
        offsetLeft: appState.offsetLeft,
        offsetTop: appState.offsetTop,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      }
    );

    // Calculate bounding box of diagram elements
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

    const diagCenterX = minX + (maxX - minX) / 2;
    const diagCenterY = minY + (maxY - minY) / 2;

    const dx = Math.round(targetCenterX - diagCenterX);
    const dy = Math.round(targetCenterY - diagCenterY);

    const centeredElements = normalizeLinearElements(
      elements.map((el) => ({
        ...el,
        x: el.x + dx,
        y: el.y + dy,
      }))
    );

    const selectedElementIds: Record<string, true> = {};
    for (const el of centeredElements) {
      selectedElementIds[el.id] = true;
    }

    api.updateScene({
      elements: [...api.getSceneElements(), ...centeredElements],
      appState: {
        selectedElementIds,
      } as unknown as AppState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, []);

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

  // List mode formatting managed via useListMode hook
  const { listMode, applyListToText } = useListMode(excalidrawAPI, handleUpdateCanvasText);

  // Scene data captured alongside an Explaino voice note.
  const getSceneDataForNote = useCallback((): {
    elements: ExcalidrawElement[];
    files: BinaryFiles;
  } | null => {
    try {
      const scene = latestSceneRef.current;
      if (!scene) return null;
      return { elements: [...scene.elements], files: scene.files };
    } catch {
      return null;
    }
  }, []);

  // Scene snapshot captured alongside an Explaino voice note (capped size).
  const getSceneSnapshotForNote = useCallback((): string | null => {
    try {
      const scene = latestSceneRef.current;
      if (!scene) return null;
      const json = JSON.stringify(scene.elements);
      return json.length > 200_000 ? json.slice(0, 200_000) : json;
    } catch {
      return null;
    }
  }, []);

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

  // Stop Excalidraw from processing canvas tool shortcuts (v, r, t, l, a, Delete, Backspace, etc.)
  // when the user is actively working inside the Screen (Code Server)
  useEffect(() => {
    if (!isScreenActive || !showIframePanel) return;

    const blockCanvasShortcuts = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsScreenActive(false);
        const container = document.querySelector<HTMLElement>(".excalidraw");
        container?.focus();
        return;
      }
      // When working in screen, stop keystrokes from bleeding into Excalidraw tool shortcuts
      e.stopPropagation();
    };

    window.addEventListener("keydown", blockCanvasShortcuts, true);
    return () => window.removeEventListener("keydown", blockCanvasShortcuts, true);
  }, [isScreenActive, showIframePanel]);

  // Click outside screen panel to deactivate and return to canvas mode
  useEffect(() => {
    if (!isScreenActive || !showIframePanel) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const screenPanel = document.querySelector(".canvas-screen-panel");
      if (screenPanel && screenPanel.contains(e.target as Node)) {
        return;
      }
      setIsScreenActive(false);
    };

    window.addEventListener("pointerdown", handlePointerDownOutside);
    return () => window.removeEventListener("pointerdown", handlePointerDownOutside);
  }, [isScreenActive, showIframePanel]);

  // Direct canvas scroll callback for trackpad panning and zooming over the Screen
  const handleScreenCanvasScroll = useCallback(
    (deltaX: number, deltaY: number, isZoom: boolean, isShift: boolean) => {
      const api = excalidrawAPI.current;
      if (!api) return;

      const appState = api.getAppState();
      const zoom = appState.zoom.value || 1;

      if (isZoom) {
        const sign = Math.sign(deltaY);
        const absDelta = Math.abs(deltaY);
        const factor = Math.min(1, absDelta / 20);
        let nextZoom = zoom - deltaY / 100;
        nextZoom += Math.log10(Math.max(1, zoom)) * -sign * factor;
        const clampedZoom = Math.min(Math.max(nextZoom, 0.1), 5);
        api.updateScene({
          appState: {
            zoom: { value: clampedZoom as unknown as Zoom["value"] },
          },
        });
      } else {
        const dx = (isShift ? deltaY : deltaX) / zoom;
        const dy = (isShift ? 0 : deltaY) / zoom;
        api.updateScene({
          appState: {
            scrollX: appState.scrollX - dx,
            scrollY: appState.scrollY - dy,
          },
        });
      }
    },
    []
  );

  // Global shortcuts handled via useCanvasShortcuts hook
  useCanvasShortcuts({
    onTogglePalette: () => setShowPalette((v) => !v),
    onOpenTerminal: () => {
      setShowCodePanel(true);
      showCodePanelRef.current = true;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("explaino:open-terminal"));
      }, 60);
    },
    onOpenCodeEditor: () => {
      setShowCodePanel(true);
      showCodePanelRef.current = true;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("explaino:focus-editor"));
      }, 60);
    },
    onExitLaser: () => setLaserActive(false),
    isCodePanelOpen: showCodePanel,
    isLaserActive: laserActive,
    isScreenActive: isScreenActive && showIframePanel,
  });

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => {
      const api = () => excalidrawAPI.current;
      const closePanels = () => {
        setShowCodePanel(false);
        setShowAiTextPanel(false);
        setShowDataStructuresPanel(false);
        setShowExplaino(false);
      };
      const zoomBy = (factor: number) => {
        const a = api();
        if (!a) return;
        const z = a.getAppState().zoom.value;
        const next = Math.max(0.1, Math.min(30, z * factor));
        a.updateScene({ appState: { zoom: { value: next } } as unknown as AppState });
      };

      return [
        // ─── Screen & Code Server (Workspace) ───
        {
          id: "toggle-screen",
          label: "Toggle Canvas Screen (Code Server)",
          category: "Screen",
          shortcut: "Browser",
          icon: <Monitor size={15} />,
          run: () => {
            setShowIframePanel((v) => {
              const next = !v;
              saveScreenState({ isOpen: next });
              return next;
            });
          },
        },
        {
          id: "focus-screen",
          label: "Focus & Type in Code Server",
          category: "Screen",
          shortcut: "Enter",
          icon: <Terminal size={15} />,
          run: () => {
            setShowIframePanel(true);
            saveScreenState({ isOpen: true });
            setIsScreenActive(true);
          },
        },
        {
          id: "release-screen",
          label: "Release Focus to Canvas",
          category: "Screen",
          shortcut: "Esc",
          icon: <MousePointer size={15} />,
          run: () => {
            setIsScreenActive(false);
            const container = document.querySelector<HTMLElement>(".excalidraw");
            container?.focus();
          },
        },
        {
          id: "toggle-terminal",
          label: "Open Integrated Terminal",
          category: "Code",
          shortcut: "Ctrl+`",
          icon: <Terminal size={15} />,
          run: () => {
            setShowCodePanel(true);
            showCodePanelRef.current = true;
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("explaino:open-terminal"));
            }, 60);
          },
        },
        {
          id: "toggle-code",
          label: "Toggle Code Editor & Runner",
          category: "Code",
          shortcut: "Ctrl+C",
          icon: <Code size={15} />,
          run: () => {
            if (!showCodePanel) closePanels();
            setShowCodePanel(!showCodePanel);
          },
        },

        // ─── Drawing & Canvas Tools ───
        {
          id: "tool-selection",
          label: "Tool: Selection",
          category: "Tools",
          shortcut: "V",
          icon: <MousePointer size={15} />,
          run: () => api()?.setActiveTool({ type: "selection" }),
        },
        {
          id: "tool-rectangle",
          label: "Tool: Rectangle",
          category: "Tools",
          shortcut: "R",
          icon: <Square size={15} />,
          run: () => api()?.setActiveTool({ type: "rectangle" }),
        },
        {
          id: "tool-diamond",
          label: "Tool: Diamond",
          category: "Tools",
          shortcut: "D",
          icon: <Diamond size={15} />,
          run: () => api()?.setActiveTool({ type: "diamond" }),
        },
        {
          id: "tool-ellipse",
          label: "Tool: Ellipse / Circle",
          category: "Tools",
          shortcut: "O",
          icon: <Circle size={15} />,
          run: () => api()?.setActiveTool({ type: "ellipse" }),
        },
        {
          id: "tool-arrow",
          label: "Tool: Arrow",
          category: "Tools",
          shortcut: "A",
          icon: <ArrowRight size={15} />,
          run: () => api()?.setActiveTool({ type: "arrow" }),
        },
        {
          id: "tool-line",
          label: "Tool: Line",
          category: "Tools",
          shortcut: "L",
          icon: <Minus size={15} />,
          run: () => api()?.setActiveTool({ type: "line" }),
        },
        {
          id: "tool-freedraw",
          label: "Tool: Draw / Freehand Pen",
          category: "Tools",
          shortcut: "P",
          icon: <PenTool size={15} />,
          run: () => api()?.setActiveTool({ type: "freedraw" }),
        },
        {
          id: "smartboard-pen",
          label: "Smart Board: Pen Writing Mode",
          category: "Smart Board",
          shortcut: "Pen",
          icon: <PenTool size={15} />,
          run: () => handleSmartBoardToolSelect("pen"),
        },
        {
          id: "smartboard-hand",
          label: "Smart Board: Hand / Finger Draw Mode",
          category: "Smart Board",
          shortcut: "Finger",
          icon: <Sliders size={15} />,
          run: () => handleSmartBoardToolSelect("handDraw"),
        },
        {
          id: "smartboard-pan",
          label: "Smart Board: Hand Pan (Palm Rejection)",
          category: "Smart Board",
          shortcut: "Pan",
          icon: <Hand size={15} />,
          run: () => handleSmartBoardToolSelect("pan"),
        },
        {
          id: "system-pwa-install",
          label: "System: Install App (PWA) on Board / Phone",
          category: "System",
          shortcut: "Install",
          icon: <Download size={15} />,
          run: handleInstallPwa,
        },
        {
          id: "tool-text",
          label: "Tool: Text Box",
          category: "Tools",
          shortcut: "T",
          icon: <Type size={15} />,
          run: () => api()?.setActiveTool({ type: "text" }),
        },
        {
          id: "tool-eraser",
          label: "Tool: Eraser",
          category: "Tools",
          shortcut: "E",
          icon: <Eraser size={15} />,
          run: () => api()?.setActiveTool({ type: "eraser" }),
        },
        {
          id: "toggle-laser",
          label: `${laserActive ? "Stop" : "Start"} Laser Pointer`,
          category: "Tools",
          shortcut: "Laser",
          icon: <Zap size={15} />,
          run: () => setLaserActive((v) => !v),
        },

        // ─── Data Structures & Tables ───
        {
          id: "toggle-data-structures",
          label: "Toggle Data Structures Panel",
          category: "Diagrams",
          shortcut: "DS",
          icon: <Boxes size={15} />,
          run: () => {
            if (!showDataStructuresPanel) closePanels();
            setShowDataStructuresPanel(!showDataStructuresPanel);
          },
        },
        {
          id: "insert-stack",
          label: "Insert Stack Diagram",
          category: "Diagrams",
          hint: "DS",
          icon: <Layers size={15} />,
          run: () => {
            const def = findStructureDef("stack");
            if (def) handleInsertDataStructure(def, def.defaultData);
          },
        },
        {
          id: "insert-queue",
          label: "Insert Queue Diagram",
          category: "Diagrams",
          hint: "DS",
          icon: <Layers size={15} />,
          run: () => {
            const def = findStructureDef("queue");
            if (def) handleInsertDataStructure(def, def.defaultData);
          },
        },
        {
          id: "insert-binary-tree",
          label: "Insert Binary Tree Diagram",
          category: "Diagrams",
          hint: "DS",
          icon: <GitBranch size={15} />,
          run: () => {
            const def = findStructureDef("binary-tree");
            if (def) handleInsertDataStructure(def, def.defaultData);
          },
        },
        {
          id: "insert-linked-list",
          label: "Insert Singly Linked List",
          category: "Diagrams",
          hint: "DS",
          icon: <GitBranch size={15} />,
          run: () => {
            const def = findStructureDef("singly-linked-list");
            if (def) handleInsertDataStructure(def, def.defaultData);
          },
        },
        {
          id: "insert-array",
          label: "Insert Array Diagram",
          category: "Diagrams",
          hint: "DS",
          icon: <Grid3x3 size={15} />,
          run: () => {
            const def = findStructureDef("array");
            if (def) handleInsertDataStructure(def, def.defaultData);
          },
        },
        {
          id: "insert-table",
          label: "Insert Editable Whiteboard Table",
          category: "Diagrams",
          shortcut: "Grid",
          icon: <Grid3x3 size={15} />,
          run: () => handleInsertTable(),
        },

        // ─── AI & Diagram Generation ───
        {
          id: "text-to-diagram",
          label: "Text to Diagram (Mermaid & AI)",
          category: "AI",
          shortcut: "AI",
          icon: <Sparkles size={15} />,
          run: () => setShowTextToDiagramModal(true),
        },
        {
          id: "toggle-ai-text",
          label: "Toggle AI Text Assistant / Prompts",
          category: "AI",
          shortcut: "Chat",
          icon: <MessageSquare size={15} />,
          run: () => {
            if (!showAiTextPanel) closePanels();
            setShowAiTextPanel(!showAiTextPanel);
          },
        },
        {
          id: "toggle-explaino",
          label: "Open Explaino Voice Notes",
          category: "AI",
          shortcut: "Voice",
          icon: <Mic size={15} />,
          run: () => {
            if (!showExplaino) closePanels();
            setShowExplaino(!showExplaino);
          },
        },

        // ─── View & Zoom ───
        {
          id: "zoom-in",
          label: "Zoom In Canvas",
          category: "View",
          shortcut: "Ctrl + +",
          icon: <ZoomIn size={15} />,
          run: () => zoomBy(1.25),
        },
        {
          id: "zoom-out",
          label: "Zoom Out Canvas",
          category: "View",
          shortcut: "Ctrl + -",
          icon: <ZoomOut size={15} />,
          run: () => zoomBy(0.8),
        },
        {
          id: "zoom-reset",
          label: "Reset Zoom to 100%",
          category: "View",
          shortcut: "Ctrl + 0",
          icon: <RotateCcw size={15} />,
          run: () => {
            const a = api();
            if (a) a.updateScene({ appState: { zoom: { value: 1 } } as unknown as AppState });
          },
        },
        {
          id: "zoom-fit",
          label: "Zoom to Fit Drawing Content",
          category: "View",
          shortcut: "Shift + 1",
          icon: <Maximize2 size={15} />,
          run: () => {
            api()?.scrollToContent(undefined, { fitToViewport: true, animate: true });
          },
        },
        {
          id: "reset-view",
          label: "Reset View to Origin (0, 0)",
          category: "View",
          icon: <RotateCcw size={15} />,
          run: () => {
            const a = api();
            if (a) a.updateScene({ appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } } as unknown as AppState });
          },
        },
        {
          id: "toggle-theme",
          label: `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`,
          category: "View",
          shortcut: "Theme",
          icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />,
          run: () => setTheme(theme === "dark" ? "light" : "dark"),
        },

        // ─── Productivity & Tasks ───
        {
          id: "toggle-todos",
          label: "Toggle Todo List & Notes",
          category: "Tasks",
          shortcut: "Todos",
          icon: <ListTodo size={15} />,
          run: () => setShowTodos((v) => !v),
        },
        {
          id: "toggle-stopwatch",
          label: "Toggle Stopwatch / Timer",
          category: "Tasks",
          shortcut: "Stopwatch",
          icon: <Clock size={15} />,
          run: () => setShowStopwatch((v) => !v),
        },

        // ─── Cloud & File ───
        {
          id: "save-cloud",
          label: "Save Drawing to Cloud (Firebase)",
          category: "File",
          shortcut: "Ctrl + S",
          icon: <Save size={15} />,
          run: () => handleSaveClick(),
        },
        {
          id: "clear-canvas",
          label: "Clear Entire Whiteboard Canvas",
          category: "File",
          shortcut: "Clear",
          icon: <Trash2 size={15} />,
          run: () => api()?.resetScene(),
        },

        // ─── Account ───
        {
          id: "sign-out",
          label: "Sign Out of Workspace",
          category: "Account",
          shortcut: "Logout",
          icon: <LogOut size={15} />,
          run: () => performClientLogout(),
        },
      ];
    },
    [
      theme,
      laserActive,
      showCodePanel,
      showAiTextPanel,
      showDataStructuresPanel,
      showExplaino,
      handleInsertTable,
      handleInsertDataStructure,
      handleSaveClick,
    ]
  );

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawAPI.current = api;
    setApiReady(true);
  }, []);

  const handleToggleTodos = useCallback(() => setShowTodos((v) => !v), []);
  const handleToggleStopwatch = useCallback(() => setShowStopwatch((v) => !v), []);
  const handleOpenDiagramModal = useCallback(() => setShowTextToDiagramModal(true), []);

  const mainMenuContent = useMemo(
    () => (
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
        <MainMenu.ItemLink
          href={CREATOR_GITHUB_URL}
          icon={<CreatorAvatarIcon />}
          rel="noreferrer noopener"
          target="_blank"
        >
          Creator: Parth Vastavik
        </MainMenu.ItemLink>
        <MainMenu.Item
          onSelect={handleInstallPwa}
          icon={<Download size={16} strokeWidth={2.2} />}
          className="explaino-menu-item"
          title="Install Explaino as a Web App (PWA)"
        >
          {isPwaInstalled ? "Installed (Web App)" : "Install Web App"}
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.Item
          onSelect={handleToggleTodos}
          icon={<ListTodo size={16} strokeWidth={2.2} />}
          className="explaino-menu-item"
          title="Todo list"
        >
          Todos
        </MainMenu.Item>
        <MainMenu.Item
          onSelect={handleToggleStopwatch}
          icon={
            <div
              className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                showStopwatch
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-gray-400 dark:border-gray-500 bg-transparent"
              }`}
            >
              {showStopwatch && <Check size={12} strokeWidth={3} />}
            </div>
          }
          className="explaino-menu-item"
          title="Toggle Stopwatch on canvas"
        >
          Stopwatch
        </MainMenu.Item>
        <MainMenu.Item
          onSelect={handleOpenDiagramModal}
          icon={<Sparkles size={16} strokeWidth={2.2} />}
          className="explaino-menu-item"
          title="Text to Diagram / Mermaid"
        >
          Text to Diagram
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.Item
          onSelect={() => performClientLogout()}
          icon={<LogOut size={16} strokeWidth={2.2} />}
          className="explaino-menu-item text-red-400 hover:text-red-500"
          title="Sign out of workspace"
        >
          Sign Out
        </MainMenu.Item>
      </MainMenu>
    ),
    [handleSaveClick, handleToggleTodos, handleToggleStopwatch, showStopwatch, handleOpenDiagramModal, handleInstallPwa, isPwaInstalled]
  );

  const renderTopRightUI = useCallback(() => {
    if (isSmallScreen) return null;
    return (
      <div className="hidden lg:flex items-center gap-1.5" style={{ marginLeft: 8 }}>
        <button
          type="button"
          onClick={() => setLaserActive((v) => !v)}
          className="excalidraw-button"
          style={
            laserActive
              ? theme === "dark"
                ? {
                    ...PANEL_BUTTON_STYLE,
                    background: "#e0dfff",
                    color: "#030064",
                  }
                : {
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
          <span className="hidden xl:inline" style={{ marginLeft: 4 }}>Laser</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setShowIframePanel((v) => {
              const next = !v;
              saveScreenState({ isOpen: next });
              return next;
            });
          }}
          className="excalidraw-button"
          style={PANEL_BUTTON_STYLE}
          title="Open screen / browser panel"
          aria-pressed={showIframePanel}
        >
          <Monitor size={16} strokeWidth={2.2} />
          <span className="hidden xl:inline" style={{ marginLeft: 4 }}>Screen</span>
        </button>
        <button
          type="button"
          onClick={() => setShowTextToDiagramModal(true)}
          className="excalidraw-button"
          style={PANEL_BUTTON_STYLE}
          title="Text to Diagram / Mermaid — generate editable diagrams from prompts or Mermaid code"
          aria-label="Text to Diagram"
        >
          <Sparkles size={16} strokeWidth={2.2} />
          <span className="hidden xl:inline" style={{ marginLeft: 4 }}>Diagram</span>
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
    );
  }, [
    isSmallScreen,
    laserActive,
    theme,
    showIframePanel,
    showDataStructuresPanel,
    showCodePanel,
    handleInsertTable,
  ]);

  // QuickShape hold-detection pipeline managed via useQuickShape hook
  useQuickShape(excalidrawAPI, apiReady);

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
        excalidrawAPI={handleExcalidrawAPI}
        onChange={handleOnChange}
        initialData={initialData}
        name={drawingName}
        theme={theme}
        renderTopRightUI={renderTopRightUI}
      >
        {mainMenuContent}
      </ExcalidrawComponent>
      {/* Transient laser-pointer layer: screen-space only, never touches the
          scene or the undo/redo history. */}
      <LaserOverlay active={laserActive} />
      {/* Stopwatch & Timer — positioned directly to the right of the top-left hamburger menu (3 slashes) */}
      {showStopwatch && (
        <div className="fixed top-2.5 sm:top-3 left-[56px] sm:left-[60px] z-20 pointer-events-auto flex items-center h-9">
          <Stopwatch theme={theme} />
        </div>
      )}
      </div>
      )}

      {/* Floating right canvas toolbar for small screens (<1024px) */}
      {isSmallScreen && (
        <div className="lg:hidden">
          <RightCanvasToolbar
            laserActive={laserActive}
            onToggleLaser={() => setLaserActive((v) => !v)}
            showScreen={showIframePanel}
            onToggleScreen={() => {
              setShowIframePanel((v) => {
                const next = !v;
                saveScreenState({ isOpen: next });
                return next;
              });
            }}
            onOpenDiagram={() => setShowTextToDiagramModal(true)}
            showDataStructures={showDataStructuresPanel}
            onToggleDataStructures={() => {
              const api = excalidrawAPI.current;
              if (!showDataStructuresPanel && api) {
                api.updateScene({ appState: { showLibrary: false } as unknown as AppState });
                if (showCodePanel) setShowCodePanel(false);
              }
              setShowDataStructuresPanel(!showDataStructuresPanel);
            }}
            onInsertTable={handleInsertTable}
            theme={theme}
            onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
            penActive={activeToolType === "freedraw"}
            onTogglePen={() => handleSmartBoardToolSelect("pen")}
          />
        </div>
      )}

      {/* Todo overlay — toggled by the top-left corner button */}
      {showTodos && <TodoPanel onClose={() => setShowTodos(false)} />}

      {/* VS Code-style command palette (Ctrl/Cmd+Shift+P) */}
      {showPalette && (
        <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />
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

      {/* Iframe / Screen Panel */}
      {showIframePanel && (
        <IframePanel
          onClose={() => {
            setShowIframePanel(false);
            setIsScreenActive(false);
            saveScreenState({ isOpen: false });
          }}
          viewport={viewport}
          layout={iframePanelLayout}
          onLayoutChange={setIframePanelLayout}
          onCanvasScroll={handleScreenCanvasScroll}
          isActive={isScreenActive}
          onActiveChange={(active) => {
            setIsScreenActive(active);
            if (active) {
              excalidrawAPI.current?.setActiveTool({ type: "selection" });
            }
          }}
          activeToolType={activeToolType}
        />
      )}

      {/* Launchers — bottom-right: single stack, Explaino above AI Text */}
      <div className="bottom-controls-right ai-text-dock launcher-stack">
        <button
          type="button"
          className="excalidraw-button"
          style={PANEL_BUTTON_STYLE}
          onClick={() => {
            if (!showExplaino) {
              setShowCodePanel(false);
              setShowAiTextPanel(false);
              setShowDataStructuresPanel(false);
            }
            setShowExplaino(!showExplaino);
          }}
          title="Open Explaino voice notes"
          aria-label="Explaino"
        >
          <Mic size={16} strokeWidth={2.2} />
          <span className="hidden sm:inline" style={{ marginLeft: 4 }}>Explaino</span>
        </button>
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
          <span className="hidden sm:inline" style={{ marginLeft: 4 }}>AI Text</span>
        </button>
      </div>

      {/* Explaino voice notes panel */}
      {showExplaino && (
        <ExplainoPanel
          onClose={() => setShowExplaino(false)}
          getSceneSnapshot={getSceneSnapshotForNote}
          getSceneData={getSceneDataForNote}
          viewport={viewport}
        />
      )}

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

      {/* Text to Diagram / Mermaid Modal */}
      {showTextToDiagramModal && (
        <TextToDiagramModal
          isOpen={showTextToDiagramModal}
          onClose={() => setShowTextToDiagramModal(false)}
          onInsert={handleInsertDiagramElements}
          theme={theme}
        />
      )}
    </div>
  );
}