/**
 * QuickShape — "draw-and-hold" freehand shape recognition.
 *
 * Pipeline:
 *   1. The wrapper tracks the in-progress freedraw stroke and, when the
 *      pointer holds still (< 5px for ~500ms, no pointerup), hands the raw
 *      scene-space points to `recognizeShape`.
 *   2. `recognizeShape` resamples the trajectory and classifies it via
 *      closure, corner-angle (Ramer–Douglas–Peucker), bounding-box and
 *      radial-variance analysis into circle/ellipse, square/rectangle,
 *      triangle, line/arrow, pentagon, rhombus/parallelogram, or cylinder.
 *   3. `buildShapeElement` converts the classification into a real,
 *      standard Excalidraw element (reusing the stroke's id, seed, colors
 *      and ordering) so history, selection and rendering treat it like any
 *      hand-placed object.
 *
 * Excalidraw has no cylinder primitive, so cylinder-like strokes snap to
 * their body rectangle (documented at the call site).
 */

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export interface QPoint {
  x: number;
  y: number;
}

export interface QBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Hold trigger — movement tolerance in screen px, dwell time in ms. */
export const HOLD_TOL_PX = 5;
export const HOLD_MS = 500;
/** Strokes with fewer points / shorter paths than this never snap. */
export const MIN_POINTS = 8;
export const MIN_PATH_LEN = 40;

export type RecognizedShape =
  | { kind: "rectangle"; box: QBox }
  | { kind: "square"; box: QBox }
  | { kind: "ellipse"; box: QBox }
  | { kind: "circle"; box: QBox }
  | { kind: "triangle"; points: QPoint[] }
  | { kind: "diamond"; points: QPoint[] }
  | { kind: "parallelogram"; points: QPoint[] }
  | { kind: "pentagon"; points: QPoint[] }
  | { kind: "cylinder"; box: QBox }
  | { kind: "line"; a: QPoint; b: QPoint }
  | { kind: "arrow"; a: QPoint; b: QPoint };

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function dist(a: QPoint, b: QPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(pts: QPoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

function bboxOf(pts: QPoint[]): QBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Evenly resample a polyline to exactly `count` points by arc length. */
function resample(pts: QPoint[], count: number): QPoint[] {
  const total = pathLength(pts);
  if (total <= 0) return pts.map((p) => ({ ...p }));
  const step = total / (count - 1);
  const out: QPoint[] = [{ ...pts[0] }];
  let acc = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length && out.length < count; i++) {
    const cur = pts[i];
    const seg = dist(prev, cur);
    if (seg < 1e-9) {
      prev = cur; // duplicate sample — skip without consuming step
      continue;
    }
    if (acc + seg >= step) {
      const t = (step - acc) / seg;
      const next = {
        x: prev.x + (cur.x - prev.x) * t,
        y: prev.y + (cur.y - prev.y) * t,
      };
      out.push(next);
      prev = next;
      i--; // re-examine the remainder of this segment
      acc = 0;
    } else {
      acc += seg;
      prev = cur;
    }
  }
  while (out.length < count) out.push({ ...pts[pts.length - 1] });
  return out;
}

function perpDistance(p: QPoint, a: QPoint, b: QPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Ramer–Douglas–Peucker simplification. */
function rdp(pts: QPoint[], eps: number): QPoint[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }));
  const first = pts[0];
  const last = pts[pts.length - 1];
  let maxD = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDistance(pts[i], first, last);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, index + 1), eps);
    const right = rdp(pts.slice(index), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [{ ...first }, { ...last }];
}

/**
 * Deflection (turning) angle at vertex `b` in degrees: 0 for a straight
 * continuation, ~90 for a right-angle corner, ~180 for a full reversal.
 */
function deflection(a: QPoint, b: QPoint, c: QPoint): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  const cos = Math.min(
    1,
    Math.max(-1, (v1x * v2x + v1y * v2y) / (l1 * l2))
  );
  return (Math.acos(cos) * 180) / Math.PI;
}

function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const l1 = Math.hypot(ax, ay);
  const l2 = Math.hypot(bx, by);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Recognition
// ---------------------------------------------------------------------------

/**
 * Classify a raw freehand trajectory (scene coords). Returns null when the
 * stroke doesn't confidently match a known shape — callers must then leave
 * the original freedraw stroke untouched.
 */
