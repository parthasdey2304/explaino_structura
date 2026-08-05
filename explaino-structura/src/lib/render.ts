import type { ExcalidrawElement } from "@/types";

function hexToRgba(hex: string, opacity: number): string {
  if (hex === "transparent") return "transparent";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: ExcalidrawElement[],
  scrollX: number,
  scrollY: number,
  zoom: number
) {
  ctx.save();
  ctx.translate(scrollX, scrollY);
  ctx.scale(zoom, zoom);

  for (const el of elements) {
    if (el.isDeleted) continue;
    renderElement(ctx, el);
  }

  ctx.restore();
}

function renderElement(ctx: CanvasRenderingContext2D, el: ExcalidrawElement) {
  ctx.save();
  ctx.globalAlpha = el.opacity;

  const stroke = hexToRgba(el.strokeColor, el.opacity);
  const fill = el.backgroundColor === "transparent" ? "transparent" : hexToRgba(el.backgroundColor, el.opacity);

  switch (el.type) {
    case "rectangle":
      renderRectangle(ctx, el, stroke, fill);
      break;
    case "ellipse":
      renderEllipse(ctx, el, stroke, fill);
      break;
    case "diamond":
      renderDiamond(ctx, el, stroke, fill);
      break;
    case "line":
      renderLine(ctx, el, stroke);
      break;
    case "arrow":
      renderArrow(ctx, el, stroke);
      break;
    case "freedraw":
      renderFreedraw(ctx, el, stroke);
      break;
    case "text":
      renderText(ctx, el);
      break;
  }

  ctx.restore();
}

function renderRectangle(
  ctx: CanvasRenderingContext2D,
  el: ExcalidrawElement,
  stroke: string,
  fill: string
) {
  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  const r = typeof el.roundness === "number" ? Math.min(el.roundness, Math.min(w, h) / 4) : 0;

  ctx.beginPath();
  if (r > 0) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();

  if (fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = el.strokeWidth;
  if (el.strokeStyle === "dashed") {
    ctx.setLineDash([12, 6]);
  } else if (el.strokeStyle === "dotted") {
    ctx.setLineDash([4, 4]);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderEllipse(
  ctx: CanvasRenderingContext2D,
  el: ExcalidrawElement,
  stroke: string,
  fill: string
) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = Math.abs(el.width / 2);
  const ry = Math.abs(el.height / 2);

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  ctx.closePath();

  if (fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = el.strokeWidth;
  if (el.strokeStyle === "dashed") ctx.setLineDash([12, 6]);
  else if (el.strokeStyle === "dotted") ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderDiamond(
  ctx: CanvasRenderingContext2D,
  el: ExcalidrawElement,
  stroke: string,
  fill: string
) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const hw = Math.abs(el.width / 2);
  const hh = Math.abs(el.height / 2);

  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();

  if (fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = el.strokeWidth;
  if (el.strokeStyle === "dashed") ctx.setLineDash([12, 6]);
  else if (el.strokeStyle === "dotted") ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderLine(ctx: CanvasRenderingContext2D, el: ExcalidrawElement, stroke: string) {
  if (!el.points || el.points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (el.strokeStyle === "dashed") ctx.setLineDash([12, 6]);
  else if (el.strokeStyle === "dotted") ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderArrow(ctx: CanvasRenderingContext2D, el: ExcalidrawElement, stroke: string) {
  if (!el.points || el.points.length < 2) return;

  const lastIdx = el.points.length - 1;
  const lastX = el.x + el.points[lastIdx][0];
  const lastY = el.y + el.points[lastIdx][1];
  const prevX = el.x + el.points[Math.max(0, lastIdx - 1)][0];
  const prevY = el.y + el.points[Math.max(0, lastIdx - 1)][1];

  ctx.beginPath();
  ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  const angle = Math.atan2(lastY - prevY, lastX - prevX);
  const headLen = 14;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(
    lastX - headLen * Math.cos(angle - Math.PI / 6),
    lastY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(
    lastX - headLen * Math.cos(angle + Math.PI / 6),
    lastY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function renderFreedraw(ctx: CanvasRenderingContext2D, el: ExcalidrawElement, stroke: string) {
  if (!el.points || el.points.length < 2) {
    if (el.points && el.points.length === 1) {
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(el.x + el.points[0][0], el.y + el.points[0][1], el.strokeWidth / 2, 0, 2 * Math.PI);
      ctx.fill();
    }
    return;
  }

  ctx.beginPath();
  ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
  for (let i = 1; i < el.points.length - 1; i++) {
    const mx = (el.x + el.points[i][0] + el.x + el.points[i + 1][0]) / 2;
    const my = (el.y + el.points[i][1] + el.y + el.points[i + 1][1]) / 2;
    ctx.quadraticCurveTo(el.x + el.points[i][0], el.y + el.points[i][1], mx, my);
  }
  const last = el.points[el.points.length - 1];
  ctx.lineTo(el.x + last[0], el.y + last[1]);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function renderText(ctx: CanvasRenderingContext2D, el: ExcalidrawElement) {
  if (!el.text) return;
  const fontSize = el.fontSize || 20;
  ctx.font = `${fontSize}px Virgil, Segoe UI Emoji, sans-serif`;
  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = "top";

  const lines = el.text.split("\n");
  const lineHeight = fontSize * (el.lineHeight || 1.25);
  const align = el.textAlign || "left";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let x = el.x;
    if (align === "center") {
      const metrics = ctx.measureText(line);
      x = el.x + el.width / 2 - metrics.width / 2;
    } else if (align === "right") {
      const metrics = ctx.measureText(line);
      x = el.x + el.width - metrics.width;
    }
    ctx.fillText(line, x, el.y + i * lineHeight);
  }
}

export function renderSelectionBound(
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  scrollX: number,
  scrollY: number,
  zoom: number
) {
  ctx.save();
  ctx.translate(scrollX, scrollY);
  ctx.scale(zoom, zoom);

  const padding = 6 / zoom;
  const x = Math.min(element.x, element.x + element.width) - padding;
  const y = Math.min(element.y, element.y + element.height) - padding;
  const w = Math.abs(element.width) + padding * 2;
  const h = Math.abs(element.height) + padding * 2;

  ctx.strokeStyle = "#4a90d9";
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([5 / zoom, 3 / zoom]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  const handleSize = 7 / zoom;
  const handles = [
    { cx: x, cy: y },
    { cx: x + w / 2, cy: y },
    { cx: x + w, cy: y },
    { cx: x + w, cy: y + h / 2 },
    { cx: x + w, cy: y + h },
    { cx: x + w / 2, cy: y + h },
    { cx: x, cy: y + h },
    { cx: x, cy: y + h / 2 },
  ];

  for (const { cx, cy } of handles) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 1.5 / zoom;
    ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
  }

  ctx.restore();
}

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scrollX: number,
  scrollY: number,
  zoom: number,
  gridSize: number = 20
) {
  ctx.save();
  const isDark = typeof document !== "undefined" && document.body.classList.contains("dark");
  ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";
  ctx.lineWidth = 1;

  const effectiveGrid = gridSize * zoom;
  if (effectiveGrid < 5) {
    ctx.restore();
    return;
  }

  const offsetX = (scrollX % effectiveGrid) + effectiveGrid;
  const offsetY = (scrollY % effectiveGrid) + effectiveGrid;

  ctx.beginPath();
  for (let x = offsetX; x < width; x += effectiveGrid) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = offsetY; y < height; y += effectiveGrid) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}