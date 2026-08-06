import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";

/**
 * Data-structure diagram generators for the "Data Structures" drag-and-drop
 * panel. Each generator returns a self-contained set of Excalidraw element
 * skeletons anchored at a given top-left (x, y) scene position. The
 * skeletons are converted via `convertToExcalidrawElements` before being
 * inserted into the scene, which automatically gives them Excalidraw's
 * signature hand-drawn (roughjs) rendering — no extra work needed here.
 */

export interface DataStructureDef {
  id: string;
  name: string;
  description: string;
  /** lucide-react icon name, verified to exist in the installed version */
  icon: string;
  generate: (x: number, y: number) => ExcalidrawElementSkeleton[];
}

// ── Excalidraw default palette (hardcoded, matches the app's color pickers) ─
const STROKE_BLACK = "#1e1e1e";
const STROKE_RED = "#e03131";
const STROKE_GREEN = "#2f9e44";
const STROKE_BLUE = "#1971c2";
const STROKE_ORANGE = "#f08c00";

const BG_TRANSPARENT = "transparent";
const BG_GREEN = "#b2f2bb";
const BG_BLUE = "#a5d8ff";
const BG_YELLOW = "#ffec99";

// ── Small helpers to keep generators readable ───────────────────────────

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

// ── Stack ─────────────────────────────────────────────────────────────────
// Drawn as an open-top "bucket" container (open top, closed bottom & sides)
// with blocks stacked inside, plus a "TOP" arrow pointing at the top block.
function generateStack(x: number, y: number): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];

  const bucketX = x + 55;
  const bucketY = y + 36;
  const bucketW = 140;
  const bucketH = 170;
  const blockH = 46;
  const blocks = ["A", "B", "C"]; // bottom -> top

  elements.push(txt(bucketX, y, "STACK", { fontSize: 18 }));

  // Open-top outline: left wall down, across the bottom, up the right wall.
  elements.push(
    line(
      bucketX,
      bucketY,
      [
        [0, 0],
        [0, bucketH],
        [bucketW, bucketH],
        [bucketW, 0],
      ],
      { strokeColor: STROKE_BLUE, strokeWidth: 2.5 }
    )
  );

  blocks.forEach((label, i) => {
    const blockY = bucketY + bucketH - blockH * (i + 1) - 4;
    elements.push(
      rect(bucketX + 10, blockY, bucketW - 20, blockH - 6, {
        backgroundColor: i === blocks.length - 1 ? BG_YELLOW : BG_BLUE,
        label: { text: label, fontSize: 18 },
      })
    );
  });

  const topBlockY = bucketY + bucketH - blockH * blocks.length - 4;
  elements.push(
    arrow(bucketX + bucketW + 65, topBlockY + (blockH - 6) / 2, [
      [0, 0],
      [-50, 0],
    ], { label: { text: "TOP" }, strokeColor: STROKE_ORANGE })
  );

  return elements;
}

// ── Queue ─────────────────────────────────────────────────────────────────
// A row of cells inside an open-ended "tube" (top/bottom rails only, no end
// walls), with ENQUEUE entering from the right and DEQUEUE leaving the left.
function generateQueue(x: number, y: number): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];

  const tubeX = x + 70;
  const tubeY = y + 46;
  const cellW = 50;
  const cellH = 70;
  const values = ["10", "20", "30", "40"];
  const tubeWidth = cellW * values.length;

  elements.push(txt(tubeX, y, "QUEUE", { fontSize: 18 }));

  elements.push(
    line(tubeX, tubeY, [[0, 0], [tubeWidth, 0]], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 })
  );
  elements.push(
    line(tubeX, tubeY + cellH, [[0, 0], [tubeWidth, 0]], { strokeColor: STROKE_BLUE, strokeWidth: 2.5 })
  );

  values.forEach((value, i) => {
    if (i > 0) {
      elements.push(
        line(tubeX + cellW * i, tubeY, [[0, 0], [0, cellH]], { strokeColor: STROKE_BLUE })
      );
    }
    elements.push(
      txt(tubeX + cellW * i + cellW / 2 - 8, tubeY + cellH / 2 - 10, value, { fontSize: 15 })
    );
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

// ── Array ─────────────────────────────────────────────────────────────────
// A row of indexed, fixed-size cells with the index printed below each cell.
function generateArray(x: number, y: number): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];

  const cellW = 55;
  const cellH = 55;
  const values = ["12", "7", "39", "4", "21"];
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

// ── Linked List ───────────────────────────────────────────────────────────
// Boxes connected by arrows, terminating in a "NULL" text node.
function generateLinkedList(x: number, y: number): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];

  const nodeW = 60;
  const nodeH = 50;
  const gap = 35;
  const values = ["A", "B", "C"];
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

  elements.push(
    arrow(lastNodeX + nodeW, nodeY + nodeH / 2, [[0, 0], [35, 0]], {
      strokeColor: STROKE_BLACK,
    })
  );
  elements.push(
    txt(lastNodeX + nodeW + 42, nodeY + nodeH / 2 - 8, "NULL", {
      fontSize: 14,
      strokeColor: STROKE_RED,
    })
  );

  return elements;
}

