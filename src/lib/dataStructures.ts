import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

/**
 * Data-structure diagram generators for the "Data Structures" panel and for
 * the on-canvas editing controls.
 *
 * Every generator turns a plain data object into a self-contained set of
 * Excalidraw element skeletons anchored at a scene position. The skeletons
 * go through `convertToExcalidrawElements` before insertion, which gives
 * them Excalidraw's hand-drawn (roughjs) look and makes them ordinary
 * canvas objects: selectable, movable, resizable, undoable and persisted
 * with the scene.
 *
 * Diagrams are regenerated in place whenever their data changes, so the
 * same generator drives both the initial insert and every later edit.
 */

// ── Excalidraw default palette ─────────────────────────────────────────
const STROKE_BLACK = "#1e1e1e";
const STROKE_RED = "#e03131";
const STROKE_GREEN = "#2f9e44";
const STROKE_BLUE = "#1971c2";
const STROKE_ORANGE = "#f08c00";

const BG_TRANSPARENT = "transparent";
const BG_GREEN = "#b2f2bb";
const BG_BLUE = "#a5d8ff";
const BG_YELLOW = "#ffec99";
const BG_GRAY = "#e9ecef";

// ── Small helpers ─────────────────────────────────────────────────────

interface RectOptions {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid";
  strokeWidth?: number;
  roughness?: number;
  label?: { text: string; fontSize?: number };
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  options: RectOptions = {}
): ExcalidrawElementSkeleton {
  return {
    type: "rectangle",
    x,
    y,
    width,
    height,
    strokeColor: options.strokeColor ?? STROKE_BLACK,
    backgroundColor: options.backgroundColor ?? BG_TRANSPARENT,
    fillStyle: options.fillStyle ?? "solid",
    strokeWidth: options.strokeWidth ?? 2,
    roughness: options.roughness ?? 1,
    ...(options.label ? { label: options.label } : {}),
  };
}

function ellipse(
  x: number,
  y: number,
  width: number,
  height: number,
  options: RectOptions = {}
): ExcalidrawElementSkeleton {
  return {
    type: "ellipse",
    x,
    y,
    width,
    height,
    strokeColor: options.strokeColor ?? STROKE_BLACK,
    backgroundColor: options.backgroundColor ?? BG_TRANSPARENT,
    fillStyle: options.fillStyle ?? "solid",
    strokeWidth: options.strokeWidth ?? 2,
    roughness: options.roughness ?? 1,
    ...(options.label ? { label: options.label } : {}),
  };
}

interface TextOptions {
  fontSize?: number;
  strokeColor?: string;
}

function txt(
  x: number,
  y: number,
  text: string,
  options: TextOptions = {}
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    x,
    y,
    text,
    fontSize: options.fontSize ?? 16,
    strokeColor: options.strokeColor ?? STROKE_BLACK,
  };
}

interface LineOptions {
  strokeColor?: string;
  strokeWidth?: number;
  roughness?: number;
}

function line(
  x: number,
  y: number,
  points: [number, number][],
  options: LineOptions = {}
): ExcalidrawElementSkeleton {
  return {
    type: "line",
    x,
    y,
    points,
    strokeColor: options.strokeColor ?? STROKE_BLACK,
    strokeWidth: options.strokeWidth ?? 2,
    roughness: options.roughness ?? 1,
  };
}

interface ArrowOptions extends LineOptions {
  label?: { text: string; fontSize?: number };
}

function arrow(
  x: number,
  y: number,
  points: [number, number][],
  options: ArrowOptions = {}
): ExcalidrawElementSkeleton {
  return {
    type: "arrow",
    x,
    y,
    points,
    strokeColor: options.strokeColor ?? STROKE_BLACK,
    strokeWidth: options.strokeWidth ?? 2,
    roughness: options.roughness ?? 1,
    endArrowhead: "arrow",
    ...(options.label ? { label: options.label } : {}),
  };
}

