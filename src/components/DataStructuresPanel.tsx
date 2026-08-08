"use client";

import React, { useCallback, useState } from "react";
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
  type DataStructureDef,
  type StructureData,
  type TreeNode,
  makeTreeNode,
  cloneTree,
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
  onInsertTable: () => void;
}

// ── Mini previews (SVG) ─────────────────────────────────────────────

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

// ── Builder state ────────────────────────────────────────────────────

type BuilderState = {
  [K in keyof StructureData]: StructureData[K];
};

function initBuilderState(): BuilderState {
  return {
    stack: { items: [...DEFAULT_DATA.stack.items] },
    queue: { values: [...DEFAULT_DATA.queue.values] },
    array: { values: [...DEFAULT_DATA.array.values] },
    "linked-list": { values: [...DEFAULT_DATA["linked-list"].values] },
    "binary-tree": { root: cloneTree(DEFAULT_DATA["binary-tree"].root!) },
    graph: { labels: [...DEFAULT_DATA.graph.labels] },
  };
}

// ── Helpers for binary tree ──────────────────────────────────────────

function findNode(root: TreeNode | null | undefined, id: string): TreeNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  return findNode(root.left, id) || findNode(root.right, id);
}

function addChildAt(root: TreeNode | undefined, parentId: string, side: "left" | "right", value: string): TreeNode | undefined {
  if (!root) return undefined;
  const next = makeTreeNode(value);
  if (root.id === parentId) {
    return { ...root, [side]: next };
  }
  return {
    ...root,
    left: addChildAt(root.left, parentId, side, value),
    right: addChildAt(root.right, parentId, side, value),
  };
}

// ── Main panel ───────────────────────────────────────────────────────

