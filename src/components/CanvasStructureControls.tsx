"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import {
  actionsFor,
  collectNodes,
  describeData,
  findStructureDef,
  type ApplyActionOptions,
  type StructureData,
  type StructureId,
} from "@/lib/dataStructures";

/** Bounding box of the selected diagram, in viewport (screen) pixels. */
export interface ViewportBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CanvasStructureControlsProps {
  instanceId: string;
  type: StructureId;
  data: unknown;
  box: ViewportBox;
  onAction: (actionId: string, opts: ApplyActionOptions) => void;
  onRemove: () => void;
}

/**
 * Editing affordances for a data-structure diagram, floating just outside
 * the shape on the canvas. Deliberately not scaled with zoom: this is a
 * control surface, not drawn content, so it stays legible at any zoom.
 */
export default function CanvasStructureControls({
  instanceId,
  type,
  data,
  box,
  onAction,
  onRemove,
}: CanvasStructureControlsProps) {
  const [value, setValue] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; width: number; quickLeft: number; quickTop: number; quickVisible: boolean; visible: boolean } | null>(null);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    let frame = 0;
    const update = () => {
      const margin = 12;
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const sidebar = document.querySelector<HTMLElement>(".selected-shape-actions .App-menu__left")?.getBoundingClientRect();
      const sidebarRight = sidebar && sidebar.width > 0 ? sidebar.right + margin : margin;
      const width = Math.max(0, Math.min(420, screenWidth - sidebarRight - margin));
      const actualWidth = Math.min(controls.offsetWidth, width);
      const height = controls.offsetHeight;
      const left = Math.max(sidebarRight, Math.min(box.left, screenWidth - actualWidth - margin));
      const preferredTop = box.bottom + 14;
      const top = preferredTop + height <= screenHeight - margin
        ? preferredTop
        : Math.max(margin, Math.min(box.top - height - 14, screenHeight - height - margin));
      const quickTop = Math.max(margin, Math.min((box.top + box.bottom) / 2 - 16, screenHeight - 32 - margin));
      const leftCandidate = box.left - 46;
      const rightCandidate = box.right + 14;
      const quickLeft = leftCandidate >= sidebarRight ? leftCandidate : rightCandidate;
      const quickVisible = quickLeft >= sidebarRight && quickLeft + 32 <= screenWidth - margin;
      const visible = box.right > 0 && box.left < screenWidth && box.bottom > 0 && box.top < screenHeight && width >= 120;
      setPlacement((old) => {
        const next = { left, top, width, quickLeft, quickTop, quickVisible, visible };
        return old && Object.keys(next).every((key) => old[key as keyof typeof next] === next[key as keyof typeof next]) ? old : next;
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(controls);
    const sidebar = document.querySelector<HTMLElement>(".selected-shape-actions .App-menu__left");
    if (sidebar) observer.observe(sidebar);
    window.addEventListener("resize", schedule);
    update();
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); };
  }, [box.left, box.top, box.right, box.bottom]);

  const def = findStructureDef(type);
  const actions = useMemo(() => actionsFor(type), [type]);
  const primary = actions.find((a) => a.primary);
  const usesValue = actions.some((a) => a.usesValue);

  const treeNodes = useMemo(
    () =>
      type === "binary-tree"
        ? collectNodes((data as StructureData["binary-tree"]).root)
        : [],
    [type, data]
  );

  // Reset the scratch input whenever the selection moves to another diagram.
  useEffect(() => {
    setValue("");
    setSelectedNodeId(null);
  }, [instanceId]);

  // Keep a valid tree node selected so "Add left" is usable immediately.
  useEffect(() => {
    if (type !== "binary-tree") return;
    if (treeNodes.length === 0) {
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId((prev) =>
      prev && treeNodes.some((n) => n.id === prev) ? prev : treeNodes[0].id
    );
  }, [type, treeNodes]);

  const run = (actionId: string) => {
    onAction(actionId, { value, nodeId: selectedNodeId });
    setValue("");
    // Keep focus so several items can be added in a row.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // Swallow events so clicks never reach the Excalidraw canvas underneath
  // (which would otherwise deselect the diagram we're editing). React's
  // synthetic stopPropagation isn't enough on its own, since Excalidraw also
  // listens at the document level.
  const swallow = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopPropagation();
  };

  const needsNodeBlocked = (needsNode?: boolean) =>
    Boolean(needsNode) && !selectedNodeId;

  return (
    <>
      {/* Quick-add button, centred on the shape's left edge. */}
      {primary && placement?.visible && placement.quickVisible && (
        <button
          type="button"
          className="ds-canvas-quickadd"
          style={{
            left: placement.quickLeft,
            top: placement.quickTop,
          }}
          onPointerDown={swallow}
          onClick={(e) => {
            swallow(e);
            run(primary.id);
          }}
          title={`${primary.label} (quick add)`}
        >
          <Plus size={18} strokeWidth={3} />
        </button>
      )}

      {/* Full control bar, just below the shape. */}
      <div
        ref={controlsRef}
        className="ds-canvas-controls"
        style={{ left: placement?.left ?? box.left, top: placement?.top ?? box.bottom + 14, minWidth: Math.min(210, placement?.width ?? 210), maxWidth: placement?.width, visibility: placement?.visible ? "visible" : "hidden" }}
        onPointerDown={swallow}
        onPointerUp={swallow}
        onClick={swallow}
        onDoubleClick={swallow}
        onWheel={swallow}
      >
        <div className="ds-canvas-controls__head">
          <span className="ds-canvas-controls__name">{def?.name ?? type}</span>
          <span className="ds-canvas-controls__count">{describeData(type, data)}</span>
          <button
            type="button"
            className="ds-canvas-controls__delete"
            onClick={(e) => {
              swallow(e);
              onRemove();
            }}
            title="Delete this diagram"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {type === "binary-tree" && treeNodes.length > 0 && (
          <div className="ds-canvas-controls__nodes">
            <span className="ds-canvas-controls__hint">Attach to:</span>
            {treeNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`ds-canvas-controls__pill${
                  selectedNodeId === n.id ? " ds-canvas-controls__pill--active" : ""
                }`}
                onClick={(e) => {
                  swallow(e);
                  setSelectedNodeId(n.id);
                }}
              >
                {n.value}
              </button>
            ))}
          </div>
        )}

        <div className="ds-canvas-controls__row">
          {usesValue && (
            <input
              ref={inputRef}
              type="text"
              className="ds-canvas-controls__input"
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && primary && !needsNodeBlocked(primary.needsNode)) {
                  run(primary.id);
                }
              }}
            />
          )}
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`ds-canvas-controls__btn ds-canvas-controls__btn--${a.kind}`}
              disabled={needsNodeBlocked(a.needsNode)}
              onClick={(e) => {
                swallow(e);
                run(a.id);
              }}
              title={a.label}
            >
              {a.kind === "add" ? <Plus size={12} /> : <Minus size={12} />}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
