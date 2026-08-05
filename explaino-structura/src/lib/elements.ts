import { type ExcalidrawElement, type ExcalidrawElementType, type AppState } from "@/types";
import { generateId, randomSeed } from "./utils";

export function createNewElement(
  type: ExcalidrawElementType,
  x: number,
  y: number,
  appState: Partial<AppState> = {}
): ExcalidrawElement {
  const base = {
    id: generateId(),
    type,
    x,
    y,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: appState.currentItemStrokeColor || "#1e1e1e",
    backgroundColor: appState.currentItemBackgroundColor || "transparent",
    fillStyle: (appState.currentItemFillStyle || "solid") as ExcalidrawElement["fillStyle"],
    strokeWidth: appState.currentItemStrokeWidth || 2,
    strokeStyle: (appState.currentItemStrokeStyle || "solid") as ExcalidrawElement["strokeStyle"],
    roughness: appState.currentItemRoughness || 0,
    opacity: (appState.currentItemOpacity ?? 100) / 100,
    roundness: appState.currentItemRoundness ?? 3,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
  };

  switch (type) {
    case "rectangle":
    case "ellipse":
    case "diamond":
      return { ...base, type };

    case "line":
    case "arrow":
      return {
        ...base,
        type,
        points: [[0, 0]],
      };

    case "freedraw":
      return {
        ...base,
        type,
        points: [[0, 0]],
        pressures: [0.5],
        simulatePressure: true,
      };

    case "text":
      return {
        ...base,
        type,
        width: 0,
        height: 0,
        text: "",
        fontSize: appState.currentItemFontSize || 20,
        fontFamily: appState.currentItemFontFamily || 1,
        textAlign: (appState.currentItemTextAlign || "left") as ExcalidrawElement["textAlign"],
        verticalAlign: "top" as const,
        containerId: null,
        originalText: "",
        autoResize: true,
        lineHeight: 1.25,
      };

    default:
      return { ...base, type: "rectangle" as ExcalidrawElementType };
  }
}

export function updateElementPosition(
  element: ExcalidrawElement,
  x: number,
  y: number
): ExcalidrawElement {
  return {
    ...element,
    x,
    y,
    updated: Date.now(),
    version: element.version + 1,
    versionNonce: randomSeed(),
  };
}

export function updateElementSize(
  element: ExcalidrawElement,
  width: number,
  height: number
): ExcalidrawElement {
  return {
    ...element,
    width,
    height,
    updated: Date.now(),
    version: element.version + 1,
    versionNonce: randomSeed(),
  };
}

export function updateElementPoints(
  element: ExcalidrawElement,
  points: number[][],
  pressures?: number[]
): ExcalidrawElement {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  return {
    ...element,
    points,
    pressures: pressures || element.pressures,
    x: element.x + minX,
    y: element.y + minY,
    width: maxX - minX,
    height: maxY - minY,
    updated: Date.now(),
    version: element.version + 1,
    versionNonce: randomSeed(),
  };
}

export function duplicateElements(
  elements: ExcalidrawElement[],
  offsetX = 20,
  offsetY = 20
): ExcalidrawElement[] {
  return elements.map((el) => ({
    ...el,
    id: generateId(),
    x: el.x + offsetX,
    y: el.y + offsetY,
    seed: randomSeed(),
    versionNonce: randomSeed(),
    version: 1,
    updated: Date.now(),
  }));
}