// ── Data types ────────────────────────────────────────────────────────

export interface TreeNode {
  id: string;
  value: string;
  left?: TreeNode;
  right?: TreeNode;
}

let _nodeCounter = 0;

/**
 * Build a tree node, omitting absent children rather than storing explicit
 * `undefined`. Diagram data rides along in each element's `customData` and
 * gets written to Firestore, which rejects `undefined` values outright.
 */
export function makeTreeNode(value: string, left?: TreeNode, right?: TreeNode): TreeNode {
  const node: TreeNode = { id: `n${_nodeCounter++}`, value };
  if (left) node.left = left;
  if (right) node.right = right;
  return node;
}

export function cloneTree(node: TreeNode): TreeNode {
  const copy: TreeNode = { id: node.id, value: node.value };
  if (node.left) copy.left = cloneTree(node.left);
  if (node.right) copy.right = cloneTree(node.right);
  return copy;
}

/** Rebuild a node with new children, dropping the keys that are empty. */
function withChildren(
  node: TreeNode,
  left: TreeNode | undefined,
  right: TreeNode | undefined
): TreeNode {
  const next: TreeNode = { id: node.id, value: node.value };
  if (left) next.left = left;
  if (right) next.right = right;
  return next;
}

export interface StructureData {
  stack: { items: string[] };
  queue: { values: string[] };
  array: { values: string[] };
  "linked-list": { values: string[] };
  "binary-tree": { root: TreeNode | null };
  graph: { labels: string[] };
  table: { rows: number; cols: number; cells: string[][] };
}

export type StructureId = keyof StructureData;

export const DEFAULT_DATA: StructureData = {
  stack: { items: ["A", "B", "C"] },
  queue: { values: ["10", "20", "30", "40"] },
  array: { values: ["12", "7", "39", "4", "21"] },
  "linked-list": { values: ["A", "B", "C"] },
  "binary-tree": {
    root: makeTreeNode("8",
      makeTreeNode("3", makeTreeNode("1"), makeTreeNode("6")),
      makeTreeNode("10", makeTreeNode("9"), makeTreeNode("14"))
    ),
  },
  graph: { labels: ["A", "B", "C", "D", "E"] },
  table: {
    rows: 3,
    cols: 3,
    cells: [
      ["Column A", "Column B", "Column C"],
      ["", "", ""],
      ["", "", ""],
    ],
  },
};

// ── Stack ─────────────────────────────────────────────────────────────
// Grows upward from a fixed base: the generator is top-left anchored, and
// the insertion code re-anchors the bottom edge so pushing looks like the
// container getting taller rather than the whole diagram sliding down.

function generateStack(x: number, y: number, data: StructureData["stack"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const items = data.items;

  const bucketX = x + 55;
  const bucketY = y + 36;
  const bucketW = 140;
  const blockH = 46;
  const bucketH = Math.max(80, items.length * blockH + 20);

  elements.push(txt(bucketX, y, "STACK", { fontSize: 18 }));

  elements.push(
    line(bucketX, bucketY, [
      [0, 0],
      [0, bucketH],
      [bucketW, bucketH],
      [bucketW, 0],
    ], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 })
  );

  items.forEach((label, i) => {
    const blockY = bucketY + bucketH - blockH * (i + 1) - 4;
    elements.push(
      rect(bucketX + 10, blockY, bucketW - 20, blockH - 6, {
        backgroundColor: i === items.length - 1 ? BG_YELLOW : BG_BLUE,
        label: { text: label, fontSize: 18 },
      })
    );
  });

  const topBlockY = bucketY + bucketH - blockH * items.length - 4;
  if (items.length > 0) {
    elements.push(
      arrow(bucketX + bucketW + 65, topBlockY + (blockH - 6) / 2, [[0, 0], [-50, 0]], {
        label: { text: "TOP" },
        strokeColor: STROKE_ORANGE,
      })
    );
  }

  return elements;
}

