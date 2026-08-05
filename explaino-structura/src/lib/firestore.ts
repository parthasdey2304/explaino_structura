import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";

const DRAWINGS_COLLECTION = "drawings";

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
 * JSON-safe structure that Firestore can serialize. Explicitly strips
 * live-collaboration state (`collaborators`) that isn't part of a scene.
 */
function sanitizeSceneAppState(appState: unknown): Record<string, unknown> {
  if (!appState || typeof appState !== "object") {
    return {};
  }

  // JSON round-trip guarantees only plain JSON data remains.
  // Maps become {}, Sets become [], functions are dropped, dates become
  // strings — all of which Firestore accepts.
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

/**
 * Save the current Excalidraw scene to Firestore.
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
  if (!db) {
    throw new Error("Firestore not initialized — add your config to .env.local");
  }
  const id = drawingId || generateId();
  const docRef = doc(db, DRAWINGS_COLLECTION, id);

  const data: Record<string, unknown> = {
    id,
    name,
    elements: sceneData.elements,
    appState: sanitizeSceneAppState(sceneData.appState),
    files: sceneData.files,
    updatedAt: Date.now(),
  };

  if (!drawingId) {
    data.createdAt = Date.now();
  }

  await setDoc(docRef, data, { merge: true });
  return id;
}

/** Load a drawing from Firestore by ID. Returns null if not found. */
export async function loadDrawing(drawingId: string): Promise<SavedScene | null> {
  if (!db) {
    throw new Error("Firestore not initialized — add your config to .env.local");
  }
  const docRef = doc(db, DRAWINGS_COLLECTION, drawingId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data() as SavedScene;
  }
  return null;
}

/** List all saved drawings, newest first. */
export async function listDrawings(): Promise<SavedScene[]> {
  if (!db) {
    throw new Error("Firestore not initialized — add your config to .env.local");
  }
  const q = query(
    collection(db, DRAWINGS_COLLECTION),
    orderBy("updatedAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as SavedScene);
}

/** Delete a drawing from Firestore. */
export async function deleteDrawing(drawingId: string): Promise<void> {
  if (!db) {
    throw new Error("Firestore not initialized — add your config to .env.local");
  }
  const docRef = doc(db, DRAWINGS_COLLECTION, drawingId);
  await deleteDoc(docRef);
}

export { generateId };