export function recognizeShape(raw: QPoint[]): RecognizedShape | null {
  const pts = raw.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < MIN_POINTS) return null;
  if (pathLength(pts) < MIN_PATH_LEN) return null;

  const box = bboxOf(pts);
  const diag = Math.hypot(box.width, box.height);
  if (diag < 30) return null;

  const gap = dist(pts[0], pts[pts.length - 1]);
  const closed = gap <= Math.max(20, 0.18 * Math.max(box.width, box.height));
  const sampled = resample(pts, 64);

  if (!closed) {
    return recognizeOpen(pts);
  }

  const eps = Math.max(3, 0.02 * diag);
  let corners = rdp(sampled, eps);
  // RDP keeps both endpoints (start ≈ end for closed paths); drop the dup.
  if (
    corners.length > 1 &&
    dist(corners[0], corners[corners.length - 1]) < eps * 2
  ) {
    corners = corners.slice(0, -1);
  }
  const sharp = sharpCorners(corners, true);

  if (sharp.length === 3) {
    return { kind: "triangle", points: sharp };
  }
  if (sharp.length === 4) {
    return recognizeQuad(sharp, box);
  }
  if (sharp.length === 5) {
    return { kind: "pentagon", points: sharp };
  }
  if (sharp.length <= 2) {
    const ellipse = fitEllipse(sampled, box);
    if (ellipse) return ellipse;
    // Cylinder fallback: straight vertical sides with curved caps.
    if (looksLikeCylinder(sampled, box)) {
      return { kind: "cylinder", box };
    }
    return null;
  }
  // 6+ corners: try ellipse (e.g. wobbly circle), else give up.
  return fitEllipse(sampled, box);
}

/** Interior-vertex corners whose deflection exceeds ~40 degrees. */
function sharpCorners(corners: QPoint[], closed: boolean): QPoint[] {
  const out: QPoint[] = [];
  const n = corners.length;
  const last = closed ? n : n - 1;
  for (let i = closed ? 0 : 1; i < last; i++) {
    const a = corners[(i - 1 + n) % n];
    const b = corners[i];
    const c = corners[(i + 1) % n];
    if (deflection(a, b, c) > 40) out.push(b);
  }
  return out;
}

function recognizeQuad(
  corners: QPoint[],
  box: QBox
): RecognizedShape | null {
  const [p0, p1, p2, p3] = corners;
  const interior = [p0, p1, p2, p3].map((_, i) => {
    const a = corners[(i + 3) % 4];
    const b = corners[i];
    const c = corners[(i + 1) % 4];
    return 180 - deflection(a, b, c);
  });
  const rightAngles = interior.every((a) => Math.abs(a - 90) < 20);
  if (rightAngles) {
    const aspect = box.width / Math.max(box.height, 1e-9);
    if (aspect > 0.85 && aspect < 1.18) return { kind: "square", box };
    return { kind: "rectangle", box };
  }
  const sides = [0, 1, 2, 3].map((i) =>
    dist(corners[i], corners[(i + 1) % 4])
  );
  const parallel =
    angleBetween(
      p1.x - p0.x,
      p1.y - p0.y,
      p2.x - p3.x,
      p2.y - p3.y
    ) < 14 &&
    angleBetween(
      p2.x - p1.x,
      p2.y - p1.y,
      p3.x - p0.x,
      p3.y - p0.y
    ) < 14;
  const oppositeEqual =
    Math.abs(sides[0] - sides[2]) / Math.max(sides[0], sides[2], 1e-9) < 0.3 &&
    Math.abs(sides[1] - sides[3]) / Math.max(sides[1], sides[3], 1e-9) < 0.3;
  if (parallel && oppositeEqual) {
    const allEqual =
      Math.max(...sides) / Math.min(...sides, 1e-9) < 1.25;
    return {
      kind: allEqual ? "diamond" : "parallelogram",
      points: corners,
    };
  }
  return null;
}

/** Closed smooth loop → circle/ellipse when radial variance is low. */
function fitEllipse(
  sampled: QPoint[],
  box: QBox
): Extract<RecognizedShape, { kind: "ellipse" | "circle" }> | null {
  const rx = Math.max(box.width / 2, 1e-9);
  const ry = Math.max(box.height / 2, 1e-9);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radii = sampled.map((p) => {
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    return nx * nx + ny * ny;
  });
  const mean = radii.reduce((s, v) => s + v, 0) / radii.length;
  if (mean < 1e-9) return null;
  const variance =
    radii.reduce((s, v) => s + (v - mean) * (v - mean), 0) / radii.length;
  if (Math.sqrt(variance) / mean > 0.16) return null;
  const aspect = box.width / Math.max(box.height, 1e-9);
  if (aspect > 0.88 && aspect < 1.12) return { kind: "circle", box };
  return { kind: "ellipse", box };
}

/**
 * Cylinder heuristic: smooth closed loop that failed the ellipse fit, with
 * near-vertical straight runs on both flanks across the middle band.
 */
function looksLikeCylinder(sampled: QPoint[], box: QBox): boolean {
  if (box.height < 1e-9 || box.width < 1e-9) return false;
  const midTop = box.y + box.height * 0.25;
  const midBottom = box.y + box.height * 0.75;
  let flank = 0;
  let middle = 0;
  for (const p of sampled) {
    if (p.y < midTop || p.y > midBottom) continue;
    middle++;
    const nearLeft = Math.abs(p.x - box.x) < box.width * 0.12;
    const nearRight = Math.abs(p.x - (box.x + box.width)) < box.width * 0.12;
    if (nearLeft || nearRight) flank++;
  }
  return middle > 0 && flank / middle > 0.45;
}