// ── Queue ─────────────────────────────────────────────────────────────

function generateQueue(x: number, y: number, data: StructureData["queue"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const values = data.values;

  const tubeX = x + 70;
  const tubeY = y + 46;
  const cellW = 50;
  const cellH = 70;
  const tubeWidth = Math.max(cellW, cellW * values.length);

  elements.push(txt(tubeX, y, "QUEUE", { fontSize: 18 }));

  elements.push(line(tubeX, tubeY, [[0, 0], [tubeWidth, 0]], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 }));
  elements.push(line(tubeX, tubeY + cellH, [[0, 0], [tubeWidth, 0]], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 }));

  values.forEach((value, i) => {
    if (i > 0) {
      elements.push(line(tubeX + cellW * i, tubeY, [[0, 0], [0, cellH]], { strokeColor: STROKE_BLUE }));
    }
    elements.push(txt(tubeX + cellW * i + cellW / 2 - 8, tubeY + cellH / 2 - 10, value, { fontSize: 15 }));
  });

  elements.push(
    arrow(tubeX - 8, tubeY + cellH / 2, [[0, 0], [-50, 0]], {
      label: { text: "DEQUEUE" },
      strokeColor: STROKE_RED,
    })
  );
  elements.push(
    arrow(tubeX + tubeWidth + 58, tubeY + cellH / 2, [[0, 0], [-50, 0]], {
      label: { text: "ENQUEUE" },
      strokeColor: STROKE_GREEN,
    })
  );

  return elements;
}

// ── Array ─────────────────────────────────────────────────────────────