export default function DataStructuresPanel({
  onClose,
  onInsert,
  onInsertTable,
}: DataStructuresPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [state, setState] = useState<BuilderState>(initBuilderState);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newItemValue, setNewItemValue] = useState("");
  const [newNodeValue, setNewNodeValue] = useState("");

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
    setSelectedNodeId(null);
  }, []);

  const handleAddStack = useCallback(() => {
    const val = newItemValue.trim() || String.fromCharCode(65 + state.stack.items.length);
    setState((s) => ({ ...s, stack: { items: [...s.stack.items, val] } }));
    setNewItemValue("");
  }, [newItemValue, state.stack.items.length]);

  const handleRemoveStack = useCallback(() => {
    setState((s) => ({ ...s, stack: { items: s.stack.items.slice(0, -1) } }));
  }, []);

  const handleAddQueue = useCallback(() => {
    const val = newItemValue.trim() || String(state.queue.values.length * 10 + 10);
    setState((s) => ({ ...s, queue: { values: [...s.queue.values, val] } }));
    setNewItemValue("");
  }, [newItemValue, state.queue.values.length]);

  const handleRemoveQueue = useCallback(() => {
    setState((s) => ({ ...s, queue: { values: s.queue.values.slice(0, -1) } }));
  }, []);

  const handleAddArray = useCallback(() => {
    const val = newItemValue.trim() || String(state.array.values.length * 7 + 5);
    setState((s) => ({ ...s, array: { values: [...s.array.values, val] } }));
    setNewItemValue("");
  }, [newItemValue, state.array.values.length]);

  const handleRemoveArray = useCallback(() => {
    setState((s) => ({ ...s, array: { values: s.array.values.slice(0, -1) } }));
  }, []);

  const handleAddLinkedList = useCallback(() => {
    const val = newItemValue.trim() || String.fromCharCode(65 + state["linked-list"].values.length);
    setState((s) => ({ ...s, "linked-list": { values: [...s["linked-list"].values, val] } }));
    setNewItemValue("");
  }, [newItemValue, state["linked-list"].values.length]);

  const handleRemoveLinkedList = useCallback(() => {
    setState((s) => ({ ...s, "linked-list": { values: s["linked-list"].values.slice(0, -1) } }));
  }, []);

  const handleAddGraphNode = useCallback(() => {
    const nextLetter = String.fromCharCode(65 + state.graph.labels.length);
    setState((s) => ({ ...s, graph: { labels: [...s.graph.labels, nextLetter] } }));
  }, [state.graph.labels.length]);

  const handleRemoveGraphNode = useCallback(() => {
    setState((s) => ({ ...s, graph: { labels: s.graph.labels.slice(0, -1) } }));
  }, []);

  const handleAddTreeChild = useCallback((side: "left" | "right") => {
    if (!selectedNodeId || !state["binary-tree"].root) return;
    const val = newNodeValue.trim() || "0";
    const newRoot = addChildAt(state["binary-tree"].root, selectedNodeId, side, val) ?? null;
    setState((s) => ({ ...s, "binary-tree": { root: newRoot } }));
    setNewNodeValue("");
  }, [selectedNodeId, newNodeValue, state["binary-tree"].root]);

  const handleInsert = useCallback((def: DataStructureDef) => {
    onInsert(def, state[def.id]);
  }, [onInsert, state]);

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
        Click to expand, add items, then insert onto canvas
      </p>

      <div className="ds-panel__table-btn-wrap">
        <button
          type="button"
          className="ds-panel__table-btn"
          onClick={onInsertTable}
        >
          <Table size={14} strokeWidth={2} />
          <span>Insert Editable Table</span>
        </button>
      </div>

      <div className="data-structures-panel__list">
        {DATA_STRUCTURES.map((def) => {
          const Icon = ICONS[def.icon] ?? Layers;
          const isOpen = expanded === def.id;
          return (
            <div key={def.id} className="ds-card">
              <div
                className={`ds-card__header${isOpen ? " ds-card__header--open" : ""}`}
                onClick={() => toggleExpand(def.id)}
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
                    {def.id === "stack" && <StackPreview items={(state.stack as StructureData["stack"]).items} />}
                    {def.id === "queue" && <QueuePreview values={(state.queue as StructureData["queue"]).values} />}
                    {def.id === "array" && <ArrayPreview values={(state.array as StructureData["array"]).values} />}
                    {def.id === "linked-list" && <LinkedListPreview values={(state["linked-list"] as StructureData["linked-list"]).values} />}
                    {def.id === "binary-tree" && <BinaryTreePreview root={(state["binary-tree"] as StructureData["binary-tree"]).root} />}
                    {def.id === "graph" && <GraphPreview labels={(state.graph as StructureData["graph"]).labels} />}
                  </div>

                  {/* Controls per structure */}
                  {def.id === "binary-tree" ? (
                    <div className="ds-card__controls ds-card__controls--tree">
                      <div className="ds-card__tree-select">
                        <small>Select a node:</small>
                        <div className="ds-card__tree-nodes">
                          {collectNodes((state["binary-tree"] as StructureData["binary-tree"]).root).map((n) => (
                            <button
                              key={n.id}
                              type="button"
                              className={`ds-card__tree-pill${selectedNodeId === n.id ? " ds-card__tree-pill--active" : ""}`}
                              onClick={() => setSelectedNodeId(n.id)}
                            >
                              {n.value}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="ds-card__input-row">
                        <input
                          type="text"
                          placeholder="child value"
                          value={newNodeValue}
                          onChange={(e) => setNewNodeValue(e.target.value)}
                          className="ds-card__input"
                        />
                        <button
                          type="button"
                          className="ds-card__btn ds-card__btn--add"
                          onClick={() => handleAddTreeChild("left")}
                          disabled={!selectedNodeId}
                          title="Add left child"
                        >
                          <Plus size={12} /> Left
                        </button>
                        <button
                          type="button"
                          className="ds-card__btn ds-card__btn--add"
                          onClick={() => handleAddTreeChild("right")}
                          disabled={!selectedNodeId}
                          title="Add right child"
                        >
                          <Plus size={12} /> Right
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="ds-card__controls">
                      <div className="ds-card__input-row">
                        <input
                          type="text"
                          placeholder="value"
                          value={newItemValue}
                          onChange={(e) => setNewItemValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (def.id === "stack") handleAddStack();
                              else if (def.id === "queue") handleAddQueue();
                              else if (def.id === "array") handleAddArray();
                              else if (def.id === "linked-list") handleAddLinkedList();
                            }
                          }}
                          className="ds-card__input"
                        />
                        {def.id === "stack" && (
                          <>
                            <button type="button" className="ds-card__btn ds-card__btn--add" onClick={handleAddStack}>
                              <Plus size={12} /> Push
                            </button>
                            <button type="button" className="ds-card__btn ds-card__btn--remove" onClick={handleRemoveStack}>
                              <Minus size={12} />
                            </button>
                          </>
                        )}
                        {def.id === "queue" && (
                          <>
                            <button type="button" className="ds-card__btn ds-card__btn--add" onClick={handleAddQueue}>
                              <Plus size={12} /> Add
                            </button>
                            <button type="button" className="ds-card__btn ds-card__btn--remove" onClick={handleRemoveQueue}>
                              <Minus size={12} />
                            </button>
                          </>
                        )}
                        {def.id === "array" && (
                          <>
                            <button type="button" className="ds-card__btn ds-card__btn--add" onClick={handleAddArray}>
                              <Plus size={12} /> Add
                            </button>
                            <button type="button" className="ds-card__btn ds-card__btn--remove" onClick={handleRemoveArray}>
                              <Minus size={12} />
                            </button>
                          </>
                        )}
                        {def.id === "linked-list" && (
                          <>
                            <button type="button" className="ds-card__btn ds-card__btn--add" onClick={handleAddLinkedList}>
                              <Plus size={12} /> Add
                            </button>
                            <button type="button" className="ds-card__btn ds-card__btn--remove" onClick={handleRemoveLinkedList}>
                              <Minus size={12} />
                            </button>
                          </>
                        )}
                        {def.id === "graph" && (
                          <>
                            <button type="button" className="ds-card__btn ds-card__btn--add" onClick={handleAddGraphNode}>
                              <Plus size={12} /> Node
                            </button>
                            <button type="button" className="ds-card__btn ds-card__btn--remove" onClick={handleRemoveGraphNode}>
                              <Minus size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

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

function collectNodes(root: TreeNode | null | undefined): TreeNode[] {
  if (!root) return [];
  return [root, ...collectNodes(root.left), ...collectNodes(root.right)];
}
