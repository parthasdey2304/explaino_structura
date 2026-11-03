// Older canvas records used a dark color as the default. Excalidraw expects
// a light base color and adjusts it when its dark theme is active.
export function normalizeCanvasBackground(color?: string | null): string {
  return !color || color.toLowerCase() === "#0c0c0e" ? "#ffffff" : color;
}
