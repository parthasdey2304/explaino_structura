"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  X,
  Layers,
  Rows3,
  Grid3x3,
  Link2,
  GitBranch,
  Network,
  Table,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  DATA_STRUCTURES,
  DEFAULT_DATA,
  actionsFor,
  applyAction,
  collectNodes,
  cloneTree,
  type DataStructureDef,
  type StructureData,
  type StructureId,
  type TreeNode,
} from "@/lib/dataStructures";

const ICONS: Record<string, LucideIcon> = {
  Layers,
  Rows3,
  Grid3x3,
  Link2,
  GitBranch,
  Network,
  Table,
};

interface DataStructuresPanelProps {
  onClose: () => void;
  onInsert: (def: DataStructureDef, data: unknown) => void;
}

// ── Mini previews ───────────────────────────────────────────────────

function StackPreview({ items }: { items: string[] }) {
  const display = items.slice(-4);
  return (
    <div className="ds-preview">
      <div className="ds-preview__stack">
        {display.map((v, i) => (
          <div
            key={i}
            className="ds-preview__block"
            style={{ background: i === display.length - 1 ? "#ffec99" : "#a5d8ff" }}
          >
            {v}
          </div>
        ))}
        {items.length === 0 && <span className="ds-preview__empty">empty</span>}
      </div>
    </div>
  );
}

function QueuePreview({ values }: { values: string[] }) {
  const display = values.slice(0, 4);
  return (
    <div className="ds-preview">
      <div className="ds-preview__queue">
        {display.map((v, i) => (
          <div key={i} className="ds-preview__cell">{v}</div>
        ))}
        {values.length === 0 && <span className="ds-preview__empty">empty</span>}
      </div>
    </div>
  );
}

function ArrayPreview({ values }: { values: string[] }) {
  const display = values.slice(0, 5);
  return (
    <div className="ds-preview">
      <div className="ds-preview__array">
        {display.map((v, i) => (
          <div key={i} className="ds-preview__array-cell">
            <span>{v}</span>
            <span className="ds-preview__array-idx">{i}</span>
          </div>
        ))}
        {values.length === 0 && <span className="ds-preview__empty">empty</span>}
      </div>
    </div>
  );
}

function LinkedListPreview({ values }: { values: string[] }) {
  const display = values.slice(0, 4);
  return (
    <div className="ds-preview">
      <div className="ds-preview__ll">
        {display.map((v, i) => (
          <React.Fragment key={i}>
            <div className="ds-preview__ll-node">{v}</div>
            {i < display.length - 1 && <span className="ds-preview__ll-arrow">→</span>}
          </React.Fragment>
        ))}
        {display.length > 0 && <span className="ds-preview__ll-arrow">→ ∅</span>}
        {values.length === 0 && <span className="ds-preview__empty">empty</span>}
      </div>
    </div>
  );
}

function BinaryTreePreview({ root }: { root: TreeNode | null }) {
  if (!root) return <div className="ds-preview"><span className="ds-preview__empty">empty</span></div>;
  const render = (node: TreeNode | undefined, depth: number): React.ReactNode => {
    if (!node) return null;
    return (
      <div className="ds-preview__tree-node" key={node.id}>
        <div className="ds-preview__tree-circle">{node.value}</div>
        {(node.left || node.right) && (
          <div className="ds-preview__tree-children">
            {render(node.left, depth + 1) ?? <span className="ds-preview__tree-missing">·</span>}
            {render(node.right, depth + 1) ?? <span className="ds-preview__tree-missing">·</span>}
          </div>
        )}
      </div>
    );
  };
  return <div className="ds-preview">{render(root, 0)}</div>;
}

function GraphPreview({ labels }: { labels: string[] }) {
  const display = labels.slice(0, 6);
  return (
    <div className="ds-preview">
      <div className="ds-preview__graph">
        {display.map((l, i) => (
          <div key={i} className="ds-preview__graph-node">{l}</div>
        ))}
        {labels.length === 0 && <span className="ds-preview__empty">empty</span>}
      </div>
    </div>
  );
}

