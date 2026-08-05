import type { ExcalidrawElement, AppState } from "@/types";

const STORAGE_KEY = "explaino_drawing";

export interface LocalDrawingData {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  name: string;
  updatedAt: number;
}

export function saveToLocalStorage(
  elements: ExcalidrawElement[],
  appState: AppState,
  name: string = "Untitled"
): void {
  try {
    const data: LocalDrawingData = {
      elements,
      appState,
      name,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save to localStorage:", e);
  }
}

export function loadFromLocalStorage(): LocalDrawingData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalDrawingData;
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
    return null;
  }
}

export function clearLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear localStorage:", e);
  }
}

export const defaultAppState: AppState = {
  theme: "light",
  viewBackgroundColor: "#ffffff",
  gridSize: null,
  zoom: { value: 1 },
  scrollX: 0,
  scrollY: 0,
  currentItemStrokeColor: "#1e1e1e",
  currentItemBackgroundColor: "transparent",
  currentItemFillStyle: "solid",
  currentItemStrokeWidth: 2,
  currentItemStrokeStyle: "solid",
  currentItemRoughness: 0,
  currentItemOpacity: 100,
  currentItemFontFamily: 1,
  currentItemFontSize: 20,
  currentItemTextAlign: "left",
  currentItemStartArrowhead: null,
  currentItemEndArrowhead: null,
  currentItemRoundness: 3,
};
