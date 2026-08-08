"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
      {primary && (
        <button
          type="button"
          className="ds-canvas-quickadd"
          style={{
            left: box.left - 46,
            top: (box.top + box.bottom) / 2 - 16,
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
        className="ds-canvas-controls"
        style={{ left: box.left, top: box.bottom + 14 }}
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