// ── Binary Tree ───────────────────────────────────────────────────────────
// Root + two children + four grandchildren (3 levels), connected by lines.
function generateBinaryTree(x: number, y: number): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];

  const width = 280;
  const diameter = 40;
  const titleY = y;
  const baseY = y + 40;

  const centerOf = (cx: number, cy: number) => ({ x: cx, y: cy });

  const root = centerOf(x + width / 2, baseY + diameter / 2);
  const level1 = [
    centerOf(x + width * 0.25, baseY + 90 + diameter / 2),
    centerOf(x + width * 0.75, baseY + 90 + diameter / 2),
  ];
  const level2 = [
    centerOf(x + width * 0.125, baseY + 180 + diameter / 2),
    centerOf(x + width * 0.375, baseY + 180 + diameter / 2),
    centerOf(x + width * 0.625, baseY + 180 + diameter / 2),
    centerOf(x + width * 0.875, baseY + 180 + diameter / 2),
  ];

  elements.push(txt(x + width / 2 - 45, titleY, "BINARY TREE", { fontSize: 18 }));

  const connect = (
    parent: { x: number; y: number },
    child: { x: number; y: number }
  ): ExcalidrawElementSkeleton =>
    line(parent.x, parent.y, [
      [0, 0],
      [child.x - parent.x, child.y - parent.y],
    ], { strokeColor: STROKE_BLACK });

  elements.push(connect(root, level1[0]));
  elements.push(connect(root, level1[1]));
  elements.push(connect(level1[0], level2[0]));
  elements.push(connect(level1[0], level2[1]));
  elements.push(connect(level1[1], level2[2]));
  elements.push(connect(level1[1], level2[3]));

  const node = (center: { x: number; y: number }, label: string, bg: string) =>
    ellipse(center.x - diameter / 2, center.y - diameter / 2, diameter, diameter, {
      backgroundColor: bg,
      label: { text: label, fontSize: 15 },
    });

  elements.push(node(root, "8", BG_YELLOW));
  elements.push(node(level1[0], "3", BG_BLUE));
  elements.push(node(level1[1], "10", BG_BLUE));
  elements.push(node(level2[0], "1", BG_GREEN));
  elements.push(node(level2[1], "6", BG_GREEN));
  elements.push(node(level2[2], "9", BG_GREEN));
  elements.push(node(level2[3], "14", BG_GREEN));

  return elements;
}

// ── Graph ─────────────────────────────────────────────────────────────────
// Five labeled nodes (A-E) arranged in a pentagon with connecting edges.
function generateGraph(x: number, y: number): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = [];

  const size = 220;
  const radius = 95;
  const centerX = x + size / 2;
  const centerY = y + 55 + size / 2;
  const diameter = 36;

  const labels = ["A", "B", "C", "D", "E"];
  const nodes = labels.map((label, i) => {
    const angle = (-90 + i * 72) * (Math.PI / 180);
    return {
      label,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  elements.push(txt(centerX - 30, y, "GRAPH", { fontSize: 18 }));

  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 0],
    [1, 3],
  ];

  // Edges first, so node fills sit on top and hide the segments inside them.
  edges.forEach(([a, b]) => {
    const from = nodes[a];
    const to = nodes[b];
    elements.push(
      line(from.x, from.y, [
        [0, 0],
        [to.x - from.x, to.y - from.y],
      ], { strokeColor: STROKE_BLUE })
    );
  });

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

// ── Registry ──────────────────────────────────────────────────────────────
export const DATA_STRUCTURES: DataStructureDef[] = [
  {
    id: "stack",
    name: "Stack",
    description: "LIFO container — push and pop from the top",
    icon: "Layers",
    generate: generateStack,
  },
  {
    id: "queue",
    name: "Queue",
    description: "FIFO line — enqueue at the back, dequeue from the front",
    icon: "Rows3",
    generate: generateQueue,
  },
  {
    id: "array",
    name: "Array",
    description: "Fixed-size, indexed collection of elements",
    icon: "Grid3x3",
    generate: generateArray,
  },
  {
    id: "linked-list",
    name: "Linked List",
    description: "Nodes linked in sequence, each pointing to the next",
    icon: "Link2",
    generate: generateLinkedList,
  },
  {
    id: "binary-tree",
    name: "Binary Tree",
    description: "Hierarchical nodes with up to two children each",
    icon: "GitBranch",
    generate: generateBinaryTree,
  },
  {
    id: "graph",
    name: "Graph",
    description: "Nodes connected by edges, cycles allowed",
    icon: "Network",
    generate: generateGraph,
  },
];
