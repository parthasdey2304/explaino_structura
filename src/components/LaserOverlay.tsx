"use client";

import { useEffect, useRef } from "react";

/**
 * LaserOverlay — disappearing red laser pointer ("vanishing marker").
 *
 * A dedicated transient canvas layered above the whiteboard drawing surface
 * (z-index 3: above Excalidraw's canvases at 1–2, below its toolbar UI at 4).
 * The canvas itself is click-through (`pointer-events: none`), so wheel
 * scrolling/zooming and every other Excalidraw interaction keep working.
 * While laser mode is active, a window capture-phase `pointerdown` listener
 * intercepts only primary-button presses that land on the drawing canvases
 * and stops them before Excalidraw's own handlers run — the document state
 * is never touched and nothing is pushed to the undo/redo history.
 * Deliberately NOT intercepted (so they keep working in laser mode):
 * middle/right-button presses (pan, context menu) and Space+drag panning.
 *
 * Rendering: vivid red strokes (`#ff3b30` core over a `#ef4444` aura) with a
 * glow, smoothed with quadratic bezier segments through the recorded pointer
 * coordinates. Each finished stroke holds briefly, then fades to zero alpha
 * over ~1.25s in a `requestAnimationFrame` loop; expired strokes are dropped
 * and the canvas is cleared once nothing remains.
 */

export const LASER_RED = "#ff3b30";
const LASER_RED_DEEP = "#ef4444";
/** Fully-visible hold time after a stroke ends before fading starts (ms). */
const HOLD_MS = 250;
/** Fade-out duration (ms) — spec window is 1.0–1.5 s. */
const FADE_MS = 1250;
const CORE_WIDTH = 3;
const AURA_WIDTH = 8;

interface TrailPoint {
  x: number;
  y: number;
}

interface Trail {
  points: TrailPoint[];
  /** performance.now() timestamp of pointerup; null while still drawing. */
  finishedAt: number | null;
}

export default function LaserOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trailsRef = useRef<Trail[]>([]);
  const rafRef = useRef<number>(0);
  const kickRef = useRef(() => {});

  // Keep the canvas matched to its parent box at device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(parent.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(parent.clientHeight * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  // Frame loop (an effect, never render): every animation frame repaints all
  // live/fading trails until none remain. Stopped on unmount.
  useEffect(() => {
    const tick = () => {
      const remaining = paintFrame(canvasRef.current, trailsRef.current);
      trailsRef.current = remaining;
      if (remaining.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = 0;
      }
    };
    kickRef.current = () => {
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      trailsRef.current = [];
    };
  }, []);

  // Laser input interception. Window capture phase runs before Excalidraw's
  // own (bubble-phase, container-level) pointer handlers, so stopping a
  // canvas-targeted press here keeps the stroke out of the document while
  // wheel events and all non-canvas UI keep flowing untouched.
  useEffect(() => {
    if (!active) return;
    const toLocal = (clientX: number, clientY: number): TrailPoint => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return {
        x: clientX - (rect?.left ?? 0),
        y: clientY - (rect?.top ?? 0),
      };
    };
    const kick = () => {
      kickRef.current();
    };
    const appendPoints = (clientX: number, clientY: number) => {
      const current = trailsRef.current[trailsRef.current.length - 1];
      if (!current || current.finishedAt !== null) return;
      current.points.push(toLocal(clientX, clientY));
      kick();
    };
    const finishStroke = () => {
      const current = trailsRef.current[trailsRef.current.length - 1];
      if (current && current.finishedAt === null) {
        current.finishedAt = performance.now();
        kick();
      }
    };
    let spaceHeld = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      // Let pan (middle button / Space+drag), context menu and multi-touch
      // gestures reach Excalidraw; laser only owns primary-button presses.
      if (e.button !== 0 || !e.isPrimary || spaceHeld) return;
      const target = e.target as HTMLElement | null;
      // Only presses landing on the drawing canvases become laser strokes —
      // toolbar buttons, panels and the text editor keep working normally.
      if (
        !target ||
        target.tagName !== "CANVAS" ||
        !canvasRef.current?.parentElement?.contains(target)
      ) {
        return;
      }
      e.stopPropagation();
      trailsRef.current.push({
        points: [toLocal(e.clientX, e.clientY)],
        finishedAt: null,
      });
      kick();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      const native = e as PointerEvent & {
        getCoalescedEvents?: () => PointerEvent[];
      };
      const events =
        typeof native.getCoalescedEvents === "function"
          ? native.getCoalescedEvents()
          : [native];
      for (const ev of events) {
        appendPoints(ev.clientX, ev.clientY);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishStroke);
    window.addEventListener("pointercancel", finishStroke);
    window.addEventListener("blur", finishStroke);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishStroke);
      window.removeEventListener("pointercancel", finishStroke);
      window.removeEventListener("blur", finishStroke);
      spaceHeld = false;
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 3,
        // Click-through: wheel/scroll/zoom and all Excalidraw UI keep
        // working; laser input is intercepted in the capture phase above.
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Paint one frame: redraw every trail with its current fade alpha, drop
 * expired/empty trails, and clear the canvas once nothing remains. Returns
 * the surviving trails.
 */
function paintFrame(
  canvas: HTMLCanvasElement | null,
  trails: Trail[]
): Trail[] {
  if (!canvas) return [];
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const now = performance.now();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const alive: Trail[] = [];
  for (const trail of trails) {
    let alpha = 1;
    if (trail.finishedAt !== null) {
      const age = now - trail.finishedAt - HOLD_MS;
      if (age >= FADE_MS) {
        continue; // expired — drop it
      }
      if (age > 0) {
        // Ease-out fade so the tail vanishes smoothly.
        const t = 1 - age / FADE_MS;
        alpha = t * t;
      }
    }
    if (trail.points.length === 0) {
      continue;
    }
    alive.push(trail);
    if (trail.points.length === 1) {
      drawTipDot(ctx, trail.points[0], alpha);
    } else {
      // Soft aura pass, then a hot glowing core pass.
      ctx.save();
      ctx.globalAlpha = 0.3 * alpha;
      ctx.strokeStyle = LASER_RED_DEEP;
      ctx.lineWidth = AURA_WIDTH;
      tracePath(ctx, trail.points);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.95 * alpha;
      ctx.strokeStyle = LASER_RED;
      ctx.lineWidth = CORE_WIDTH;
      ctx.shadowColor = LASER_RED;
      ctx.shadowBlur = 14;
      tracePath(ctx, trail.points);
      ctx.stroke();
      ctx.restore();

      if (trail.finishedAt === null) {
        drawTipDot(ctx, trail.points[trail.points.length - 1], alpha);
      }
    }
  }
  if (alive.length === 0) {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }
  return alive;
}

/**
 * Smooth path through recorded points using quadratic bezier segments via
 * edge midpoints (the standard "quadratic midpoint" smoothing technique).
 */
function tracePath(ctx: CanvasRenderingContext2D, points: TrailPoint[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** Hot glowing dot marking the live laser tip (and single-tap dots). */
function drawTipDot(
  ctx: CanvasRenderingContext2D,
  at: TrailPoint,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = 0.95 * alpha;
  ctx.fillStyle = LASER_RED;
  ctx.shadowColor = LASER_RED;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(at.x, at.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
