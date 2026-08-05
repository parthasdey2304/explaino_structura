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
import type { DrawingData, ExcalidrawElement, AppState } from "@/types";
import { generateId, getTimestamp } from "./utils";

const DRAWINGS_COLLECTION = "drawings";

const defaultAppState: AppState = {
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

export async function saveDrawing(
  drawingId: string | null,
  elements: ExcalidrawElement[],
  appState: AppState,
  name: string = "Untitled"
): Promise<string> {
  if (!db) {
    throw new Error("Firestore not initialized");
  }
  const id = drawingId || generateId();
  const docRef = doc(db, DRAWINGS_COLLECTION, id);

  const data: Record<string, unknown> = {
    id,
    name,
    elements,
    appState,
    files: {},
    updatedAt: getTimestamp(),
  };

  if (!drawingId) {
    data.createdAt = getTimestamp();
    data.ownerId = "anonymous";
    data.collaborators = [];
  }

  await setDoc(docRef, data, { merge: true });
  return id;
}

export async function loadDrawing(
  drawingId: string
): Promise<DrawingData | null> {
  if (!db) {
    throw new Error("Firestore not initialized");
  }
  const docRef = doc(db, DRAWINGS_COLLECTION, drawingId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data() as DrawingData;
  }
  return null;
}

export async function listDrawings(): Promise<DrawingData[]> {
  if (!db) {
    throw new Error("Firestore not initialized");
  }
  const q = query(
    collection(db, DRAWINGS_COLLECTION),
    orderBy("updatedAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as DrawingData);
}

export async function deleteDrawing(drawingId: string): Promise<void> {
  if (!db) {
    throw new Error("Firestore not initialized");
  }
  const docRef = doc(db, DRAWINGS_COLLECTION, drawingId);
  await deleteDoc(docRef);
}

export { defaultAppState };