import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

/**
 * Data-structure diagram generators for the "Data Structures" drag-and-drop
 * panel. Each generator returns a self-contained set of Excalidraw element
 * skeletons anchored at a given top-left (x, y) scene position. The
 * skeletons are converted via `convertToExcalidrawElements` before being
 * inserted into the scene, which automatically gives them Excalidraw's
 * signature hand-drawn (roughjs) rendering.
 *
 * Every generator now accepts a `data` parameter so the interactive panel
 * can build up the structure before insertion.
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
export function makeTreeNode(value: string, left?: TreeNode, right?: TreeNode): TreeNode {
  return { id: `n${_nodeCounter++}`, value, left, right };
}

export function cloneTree(node: TreeNode): TreeNode {
  return {
    id: node.id,
    value: node.value,
    left: node.left ? cloneTree(node.left) : undefined,
    right: node.right ? cloneTree(node.right) : undefined,
  };
}

export interface StructureData {
  stack: { items: string[] };
  queue: { values: string[] };
  array: { values: string[] };
  "linked-list": { values: string[] };
  "binary-tree": { root: TreeNode | null };
  graph: { labels: string[] };
}

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
};

// ── Stack ─────────────────────────────────────────────────────────────

function generateStack(x: number, y: number, data: StructureData["stack"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const items = data.items;

  const bucketX = x + 55;
  const bucketY = y + 36;
  const bucketW = 140;
  const blockH = 46;
  const maxBlocks = 6;
  const displayItems = items.slice(-maxBlocks);
  const bucketH = Math.max(80, displayItems.length * blockH + 20);

  elements.push(txt(bucketX, y, "STACK", { fontSize: 18 }));

  elements.push(
    line(bucketX, bucketY, [
      [0, 0],
      [0, bucketH],
      [bucketW, bucketH],
      [bucketW, 0],
    ], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 })
  );

  displayItems.forEach((label, i) => {
    const blockY = bucketY + bucketH - blockH * (i + 1) - 4;
    elements.push(
      rect(bucketX + 10, blockY, bucketW - 20, blockH - 6, {
        backgroundColor: i === displayItems.length - 1 ? BG_YELLOW : BG_BLUE,
        label: { text: label, fontSize: 18 },
      })
    );
  });

  if (displayItems.length < items.length) {
    elements.push(txt(bucketX + bucketW + 10, bucketY + bucketH - 20, `+${items.length - displayItems.length} more`, { fontSize: 11 }));
  }

  const topBlockY = bucketY + bucketH - blockH * displayItems.length - 4;
  if (displayItems.length > 0) {
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
  const maxCells = 6;
  const display = values.slice(0, maxCells);

  const tubeX = x + 70;
  const tubeY = y + 46;
  const cellW = 50;
  const cellH = 70;
  const tubeWidth = cellW * display.length;

  elements.push(txt(tubeX, y, "QUEUE", { fontSize: 18 }));

  elements.push(line(tubeX, tubeY, [[0, 0], [tubeWidth, 0]], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 }));
  elements.push(line(tubeX, tubeY + cellH, [[0, 0], [tubeWidth, 0]], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 }));

  display.forEach((value, i) => {
    if (i > 0) {
      elements.push(line(tubeX + cellW * i, tubeY, [[0, 0], [0, cellH]], { strokeColor: STROKE_BLUE }));
    }
    elements.push(txt(tubeX + cellW * i + cellW / 2 - 8, tubeY + cellH / 2 - 10, value, { fontSize: 15 }));
  });

  if (display.length < values.length) {
    elements.push(txt(tubeX + tubeWidth + 4, tubeY + cellH / 2 - 8, `+${values.length - display.length}`, { fontSize: 11 }));
  }

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
  const maxCells = 6;
  const display = values.slice(0, maxCells);

  const cellW = 55;
  const cellH = 55;
  const rowY = y + 40;

  elements.push(txt(x, y, "ARRAY", { fontSize: 18 }));

  display.forEach((value, i) => {
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

  if (display.length < values.length) {
    elements.push(txt(x + cellW * display.length + 4, rowY + cellH / 2, `+${values.length - display.length}`, { fontSize: 11 }));
  }

  return elements;
}

// ── Linked List ───────────────────────────────────────────────────────

function generateLinkedList(x: number, y: number, data: StructureData["linked-list"]): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];
  const values = data.values;
  const maxNodes = 5;
  const display = values.slice(0, maxNodes);

  const nodeW = 60;
  const nodeH = 50;
  const gap = 35;
  const nodeY = y + 40;

  elements.push(txt(x, y, "LINKED LIST", { fontSize: 18 }));

  let lastNodeX = x;
  display.forEach((value, i) => {
    const nodeX = x + i * (nodeW + gap);
    lastNodeX = nodeX;
    elements.push(
      rect(nodeX, nodeY, nodeW, nodeH, {
        backgroundColor: BG_GREEN,
        label: { text: value, fontSize: 16 },
      })
    );
    if (i < display.length - 1) {
      elements.push(
        arrow(nodeX + nodeW, nodeY + nodeH / 2, [[0, 0], [gap, 0]], {
          strokeColor: STROKE_BLACK,
        })
      );
    }
  });

  if (display.length < values.length) {
    elements.push(txt(lastNodeX + nodeW + 6, nodeY + nodeH / 2 - 8, `→ +${values.length - display.length}`, { fontSize: 11 }));
  } else {
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

  const size = 220;
  const radius = 95;
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

  const edgeCount = Math.min(labels.length, 6);
  for (let i = 0; i < edgeCount; i++) {
    const a = i % labels.length;
    const b = (i + 1) % labels.length;
    if (i === edgeCount - 1 && labels.length > 3) break;
    const from = nodes[a];
    const to = nodes[b];
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

// ── DataStructureDef with generate accepting data ─────────────────────

export interface DataStructureDef {
  id: keyof StructureData;
  name: string;
  description: string;
  icon: string;
  generate: (x: number, y: number, data: unknown) => ExcalidrawElementSkeleton[];
  defaultData: () => StructureData[keyof StructureData];
}

export const DATA_STRUCTURES: DataStructureDef[] = [
  {
    id: "stack",
    name: "Stack",
    description: "LIFO container — push and pop from the top",
    icon: "Layers",
    generate: (x, y, data) => generateStack(x, y, data as StructureData["stack"]),
    defaultData: () => ({ ...DEFAULT_DATA.stack }),
  },
  {
    id: "queue",
    name: "Queue",
    description: "FIFO line — enqueue at the back, dequeue from the front",
    icon: "Rows3",
    generate: (x, y, data) => generateQueue(x, y, data as StructureData["queue"]),
    defaultData: () => ({ ...DEFAULT_DATA.queue }),
  },
  {
    id: "array",
    name: "Array",
    description: "Fixed-size, indexed collection of elements",
    icon: "Grid3x3",
    generate: (x, y, data) => generateArray(x, y, data as StructureData["array"]),
    defaultData: () => ({ ...DEFAULT_DATA.array }),
  },
  {
    id: "linked-list",
    name: "Linked List",
    description: "Nodes linked in sequence, each pointing to the next",
    icon: "Link2",
    generate: (x, y, data) => generateLinkedList(x, y, data as StructureData["linked-list"]),
    defaultData: () => ({ ...DEFAULT_DATA["linked-list"] }),
  },
  {
    id: "binary-tree",
    name: "Binary Tree",
    description: "Hierarchical nodes with up to two children each",
    icon: "GitBranch",
    generate: (x, y, data) => generateBinaryTree(x, y, data as StructureData["binary-tree"]),
    defaultData: () => ({
      root: cloneTree(DEFAULT_DATA["binary-tree"].root!) ,
    }),
  },
  {
    id: "graph",
    name: "Graph",
    description: "Nodes connected by edges, cycles allowed",
    icon: "Network",
    generate: (x, y, data) => generateGraph(x, y, data as StructureData["graph"]),
    defaultData: () => ({ ...DEFAULT_DATA.graph }),
  },
];
