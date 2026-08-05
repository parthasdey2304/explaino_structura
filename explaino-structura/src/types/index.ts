export type ExcalidrawElementType = 
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freedraw'
  | 'text'
  | 'diamond'
  | 'image';

export interface ExcalidrawElement {
  id: string;
  type: ExcalidrawElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid' | 'hachure' | 'cross-hatch' | 'dots';
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  roughness: number;
  opacity: number;
  roundness: number | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: null | Array<{ type: string; id: string }>;
  updated: number;
  link: string | null;
  locked: boolean;
  points?: number[][];
  pressures?: number[];
  simulatePressure?: boolean;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  containerId?: string | null;
  originalText?: string;
  autoResize?: boolean;
  lineHeight?: number;
  baseline?: number;
  fileId?: string | null;
  scale?: [number, number];
  crop?: { x: number; y: number; width: number; height: number };
}

export interface AppState {
  theme: "light" | "dark";
  viewBackgroundColor: string;
  gridSize: number | null;
  zoom: {
    value: number;
  };
  scrollX: number;
  scrollY: number;
  currentItemStrokeColor: string;
  currentItemBackgroundColor: string;
  currentItemFillStyle: 'solid' | 'hachure' | 'cross-hatch' | 'dots';
  currentItemStrokeWidth: number;
  currentItemStrokeStyle: 'solid' | 'dashed' | 'dotted';
  currentItemRoughness: number;
  currentItemOpacity: number;
  currentItemFontFamily: number;
  currentItemFontSize: number;
  currentItemTextAlign: 'left' | 'center' | 'right';
  currentItemStartArrowhead: null | 'arrow';
  currentItemEndArrowhead: null | 'arrow';
  currentItemRoundness: number | null;
}

export interface DrawingData {
  id: string;
  name: string;
  elements: ExcalidrawElement[];
  appState: AppState;
  files: Record<string, { dataURL: string; mimeType: string }>;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  collaborators: string[];
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type ToolType = 
  | 'selection'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'freedraw'
  | 'text'
  | 'diamond'
  | 'eraser'
  | 'pan'
  | 'laser'
  | 'image'
  | 'frame'
  | 'lasso'
  | 'bucket'
  | 'magic'
  | 'embed';

export interface PointerCoords {
  x: number;
  y: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface RectangleCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}