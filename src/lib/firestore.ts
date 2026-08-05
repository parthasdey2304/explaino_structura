const DRAWINGS_KEY = "explaino_drawings";

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
    localStorage.setItem(DRAWINGS_KEY, JSON.stringify(map));
  } catch (error) {
    console.error("Failed to save to localStorage, it might be full", error);
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