import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

export interface MermaidParseOutput {
  elements: readonly ExcalidrawElement[];
  files?: BinaryFiles;
}

/**
 * Normalizes Mermaid code for better compatibility with excalidraw parser.
 * E.g., ensures subgraph definitions with quoted titles don't produce invalid IDs.
 */
export function sanitizeMermaidSyntax(code: string): string {
  if (!code) return "";
  let sanitized = code;

  // Normalize Windows newlines
  sanitized = sanitized.replace(/\r\n/g, "\n");

  // Fix subgraph with quotes directly in identifier e.g. `subgraph "Clients Layer"` -> `subgraph Clients_Layer ["Clients Layer"]`
  sanitized = sanitized.replace(/subgraph\s+"([^"]+)"/g, (_, title) => {
    const safeId = title.replace(/[^a-zA-Z0-9_]/g, "_");
    return `subgraph ${safeId} ["${title}"]`;
  });

  return sanitized;
}

/**
 * Ensures sequence diagram lifelines don't improperly overlap or slice through cards.
 */
export function sanitizeSequenceDiagramLifelines(elements: any[]): any[] {
  const rects = elements.filter(
    (el) => el.type === "rectangle" && el.width > 0 && el.height > 0
  );

  const processedElements: any[] = [];
  const linesToReorder: any[] = [];

  for (const el of elements) {
    const isVerticalLine =
      el.type === "line" &&
      (el.width === 0 ||
        (Array.isArray(el.points) &&
          el.points.length === 2 &&
          Math.abs(el.points[0][0] - el.points[1][0]) <= 3)) &&
      (el.height > 30 ||
        (Array.isArray(el.points) &&
          el.points.length === 2 &&
          Math.abs(el.points[0][1] - el.points[1][1]) > 30));

    if (!isVerticalLine) {
      if (el.type === "rectangle") {
        if (!el.backgroundColor || el.backgroundColor === "transparent" || el.backgroundColor === "none") {
          el.backgroundColor = "#fff9db";
        }
        el.fillStyle = "solid";
      }
      processedElements.push(el);
      continue;
    }

    const lineX = el.x;
    const startY = Math.min(el.y, el.y + (el.height ?? 0));
    const totalHeight = Math.abs(el.height ?? (el.points?.[1]?.[1] ?? 0));
    const endY = startY + totalHeight;

    const overlapping = rects.filter((rect) => {
      const rx = rect.x;
      const rw = rect.width;
      const ry = rect.y;
      const rh = rect.height;

      const crossesHorizontally = lineX >= rx - 2 && lineX <= rx + rw + 2;
      const crossesVertically = startY < ry + rh && endY > ry;
      return crossesHorizontally && crossesVertically;
    });

    if (overlapping.length === 0) {
      linesToReorder.push(el);
      continue;
    }

    overlapping.sort((a, b) => a.y - b.y);

    let curY = startY;
    for (let i = 0; i < overlapping.length; i++) {
      const rect = overlapping[i];
      const rectTop = rect.y;
      const rectBottom = rect.y + rect.height;

      if (rectTop > curY + 2) {
        const segHeight = rectTop - curY;
        linesToReorder.push({
          ...el,
          id: el.id ? `${el.id}-seg-${Math.round(curY)}` : undefined,
          y: curY,
          height: segHeight,
          points: [
            [0, 0],
            [0, segHeight],
          ],
        });
      }
      curY = Math.max(curY, rectBottom);
    }

    if (endY > curY + 2) {
      const segHeight = endY - curY;
      linesToReorder.push({
        ...el,
        id: el.id ? `${el.id}-seg-${Math.round(curY)}` : undefined,
        y: curY,
        height: segHeight,
        points: [
          [0, 0],
          [0, segHeight],
        ],
      });
    }
  }

  return [...linesToReorder, ...processedElements];
}

/**
 * Safely parses Mermaid diagram definition into Excalidraw elements.
 * Resilient against:
 * - SubGraph element lookup failures in Mermaid DOM
 * - Fallback to image/svg+xml with BinaryFiles payload
 */
export async function safeParseMermaidToExcalidraw(
  code: string,
  options?: { fontSize?: string }
): Promise<MermaidParseOutput> {
  const cleanCode = sanitizeMermaidSyntax(code.trim());
  const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");

  // DOM QuerySelector shim to prevent "SubGraph element not found" in any environment
  const originalQuerySelector = Element.prototype.querySelector;
  const originalQuerySelectorAll = Element.prototype.querySelectorAll;

  let patched = false;
  if (typeof window !== "undefined") {
    try {
      Element.prototype.querySelector = function (selector: string) {
        const res = originalQuerySelector.call(this, selector);
        if (res) return res;

        // SubGraph query fallback handler
        if (selector.startsWith("[id=")) {
          const idValue = selector.slice(4, -1).replace(/^['"]|['"]$/g, "");
          // 1. Partial/contains ID search (e.g. flowchart-Backend-10)
          const fallbackByContains = originalQuerySelector.call(this, `[id*="${idValue}"]`);
          if (fallbackByContains) return fallbackByContains;

          // 2. Class-based cluster fallback
          const clusters = originalQuerySelectorAll.call(this, ".cluster, [class*='cluster']");
          for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i] as Element;
            const cid = cluster.getAttribute("id") || "";
            if (cid.toLowerCase().includes(idValue.toLowerCase())) {
              return cluster;
            }
          }
          if (clusters.length > 0) {
            return clusters[0];
          }
        }
        return null;
      };
      patched = true;
    } catch {
      // Ignore patching failure
    }
  }

  try {
    const result = await parseMermaidToExcalidraw(cleanCode, {
      themeVariables: { fontSize: options?.fontSize || "16px" },
    });

    const rawElements = result.elements || [];
    const sanitizedRaw = sanitizeSequenceDiagramLifelines(rawElements);
    const convertedElements = convertToExcalidrawElements(sanitizedRaw);

    return {
      elements: convertedElements,
      files: result.files,
    };
  } finally {
    if (patched && typeof window !== "undefined") {
      Element.prototype.querySelector = originalQuerySelector;
      Element.prototype.querySelectorAll = originalQuerySelectorAll;
    }
  }
}
