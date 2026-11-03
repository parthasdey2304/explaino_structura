export interface CanvasMetadata {
  id: string;
  name: string;
  description?: string;
  is_readonly: number; // 0 or 1
  share_slug: string;
  sort_order: number;
  thumbnail?: string;
  created_at: number;
  updated_at: number;
}

export interface CanvasPayload {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  todos?: unknown[];
  notes?: unknown[];
  extensionsData?: Record<string, unknown>;
}

export interface CanvasDetail extends CanvasMetadata, CanvasPayload {}

export interface CanvasSnapshotItem {
  id: string;
  canvas_id: string;
  label: string;
  element_count: number;
  created_at: number;
}
