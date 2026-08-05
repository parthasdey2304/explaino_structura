import { type ExcalidrawElement } from "@/types";

let counter = 0;

export function generateId(): string {
  counter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}-${counter}`;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2000000000);
}

export function getTimestamp(): number {
  return Date.now();
}

export function getBoundingBox(elements: ExcalidrawElement[]) {
  if (elements.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const x = el.x;
    const y = el.y;
    const w = el.width;
    const h = el.height;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function isPointInsideElement(
  x: number,
  y: number,
  element: ExcalidrawElement
): boolean {
  const tolerance = 8;

  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "text": {
      const minX = Math.min(element.x, element.x + element.width) - tolerance;
      const maxX = Math.max(element.x, element.x + element.width) + tolerance;
      const minY = Math.min(element.y, element.y + element.height) - tolerance;
      const maxY = Math.max(element.y, element.y + element.height) + tolerance;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    case "ellipse": {
      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      const rx = Math.abs(element.width / 2) + tolerance;
      const ry = Math.abs(element.height / 2) + tolerance;
      if (rx === 0 || ry === 0) return false;
      return ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) <= 1;
    }
    case "freedraw":
    case "line":
    case "arrow": {
      if (element.points && element.points.length > 0) {
        for (let i = 0; i < element.points.length; i++) {
          const px = element.x + element.points[i][0];
          const py = element.y + element.points[i][1];
          if (Math.abs(x - px) <= tolerance && Math.abs(y - py) <= tolerance) {
            return true;
          }
        }
      }
      const minX = Math.min(element.x, element.x + element.width) - tolerance;
      const maxX = Math.max(element.x, element.x + element.width) + tolerance;
      const minY = Math.min(element.y, element.y + element.height) - tolerance;
      const maxY = Math.max(element.y, element.y + element.height) + tolerance;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    default:
      return false;
  }
}

export function getElementAtPoint(
  elements: ExcalidrawElement[],
  x: number,
  y: number
): ExcalidrawElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.isDeleted) continue;
    if (isPointInsideElement(x, y, el)) {
      return el;
    }
  }
  return null;
}

export function getElementBounds(element: ExcalidrawElement) {
  if (element.points && element.points.length > 1) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of element.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return {
      x: element.x + minX,
      y: element.y + minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}