/** Open path → straight line, or arrow when the tip hooks back. */
function recognizeOpen(pts: QPoint[]): RecognizedShape | null {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const chord = dist(a, b);
  if (chord < 1e-9) return null;
  let maxDev = 0;
  for (const p of pts) maxDev = Math.max(maxDev, perpDistance(p, a, b));
  if (maxDev / chord > 0.1) return null; // too curvy for line/arrow

  // Arrowhead: a sharp direction change in the final stretch (the barb
  // doubling back from the tip). The tip is the max-deflection vertex.
  const total = pathLength(pts);
  const hookFrom = total * 0.6;
  let acc = 0;
  let hookIndex = pts.length - 1;
  for (let i = 1; i < pts.length; i++) {
    acc += dist(pts[i - 1], pts[i]);
    if (acc >= hookFrom) {
      hookIndex = i;
      break;
    }
  }
  let tip = b;
  let tipDeflection = 0;
  for (let i = Math.max(1, hookIndex); i < pts.length - 1; i++) {
    const d = deflection(pts[i - 1], pts[i], pts[i + 1]);
    if (d > tipDeflection) {
      tipDeflection = d;
      tip = pts[i];
    }
  }
  const tailLen = total - acc + dist(pts[hookIndex], tip);
  if (tipDeflection > 55 && tailLen < total * 0.45 && dist(a, tip) > chord * 0.5) {
    return { kind: "arrow", a: { ...a }, b: { ...tip } };
  }
  return { kind: "line", a: { ...a }, b: { ...b } };
}

// ---------------------------------------------------------------------------
// Element construction
// ---------------------------------------------------------------------------

type MutableRecord = Record<string, unknown>;

function baseOf(source: ExcalidrawElement): MutableRecord {
  const out: MutableRecord = { ...(source as unknown as MutableRecord) };
  // Freedraw-only fields are meaningless on geometric shapes.
  delete out.points;
  delete out.pressures;
  delete out.simulatePressure;
  delete out.lastCommittedPoint;
  return out;
}

/** Roundness matching Excalidraw's native defaults per element family. */
const ROUNDNESS_BOX = { type: 3 }; // ADAPTIVE_RADIUS
const ROUNDNESS_LINE = { type: 2 }; // PROPORTIONAL_RADIUS

/**
 * Build the replacement element, preserving the stroke's identity (id, seed,
 * style, stacking order) so the swap is seamless and undo-friendly.
 */
export function buildShapeElement(
  source: ExcalidrawElement,
  recognized: RecognizedShape
): ExcalidrawElement {
  const src = source as unknown as {
    x: number;
    y: number;
    strokeColor: string;
    backgroundColor: string;
  };
  switch (recognized.kind) {
    case "rectangle":
    case "square":
    case "cylinder": {
      // No native cylinder primitive: snap to the body rectangle.
      const { box } = recognized;
      return {
        ...baseOf(source),
        type: "rectangle",
        x: box.x,
        y: box.y,
        width: Math.max(box.width, 1),
        height: Math.max(box.height, 1),
        angle: 0,
        roundness: { ...ROUNDNESS_BOX },
        updated: Date.now(),
      } as unknown as ExcalidrawElement;
    }
    case "ellipse":
    case "circle": {
      const { box } = recognized;
      return {
        ...baseOf(source),
        type: "ellipse",
        x: box.x,
        y: box.y,
        width: Math.max(box.width, 1),
        height: Math.max(box.height, 1),
        angle: 0,
        roundness: { ...ROUNDNESS_BOX },
        updated: Date.now(),
      } as unknown as ExcalidrawElement;
    }
    case "line":
    case "arrow": {
      const { a, b } = recognized;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const end: [number, number] = [dx, dy];
      return {
        ...baseOf(source),
        type: recognized.kind,
        x: a.x,
        y: a.y,
        width: Math.abs(dx) || 1,
        height: Math.abs(dy) || 1,
        angle: 0,
        roundness: { ...ROUNDNESS_LINE },
        points: [
          [0, 0],
          end,
        ],
        lastCommittedPoint: [...end] as [number, number],
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: recognized.kind === "arrow" ? "arrow" : null,
        ...(recognized.kind === "arrow" ? { elbowed: false } : {}),
        backgroundColor: "transparent",
        updated: Date.now(),
      } as unknown as ExcalidrawElement;
    }
    case "triangle":
    case "diamond":
    case "parallelogram":
    case "pentagon": {
      // Closed polygons are multi-point lines ending back at the origin.
      // First point [0,0] keeps Excalidraw's linear editor normalization.
      const origin = recognized.points[0];
      const rel = recognized.points.map(
        (p): [number, number] => [p.x - origin.x, p.y - origin.y]
      );
      rel.push([0, 0]);
      const polyBox = bboxOf(recognized.points);
      return {
        ...baseOf(source),
        type: "line",
        x: origin.x,
        y: origin.y,
        width: Math.max(polyBox.width, 1),
        height: Math.max(polyBox.height, 1),
        angle: 0,
        roundness: { ...ROUNDNESS_LINE },
        points: rel,
        lastCommittedPoint: [0, 0] as [number, number],
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
        backgroundColor: "transparent",
        updated: Date.now(),
      } as unknown as ExcalidrawElement;
    }
    default: {
      // Exhaustiveness guard — return the untouched stroke style base.
      void src;
      return source;
    }
  }
}
