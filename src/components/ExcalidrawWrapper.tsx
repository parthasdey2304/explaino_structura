"use client";

import "@/lib/suppressUnloadViolation";
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  MainMenu,
  serializeAsJSON,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
  CaptureUpdateAction,
  getSceneVersion,
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
import { normalizeCanvasBackground } from "@/lib/canvasTheme";
import ExcalidrawComponent from "./ExcalidrawCanvas";
import IframePanel, {
  type IframePanelLayout,
  loadSavedScreenState,
  saveScreenState,
} from "./IframePanel";
import CanvasStructureControls, { type ViewportBox } from "./CanvasStructureControls";
import type { PaletteCommand } from "./CommandPalette";
import { chatStreamAuto, MistralError, getStoredModel, setStoredModel, ALL_MODELS, type ChatMessage } from "@/lib/ai/mistral";
import GoogleExtensionIcon from "./GoogleExtensionIcon";
import RightCanvasToolbar from "./RightCanvasToolbar";
import { useCanvasTabs } from "@/hooks/useCanvasTabs";
import WebPreviewPanel, { loadSavedPreviewState, savePreviewState, DEFAULT_PREVIEW_PORT, DEFAULT_PREVIEW_PATH } from "./WebPreviewPanel";
import type { PdfWindowItem } from "./PdfCanvasWindow";
import { deletePdfWindow, loadPdfWindows } from "@/lib/pdfWindowStore";
import { deleteOfficeWindow, loadOfficeWindows } from "@/lib/officeWindowStore";
import type { OfficeKind, OfficeWindowItem } from "@/lib/officeFiles";
import { buildExternalTabUrl } from "@/lib/vpsProxy";
import { getOptimalSaveDebounceMs, getDeviceProfile } from "@/lib/deviceOptimization";

const TextToDiagramModal = dynamic(() => import("./TextToDiagramModal"), {
  ssr: false,
});
const DataStructuresPanel = dynamic(() => import("./DataStructuresPanel"), { ssr: false });
const AITextSidebar = dynamic(() => import("./AITextSidebar"), { ssr: false });
const ExplainoPanel = dynamic(() => import("./ExplainoPanel"), { ssr: false });
const TodoPanel = dynamic(() => import("./TodoOverlay"), { ssr: false });
const PdfCanvasWindow = dynamic(() => import("./PdfCanvasWindow"), { ssr: false });
const OfficeCanvasWindow = dynamic(() => import("./OfficeCanvasWindow"), { ssr: false });
const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });
const ExtensionsPanel = dynamic(() => import("./ExtensionsPanel"), { ssr: false });
const Stopwatch = dynamic(() => import("./Stopwatch"), { ssr: false });
const LaserOverlay = dynamic(() => import("./LaserOverlay"), { ssr: false });

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
import { Blocks, Moon, Sun, Check, Clock, Menu, X, LayoutDashboard, Save, ChevronDown, Boxes, Grid3x3, Sparkles, Zap, ListOrdered, List, Send, Loader2, Mic, ListTodo, Monitor, LogOut, Terminal, MessageSquare, Layers, GitBranch, MousePointer, Square, Circle, Diamond, ArrowRight, Minus, PenTool, Type, Eraser, ZoomIn, ZoomOut, Maximize2, RotateCcw, Trash2, Download, RefreshCw, Hand, Sliders, FolderOpen, Image as ImageIcon, HelpCircle, Palette, Search, Globe, ExternalLink, Lock } from "lucide-react";
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
  s = s.replace(/^\s*[*+]\s/gm, "â€¢ ");
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

const EXTENSIONS_BUTTON_STYLE: React.CSSProperties = {
  height: "2rem",
  padding: "0 16px",
  width: "auto",
  minWidth: "fit-content",
  whiteSpace: "nowrap",
  fontSize: "0.8rem",
  borderRadius: "0.5rem",
  cursor: "pointer",
  fontWeight: 500,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};

/** GitHub mark, inlined because this lucide version dropped brand icons. */
function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.42.36.79 1.07.79 2.15v3.19c0 .31.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

export const getCanvasStorageKey = (canvasId?: string) =>
  canvasId ? `explaino_autosave_${canvasId}` : "explaino_autosave";

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
    // Live DOM windows regenerate their export placeholders. Restoring old
    // placeholders as drawings renders invisible, stale window copies first.
    if ((item.customData as { isScreenSyncElement?: boolean } | undefined)?.isScreenSyncElement) continue;
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

export interface ExcalidrawWrapperProps {
  initialCanvasId?: string;
  isReadOnly?: boolean;
}

