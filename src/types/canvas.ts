export * from "@/lib/db/types";

export interface CanvasTabItem {
  id: string;
  name: string;
  isDirty?: boolean;
  isReadOnly?: boolean;
  sortOrder?: number;
}

export interface CanvasSceneSnapshot {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

export interface CanvasSnapshot {
  id?: string;
  name: string;
  elements: readonly any[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  notes?: unknown[];
  todos?: unknown[];
  extensionsData?: Record<string, unknown>;
  isReadOnly: boolean;
  updatedAt?: number;
}