function TablePreview({ rows, cols }: { rows: number; cols: number }) {
  const r = Math.min(rows, 4);
  const c = Math.min(cols, 4);
  return (
    <div className="ds-preview">
      <div className="ds-preview__table">
        {Array.from({ length: r }, (_, ri) => (
          <div key={ri} className="ds-preview__table-row">
            {Array.from({ length: c }, (_, ci) => (
              <div
                key={ci}
                className="ds-preview__table-cell"
                style={{ background: ri === 0 ? "#e9ecef" : "transparent" }}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="ds-preview__table-size">{rows} × {cols}</span>
    </div>
  );
}

// ── Builder state ────────────────────────────────────────────────────

type BuilderState = { [K in StructureId]: StructureData[K] };

function initBuilderState(): BuilderState {
  return {
    stack: { items: [...DEFAULT_DATA.stack.items] },
    queue: { values: [...DEFAULT_DATA.queue.values] },
    array: { values: [...DEFAULT_DATA.array.values] },
    "linked-list": { values: [...DEFAULT_DATA["linked-list"].values] },
    "binary-tree": { root: cloneTree(DEFAULT_DATA["binary-tree"].root!) },
    graph: { labels: [...DEFAULT_DATA.graph.labels] },
    table: {
      rows: DEFAULT_DATA.table.rows,
      cols: DEFAULT_DATA.table.cols,
      cells: DEFAULT_DATA.table.cells.map((row) => [...row]),
    },
  };
}

// ── Main panel ───────────────────────────────────────────────────────

export default function DataStructuresPanel({
  onClose,
  onInsert,
}: DataStructuresPanelProps) {
  const [expanded, setExpanded] = useState<StructureId | null>(null);
  const [state, setState] = useState<BuilderState>(initBuilderState);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [value, setValue] = useState("");

  const toggleExpand = useCallback((id: StructureId) => {
    setExpanded((prev) => (prev === id ? null : id));
    setSelectedNodeId(null);
    setValue("");
  }, []);

  const treeNodes = useMemo(
    () => collectNodes(state["binary-tree"].root),
    [state]
  );

  // Same action table the on-canvas controls use, so the two can't drift.
  const handleAction = useCallback(
    (id: StructureId, actionId: string) => {
      setState((prev) => {
        const next = applyAction(
          id,
          prev[id] as StructureData[StructureId],
          actionId,
          { value, nodeId: selectedNodeId }
        );
        if (next === prev[id]) return prev;
        return { ...prev, [id]: next } as BuilderState;
      });
      setValue("");
    },
    [value, selectedNodeId]
  );

  const handleInsert = useCallback(
    (def: DataStructureDef) => {
      onInsert(def, state[def.id]);
    },
    [onInsert, state]
  );

  return (
    <div className="data-structures-panel excalidraw-island">
      <div className="data-structures-panel__header">
        <span className="data-structures-panel__title">Data Structures</span>
        <button
          type="button"
          onClick={onClose}
          className="tool-icon-btn"
          style={{ width: "1.75rem", height: "1.75rem" }}
          title="Close"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <p className="data-structures-panel__hint">
        Build it here, or drop it on the canvas and keep editing it there.
      </p>

      <div className="data-structures-panel__list">
        {DATA_STRUCTURES.map((def) => {
          const Icon = ICONS[def.icon] ?? Layers;
          const isOpen = expanded === def.id;
          const actions = actionsFor(def.id);
          const usesValue = actions.some((a) => a.usesValue);
          const isTree = def.id === "binary-tree";

          return (
            <div key={def.id} className="ds-card">
              <div
                className={`ds-card__header${isOpen ? " ds-card__header--open" : ""}`}
                onClick={() => toggleExpand(def.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-data-structure", def.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title="Drag onto the canvas, or click to configure"
              >
                <div className="ds-card__left">
                  <div className="ds-card__icon">
                    <Icon size={16} strokeWidth={1.8} />
                  </div>
                  <div className="ds-card__meta">
                    <span className="ds-card__name">{def.name}</span>
                    <span className="ds-card__desc">{def.description}</span>
                  </div>
                </div>
                <div className="ds-card__chevron">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
              </div>

              {isOpen && (
                <div className="ds-card__body">
                  <div className="ds-card__preview">
                    {def.id === "stack" && <StackPreview items={state.stack.items} />}
                    {def.id === "queue" && <QueuePreview values={state.queue.values} />}
                    {def.id === "array" && <ArrayPreview values={state.array.values} />}
                    {def.id === "linked-list" && (
                      <LinkedListPreview values={state["linked-list"].values} />
                    )}
                    {def.id === "binary-tree" && (
                      <BinaryTreePreview root={state["binary-tree"].root} />
                    )}
                    {def.id === "graph" && <GraphPreview labels={state.graph.labels} />}
                    {def.id === "table" && (
                      <TablePreview rows={state.table.rows} cols={state.table.cols} />
                    )}
                  </div>

                  <div className="ds-card__controls">
                    {isTree && treeNodes.length > 0 && (
                      <div className="ds-card__tree-select">
                        <small>Select a node:</small>
                        <div className="ds-card__tree-nodes">
                          {treeNodes.map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              className={`ds-card__tree-pill${
                                selectedNodeId === n.id ? " ds-card__tree-pill--active" : ""
                              }`}
                              onClick={() => setSelectedNodeId(n.id)}
                            >
                              {n.value}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="ds-card__input-row">
                      {usesValue && (
                        <input
                          type="text"
                          placeholder="value"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            const primary = actions.find((a) => a.primary);
                            if (!primary) return;
                            if (primary.needsNode && !selectedNodeId) return;
                            handleAction(def.id, primary.id);
                          }}
                          className="ds-card__input"
                        />
                      )}
                      {actions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className={`ds-card__btn ds-card__btn--${
                            a.kind === "add" ? "add" : "remove"
                          }`}
                          disabled={Boolean(a.needsNode) && !selectedNodeId}
                          onClick={() => handleAction(def.id, a.id)}
                          title={a.label}
                        >
                          {a.kind === "add" ? <Plus size={12} /> : <Minus size={12} />}
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="ds-card__insert-btn"
                    onClick={() => handleInsert(def)}
                  >
                    Insert onto Canvas
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
