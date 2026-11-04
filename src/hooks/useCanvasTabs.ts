"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getSceneVersion } from "@excalidraw/excalidraw";
import type { CanvasTabItem, CanvasDetail, CanvasSnapshot } from "@/types/canvas";
import { normalizeCanvasBackground } from "@/lib/canvasTheme";

export interface UseCanvasTabsOptions {
  initialCanvasId?: string;
  isReadOnly?: boolean;
  excalidrawAPI?: ExcalidrawImperativeAPI | null;
  onSceneRestored?: (canvas: CanvasDetail) => void;
}

export function useCanvasTabs(options?: UseCanvasTabsOptions) {
  const [tabs, setTabs] = useState<CanvasTabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [activeCanvas, setActiveCanvas] = useState<CanvasDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // In-memory cache for sub-10ms instant tab switching with zero flicker
  const cacheRef = useRef<Map<string, CanvasSnapshot>>(new Map());

  // Synchronous tabs reference to prevent stale closure races during rapid operations
  const tabsRef = useRef<CanvasTabItem[]>(tabs);

  // Blacklist of tabs currently deleted or being closed to prevent ghost autosaves and PUT 404s
  const deletedTabIdsRef = useRef<Set<string>>(new Set());

  // Per-canvas debounced autosave timers (prevents rapid tab switching from cancelling previous tab saves)
  const saveTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastSaveCaptureRef = useRef(new Map<string, { elements: readonly ExcalidrawElement[]; version: number; files: BinaryFiles; state: string }>());
  const mountedRef = useRef(true);

  // Ref tracking current activeTabId synchronously
  const activeTabIdRef = useRef<string>(activeTabId);

  // Synchronous loading & read-only state refs to avoid stale closure issues in debounced callbacks
  const isLoadingRef = useRef<boolean>(isLoading);
  const isReadOnlyRef = useRef<boolean>(isReadOnly);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    isLoadingRef.current = isLoading;
    isReadOnlyRef.current = isReadOnly;
  }, [tabs, activeTabId, isLoading, isReadOnly]);

  // Prevent duplicate concurrent fallback tab creation requests
  const isCreatingFallbackRef = useRef<boolean>(false);

  // Clear all pending save timers on unmount
  useEffect(() => {
    mountedRef.current = true;
    const timeouts = saveTimeoutsRef.current;
    return () => {
      mountedRef.current = false;
      timeouts.forEach((timer) => clearTimeout(timer));
      timeouts.clear();
    };
  }, []);

  // Initialize tabs from database
  useEffect(() => {
    let cancelled = false;

    async function loadInitialTabs() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const query = new URLSearchParams(window.location.search);
        const requested = options?.initialCanvasId || query.get("view") || query.get("canvas") || query.get("doc") || localStorage.getItem("explaino_active_canvas_id") || "";
        const res = await fetch(`/api/canvases?include_data=true&initial_only=true&initial_canvas=${encodeURIComponent(requested)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load canvases.");

        if (cancelled) return;

        if (res.ok && Array.isArray(json.canvases) && json.canvases.length > 0) {
          // Pre-populate in-memory cache for all loaded tabs
          json.canvases.filter((c: CanvasDetail & { data_loaded?: boolean }) => c.data_loaded !== false).forEach((c: CanvasDetail) => {
            cacheRef.current.set(c.id, {
              name: c.name || "Untitled Canvas",
              elements: c.elements || [],
              appState: c.appState || {},
              files: c.files || {},
              isReadOnly: Boolean(c.is_readonly),
            });
          });

          const loadedTabs: CanvasTabItem[] = json.canvases.map((c: CanvasDetail) => ({
            id: c.id,
            name: c.name || "Untitled Canvas",
            isReadOnly: Boolean(c.is_readonly),
            sortOrder: c.sort_order ?? 0,
          }));

          tabsRef.current = loadedTabs;
          setTabs(loadedTabs);

          // Check if options or URL specified a canvas, or restore last active tab
          const urlParams = new URLSearchParams(window.location.search);
          const urlCanvasId = options?.initialCanvasId || urlParams.get("view") || urlParams.get("canvas") || urlParams.get("doc");
          const savedActiveTabId = typeof window !== "undefined" ? localStorage.getItem("explaino_active_canvas_id") : null;
          const targetId = json.canvases.find((c: CanvasDetail & { data_loaded?: boolean }) => c.data_loaded === true)?.id ||
            (urlCanvasId && loadedTabs.find((t) => t.id === urlCanvasId)?.id) ||
            (savedActiveTabId && loadedTabs.find((t) => t.id === savedActiveTabId)?.id) ||
            loadedTabs[0].id;

          const targetCanvas = json.canvases.find((c: CanvasDetail) => c.id === targetId) || json.canvases[0];
          setActiveTabId(targetId);
          activeTabIdRef.current = targetId;
          setActiveCanvas(targetCanvas);
          setIsReadOnly(Boolean(options?.isReadOnly || targetCanvas.is_readonly));
          try {
            localStorage.setItem("explaino_active_canvas_id", targetId);
          } catch {}
        } else {
          // If no canvas exists, create a default "Main Whiteboard"
          const createRes = await fetch("/api/canvases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Main Whiteboard",
              elements: [],
              appState: { viewBackgroundColor: "#ffffff" },
              files: {},
            }),
          });
          const createJson = await createRes.json();
          if (!createRes.ok || !createJson.canvas) throw new Error(createJson.error || "Could not create the first canvas.");
          const created = createJson.canvas;

          if (!cancelled && created) {
            const firstTab: CanvasTabItem = {
              id: created.id,
              name: created.name,
              isReadOnly: Boolean(options?.isReadOnly),
              sortOrder: 0,
            };
            cacheRef.current.set(created.id, {
              name: created.name,
              elements: created.elements || [],
              appState: created.appState || {},
              files: created.files || {},
              isReadOnly: Boolean(options?.isReadOnly),
            });
            tabsRef.current = [firstTab];
            setTabs([firstTab]);
            setActiveTabId(created.id);
            activeTabIdRef.current = created.id;
            setActiveCanvas(created);
            setIsReadOnly(Boolean(options?.isReadOnly));
          }
        }
      } catch (err) {
        console.error("Failed to load initial canvases:", err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Canvas storage is unavailable.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    }

    loadInitialTabs();

    return () => {
      cancelled = true;
    };
  }, [options?.initialCanvasId, options?.isReadOnly, retryCount]);

  // Fetch active canvas data when activeTabId changes (if not already cached)
  useEffect(() => {
    if (!activeTabId) return;

    let cancelled = false;

    async function fetchActiveData() {
      const cached = cacheRef.current.get(activeTabId);
      if (cached) {
        setIsReadOnly(cached.isReadOnly);
        setActiveCanvas((prev) => {
          if (prev?.id === activeTabId) return prev;
          const tab = tabsRef.current.find((t) => t.id === activeTabId);
          return {
            id: activeTabId,
            name: cached.name || tab?.name || "Untitled Canvas",
            elements: (cached.elements || []) as unknown[],
            appState: (cached.appState || {}) as Record<string, unknown>,
            files: (cached.files || {}) as BinaryFiles,
            is_readonly: cached.isReadOnly ? 1 : 0,
            share_slug: activeTabId,
            sort_order: tab?.sortOrder ?? 0,
            created_at: Date.now(),
            updated_at: Date.now(),
          };
        });
        return;
      }

      try {
        const res = await fetch(`/api/canvases/${activeTabId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;

        if (json.canvas) {
          setActiveCanvas(json.canvas);
          setIsReadOnly(Boolean(json.canvas.is_readonly));
          cacheRef.current.set(activeTabId, {
            name: json.canvas.name,
            elements: json.canvas.elements || [],
            appState: json.canvas.appState || {},
            files: json.canvas.files || {},
            isReadOnly: Boolean(json.canvas.is_readonly),
          });
        }
      } catch (err) {
        console.error("Failed to fetch active canvas detail:", err);
      }
    }

    fetchActiveData();

    return () => {
      cancelled = true;
    };
  }, [activeTabId]);

  // Capture current scene into cache and save to DB
  const persistCurrentSceneToCache = useCallback(
    (
      api?: ExcalidrawImperativeAPI | null,
      targetCanvasId?: string,
      options?: { immediate?: boolean }
    ) => {
      if (isLoadingRef.current) return;
      const currentId = targetCanvasId || activeTabIdRef.current;
      if (!currentId || !api) return;

      // Guard: Never persist or schedule saves for deleted/closed tabs
      if (deletedTabIdsRef.current.has(currentId)) return;

      try {
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const files = api.getFiles();

        const currentTab = tabsRef.current.find((t) => t.id === currentId);
        const name = currentTab?.name || "Untitled Canvas";

        cacheRef.current.set(currentId, {
          name,
          elements,
          appState,
          files,
          isReadOnly: Boolean(isReadOnlyRef.current),
        });

        const savePayload = {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            gridSize: appState.gridSize,
            theme: appState.theme,
          },
          files,
        };
        const capture = { elements, version: getSceneVersion(elements), files, state: JSON.stringify([name, savePayload.appState]) };
        const previous = lastSaveCaptureRef.current.get(currentId);
        if (!options?.immediate && previous && previous.elements === elements && previous.version === capture.version && previous.files === files && previous.state === capture.state) return;
        lastSaveCaptureRef.current.set(currentId, capture);

        const executePut = async (attempt = 0) => {
          if (!mountedRef.current || deletedTabIdsRef.current.has(currentId) || lastSaveCaptureRef.current.get(currentId) !== capture) return;
          let retryScheduled = false;
          try {
            const response = await fetch(`/api/canvases/${currentId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(savePayload),
            });
            if (!response.ok) throw new Error(`Canvas save failed (${response.status}).`);
          } catch (e) {
            if (mountedRef.current && lastSaveCaptureRef.current.get(currentId) === capture) {
              if (attempt < 3 && !deletedTabIdsRef.current.has(currentId)) {
                const timer = setTimeout(() => void executePut(attempt + 1), 1000 * 2 ** attempt);
                saveTimeoutsRef.current.set(currentId, timer);
                retryScheduled = true;
              } else {
                lastSaveCaptureRef.current.delete(currentId);
              }
            }
            console.warn(`Background tab save error for ${currentId}:`, e);
          } finally {
            if (!retryScheduled && lastSaveCaptureRef.current.get(currentId) === capture) saveTimeoutsRef.current.delete(currentId);
          }
        };

        // Clear ONLY this canvas's previous pending save timer
        const existingTimer = saveTimeoutsRef.current.get(currentId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          saveTimeoutsRef.current.delete(currentId);
        }

        if (options?.immediate) {
          executePut();
        } else {
          const timer = setTimeout(() => void executePut(), 500);
          saveTimeoutsRef.current.set(currentId, timer);
        }
      } catch (err) {
        console.warn("Error capturing scene to cache:", err);
      }
    },
    []
  );

  // Switch to another tab with sub-10ms response and canvas-scoped undo/redo
  const selectTab = useCallback(
    async (
      targetId: string,
      api?: ExcalidrawImperativeAPI | null,
      options?: { skipPersistCurrent?: boolean }
    ) => {
      if (targetId === activeTabIdRef.current) return;

      const previousTabId = activeTabIdRef.current;

      // 1. Snapshot previous tab into in-memory cache and flush save to SQLite immediately
      if (api && previousTabId && !options?.skipPersistCurrent) {
        if (!deletedTabIdsRef.current.has(previousTabId)) {
          persistCurrentSceneToCache(api, previousTabId, { immediate: true });
        }
      }

      // 2. Look up target tab in cache or fetch from API
      let targetScene = cacheRef.current.get(targetId);

      if (!targetScene) {
        try {
          const res = await fetch(`/api/canvases/${targetId}`);
          if (res.ok) {
            const json = await res.json();
            if (json.canvas) {
              targetScene = {
                name: json.canvas.name,
                elements: json.canvas.elements || [],
                appState: json.canvas.appState || {},
                files: json.canvas.files || {},
                isReadOnly: Boolean(json.canvas.is_readonly),
              };
              cacheRef.current.set(targetId, targetScene);
            }
          }
        } catch (err) {
          console.error("Failed to load target tab:", err);
        }
      }

      // 3. Update active tab ID
      setActiveTabId(targetId);
      activeTabIdRef.current = targetId;
      try {
        localStorage.setItem("explaino_active_canvas_id", targetId);
      } catch {}

      const targetTab = tabsRef.current.find((t) => t.id === targetId);
      const isTargetReadOnly = Boolean(targetScene?.isReadOnly ?? targetTab?.isReadOnly);
      setIsReadOnly(isTargetReadOnly);

      if (targetScene) {
        setActiveCanvas({
          id: targetId,
          name: targetScene.name,
          elements: (targetScene.elements || []) as unknown[],
          appState: targetScene.appState || {},
          files: targetScene.files || {},
          is_readonly: isTargetReadOnly ? 1 : 0,
          share_slug: targetId,
          sort_order: targetTab?.sortOrder ?? 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }

      // 4. Update Excalidraw scene and clear undo history
      if (api && targetScene) {
        try {
          api.updateScene({
            elements: targetScene.elements as unknown as Parameters<typeof api.updateScene>[0]["elements"],
            appState: {
              ...targetScene.appState,
              viewBackgroundColor: normalizeCanvasBackground(targetScene.appState?.viewBackgroundColor as string | undefined),
              theme: api.getAppState().theme,
              selectedElementIds: {},
              selectedGroupIds: {},
              editingTextElement: null,
              viewModeEnabled: isTargetReadOnly,
            } as unknown as Parameters<typeof api.updateScene>[0]["appState"],
            commitToHistory: false,
          } as unknown as Parameters<typeof api.updateScene>[0]);

          if (targetScene.files && Object.keys(targetScene.files).length > 0) {
            api.addFiles(Object.values(targetScene.files) as unknown as Parameters<typeof api.addFiles>[0]);
          }

          // Clear history so undo doesn't bleed across canvases
          api.history.clear();
        } catch (err) {
          console.error("Error updating scene on tab switch:", err);
        }
      }
    },
    [persistCurrentSceneToCache]
  );

  // Add new tab
  const addTab = useCallback(
    async (customName?: string, api?: ExcalidrawImperativeAPI | null) => {
      // 1. Snapshot current tab and flush to SQLite immediately
      if (api && activeTabIdRef.current && !deletedTabIdsRef.current.has(activeTabIdRef.current)) {
        persistCurrentSceneToCache(api, activeTabIdRef.current, { immediate: true });
      }

      const nextLetter = String.fromCharCode(65 + (tabsRef.current.length % 26));
      const defaultName = customName || `Group ${nextLetter} - Canvas`;

      try {
        const res = await fetch("/api/canvases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: defaultName,
            elements: [],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.canvas) throw new Error(json.error || "Failed to create tab");

        const newCanvas: CanvasDetail = json.canvas;
        const newTabItem: CanvasTabItem = {
          id: newCanvas.id,
          name: newCanvas.name,
          isReadOnly: false,
          sortOrder: newCanvas.sort_order,
        };

        // Cache empty scene for new tab
        cacheRef.current.set(newCanvas.id, {
          name: newCanvas.name,
          elements: [],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
          isReadOnly: false,
        });

        tabsRef.current = [...tabsRef.current, newTabItem];
        setTabs(tabsRef.current);
        setActiveTabId(newCanvas.id);
        activeTabIdRef.current = newCanvas.id;
        try {
          localStorage.setItem("explaino_active_canvas_id", newCanvas.id);
        } catch {}
        setActiveCanvas(newCanvas);
        setIsReadOnly(false);

        // Reset Excalidraw canvas to blank scene
        if (api) {
          api.updateScene({
            elements: [],
            appState: {
              viewBackgroundColor: "#ffffff",
              viewModeEnabled: false,
            },
            commitToHistory: false,
          } as unknown as Parameters<typeof api.updateScene>[0]);
          api.history.clear();
        }

        return newTabItem;
      } catch (err) {
        console.error("Error creating new tab:", err);
        return null;
      }
    },
    [persistCurrentSceneToCache]
  );

  // Rename tab
  const renameTab = useCallback(
    async (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;

      // Update in local tabs mirror and React state
      tabsRef.current = tabsRef.current.map((t) =>
        t.id === id ? { ...t, name: trimmed } : t
      );
      setTabs(tabsRef.current);

      // Update in cache
      const cached = cacheRef.current.get(id);
      if (cached) {
        cached.name = trimmed;
      }

      // Persist to DB
      try {
        await fetch(`/api/canvases/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch (err) {
        console.warn("Error renaming tab:", err);
      }
    },
    []
  );

  // Close tab with automatic fallback to fresh tab if closing last tab
  const closeTab = useCallback(
    async (id: string, api?: ExcalidrawImperativeAPI | null) => {
      // 1. Immediately blacklist this tab ID so NO background or queued PUT can ever target it
      deletedTabIdsRef.current.add(id);

      // 2. Immediately cancel any pending debounced save timer for this tab ID
      const pendingTimer = saveTimeoutsRef.current.get(id);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        saveTimeoutsRef.current.delete(id);
      }

      // 3. Evict from in-memory cache
      cacheRef.current.delete(id);

      // 4. Compute remaining tabs from tabsRef.current (synchronous, immune to stale closures)
      const currentTabs = tabsRef.current;
      const tabIndex = currentTabs.findIndex((t) => t.id === id);
      if (tabIndex === -1) return;

      const remainingTabs = currentTabs.filter((t) => t.id !== id);

      // 5. Fire DELETE request to database in background
      fetch(`/api/canvases/${id}`, { method: "DELETE" }).catch((e) =>
        console.warn("Error deleting canvas tab:", e)
      );

      // 6. Handle closing the last remaining tab (instant auto-fallback)
      if (remainingTabs.length === 0) {
        if (isCreatingFallbackRef.current) return;
        isCreatingFallbackRef.current = true;

        const now = Date.now();
        const fallbackId = `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const fallbackTab: CanvasTabItem = {
          id: fallbackId,
          name: "Main Whiteboard",
          isReadOnly: false,
          sortOrder: 0,
        };

        // Cache initial blank scene for fallback tab
        cacheRef.current.set(fallbackId, {
          name: fallbackTab.name,
          elements: [],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
          isReadOnly: false,
        });

        // Synchronously update mirror ref and React state (0ms delay, zero tab collapse)
        tabsRef.current = [fallbackTab];
        setTabs([fallbackTab]);
        setActiveTabId(fallbackId);
        activeTabIdRef.current = fallbackId;
        try {
          localStorage.setItem("explaino_active_canvas_id", fallbackId);
        } catch {}
        setActiveCanvas({
          id: fallbackId,
          name: "Main Whiteboard",
          elements: [],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
          is_readonly: 0,
          share_slug: fallbackId,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        });
        setIsReadOnly(false);

        // Synchronously reset Excalidraw scene
        if (api) {
          api.updateScene({
            elements: [],
            appState: { viewBackgroundColor: "#ffffff", viewModeEnabled: false },
            commitToHistory: false,
          } as unknown as Parameters<typeof api.updateScene>[0]);
          api.history.clear();
        }

        // Persist fallback canvas to SQLite in background
        fetch("/api/canvases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: fallbackId,
            name: "Main Whiteboard",
            elements: [],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          }),
        })
          .catch((err) => console.error("Error creating fallback canvas in DB:", err))
          .finally(() => {
            isCreatingFallbackRef.current = false;
          });

        return;
      }

      // 7. Update remaining tabs synchronously
      tabsRef.current = remainingTabs;
      setTabs(remainingTabs);

      // 8. If we closed the active tab, switch to adjacent tab WITHOUT persisting the deleted tab
      if (id === activeTabIdRef.current) {
        const nextIndex = Math.min(tabIndex, remainingTabs.length - 1);
        const nextTab = remainingTabs[nextIndex];
        try {
          localStorage.setItem("explaino_active_canvas_id", nextTab.id);
        } catch {}
        selectTab(nextTab.id, api, { skipPersistCurrent: true });
      }
    },
    [selectTab]
  );

  // Duplicate tab
  const duplicateTab = useCallback(
    async (id: string, api?: ExcalidrawImperativeAPI | null) => {
      // 1. Snapshot current tab and flush to SQLite immediately
      if (api && activeTabIdRef.current && !deletedTabIdsRef.current.has(activeTabIdRef.current)) {
        persistCurrentSceneToCache(api, activeTabIdRef.current, { immediate: true });
      }

      try {
        const res = await fetch(`/api/canvases/${id}/clone`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok || !json.canvas) throw new Error(json.error || "Failed to clone canvas");

        const cloned: CanvasDetail = json.canvas;
        const newTabItem: CanvasTabItem = {
          id: cloned.id,
          name: cloned.name,
          isReadOnly: Boolean(cloned.is_readonly),
          sortOrder: cloned.sort_order,
        };

        cacheRef.current.set(cloned.id, {
          name: cloned.name,
          elements: (cloned.elements || []) as readonly ExcalidrawElement[],
          appState: cloned.appState || {},
          files: (cloned.files || {}) as BinaryFiles,
          isReadOnly: Boolean(cloned.is_readonly),
        });

        tabsRef.current = [...tabsRef.current, newTabItem];
        setTabs(tabsRef.current);
        return newTabItem;
      } catch (err) {
        console.error("Error cloning canvas tab:", err);
        return null;
      }
    },
    [persistCurrentSceneToCache]
  );

  // Reorder tabs
  const reorderTabs = useCallback(async (newOrder: string[]) => {
    const orderMap = new Map(newOrder.map((id, idx) => [id, idx]));
    const sorted = [...tabsRef.current].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    tabsRef.current = sorted;
    setTabs(sorted);

    try {
      await fetch("/api/canvases/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: newOrder }),
      });
    } catch (err) {
      console.warn("Error persisting tab order:", err);
    }
  }, []);

  // Toggle read-only mode on current canvas
  const toggleReadOnly = useCallback(
    async (api?: ExcalidrawImperativeAPI | null) => {
      const newReadOnly = !isReadOnly;
      setIsReadOnly(newReadOnly);

      tabsRef.current = tabsRef.current.map((t) =>
        t.id === activeTabIdRef.current ? { ...t, isReadOnly: newReadOnly } : t
      );
      setTabs(tabsRef.current);

      const cached = cacheRef.current.get(activeTabIdRef.current);
      if (cached) {
        cached.isReadOnly = newReadOnly;
      }

      if (api) {
        api.updateScene({
          appState: {
            viewModeEnabled: newReadOnly,
            selectedElementIds: {},
            selectedGroupIds: {},
          },
        });
      }

      try {
        await fetch(`/api/canvases/${activeTabIdRef.current}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_readonly: newReadOnly ? 1 : 0 }),
        });
      } catch (err) {
        console.warn("Error updating canvas read-only state:", err);
      }
    },
    [isReadOnly]
  );

  // Share URL calculation
  const shareUrl = typeof window !== "undefined" && activeTabId ? `${window.location.origin}/share/${activeTabId}` : "";

  // Copy share URL with visual toast state
  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
      return true;
    } catch {
      return false;
    }
  }, [shareUrl]);

  // Mark tab dirty (for unsaved changes indicator)
  const markTabDirty = useCallback((tabId: string, isDirty = true) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isDirty } : t))
    );
  }, []);

  return {
    tabs,
    activeTabId,
    activeCanvas,
    isLoading,
    isReadOnly,
    copiedShare,
    loadError,
    retryLoad: () => setRetryCount((count) => count + 1),
    shareUrl,
    cacheRef,
    selectTab,
    addTab,
    renameTab,
    closeTab,
    duplicateTab,
    reorderTabs,
    toggleReadOnly,
    copyShareUrl,
    persistCurrentSceneToCache,
    markTabDirty,
  };
}