function generateArray(x: number, y: number, data: StructureData["array"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const values = data.values;

  const cellW = 55;
  const cellH = 55;
  const rowY = y + 40;

  elements.push(txt(x, y, "ARRAY", { fontSize: 18 }));

  values.forEach((value, i) => {
    const cellX = x + cellW * i;
    elements.push(
      rect(cellX, rowY, cellW, cellH, {
        backgroundColor: i % 2 === 0 ? BG_BLUE : BG_TRANSPARENT,
        label: { text: value, fontSize: 16 },
      })
    );
    elements.push(
      txt(cellX + cellW / 2 - 4, rowY + cellH + 6, String(i), {
        fontSize: 13,
        strokeColor: STROKE_ORANGE,
      })
    );
  });

  return elements;
}

// ── Linked List ───────────────────────────────────────────────────────

function generateLinkedList(x: number, y: number, data: StructureData["linked-list"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const values = data.values;

  const nodeW = 60;
  const nodeH = 50;
  const gap = 35;
  const nodeY = y + 40;

  elements.push(txt(x, y, "LINKED LIST", { fontSize: 18 }));

  let lastNodeX = x;
  values.forEach((value, i) => {
    const nodeX = x + i * (nodeW + gap);
    lastNodeX = nodeX;
    elements.push(
      rect(nodeX, nodeY, nodeW, nodeH, {
        backgroundColor: BG_GREEN,
        label: { text: value, fontSize: 16 },
      })
    );
    if (i < values.length - 1) {
      elements.push(
        arrow(nodeX + nodeW, nodeY + nodeH / 2, [[0, 0], [gap, 0]], {
          strokeColor: STROKE_BLACK,
        })
      );
    }
  });

  if (values.length > 0) {
    elements.push(arrow(lastNodeX + nodeW, nodeY + nodeH / 2, [[0, 0], [35, 0]], { strokeColor: STROKE_BLACK }));
    elements.push(txt(lastNodeX + nodeW + 42, nodeY + nodeH / 2 - 8, "NULL", { fontSize: 14, strokeColor: STROKE_RED }));
  }

  return elements;
}

// ── Binary Tree ───────────────────────────────────────────────────────

interface TreeLayout {
  x: number;
  y: number;
  node: TreeNode;
  left?: TreeLayout;
  right?: TreeLayout;
}

function layoutTree(root: TreeNode, x: number, baseY: number, level: number, minX: number, maxX: number): TreeLayout {
  const cx = (minX + maxX) / 2;
  const cy = baseY + level * 70;
  const layout: TreeLayout = { x: cx, y: cy, node: root };

  if (root.left) {
    layout.left = layoutTree(root.left, x, baseY, level + 1, minX, cx);
  }
  if (root.right) {
    layout.right = layoutTree(root.right, x, baseY, level + 1, cx, maxX);
  }
  return layout;
}

function countNodes(node: TreeNode | undefined): number {
  if (!node) return 0;
  return 1 + countNodes(node.left) + countNodes(node.right);
}

function generateBinaryTree(x: number, y: number, data: StructureData["binary-tree"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const root = data.root;
  if (!root) return elements;

  const diameter = 40;
  const nodeCount = countNodes(root);
  const width = Math.max(200, nodeCount * 70);
  const baseY = y + 40;

  elements.push(txt(x + width / 2 - 45, y, "BINARY TREE", { fontSize: 18 }));

  const layout = layoutTree(root, x, baseY, 0, x, x + width);

  const connect = (parent: TreeLayout, child: TreeLayout) =>
    line(parent.x, parent.y, [[0, 0], [child.x - parent.x, child.y - parent.y]], { strokeColor: STROKE_BLACK });

  const traverse = (node: TreeLayout) => {
    if (node.left) {
      elements.push(connect(node, node.left));
      traverse(node.left);
    }
    if (node.right) {
      elements.push(connect(node, node.right));
      traverse(node.right);
    }
  };
  traverse(layout);

  const drawNode = (node: TreeLayout) => {
    const bg = !node.left && !node.right ? BG_GREEN : BG_BLUE;
    elements.push(
      ellipse(node.x - diameter / 2, node.y - diameter / 2, diameter, diameter, {
        backgroundColor: bg,
        label: { text: node.node.value, fontSize: 15 },
      })
    );
    if (node.left) drawNode(node.left);
    if (node.right) drawNode(node.right);
  };
  drawNode(layout);

  return elements;
}

// ── Graph ─────────────────────────────────────────────────────────────

function generateGraph(x: number, y: number, data: StructureData["graph"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const labels = data.labels;
  if (labels.length === 0) return elements;

  const radius = Math.max(95, labels.length * 16);
  const size = radius * 2;
  const centerX = x + size / 2;
  const centerY = y + 55 + size / 2;
  const diameter = 36;

  elements.push(txt(centerX - 30, y, "GRAPH", { fontSize: 18 }));

  const nodes = labels.map((label, i) => {
    const angle = (-90 + i * (360 / labels.length)) * (Math.PI / 180);
    return {
      label,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  // Ring edges plus one chord, so the shape reads as a graph rather than a
  // polygon outline.
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    elements.push(line(from.x, from.y, [[0, 0], [to.x - from.x, to.y - from.y]], { strokeColor: STROKE_BLUE }));
  }
  if (labels.length >= 3) {
    const from = nodes[0];
    const to = nodes[2];
    elements.push(line(from.x, from.y, [[0, 0], [to.x - from.x, to.y - from.y]], { strokeColor: STROKE_BLUE }));
  }

  nodes.forEach((n) => {
    elements.push(
      ellipse(n.x - diameter / 2, n.y - diameter / 2, diameter, diameter, {
        backgroundColor: BG_YELLOW,
        label: { text: n.label, fontSize: 15 },
      })
    );
  });

  return elements;
}

// ── Table ─────────────────────────────────────────────────────────────
// Real canvas geometry rather than an HTML overlay: one labelled rectangle
// per cell, so the whole table drags, scales, undoes and saves like any
// other drawing, and a cell's text is edited by double-clicking it.

const TABLE_CELL_W = 120;
const TABLE_CELL_H = 40;

function generateTable(x: number, y: number, data: StructureData["table"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const { rows, cols, cells } = data;

  elements.push(txt(x, y, "TABLE", { fontSize: 18 }));

  const gridY = y + 32;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const text = cells[r]?.[c] ?? "";
      elements.push(
        rect(x + c * TABLE_CELL_W, gridY + r * TABLE_CELL_H, TABLE_CELL_W, TABLE_CELL_H, {
          backgroundColor: r === 0 ? BG_GRAY : BG_TRANSPARENT,
          strokeWidth: r === 0 ? 2.5 : 2,
          // An empty label would create a stray empty text element;
          // double-clicking the cell adds one natively instead.
          ...(text ? { label: { text, fontSize: 14 } } : {}),
        })
      );
    }
  }

  return elements;
}

/** Resize a cell grid, preserving whatever text already exists. */
function resizeCells(cells: string[][], rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => cells[r]?.[c] ?? "")
  );
}

// ── Binary-tree editing helpers ───────────────────────────────────────

export function collectNodes(root: TreeNode | null | undefined): TreeNode[] {
  if (!root) return [];
  return [root, ...collectNodes(root.left), ...collectNodes(root.right)];
}

export function addChildAt(
  root: TreeNode | undefined,
  parentId: string,
  side: "left" | "right",
  value: string
): TreeNode | undefined {
  if (!root) return undefined;
  if (root.id === parentId) {
    const child = makeTreeNode(value);
    return side === "left"
      ? withChildren(root, child, root.right)
      : withChildren(root, root.left, child);
  }
  return withChildren(
    root,
    addChildAt(root.left, parentId, side, value),
    addChildAt(root.right, parentId, side, value)
  );
}

/** Remove a node and its subtree. Returns undefined when the root is removed. */
export function removeNodeAt(root: TreeNode | undefined, id: string): TreeNode | undefined {
  if (!root) return undefined;
  if (root.id === id) return undefined;
  return withChildren(root, removeNodeAt(root.left, id), removeNodeAt(root.right, id));
}

// ── Shared edit actions ───────────────────────────────────────────────
// One description of "what can I add to this structure" that both the
// side panel and the on-canvas controls render, so the two never drift.

export interface StructureAction {
  /** Stable key passed back to `applyAction`. */
  id: string;
  label: string;
  kind: "add" | "remove";
  /** Uses the value input when present. */
  usesValue?: boolean;
  /** Requires a selected tree node. */
  needsNode?: boolean;
  /** Rendered as the big round quick-add button next to the shape. */
  primary?: boolean;
}

export function actionsFor(type: StructureId): StructureAction[] {
  switch (type) {
    case "stack":
      return [
        { id: "push", label: "Push", kind: "add", usesValue: true, primary: true },
        { id: "pop", label: "Pop", kind: "remove" },
      ];
    case "queue":
      return [
        { id: "enqueue", label: "Enqueue", kind: "add", usesValue: true, primary: true },
        { id: "dequeue", label: "Dequeue", kind: "remove" },
      ];
    case "array":
      return [
        { id: "append", label: "Add cell", kind: "add", usesValue: true, primary: true },
        { id: "pop", label: "Remove cell", kind: "remove" },
      ];
    case "linked-list":
      return [
        { id: "append", label: "Add node", kind: "add", usesValue: true, primary: true },
        { id: "pop", label: "Remove node", kind: "remove" },
      ];
    case "binary-tree":
      return [
        { id: "add-left", label: "Add left", kind: "add", usesValue: true, needsNode: true, primary: true },
        { id: "add-right", label: "Add right", kind: "add", usesValue: true, needsNode: true },
        { id: "remove-node", label: "Remove node", kind: "remove", needsNode: true },
      ];
    case "graph":
      return [
        { id: "add-node", label: "Add node", kind: "add", usesValue: true, primary: true },
        { id: "remove-node", label: "Remove node", kind: "remove" },
      ];
    case "table":
      return [
        { id: "add-row", label: "Add row", kind: "add", primary: true },
        { id: "add-col", label: "Add column", kind: "add" },
        { id: "remove-row", label: "Remove row", kind: "remove" },
        { id: "remove-col", label: "Remove column", kind: "remove" },
      ];
    default:
      return [];
  }
}

export interface ApplyActionOptions {
  /** Text typed into the value input, if any. */
  value?: string;
  /** Selected tree node id, for binary-tree actions. */
  nodeId?: string | null;
}

/** Any structure's data, before it's narrowed to a specific kind. */
export type AnyStructureData = StructureData[StructureId];

/**
 * Apply an edit action, returning fresh data. Returns the *same object* when
 * the action can't apply (popping an empty stack, adding a child with no node
 * selected, and so on), so callers can treat reference equality as "nothing
 * changed" and skip the redraw.
 *
 * Intentionally not generic: a generic return type would force every branch
 * through an unsound `as StructureData[T]` cast.
 */
export function applyAction(
  type: StructureId,
  data: AnyStructureData,
  actionId: string,
  opts: ApplyActionOptions = {}
): AnyStructureData {
  switch (type) {
    case "stack": {
      const d = data as StructureData["stack"];
      if (actionId === "push") {
        return { items: [...d.items, opts.value?.trim() || nextLetter(d.items.length)] };
      }
      if (actionId === "pop" && d.items.length > 0) {
        return { items: d.items.slice(0, -1) };
      }
      return data;
    }
    case "queue": {
      const d = data as StructureData["queue"];
      if (actionId === "enqueue") {
        return {
          values: [...d.values, opts.value?.trim() || String(d.values.length * 10 + 10)],
        };
      }
      if (actionId === "dequeue" && d.values.length > 0) {
        return { values: d.values.slice(1) };
      }
      return data;
    }
    case "array": {
      const d = data as StructureData["array"];
      if (actionId === "append") {
        return {
          values: [...d.values, opts.value?.trim() || String(d.values.length * 7 + 5)],
        };
      }
      if (actionId === "pop" && d.values.length > 0) {
        return { values: d.values.slice(0, -1) };
      }
      return data;
    }
    case "linked-list": {
      const d = data as StructureData["linked-list"];
      if (actionId === "append") {
        return { values: [...d.values, opts.value?.trim() || nextLetter(d.values.length)] };
      }
      if (actionId === "pop" && d.values.length > 0) {
        return { values: d.values.slice(0, -1) };
      }
      return data;
    }
    case "binary-tree": {
      const d = data as StructureData["binary-tree"];
      const isAdd = actionId === "add-left" || actionId === "add-right";
      if (!d.root) {
        // First click on an empty tree plants the root.
        return isAdd ? { root: makeTreeNode(opts.value?.trim() || "1") } : data;
      }
      if (isAdd) {
        if (!opts.nodeId) return data;
        const side = actionId === "add-left" ? "left" : "right";
        return { root: addChildAt(d.root, opts.nodeId, side, opts.value?.trim() || "0") ?? null };
      }
      if (actionId === "remove-node" && opts.nodeId) {
        return { root: removeNodeAt(d.root, opts.nodeId) ?? null };
      }
      return data;
    }
    case "graph": {
      const d = data as StructureData["graph"];
      if (actionId === "add-node") {
        return { labels: [...d.labels, opts.value?.trim() || nextLetter(d.labels.length)] };
      }
      if (actionId === "remove-node" && d.labels.length > 0) {
        return { labels: d.labels.slice(0, -1) };
      }
      return data;
    }
    case "table": {
      const d = data as StructureData["table"];
      if (actionId === "add-row") {
        const rows = d.rows + 1;
        return { rows, cols: d.cols, cells: resizeCells(d.cells, rows, d.cols) };
      }
      if (actionId === "add-col") {
        const cols = d.cols + 1;
        return { rows: d.rows, cols, cells: resizeCells(d.cells, d.rows, cols) };
      }
      if (actionId === "remove-row" && d.rows > 1) {
        const rows = d.rows - 1;
        return { rows, cols: d.cols, cells: resizeCells(d.cells, rows, d.cols) };
      }
      if (actionId === "remove-col" && d.cols > 1) {
        const cols = d.cols - 1;
        return { rows: d.rows, cols, cells: resizeCells(d.cells, d.rows, cols) };
      }
      return data;
    }
    default:
      return data;
  }
}

function nextLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

// ── Reading canvas edits back into the data ───────────────────────────
// Diagram values are drawn as labelled shapes, and Excalidraw lets the user
// double-click any of them and retype. Regenerating from stale stored data
// would silently discard those edits, so before every redraw the labels are
// read off the canvas and merged back in.

/**
 * Which element type carries this structure's editable values, in the order
 * the generator emits them. `null` means the values aren't in labelled
 * containers, so there's nothing to read back.
 */
export function valueCarrier(type: StructureId): "rectangle" | "ellipse" | null {
  switch (type) {
    case "stack":
    case "array":
    case "linked-list":
    case "table":
      return "rectangle";
    case "graph":
    case "binary-tree":
      return "ellipse";
    default:
      // A queue draws its values as bare text, not labelled cells.
      return null;
  }
}

/** Replace a node's value by pre-order position, matching the draw order. */
function writeTreeValues(node: TreeNode, values: string[], cursor: { i: number }): TreeNode {
  const value = values[cursor.i++] ?? node.value;
  const next: TreeNode = { id: node.id, value };
  if (node.left) next.left = writeTreeValues(node.left, values, cursor);
  if (node.right) next.right = writeTreeValues(node.right, values, cursor);
  return next;
}

/**
 * Merge canvas-edited labels back into a structure's data. `values` must be
 * in generator order. Returns the same object when nothing changed.
 */
export function writeSlots(
  type: StructureId,
  data: AnyStructureData,
  values: string[]
): AnyStructureData {
  switch (type) {
    case "stack": {
      const d = data as StructureData["stack"];
      if (values.length !== d.items.length) return data;
      if (values.every((v, i) => v === d.items[i])) return data;
      return { items: values };
    }
    case "array":
    case "linked-list": {
      const d = data as StructureData["array"];
      if (values.length !== d.values.length) return data;
      if (values.every((v, i) => v === d.values[i])) return data;
      return { values };
    }
    case "graph": {
      const d = data as StructureData["graph"];
      if (values.length !== d.labels.length) return data;
      if (values.every((v, i) => v === d.labels[i])) return data;
      return { labels: values };
    }
    case "binary-tree": {
      const d = data as StructureData["binary-tree"];
      if (!d.root) return data;
      const nodes = collectNodes(d.root);
      if (values.length !== nodes.length) return data;
      if (values.every((v, i) => v === nodes[i].value)) return data;
      return { root: writeTreeValues(d.root, values, { i: 0 }) };
    }
    case "table": {
      const d = data as StructureData["table"];
      if (values.length !== d.rows * d.cols) return data;
      const cells = Array.from({ length: d.rows }, (_, r) =>
        Array.from({ length: d.cols }, (_, c) => values[r * d.cols + c] ?? "")
      );
      const unchanged = cells.every((row, r) => row.every((v, c) => v === (d.cells[r]?.[c] ?? "")));
      if (unchanged) return data;
      return { rows: d.rows, cols: d.cols, cells };
    }
    default:
      return data;
  }
}

/** Short human summary of a structure's contents, for the controls header. */
export function describeData(type: StructureId, data: unknown): string {
  switch (type) {
    case "stack":
      return `${(data as StructureData["stack"]).items.length} items`;
    case "queue":
      return `${(data as StructureData["queue"]).values.length} items`;
    case "array":
      return `${(data as StructureData["array"]).values.length} cells`;
    case "linked-list":
      return `${(data as StructureData["linked-list"]).values.length} nodes`;
    case "binary-tree":
      return `${collectNodes((data as StructureData["binary-tree"]).root).length} nodes`;
    case "graph":
      return `${(data as StructureData["graph"]).labels.length} nodes`;
    case "table": {
      const d = data as StructureData["table"];
      return `${d.rows} \u00d7 ${d.cols}`;
    }
    default:
      return "";
  }
}

// ── Registry ──────────────────────────────────────────────────────────

export interface DataStructureDef {
  id: StructureId;
  name: string;
  description: string;
  icon: string;
  generate: (x: number, y: number, data: unknown) => ExcalidrawElementSkeleton[];
  defaultData: () => StructureData[StructureId];
  /**
   * Which edge stays put when the diagram changes size. A stack should look
   * like it grows upward from its base, everything else grows right/down
   * from its top-left corner.
   */
  growthAnchor: "top-left" | "bottom-left";
}

export const DATA_STRUCTURES: DataStructureDef[] = [
  {
    id: "stack",
    name: "Stack",
    description: "LIFO container — push and pop from the top",
    icon: "Layers",
    generate: (x, y, data) => generateStack(x, y, data as StructureData["stack"]),
    defaultData: () => ({ items: [...DEFAULT_DATA.stack.items] }),
    growthAnchor: "bottom-left",
  },
  {
    id: "queue",
    name: "Queue",
    description: "FIFO line — enqueue at the back, dequeue from the front",
    icon: "Rows3",
    generate: (x, y, data) => generateQueue(x, y, data as StructureData["queue"]),
    defaultData: () => ({ values: [...DEFAULT_DATA.queue.values] }),
    growthAnchor: "top-left",
  },
  {
    id: "array",
    name: "Array",
    description: "Fixed-size, indexed collection of elements",
    icon: "Grid3x3",
    generate: (x, y, data) => generateArray(x, y, data as StructureData["array"]),
    defaultData: () => ({ values: [...DEFAULT_DATA.array.values] }),
    growthAnchor: "top-left",
  },
  {
    id: "linked-list",
    name: "Linked List",
    description: "Nodes linked in sequence, each pointing to the next",
    icon: "Link2",
    generate: (x, y, data) => generateLinkedList(x, y, data as StructureData["linked-list"]),
    defaultData: () => ({ values: [...DEFAULT_DATA["linked-list"].values] }),
    growthAnchor: "top-left",
  },
  {
    id: "binary-tree",
    name: "Binary Tree",
    description: "Hierarchical nodes with up to two children each",
    icon: "GitBranch",
    generate: (x, y, data) => generateBinaryTree(x, y, data as StructureData["binary-tree"]),
    defaultData: () => ({ root: cloneTree(DEFAULT_DATA["binary-tree"].root!) }),
    growthAnchor: "top-left",
  },
  {
    id: "graph",
    name: "Graph",
    description: "Nodes connected by edges, cycles allowed",
    icon: "Network",
    generate: (x, y, data) => generateGraph(x, y, data as StructureData["graph"]),
    defaultData: () => ({ labels: [...DEFAULT_DATA.graph.labels] }),
    growthAnchor: "top-left",
  },
  {
    id: "table",
    name: "Table",
    description: "Editable grid drawn as real canvas cells",
    icon: "Table",
    generate: (x, y, data) => generateTable(x, y, data as StructureData["table"]),
    defaultData: () => ({
      rows: DEFAULT_DATA.table.rows,
      cols: DEFAULT_DATA.table.cols,
      cells: resizeCells(DEFAULT_DATA.table.cells, DEFAULT_DATA.table.rows, DEFAULT_DATA.table.cols),
    }),
    growthAnchor: "top-left",
  },
];

export function findStructureDef(id: string): DataStructureDef | undefined {
  return DATA_STRUCTURES.find((d) => d.id === id);
}
