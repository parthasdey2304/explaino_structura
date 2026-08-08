const DRAWINGS_KEY = "explaino_drawings";
const MAX_DRAWINGS = 20; // hard cap on number of saved drawings
const MAX_BYTES = 4 * 1024 * 1024; // ~4 MB budget (localStorage is typically 5-10 MB)

export interface SavedScene {
  id: string;
  name: string;
  /** Excalidraw scene elements */
  elements: unknown[];
  /** Excalidraw app state (viewBackgroundColor, zoom, scroll, theme, etc.) */
  appState: Record<string, unknown>;
  /** Binary files (images) stored as dataURLs */
  files: Record<string, { dataURL: string; mimeType: string }>;
  createdAt: number;
  updatedAt: number;
}

function generateId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).substring(2, 10)
  );
}

/**
 * Convert any value (including Maps, Sets, functions) into a plain
 * JSON-safe structure that can be serialized. Explicitly strips
 * live-collaboration state (`collaborators`) that isn't part of a scene.
 */
function sanitizeSceneAppState(appState: unknown): Record<string, unknown> {
  if (!appState || typeof appState !== "object") {
    return {};
  }

  try {
    const cleaned = JSON.parse(JSON.stringify(appState)) as Record<
      string,
      unknown
    >;
    delete cleaned.collaborators;
    return cleaned;
  } catch {
    return {};
  }
}

function getDrawingsMap(): Record<string, SavedScene> {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(DRAWINGS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveDrawingsMap(map: Record<string, SavedScene>) {
  if (typeof window === "undefined") return;
  try {
    // Enforce count limit: drop oldest drawings
    const ids = Object.keys(map);
    if (ids.length > MAX_DRAWINGS) {
      const sorted = ids
        .map((id) => ({ id, updatedAt: map[id].updatedAt }))
        .sort((a, b) => a.updatedAt - b.updatedAt);
      const toRemove = sorted.length - MAX_DRAWINGS;
      for (let i = 0; i < toRemove; i++) {
        delete map[sorted[i].id];
      }
    }

    const json = JSON.stringify(map);
    
    // If still too large, drop largest files (which are usually image dataURLs)
    let currentMap = map;
    if (json.length > MAX_BYTES) {
      const withSizes = Object.entries(map).map(([id, scene]) => ({
        id,
        size: JSON.stringify(scene).length,
      })).sort((a, b) => b.size - a.size);
      
      // Remove largest entries until under budget
      let jsonSize = json.length;
      for (const { id, size } of withSizes) {
        if (jsonSize <= MAX_BYTES) break;
        delete currentMap[id];
        jsonSize -= size;
      }
    }

    localStorage.setItem(DRAWINGS_KEY, JSON.stringify(currentMap));
  } catch (error) {
    // If quota still exceeded, clear oldest half and retry once
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("localStorage quota exceeded, evicting oldest drawings");
      try {
        const ids = Object.keys(map)
          .map((id) => ({ id, updatedAt: map[id].updatedAt }))
          .sort((a, b) => a.updatedAt - b.updatedAt);
        const keepFrom = Math.floor(ids.length / 2);
        const trimmed: Record<string, SavedScene> = {};
        for (let i = keepFrom; i < ids.length; i++) {
          trimmed[ids[i].id] = map[ids[i].id];
        }
        localStorage.setItem(DRAWINGS_KEY, JSON.stringify(trimmed));
      } catch {
        console.error("Failed to save drawings even after eviction");
      }
    } else {
      console.error("Failed to save to localStorage", error);
    }
  }
}

/**
 * Save the current Excalidraw scene to localStorage.
 * Returns the document ID of the saved drawing.
 */
export async function saveDrawing(
  drawingId: string | null,
  sceneData: {
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, { dataURL: string; mimeType: string }>;
  },
  name: string = "Untitled"
): Promise<string> {
  const map = getDrawingsMap();
  const id = drawingId || generateId();
  
  const data: SavedScene = {
    id,
    name,
    elements: sceneData.elements,
    appState: sanitizeSceneAppState(sceneData.appState),
    files: sceneData.files,
    updatedAt: Date.now(),
    createdAt: drawingId && map[drawingId] ? map[drawingId].createdAt : Date.now(),
  };

  map[id] = data;
  saveDrawingsMap(map);
  return id;
}

/** Load a drawing from localStorage by ID. Returns null if not found. */
export async function loadDrawing(drawingId: string): Promise<SavedScene | null> {
  const map = getDrawingsMap();
  return map[drawingId] || null;
}

/** List all saved drawings, newest first. */
export async function listDrawings(): Promise<SavedScene[]> {
  const map = getDrawingsMap();
  const drawings = Object.values(map);
  drawings.sort((a, b) => b.updatedAt - a.updatedAt);
  return drawings;
}

/** Delete a drawing from localStorage. */
export async function deleteDrawing(drawingId: string): Promise<void> {
  const map = getDrawingsMap();
  if (map[drawingId]) {
    delete map[drawingId];
    saveDrawingsMap(map);
  }
}

export { generateId };