export default function ExcalidrawWrapper({
  initialCanvasId,
  isReadOnly: propReadOnly = false,
}: ExcalidrawWrapperProps = {}) {
  const excalidrawAPI = useRef<ExcalidrawImperativeAPI | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [isUrlReadOnly] = useState<boolean>(() => {
    if (propReadOnly) return true;
    if (typeof window === "undefined") return false;
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("readonly") === "true";
    } catch {
      return false;
    }
  });
  const canvasTabs = useCanvasTabs({
    initialCanvasId,
    isReadOnly: propReadOnly || isUrlReadOnly,
    excalidrawAPI: excalidrawAPI.current,
  });
  const canvasTabsRef = useRef(canvasTabs);
  useEffect(() => {
    canvasTabsRef.current = canvasTabs;
  }, [canvasTabs]);

  const lastHydratedCanvasIdRef = useRef<string | null>(null);

  // Synchronize initial/active canvas data into Excalidraw when loaded from SQLite
  useEffect(() => {
    const api = excalidrawAPI.current;
    const activeCanvas = canvasTabs.activeCanvas;
    if (!api || !activeCanvas || canvasTabs.isLoading) return;

    if (lastHydratedCanvasIdRef.current !== activeCanvas.id) {
      lastHydratedCanvasIdRef.current = activeCanvas.id;
      const cached = canvasTabs.cacheRef.current.get(activeCanvas.id);
      let elements = (cached?.elements || activeCanvas.elements || []) as unknown[];
      let appState = (cached?.appState || activeCanvas.appState || {}) as Record<string, unknown>;
      let files = (cached?.files || activeCanvas.files || {}) as BinaryFiles;

      // Check scoped localStorage backup if elements are empty
      const scopedKey = getCanvasStorageKey(activeCanvas.id);
      if (scopedKey && (!elements || (elements as any[]).length === 0)) {
        try {
          const backup = localStorage.getItem(scopedKey);
          if (backup) {
            const parsed = JSON.parse(backup);
            if (parsed && Array.isArray(parsed.elements) && parsed.elements.length > 0) {
              elements = parsed.elements;
              if (parsed.appState) appState = parsed.appState;
              if (parsed.files) files = parsed.files;
            }
          }
        } catch {}
      }

      if (elements && (elements as any[]).length > 0) {
        (api.updateScene as any)({
          elements: sanitizeElements(elements),
          appState: {
            ...appState,
            viewBackgroundColor: normalizeCanvasBackground(appState.viewBackgroundColor as string | undefined),
            theme: api.getAppState().theme,
            viewModeEnabled: canvasTabs.isReadOnly,
          } as any,
          commitToHistory: false,
        });
        if (files && Object.keys(files).length > 0) {
          api.addFiles(Object.values(files) as any);
        }
        api.history.clear();
      }
    }
  }, [canvasTabs.activeCanvas, canvasTabs.isLoading, canvasTabs.isReadOnly, apiReady]);
  const [showIframePanel, setShowIframePanel] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return Boolean(loadSavedScreenState()?.isOpen);
    } catch {
      return false;
    }
  });
  const [iframePanelLayout, setIframePanelLayout] = useState<IframePanelLayout>("center");
  const [screenRecenterTrigger, setScreenRecenterTrigger] = useState(0);
  const [isScreenActive, setIsScreenActive] = useState<boolean>(false);
  const [screenScenePos, setScreenScenePos] = useState<{
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = loadSavedScreenState();
    if (saved?.isOpen && saved.sceneX !== undefined && saved.sceneY !== undefined && saved.sceneWidth && saved.sceneHeight) {
      return {
        sceneX: saved.sceneX,
        sceneY: saved.sceneY,
        sceneWidth: saved.sceneWidth,
        sceneHeight: saved.sceneHeight,
      };
    }
    return null;
  });

  const [previewWindowIds, setPreviewWindowIds] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return loadSavedPreviewState()?.isOpen ? [0] : [];
    } catch {
      return [];
    }
  });
  const nextPreviewId = useRef(1);
  const showWebPreviewPanel = previewWindowIds.length > 0;
  const [activePreviewId, setActivePreviewId] = useState<number | null>(null);
  const [canvasWindowOrder, setCanvasWindowOrder] = useState<string[]>([]);
  const [activeCanvasWindow, setActiveCanvasWindow] = useState<string | null>(null);
  const focusCanvasWindow = useCallback((id: string) => {
    setActiveCanvasWindow(id);
    setCanvasWindowOrder((previous) => previous[previous.length - 1] === id ? previous : [...previous.filter((entry) => entry !== id), id]);
  }, []);
  const canvasWindowZIndex = (id: string) => {
    const index = canvasWindowOrder.indexOf(id);
    return 12 + (index < 0 ? canvasWindowOrder.length : index);
  };
  const [webPreviewScenePos, setWebPreviewScenePos] = useState<{
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = loadSavedPreviewState();
    if (saved?.isOpen && saved.sceneX !== undefined && saved.sceneY !== undefined && saved.sceneWidth && saved.sceneHeight) {
      return {
        sceneX: saved.sceneX,
        sceneY: saved.sceneY,
        sceneWidth: saved.sceneWidth,
        sceneHeight: saved.sceneHeight,
      };
    }
    return null;
  });

  const handleOpenWebPreview = useCallback(() => {
    const id = previewWindowIds.length === 0 ? 0 : nextPreviewId.current++;
    if (id === 0) savePreviewState({ isOpen: true, shouldRecenter: true });
    setPreviewWindowIds((previous) => [...previous, id]);
    focusCanvasWindow(`preview-${id}`);
  }, [previewWindowIds.length, focusCanvasWindow]);

  const [showHandyToolbar, setShowHandyToolbar] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("explaino-handy-toolbar-enabled");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const handleToggleHandyToolbar = useCallback(() => {
    setShowHandyToolbar((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("explaino-handy-toolbar-enabled", String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleOpenScreen = useCallback(() => {
    setShowIframePanel(true);
    focusCanvasWindow("code-server");
    setIframePanelLayout("center");
    setIsScreenActive(true);
    setScreenRecenterTrigger((v) => v + 1);
    saveScreenState({ isOpen: true, shouldRecenter: true });
    window.dispatchEvent(new CustomEvent("explaino-recenter-screen"));
  }, [focusCanvasWindow]);
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
      alert("To install Explaino as a Web App on this device, tap your browser menu (â‹® or Share) and select 'Install app' or 'Add to Home screen'.");
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

  // Global Escape handler for exiting laser mode (capture phase guarantees interception)
  useEffect(() => {
    if (!laserActive) return;
    const handleLaserEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setLaserActive(false);
      }
    };
    window.addEventListener("keydown", handleLaserEscape, true);
    return () => window.removeEventListener("keydown", handleLaserEscape, true);
  }, [laserActive]);
  const [showExtensionsPanel, setShowExtensionsPanel] = useState(false);
  const showExtensionsPanelRef = useRef(false);
  useEffect(() => {
    showExtensionsPanelRef.current = showExtensionsPanel;
  }, [showExtensionsPanel]);
  const showDataStructuresPanelRef = useRef(false);
  const [drawingName, setDrawingName] = useState("Untitled");
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const commitInitialScene = useCallback((scene: ExcalidrawInitialDataState) => {
    startTransition(() => setInitialData(scene));
  }, []);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);
  const [selectedInstance, setSelectedInstance] = useState<SelectedInstance | null>(null);
  const selectedInstanceRef = useRef<SelectedInstance | null>(null);
  const tableCellRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState<{ zoom: Zoom; offsetLeft: number; offsetTop: number; scrollX: number; scrollY: number }>({
    zoom: { value: 1 as unknown as Zoom["value"] },
    offsetLeft: 0,
    offsetTop: 0,
    scrollX: 0,
    scrollY: 0,
  });
  const viewportRef = useRef(viewport);
  const [pdfWindows, setPdfWindows] = useState<PdfWindowItem[]>([]);
  const [officeWindows, setOfficeWindows] = useState<OfficeWindowItem[]>([]);
  const documentInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    void loadOfficeWindows().then((windows) => {
      if (!cancelled) {
        setOfficeWindows((current) => [...windows.filter((saved) => !current.some((item) => item.id === saved.id)), ...current]);
        setCanvasWindowOrder((current) => [...windows.map((item) => `office-${item.id}`).filter((id) => !current.includes(id)), ...current]);
      }
    }).catch((error) => console.error("Unable to restore document windows", error));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadPdfWindows().then((windows) => {
      if (!cancelled) {
        setPdfWindows((current) => [...windows.filter((saved) => !current.some((item) => item.id === saved.id)), ...current]);
        setCanvasWindowOrder((current) => [...windows.map((item) => `pdf-${item.id}`).filter((id) => !current.includes(id)), ...current]);
      }
    }).catch((error) => console.error("Unable to restore PDF windows", error));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const openExtensions = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.code !== "Space" || isUrlReadOnly) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!showExtensionsPanelRef.current && excalidrawAPI.current) {
        excalidrawAPI.current.updateScene({ appState: { showLibrary: false, openSidebar: null } as unknown as AppState });
      }
      setShowExtensionsPanel((open) => !open);
    };
    window.addEventListener("keydown", openExtensions, true);
    return () => window.removeEventListener("keydown", openExtensions, true);
  }, [isUrlReadOnly]);
  useEffect(() => {
    const rememberCell = (event: PointerEvent) => {
      const api = excalidrawAPI.current;
      if (!api || !(event.target instanceof Element) || !event.target.closest(".excalidraw__canvas")) return;
      setActiveCanvasWindow(null);
      const state = api.getAppState();
      const point = viewportCoordsToSceneCoords({ clientX: event.clientX, clientY: event.clientY }, state);
      const cell = [...api.getSceneElements()].reverse().find((el) =>
        el.type === "rectangle" && readMeta(el)?.type === "table" && !el.isDeleted &&
        point.x >= el.x && point.x <= el.x + el.width && point.y >= el.y && point.y <= el.y + el.height
      );
      tableCellRef.current = cell?.id ?? null;
    };
    const navigateCell = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const api = excalidrawAPI.current;
      if (!api) return;
      const state = api.getAppState();
      if (state.viewModeEnabled) return;
      const target = event.target;
      const editing = target instanceof HTMLTextAreaElement && target.classList.contains('excalidraw-wysiwyg');
      if (!editing && target instanceof Element && target.closest('input, textarea, button, [contenteditable="true"]')) return;
      const elements = api.getSceneElements();
      const editingText = state.editingTextElement;
      const cellId = editing
        ? (editingText?.type === 'text' ? editingText.containerId : null)
        : tableCellRef.current;
      const cell = elements.find((el) => el.id === cellId && el.type === 'rectangle');
      const meta = cell && readMeta(cell);
      if (!cell || !meta || meta.type !== 'table') return;
      if (!editing && !state.selectedElementIds[cell.id] && !state.selectedGroupIds[meta.instanceId]) return;
      const cells = elements.filter((el) => el.type === 'rectangle' && readMeta(el)?.instanceId === meta.instanceId);
      const { rows, cols } = meta.data as { rows: number; cols: number };
      if (cells.length !== rows * cols) return;
      const index = cells.findIndex((el) => el.id === cell.id);
      const row = Math.floor(index / cols), col = index % cols;
      const nextRow = row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
      const nextCol = col + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) return;
      const next = cells[nextRow * cols + nextCol];
      tableCellRef.current = next.id;
      if (editing) target.blur();
      requestAnimationFrame(() => {
        api.updateScene({ appState: { selectedElementIds: { [next.id]: true }, selectedGroupIds: {} } as unknown as AppState });
        requestAnimationFrame(() => {
          const canvas = document.querySelector<HTMLElement>('.excalidraw.excalidraw-container');
          canvas?.focus();
          canvas?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
          requestAnimationFrame(() => {
            const editor = document.querySelector<HTMLTextAreaElement>('textarea.excalidraw-wysiwyg');
            if (editor) { editor.focus(); editor.setSelectionRange(editor.value.length, editor.value.length); }
          });
        });
      });
    };
    document.addEventListener('pointerdown', rememberCell, true);
    window.addEventListener('keydown', navigateCell, true);
    return () => {
      document.removeEventListener('pointerdown', rememberCell, true);
      window.removeEventListener('keydown', navigateCell, true);
    };
  }, []);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("explaino-theme") as "light" | "dark") || "light";
    }
    return "light";
  });

  // Responsive breakpoint for mobile/tablet/narrow screens
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(false);
  const [isNarrowForStopwatch, setIsNarrowForStopwatch] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 1024);
      setIsNarrowForStopwatch(window.innerWidth < 1280);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Synchronize Screen representation in Excalidraw's scene so that:
  // 1. In Excalidraw's "Export image" modal, the screen fits with all annotations in natural aspect ratio
  // 2. The exported SVG / PNG / Clipboard includes the IDE screen window
  useEffect(() => {
    const api = excalidrawAPI.current;
    if (!api || !apiReady) return;

    const allElements = api.getSceneElements();
    const isScreenOpen = showIframePanel && screenScenePos !== null;
    const isPreviewOpen = previewWindowIds.includes(0) && webPreviewScenePos !== null;

    // Filter out existing screen and preview sync elements
    const nonSyncElements = allElements.filter(
      (el) => !(el as { customData?: { isScreenSyncElement?: boolean } }).customData?.isScreenSyncElement
    );

    if (!isScreenOpen && !isPreviewOpen) {
      if (nonSyncElements.length !== allElements.length) {
        api.updateScene({ elements: nonSyncElements });
      }
      return;
    }

    const isDark = theme === "dark";
    const syncElementsRaw: any[] = [];

    if (isScreenOpen && screenScenePos) {
      const { sceneX, sceneY, sceneWidth, sceneHeight } = screenScenePos;
      syncElementsRaw.push(
        // 1. Screen Window Outer Frame
        {
          id: "explaino-screen-window-frame",
          type: "rectangle",
          x: Math.round(sceneX),
          y: Math.round(sceneY),
          width: Math.round(sceneWidth),
          height: Math.round(sceneHeight),
          backgroundColor: isDark ? "#16161a" : "#1e1e24",
          strokeColor: "transparent",
          strokeWidth: 0,
          fillStyle: "solid",
          roughness: 0,
          roundness: { type: 3 },
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 2. Screen Window Header Bar
        {
          id: "explaino-screen-window-header",
          type: "rectangle",
          x: Math.round(sceneX),
          y: Math.round(sceneY),
          width: Math.round(sceneWidth),
          height: 38,
          backgroundColor: isDark ? "#1c1c21" : "#282830",
          strokeColor: "transparent",
          strokeWidth: 0,
          fillStyle: "solid",
          roughness: 0,
          roundness: { type: 3 },
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 3. Traffic Lights
        {
          id: "explaino-screen-dot-red",
          type: "ellipse",
          x: Math.round(sceneX + 14),
          y: Math.round(sceneY + 13),
          width: 12,
          height: 12,
          backgroundColor: "#ef4444",
          strokeColor: "#dc2626",
          strokeWidth: 1,
          fillStyle: "solid",
          roughness: 0,
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        {
          id: "explaino-screen-dot-yellow",
          type: "ellipse",
          x: Math.round(sceneX + 32),
          y: Math.round(sceneY + 13),
          width: 12,
          height: 12,
          backgroundColor: "#f59e0b",
          strokeColor: "#d97706",
          strokeWidth: 1,
          fillStyle: "solid",
          roughness: 0,
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        {
          id: "explaino-screen-dot-green",
          type: "ellipse",
          x: Math.round(sceneX + 50),
          y: Math.round(sceneY + 13),
          width: 12,
          height: 12,
          backgroundColor: "#22c55e",
          strokeColor: "#16a34a",
          strokeWidth: 1,
          fillStyle: "solid",
          roughness: 0,
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 4. Header title text
        {
          id: "explaino-screen-title",
          type: "text",
          x: Math.round(sceneX + 74),
          y: Math.round(sceneY + 11),
          text: "code-server â€” Ubuntu Terminal & Editor",
          fontSize: 14,
          fontFamily: 3,
          strokeColor: "#94a3b8",
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 5. Header status text
        {
          id: "explaino-screen-status",
          type: "text",
          x: Math.max(Math.round(sceneX + 74), Math.round(sceneX + sceneWidth - 140)),
          y: Math.round(sceneY + 11),
          text: "â— CODE SERVER",
          fontSize: 12,
          fontFamily: 3,
          strokeColor: "#22c55e",
          locked: true,
          customData: { isScreenSyncElement: true },
        }
      );
    }

    if (isPreviewOpen && webPreviewScenePos) {
      const { sceneX, sceneY, sceneWidth, sceneHeight } = webPreviewScenePos;
      syncElementsRaw.push(
        // 1. Preview Window Outer Frame
        {
          id: "explaino-preview-window-frame",
          type: "rectangle",
          x: Math.round(sceneX),
          y: Math.round(sceneY),
          width: Math.round(sceneWidth),
          height: Math.round(sceneHeight),
          backgroundColor: isDark ? "#16161a" : "#1e1e24",
          strokeColor: "transparent",
          strokeWidth: 0,
          fillStyle: "solid",
          roughness: 0,
          roundness: { type: 3 },
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 2. Preview Window Header Bar
        {
          id: "explaino-preview-window-header",
          type: "rectangle",
          x: Math.round(sceneX),
          y: Math.round(sceneY),
          width: Math.round(sceneWidth),
          height: 38,
          backgroundColor: isDark ? "#1c1c21" : "#282830",
          strokeColor: "transparent",
          strokeWidth: 0,
          fillStyle: "solid",
          roughness: 0,
          roundness: { type: 3 },
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 3. Traffic Lights
        {
          id: "explaino-preview-dot-red",
          type: "ellipse",
          x: Math.round(sceneX + 14),
          y: Math.round(sceneY + 13),
          width: 12,
          height: 12,
          backgroundColor: "#ef4444",
          strokeColor: "#dc2626",
          strokeWidth: 1,
          fillStyle: "solid",
          roughness: 0,
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        {
          id: "explaino-preview-dot-yellow",
          type: "ellipse",
          x: Math.round(sceneX + 32),
          y: Math.round(sceneY + 13),
          width: 12,
          height: 12,
          backgroundColor: "#f59e0b",
          strokeColor: "#d97706",
          strokeWidth: 1,
          fillStyle: "solid",
          roughness: 0,
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        {
          id: "explaino-preview-dot-green",
          type: "ellipse",
          x: Math.round(sceneX + 50),
          y: Math.round(sceneY + 13),
          width: 12,
          height: 12,
          backgroundColor: "#22c55e",
          strokeColor: "#16a34a",
          strokeWidth: 1,
          fillStyle: "solid",
          roughness: 0,
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 4. Header title text
        {
          id: "explaino-preview-title",
          type: "text",
          x: Math.round(sceneX + 74),
          y: Math.round(sceneY + 11),
          text: "Web Preview â€” localhost:5500",
          fontSize: 14,
          fontFamily: 3,
          strokeColor: "#94a3b8",
          locked: true,
          customData: { isScreenSyncElement: true },
        },
        // 5. Header status text
        {
          id: "explaino-preview-status",
          type: "text",
          x: Math.max(Math.round(sceneX + 74), Math.round(sceneX + sceneWidth - 140)),
          y: Math.round(sceneY + 11),
          text: "â— LIVE PREVIEW",
          fontSize: 12,
          fontFamily: 3,
          strokeColor: "#10b981",
          locked: true,
          customData: { isScreenSyncElement: true },
        }
      );
    }

    // Keep the export placeholders inside the HTML windows. Excalidraw's
    // corner radius and dark-mode colors differ from the DOM, so matching
    // the outer bounds exactly lets the placeholder show through at the edges.
    const syncElements = convertToExcalidrawElements(syncElementsRaw.map((element) => {
      const bounds = element.id.startsWith("explaino-screen-") ? screenScenePos : webPreviewScenePos;
      if (!bounds) return element;
      const inset = Math.min(24 / viewport.zoom.value, bounds.sceneWidth * 0.15, bounds.sceneHeight * 0.15);
      const scaleX = (bounds.sceneWidth - inset * 2) / bounds.sceneWidth;
      const scaleY = (bounds.sceneHeight - inset * 2) / bounds.sceneHeight;
      return {
        ...element,
        x: bounds.sceneX + inset + (element.x - bounds.sceneX) * scaleX,
        y: bounds.sceneY + inset + (element.y - bounds.sceneY) * scaleY,
        ...(element.width !== undefined ? { width: element.width * scaleX } : {}),
        ...(element.height !== undefined ? { height: element.height * scaleY } : {}),
        ...(element.fontSize !== undefined ? { fontSize: element.fontSize * Math.min(scaleX, scaleY) } : {}),
      };
    }) as any);

    // Place syncElements at the bottom of the element stack so user whiteboard drawings stay visibly on top
    api.updateScene({
      elements: [...syncElements, ...nonSyncElements],
    });
  }, [showIframePanel, screenScenePos, previewWindowIds, webPreviewScenePos, apiReady, theme, viewport.zoom.value]);

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
  const lastPersistenceRef = useRef<{ id: string; elements: readonly ExcalidrawElement[]; version: number; files: BinaryFiles; state: string } | null>(null);

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
      if ((appState as unknown as Record<string, unknown>).showLibrary || (appState as unknown as { openSidebar?: { name?: string } | null }).openSidebar?.name === "library") {
        if (showExtensionsPanelRef.current) {
          setShowExtensionsPanel(false);
          showExtensionsPanelRef.current = false;
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

      // Only perform autosave / backups if canvas is fully loaded and hydrated
      const isHydrated =
        loadedRef.current &&
        !canvasTabsRef.current.isLoading &&
        Boolean(canvasTabsRef.current.activeTabId);

      if (!isHydrated) return;
      const persistedState = JSON.stringify(Object.fromEntries(Object.entries(appState).filter(([key]) =>
        key.startsWith("currentItem") || key.startsWith("export") || ["viewBackgroundColor", "theme", "zoom", "scrollX", "scrollY", "gridSize", "gridStep", "gridModeEnabled", "activeTool", "penMode", "objectsSnapModeEnabled"].includes(key)
      )));
      const capture = { id: canvasTabsRef.current.activeTabId, elements, version: getSceneVersion(elements), files, state: persistedState };
      const previous = lastPersistenceRef.current;
      if (previous && previous.id === capture.id && previous.elements === elements && previous.version === capture.version && previous.files === files && previous.state === persistedState) return;
      lastPersistenceRef.current = capture;

      if (isHydrated) {
        // Debounced local backup (optimized for low-RAM 1GB Android smart boards)
        if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
        localSaveTimerRef.current = setTimeout(() => {
          try {
            const s = latestSceneRef.current;
            if (s) {
              localStorage.setItem(
                (canvasTabsRef.current.activeTabId && getCanvasStorageKey(canvasTabsRef.current.activeTabId)) || "explaino_autosave",
                serializeAsJSON(s.elements, s.appState, s.files, "local")
              );
            }
          } catch {
            // ignore quota errors
          }
        }, getOptimalSaveDebounceMs());

        // Debounced SQLite persistence for active tab while drawing
        if (excalidrawAPI.current) {
          canvasTabsRef.current.persistCurrentSceneToCache(excalidrawAPI.current);
        }
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

  // --- Restore scene from SQLite/Firestore on mount
  useEffect(() => {
    if (canvasTabs.isLoading || initialData !== null) return;
    let cancelled = false;

    async function load() {
      // First clean up legacy keys
      try {
        localStorage.removeItem("explaino-autosave");
        localStorage.removeItem("explaino_autosave");
      } catch {}
      const url = new URL(window.location.href);
      const docId = url.searchParams.get("doc");

      if (docId) {
        const saved = await loadDrawing(docId).catch(() => null);
        if (saved && !cancelled) {
          lastHydratedCanvasIdRef.current = canvasTabs.activeTabId || canvasTabs.activeCanvas?.id || null;
          drawingIdRef.current = saved.id;
          nameRef.current = saved.name;
          setDrawingId(saved.id);
          setDrawingName(saved.name);
          commitInitialScene({
            elements: sanitizeElements(saved.elements as unknown[]),
            appState: {
              ...saved.appState,
              viewBackgroundColor: normalizeCanvasBackground(saved.appState?.viewBackgroundColor as string | undefined),
              theme,
            } as Partial<AppState>,
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
          setLoaded(true);
          return;
        }
      }

      const activeCanvas = canvasTabs.activeCanvas;
      const activeId = canvasTabs.activeTabId || activeCanvas?.id;
      let elements = (activeCanvas?.elements || []) as unknown[];
      let appState = (activeCanvas?.appState || {}) as Partial<AppState>;
      let files = (activeCanvas?.files || {}) as BinaryFiles;

      const scopedKey = getCanvasStorageKey(activeId || undefined);
      if (scopedKey && (!elements || elements.length === 0)) {
        try {
          const backup = localStorage.getItem(scopedKey);
          if (backup) {
            const parsed = JSON.parse(backup);
            if (parsed && Array.isArray(parsed.elements) && parsed.elements.length > 0) {
              elements = parsed.elements;
              if (parsed.appState) appState = parsed.appState;
              if (parsed.files) files = parsed.files;
            }
          }
        } catch {
          if (scopedKey) localStorage.removeItem(scopedKey);
        }
      }

      if (!cancelled) {
        lastHydratedCanvasIdRef.current = activeId || null;
        commitInitialScene({
          elements: sanitizeElements(elements),
          appState: {
            ...appState,
            viewBackgroundColor: normalizeCanvasBackground(appState.viewBackgroundColor),
            theme,
            viewModeEnabled: propReadOnly || isUrlReadOnly || canvasTabs.isReadOnly,
          } as Partial<AppState>,
          files: files as BinaryFiles,
        });
        setLoaded(true);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [canvasTabs.isLoading, canvasTabs.activeCanvas, canvasTabs.activeTabId, canvasTabs.isReadOnly, initialData, propReadOnly, isUrlReadOnly, theme]);

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
      setSaveStatus("Savingâ€¦");
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
      setSaveStatus("Saved to Firestore âœ“");
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
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("explaino-theme", theme);
  }, [theme]);

  // Mobile responsive listener removed (handled by CSS now)

  // Keep ref in sync with showDataStructuresPanel state
  useEffect(() => {
    showDataStructuresPanelRef.current = showDataStructuresPanel;
  }, [showDataStructuresPanel]);

  // Close code panel / data structures panel when Excalidraw's library button is clicked
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute("aria-label") === "Library") {
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
      let currentData = labels
        ? writeSlots(meta.type, meta.data as AnyStructureData, labels)
        : (meta.data as AnyStructureData);

      // The resize handles change the live cell geometry. Keep those sizes
      // when adding or removing rows and columns instead of reverting to 120Ã—40.
      const firstCell = meta.type === "table" ? mine.find((el) => el.type === "rectangle") : undefined;
      if (firstCell && meta.type === "table") {
        currentData = { ...currentData, cellWidth: firstCell.width, cellHeight: firstCell.height } as AnyStructureData;
      }

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
        if (firstCell) {
          anchorX = firstCell.x;
          anchorY = firstCell.y - 32;
        }

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
        for (const el of all) {
          if (el.type === "text" && el.containerId && replacedIds.has(el.containerId)) replacedIds.add(el.id);
        }
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
    const elements = api.getSceneElements();
    const memberIds = new Set(elements.filter((el) => readMeta(el)?.instanceId === instanceId).map((el) => el.id));
    api.updateScene({
      elements: elements.filter((el) => !memberIds.has(el.id) && !(el.type === "text" && el.containerId && memberIds.has(el.containerId))),
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
  const handleInsertDiagramElements = useCallback((elements: readonly ExcalidrawElement[], files?: BinaryFiles) => {
    const api = excalidrawAPI.current;
    if (!api || elements.length === 0) return;

    // Register any binary files (such as high-res SVG fallback graphics) with Excalidraw so image elements render clearly
    if (files && Object.keys(files).length > 0) {
      api.addFiles(Object.values(files));
    }

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
    async (code: string, lang: string) => {
      const { createCodeCardSvg } = await import("@/lib/ai/highlight");
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
    const model = getStoredModel();
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
    if (!api.getSceneElements().some((element) => !element.isDeleted && element.type === "image" && element.customData?.isCodeCard)) return;
    let cancelled = false;
    void import("@/lib/ai/highlight").then(({ createCodeCardSvg }) => {
      if (cancelled) return;
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
    }).catch((error) => console.warn("Code card theme update failed:", error));
    return () => { cancelled = true; };
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

  const handlePdfDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isUrlReadOnly && !canvasTabs.isReadOnly && e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, [isUrlReadOnly, canvasTabs.isReadOnly]);

  const openCanvasFiles = useCallback((files: File[], clientX: number, clientY: number) => {
    if (isUrlReadOnly || canvasTabs.isReadOnly || !canvasTabs.activeCanvas) return;
    const api = excalidrawAPI.current;
    if (!files.length || !api) return;
    const point = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
    const canvasId = canvasTabs.activeCanvas.id;
    const pdfs: PdfWindowItem[] = []; const offices: OfficeWindowItem[] = []; let focus = "";
    files.forEach((file, index) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const item = { id: crypto.randomUUID(), canvasId, file, x: point.x + index * 30, y: point.y + index * 30 };
      if (extension === "pdf" || file.type === "application/pdf") { pdfs.push(item); focus = `pdf-${item.id}`; }
      else if (extension === "docx" || extension === "xlsx" || extension === "pptx") { offices.push({ ...item, kind: extension as OfficeKind }); focus = `office-${item.id}`; }
      else if (["doc", "xls", "ppt"].includes(extension ?? "")) alert("Please save this file as DOCX, XLSX, or PPTX in Office first. Legacy DOC, XLS, and PPT files are not supported.");
    });
    if (pdfs.length) setPdfWindows((previous) => [...previous, ...pdfs]);
    if (offices.length) setOfficeWindows((previous) => [...previous, ...offices]);
    if (focus) focusCanvasWindow(focus);
  }, [isUrlReadOnly, canvasTabs.isReadOnly, canvasTabs.activeCanvas, focusCanvasWindow]);

  const handlePdfDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer.files).filter((file) => /\.(pdf|docx|xlsx|pptx|doc|xls|ppt)$/i.test(file.name) || file.type === "application/pdf");
    if (!files.length || isUrlReadOnly || canvasTabs.isReadOnly) return;
    e.preventDefault(); e.stopPropagation(); openCanvasFiles(files, e.clientX, e.clientY);
  }, [isUrlReadOnly, canvasTabs.isReadOnly, openCanvasFiles]);

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
    onExitLaser: () => setLaserActive(false),
    isLaserActive: laserActive,
    isScreenActive: isScreenActive && showIframePanel,
  });

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => {
      const api = () => excalidrawAPI.current;
      const closePanels = () => {
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
        {
          id: "open-office-document", label: "Open PDF, Word, Excel or PowerPoint File", category: "Canvas",
          keywords: ["file", "document", "docx", "xlsx", "pptx", "pdf", "import", "spreadsheet", "presentation"],
          icon: <FolderOpen size={15} />, run: () => documentInputRef.current?.click(),
        },
        // â”€â”€â”€ Screen & Code Server (Workspace) â”€â”€â”€
        {
          id: "toggle-screen",
          label: "Toggle Canvas Screen (Code Server)",
          category: "Screen",
          shortcut: "Browser",
          keywords: ["screen", "code server", "vps", "vscode", "terminal", "workspace"],
          icon: <Monitor size={15} />,
          run: () => {
            if (!showIframePanel) {
              handleOpenScreen();
            } else {
              setShowIframePanel(false);
              saveScreenState({ isOpen: false });
            }
          },
        },
        {
          id: "toggle-web-preview",
          label: "Open Web Preview Window",
          category: "Screen",
          shortcut: "Live Server",
          hint: "Responsive macOS window on canvas",
          keywords: ["preview", "web preview", "live server", "localhost", "website", "vps", "browser"],
          icon: <Globe size={15} />,
          run: handleOpenWebPreview,
        },
        {
          id: "web-preview-new-tab",
          label: "Open Web Preview in External Browser Tab",
          category: "Screen",
          shortcut: "New Tab",
          hint: "Launch on local device",
          keywords: ["preview", "new tab", "external", "live server", "browser tab", "localhost"],
          icon: <ExternalLink size={15} />,
          run: () => {
            const url = buildExternalTabUrl(DEFAULT_PREVIEW_PORT, DEFAULT_PREVIEW_PATH);
            window.open(url, "_blank", "noopener,noreferrer");
          },
        },
        {
          id: "focus-screen",
          keywords: ["focus", "type", "screen", "terminal", "code server"],
          label: "Focus & Type in Code Server",
          category: "Screen",
          shortcut: "Enter",
          icon: <Terminal size={15} />,
          run: () => {
            handleOpenScreen();
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
        // â”€â”€â”€ Drawing & Canvas Tools â”€â”€â”€
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

        // â”€â”€â”€ Data Structures & Tables â”€â”€â”€
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

        // â”€â”€â”€ AI & Diagram Generation â”€â”€â”€
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

        // â”€â”€â”€ View & Zoom â”€â”€â”€
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

        // â”€â”€â”€ Productivity & Tasks â”€â”€â”€
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

        // â”€â”€â”€ Cloud & File â”€â”€â”€
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

        // â”€â”€â”€ File & Excalidraw Menu â”€â”€â”€
        {
          id: "export-image",
          label: "Export Image...",
          category: "File",
          shortcut: "Ctrl+Shift+E",
          hint: "PNG, SVG, Clipboard",
          keywords: ["image", "export", "export image", "download", "png", "svg", "clipboard", "save as image"],
          icon: <ImageIcon size={15} />,
          run: () => {
            const a = api();
            if (a) {
              a.updateScene({
                appState: {
                  openDialog: { name: "imageExport" },
                } as unknown as AppState,
              });
            }
          },
        },
        {
          id: "save-to-file",
          label: "Save to...",
          category: "File",
          shortcut: "Save to...",
          hint: "Export .excalidraw or JSON",
          keywords: ["save", "save to", "export scene", "json", "download"],
          icon: <Download size={15} />,
          run: () => {
            const a = api();
            if (a) {
              a.updateScene({
                appState: {
                  openDialog: { name: "jsonExport" },
                } as unknown as AppState,
              });
            }
          },
        },
        {
          id: "open-scene",
          label: "Open Drawing...",
          category: "File",
          shortcut: "Ctrl+O",
          hint: "Open .excalidraw file",
          keywords: ["open", "load", "import", "file", "scene"],
          icon: <FolderOpen size={15} />,
          run: () => {
            const fileInput = document.querySelector<HTMLInputElement>(".excalidraw input[type='file']");
            if (fileInput) fileInput.click();
          },
        },
        {
          id: "insert-image",
          label: "Insert Image on Canvas",
          category: "Tools",
          shortcut: "Image",
          hint: "Upload image file to whiteboard",
          keywords: ["image", "insert image", "add image", "upload image", "picture", "photo"],
          icon: <ImageIcon size={15} />,
          run: () => {
            api()?.setActiveTool({ type: "image" });
          },
        },
        {
          id: "find-on-canvas",
          label: "Find on Canvas",
          category: "Tools",
          shortcut: "Ctrl+F",
          hint: "Search text elements across canvas",
          keywords: ["find", "search", "search canvas", "find text"],
          icon: <Search size={15} />,
          run: () => {
            const a = api();
            if (a) {
              a.updateScene({
                appState: {
                  openSidebar: { name: "search" },
                } as unknown as AppState,
              });
            }
          },
        },
        {
          id: "help-shortcuts",
          label: "Help & Keyboard Shortcuts",
          category: "Help",
          shortcut: "?",
          hint: "Shortcuts & documentation",
          keywords: ["help", "shortcuts", "keyboard", "docs", "documentation"],
          icon: <HelpCircle size={15} />,
          run: () => {
            const a = api();
            if (a) {
              a.updateScene({
                appState: {
                  openDialog: { name: "help" },
                } as unknown as AppState,
              });
            }
          },
        },

        // â”€â”€â”€ Canvas Background Colors â”€â”€â”€
        {
          id: "canvas-bg-dark",
          label: "Canvas Background: Dark Slate (#121212)",
          category: "Canvas Background",
          keywords: ["background", "canvas background", "color", "dark", "slate", "theme"],
          icon: <Palette size={15} />,
          run: () => api()?.updateScene({ appState: { viewBackgroundColor: "#121212" } as unknown as AppState }),
        },
        {
          id: "canvas-bg-light",
          label: "Canvas Background: Pure White (#ffffff)",
          category: "Canvas Background",
          keywords: ["background", "canvas background", "color", "white", "light", "theme"],
          icon: <Palette size={15} />,
          run: () => api()?.updateScene({ appState: { viewBackgroundColor: "#ffffff" } as unknown as AppState }),
        },
        {
          id: "canvas-bg-blueprint",
          label: "Canvas Background: Navy Blueprint (#1b1e2e)",
          category: "Canvas Background",
          keywords: ["background", "canvas background", "color", "navy", "blueprint", "blue"],
          icon: <Palette size={15} />,
          run: () => api()?.updateScene({ appState: { viewBackgroundColor: "#1b1e2e" } as unknown as AppState }),
        },
        {
          id: "canvas-bg-amber",
          label: "Canvas Background: Warm Amber (#24201a)",
          category: "Canvas Background",
          keywords: ["background", "canvas background", "color", "amber", "sepia", "warm"],
          icon: <Palette size={15} />,
          run: () => api()?.updateScene({ appState: { viewBackgroundColor: "#24201a" } as unknown as AppState }),
        },

        // â”€â”€â”€ Extensions & Controls â”€â”€â”€
        {
          id: "toggle-handy-toolbar",
          label: `${showHandyToolbar ? "Hide" : "Show"} Handy Toolbar`,
          category: "Tools",
          shortcut: "Handy",
          keywords: ["handy", "handy toolbar", "toolbar", "quick tools", "floating toolbar"],
          icon: <Sliders size={15} />,
          run: () => handleToggleHandyToolbar(),
        },
        {
          id: "toggle-extensions-panel",
          label: `${showExtensionsPanel ? "Close" : "Open"} Extensions Panel`,
          category: "Tools",
          shortcut: "Extensions",
          keywords: ["extensions", "plugins", "panel", "tools"],
          icon: <Blocks size={15} />,
          run: () => setShowExtensionsPanel((v) => !v),
        },

        // â”€â”€â”€ AI Models â”€â”€â”€
        ...ALL_MODELS.map((m) => ({
          id: `switch-model-${m.id}`,
          label: `Switch AI Model: ${m.label}`,
          category: "AI Models",
          shortcut: m.provider === "gemini" ? "Gemini" : "Mistral",
          hint: m.description,
          keywords: ["model", "ai", "llm", m.label.toLowerCase(), m.id, m.provider, "change model", "switch model", "select model"],
          icon: <Sparkles size={15} />,
          run: () => {
            setStoredModel(m.id);
            window.dispatchEvent(new CustomEvent("explaino-model-changed", { detail: m.id }));
          },
        })),
        {
          id: "change-ai-model-settings",
          label: "Change AI Model / Settings",
          category: "AI Models",
          shortcut: "Model",
          hint: "Open model options",
          keywords: ["model", "change model", "select model", "gemini", "mistral", "codestral", "nemo"],
          icon: <Sparkles size={15} />,
          run: () => {
            setShowExtensionsPanel(true);
          },
        },

        // â”€â”€â”€ Account â”€â”€â”€
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
      showAiTextPanel,
      showDataStructuresPanel,
      showExplaino,
      handleInsertTable,
      handleInsertDataStructure,
      handleSaveClick,
      showWebPreviewPanel,
      showHandyToolbar,
      showExtensionsPanel,
      handleOpenWebPreview,
      handleToggleHandyToolbar,
    ]
  );

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawAPI.current = api;
    if (typeof window !== "undefined") {
      (window as any).__testExcalidrawAPI = api;
    }
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
    return (
      <div className="flex items-center gap-1.5" style={{ marginLeft: 8 }}>
        {/* 1. Theme toggle outside on the left of Extensions button */}
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
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle dark mode"
        >
          {theme === "dark" ? (
            <Sun size={16} strokeWidth={2.2} />
          ) : (
            <Moon size={16} strokeWidth={2.2} />
          )}
        </button>

        {/* 2. Extensions button with icon before Extensions (opens side panel) */}
        <button
          type="button"
          data-extensions-toggle="true"
          onClick={() => {
            const api = excalidrawAPI.current;
            if (!showExtensionsPanel && api) {
              api.updateScene({
                appState: { showLibrary: false, openSidebar: null } as unknown as AppState,
              });
            }
            setShowExtensionsPanel((v) => !v);
          }}
          className="excalidraw-button hidden md:inline-flex"
          style={{
            ...EXTENSIONS_BUTTON_STYLE,
            ...(showExtensionsPanel
              ? theme === "dark"
                ? {
                    background: "#e0dfff",
                    color: "#030064",
                  }
                : {
                    background: "var(--color-on-primary-container, #030064)",
                    color: "#ffffff",
                  }
              : {
                  background: "var(--color-surface-primary-container, #e0dfff)",
                  color: "var(--color-on-primary-container, #030064)",
                  border: "none",
                }),
          }}
          title="Extensions â€” canvas tools, AI, screen, diagrams, and stopwatch"
          aria-pressed={showExtensionsPanel}
        >
          <GoogleExtensionIcon size={16} />
          <span>Extensions</span>
          {laserActive && (
            <span
              className="w-2 h-2 rounded-full bg-red-500 animate-pulse"
              style={{ marginLeft: 2 }}
              title="Laser is active"
            />
          )}
        </button>
      </div>
    );
  }, [theme, showExtensionsPanel, laserActive]);

  // QuickShape hold-detection pipeline managed via useQuickShape hook
  useQuickShape(excalidrawAPI, apiReady);

  return (
    <div className={`w-full h-screen overflow-hidden relative flex flex-col${laserActive ? " explaino-laser-active" : ""}`} style={{ fontFamily: "var(--ui-font, 'Assistant', sans-serif)" }}>
      {/* If student read-only fallback via ?view=...&readonly=true, show top banner */}
      {isUrlReadOnly && (
        <div
          data-readonly-banner="true"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-zinc-900/95 border border-zinc-700/80 shadow-xl backdrop-blur-md text-xs select-none pointer-events-auto"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-semibold text-white">Student View</span>
          <span className="text-zinc-500">â€¢</span>
          <span className="flex items-center text-amber-400 font-medium space-x-1">
            <Lock size={12} />
            <span>Read-Only Mode</span>
          </span>
        </div>
      )}

      <div className="flex-1 w-full min-h-0 relative">
      {!loaded || initialData === null || canvasTabs.isLoading ? (
        <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--default-bg-color)" }}>
          <div className="text-sm text-gray-400">Loading canvasâ€¦</div>
        </div>
      ) : (
      <div
        className="w-full h-full"
        onDragOverCapture={handlePdfDragOver}
        onDropCapture={handlePdfDrop}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
      <ExcalidrawComponent
        excalidrawAPI={handleExcalidrawAPI}
        onChange={handleOnChange}
        initialData={initialData}
        name={drawingName}
        theme={theme}
        viewModeEnabled={isUrlReadOnly || canvasTabs.isReadOnly}
        renderTopRightUI={isUrlReadOnly ? undefined : renderTopRightUI}
      >
        {isUrlReadOnly ? null : mainMenuContent}
      </ExcalidrawComponent>
      {/* Transient laser-pointer layer: screen-space only, never touches the
          scene or the undo/redo history. */}
      {laserActive && <LaserOverlay active={laserActive} onExit={() => setLaserActive(false)} />}
      {/* Stopwatch & Timer â€” responsive position:
          Desktop (>=1024px): anchored to top-left next to hamburger menu (3 slashes)
          Narrow screen (<1024px): anchored to bottom-center of the page below drawing/canvas tools */}
      {showStopwatch && (
        <div
          className="fixed z-20 pointer-events-auto transition-all duration-300 max-xl:bottom-3 max-xl:left-1/2 max-xl:-translate-x-1/2 xl:top-2.5 xl:left-[60px] xl:bottom-auto xl:translate-x-0 flex items-center"
        >
          <Stopwatch theme={theme} isCompact={isNarrowForStopwatch} />
        </div>
      )}
      </div>
      )}

      {/* Floating right canvas toolbar for tablets and laptops (hidden on phones) */}
      {showHandyToolbar && !isUrlReadOnly && (
        <div className="flex">
        <RightCanvasToolbar
          laserActive={laserActive}
          onToggleLaser={() => setLaserActive((v) => !v)}
          showScreen={showIframePanel}
          onToggleScreen={() => {
            if (!showIframePanel) {
              handleOpenScreen();
            } else {
              setShowIframePanel(false);
              saveScreenState({ isOpen: false });
            }
          }}
          onOpenDiagram={() => setShowTextToDiagramModal(true)}
          showDataStructures={showDataStructuresPanel}
          onToggleDataStructures={() => {
            const api = excalidrawAPI.current;
            if (!showDataStructuresPanel && api) {
              api.updateScene({ appState: { showLibrary: false } as unknown as AppState });
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

      {/* Todo overlay â€” toggled by the top-left corner button */}
      {showTodos && <TodoPanel onClose={() => setShowTodos(false)} />}

      {/* VS Code-style command palette (Ctrl/Cmd+Shift+P) */}
      {showPalette && (
        <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />
      )}

      {/* In-canvas text toolbar â€” anchored to the selected/editing text box */}
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
                  placeholder="Ask Gemini 3.8 Flashâ€¦"
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

      {/* Iframe / Screen Panel */}
      <input ref={documentInputRef} type="file" aria-label="Open document files" multiple accept=".pdf,.docx,.xlsx,.pptx" style={{ display: "none" }} onChange={(event) => { openCanvasFiles(Array.from(event.target.files ?? []), window.innerWidth / 2 - 300, window.innerHeight / 2 - 200); event.target.value = ""; }} />
      {!isUrlReadOnly && officeWindows.map((item) => <OfficeCanvasWindow key={item.id} item={item} viewport={viewport} visible={item.canvasId === canvasTabs.activeCanvas?.id} zIndex={canvasWindowZIndex(`office-${item.id}`)} onFocusWindow={() => focusCanvasWindow(`office-${item.id}`)} onClose={() => { void deleteOfficeWindow(item.id).catch((error) => console.error("Unable to remove document window", error)); setOfficeWindows((previous) => previous.filter((window) => window.id !== item.id)); setCanvasWindowOrder((previous) => previous.filter((id) => id !== `office-${item.id}`)); setActiveCanvasWindow((active) => active === `office-${item.id}` ? null : active); }} />)}
      {!isUrlReadOnly && pdfWindows.map((item) => (
        <PdfCanvasWindow key={item.id} item={item} viewport={viewport} visible={item.canvasId === canvasTabs.activeCanvas?.id} focused={activeCanvasWindow === `pdf-${item.id}`} zIndex={canvasWindowZIndex(`pdf-${item.id}`)} onFocusWindow={() => focusCanvasWindow(`pdf-${item.id}`)} onClose={() => { void deletePdfWindow(item.id).catch((error) => console.error("Unable to remove saved PDF window", error)); setPdfWindows((previous) => previous.filter((window) => window.id !== item.id)); setCanvasWindowOrder((previous) => previous.filter((entry) => entry !== `pdf-${item.id}`)); setActiveCanvasWindow((active) => active === `pdf-${item.id}` ? null : active); }} />
      ))}
      {showIframePanel && !isUrlReadOnly && (
        <IframePanel
          zIndex={canvasWindowZIndex("code-server")}
          onFocusWindow={() => focusCanvasWindow("code-server")}
          onClose={() => {
            setShowIframePanel(false);
            setIsScreenActive(false);
            setCanvasWindowOrder((previous) => previous.filter((entry) => entry !== "code-server"));
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
          recenterTrigger={screenRecenterTrigger}
          onScenePosChange={setScreenScenePos}
        />
      )}

      {/* Web Preview Panel (Dedicated macOS Window for Live Server on VPS) */}
      {!isUrlReadOnly && previewWindowIds.map((id, index) => (
        <WebPreviewPanel
          key={id}
          zIndex={canvasWindowZIndex(`preview-${id}`)}
          onFocusWindow={() => focusCanvasWindow(`preview-${id}`)}
          isOpen
          onClose={() => {
            setPreviewWindowIds((previous) => previous.filter((windowId) => windowId !== id));
            setActivePreviewId((active) => active === id ? null : active);
            setCanvasWindowOrder((previous) => previous.filter((entry) => entry !== `preview-${id}`));
            if (id === 0) { setWebPreviewScenePos(null); savePreviewState({ isOpen: false }); }
          }}
          viewport={viewport}
          siblingWindowPos={screenScenePos}
          onCanvasScroll={handleScreenCanvasScroll}
          isActive={activePreviewId === id}
          onActiveChange={(active) => {
            setActivePreviewId((current) => active ? id : current === id ? null : current);
            if (active) {
              excalidrawAPI.current?.setActiveTool({ type: "selection" });
            }
          }}
          activeToolType={activeToolType}
          persistState={id === 0}
          windowOffset={index}
          onScenePosChange={id === 0 ? setWebPreviewScenePos : undefined}
        />
      ))}

      {/* Explaino voice notes panel */}
      {showExplaino && !isUrlReadOnly && (
        <ExplainoPanel
          onClose={() => setShowExplaino(false)}
          getSceneSnapshot={getSceneSnapshotForNote}
          getSceneData={getSceneDataForNote}
          viewport={viewport}
        />
      )}

      {/* AI Text sidebar â€” slides in from the right at half the Code width */}
      {showAiTextPanel && !isUrlReadOnly && (
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
          className="fixed bottom-6 max-xl:bottom-16 left-1/2 -translate-x-1/2 z-[100] text-white text-xs font-medium px-4 py-2 rounded-lg shadow-lg"
          style={{ background: "var(--color-gray-90, #1e1e1e)" }}
        >
          {saveStatus}
        </div>
      )}

            {/* Laser indicator banner when laser is actively drawing */}
      {laserActive && (
        <div className="fixed bottom-6 max-xl:bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-600/95 text-white text-xs font-semibold shadow-2xl backdrop-blur transition-all pointer-events-auto border border-red-400/40 animate-in fade-in slide-in-from-bottom-2 select-none" onPointerDown={(e) => e.stopPropagation()}>
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          <span>Laser Pointer Active</span>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLaserActive(false);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLaserActive(false);
            }}
            className="ml-2 px-2.5 py-1 rounded-md bg-black/40 hover:bg-black/60 active:bg-black/80 text-white text-[11px] font-semibold transition-colors cursor-pointer select-none"
            title="Turn off laser (Esc)"
          >
            Exit (Esc)
          </button>
        </div>
      )}

      {/* Phone-only Floating Extensions Button (Excalidraw signature light purple / lavender circle in bottom right) */}
      {!isUrlReadOnly && (
      <button
        type="button"
        data-phone-extensions-fab="true"
        onClick={() => {
          const api = excalidrawAPI.current;
          if (!showExtensionsPanel && api) {
            api.updateScene({
              appState: { showLibrary: false, openSidebar: null } as unknown as AppState,
            });
          }
          setShowExtensionsPanel((v) => !v);
        }}
        className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 active:scale-90 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/50 cursor-pointer"
        style={{
          background: showExtensionsPanel
            ? theme === "dark"
              ? "#e0dfff"
              : "#6965db"
            : theme === "dark"
            ? "#2d2b52"
            : "#e0dfff",
          color: showExtensionsPanel
            ? theme === "dark"
              ? "#030064"
              : "#ffffff"
            : theme === "dark"
            ? "#e0dfff"
            : "#030064",
          boxShadow:
            theme === "dark"
              ? "0 10px 25px -4px rgba(0, 0, 0, 0.6), 0 0 0 1.5px rgba(224, 223, 255, 0.25) inset"
              : "0 10px 25px -4px rgba(105, 101, 219, 0.4), 0 0 0 1.5px rgba(3, 0, 100, 0.12) inset",
        }}
        title="Extensions"
        aria-label="Open Extensions Menu"
        aria-pressed={showExtensionsPanel}
      >
        <GoogleExtensionIcon size={24} className="drop-shadow-sm" />
        {laserActive && (
          <span
            className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white animate-pulse"
            title="Laser is active"
          />
        )}
      </button>
      )}

      {/* Extensions Side Panel */}
      {showExtensionsPanel && <ExtensionsPanel
        isOpen={showExtensionsPanel && !isUrlReadOnly}
        onClose={() => setShowExtensionsPanel(false)}
        theme={theme}
        laserActive={laserActive}
        onToggleLaser={() => setLaserActive((v) => !v)}
        showScreen={showIframePanel}
        onOpenScreen={handleOpenScreen}
        showWebPreview={showWebPreviewPanel}
        onOpenWebPreview={handleOpenWebPreview}
        onOpenDiagram={() => setShowTextToDiagramModal(true)}
        showDataStructures={showDataStructuresPanel}
        onOpenDataStructures={() => {
          const api = excalidrawAPI.current;
          if (api) {
            api.updateScene({ appState: { showLibrary: false, openSidebar: null } as unknown as AppState });
          }
          setShowDataStructuresPanel(true);
        }}
        onInsertTable={handleInsertTable}
        showExplaino={showExplaino}
        onOpenExplaino={() => setShowExplaino(true)}
        showAiText={showAiTextPanel}
        onOpenAiText={() => setShowAiTextPanel(true)}
        showStopwatch={showStopwatch}
        onToggleStopwatch={() => setShowStopwatch((v) => !v)}
        showHandyToolbar={showHandyToolbar}
        onToggleHandyToolbar={handleToggleHandyToolbar}
        tabs={canvasTabs.tabs}
        activeTabId={canvasTabs.activeTabId}
        onSelectTab={(id) => canvasTabs.selectTab(id, excalidrawAPI.current)}
        onNewTab={(name) => canvasTabs.addTab(name, excalidrawAPI.current)}
        onCloseTab={(id) => canvasTabs.closeTab(id, excalidrawAPI.current)}
        onRenameTab={canvasTabs.renameTab}
        onDuplicateTab={(id) => canvasTabs.duplicateTab(id, excalidrawAPI.current)}
        isReadOnly={canvasTabs.isReadOnly}
        onToggleReadOnly={() => canvasTabs.toggleReadOnly(excalidrawAPI.current)}
        shareUrl={canvasTabs.shareUrl}
        onCopyShareUrl={canvasTabs.copyShareUrl}
        canvasError={canvasTabs.loadError}
        onRetryCanvases={canvasTabs.retryLoad}
      />}

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
    </div>
  );
}
