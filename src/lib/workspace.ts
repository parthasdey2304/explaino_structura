// Workspace model for the code editor's file explorer.
//
// The entire workspace is kept in browser storage ONLY (localStorage). Nothing
// is ever uploaded or shared anywhere.

export interface WorkspaceFile {
  type: "file";
  id: string;
  name: string;
  language: string;
  content: string;
}

export interface WorkspaceFolder {
  type: "folder";
  id: string;
  name: string;
  children: WorkspaceNode[];
}

export type WorkspaceNode = WorkspaceFile | WorkspaceFolder;

const STORAGE_KEY = "explaino-workspace-v1";

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Extension → executor language id
const EXT_TO_LANGUAGE: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "javascript",
  tsx: "javascript",
  py: "python",
  html: "html",
  htm: "html",
  c: "c",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  java: "java",
  dart: "dart",
};

export function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? "text";
}

export const STARTER_CODE: Record<string, string> = {
  javascript: `// JavaScript — runs in browser, no API needed
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Explaino"));
console.log("2 + 2 =", 2 + 2);

// Canvas demo
const canvas = document.getElementById("c");
if (canvas) {
  canvas.width = 200;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#6965db";
  ctx.fillRect(10, 10, 180, 80);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("Hello!", 60, 55);
}
`,
  python: `# Python 3 — runs via Pyodide (WebAssembly), no API needed
def greet(name):
    return f"Hello, {name}!"

print(greet("Explaino"))

# Math demo
import math
print(f"Pi = {math.pi:.4f}")
print(f"sqrt(144) = {math.sqrt(144)}")

# List comprehension
squares = [x**2 for x in range(1, 11)]
print(f"Squares: {squares}")
`,
  html: `<!-- HTML — renders in sandboxed iframe, no API needed -->
<div style="padding: 20px; font-family: sans-serif;">
  <h2 style="color: #6965db;">Hello from Explaino!</h2>
  <p>This HTML runs entirely in your browser.</p>
  <button onclick="this.textContent='Clicked!'" 
    style="padding: 8px 16px; background: #6965db; color: white; 
           border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
    Click me
  </button>
  <div style="margin-top: 16px; padding: 12px; background: #f0f0ff; border-radius: 8px;">
    <strong>No API key required.</strong> Everything runs locally.
  </div>
</div>
`,
  c: `/* C — compiles to WebAssembly in-browser via clang, no API needed */
#include <stdio.h>

int fib(int n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

int main() {
  printf("Hello from C!\\n");
  for (int i = 0; i <= 10; i++) {
    printf("fib(%d) = %d\\n", i, fib(i));
  }
  return 0;
}
`,
  cpp: `// C++ — compiles to WebAssembly in-browser via clang, no API needed
#include <iostream>
#include <vector>

int main() {
  std::cout << "Hello from C++!" << std::endl;

  std::vector<int> nums = {1, 2, 3, 4, 5};
  int sum = 0;
  for (int n : nums) sum += n;

  std::cout << "Sum: " << sum << std::endl;
  std::cout << "Average: " << (double)sum / nums.size() << std::endl;
  return 0;
}
`,
  java: `// Java — NOTE: cannot run in-browser without a backend compiler.
public class Main {
  public static void main(String[] args) {
    System.out.println("Hello from Java!");
    System.out.println("2 + 2 = " + (2 + 2));
  }
}
`,
  dart: `// Dart — NOTE: cannot run in-browser without the Dart SDK.
void main() {
  var names = ['Explaino', 'Dart', 'Browser'];
  print('Hello from Dart!');
  for (var name in names) {
    print(name);
  }
}
`,
};

export function starterFor(language: string, fileName: string): string {
  const starter = STARTER_CODE[language];
  if (starter !== undefined) return starter;
  return `// ${fileName}\n`;
}

// ── Tree helpers (immutable) ─────────────────────────────────────────────

export function findNode(
  tree: WorkspaceNode[],
  id: string
): { node: WorkspaceNode; parentId: string | null } | null {
  for (const node of tree) {
    if (node.id === id) return { node, parentId: null };
    if (node.type === "folder") {
      const found = findNode(node.children, id);
      if (found) return { node: found.node, parentId: node.id };
    }
  }
  return null;
}

export function createNode(
  tree: WorkspaceNode[],
  parentId: string | null,
  node: WorkspaceNode
): WorkspaceNode[] {
  if (parentId === null) return [...tree, node];
  return tree.map((n) => {
    if (n.id === parentId && n.type === "folder") {
      return { ...n, children: [...n.children, node] };
    }
    if (n.type === "folder") {
      return { ...n, children: createNode(n.children, parentId, node) };
    }
    return n;
  });
}

export function deleteNode(tree: WorkspaceNode[], id: string): WorkspaceNode[] {
  const without = tree.filter((n) => n.id !== id);
  if (without.length !== tree.length) return without;
  return tree.map((n) =>
    n.type === "folder" ? { ...n, children: deleteNode(n.children, id) } : n
  );
}

export function renameNode(
  tree: WorkspaceNode[],
  id: string,
  newName: string
): WorkspaceNode[] {
  return tree.map((n) => {
    if (n.id === id) return { ...n, name: newName } as WorkspaceNode;
    if (n.type === "folder") {
      return { ...n, children: renameNode(n.children, id, newName) };
    }
    return n;
  });
}

export function updateFileContent(
  tree: WorkspaceNode[],
  id: string,
  content: string
): WorkspaceNode[] {
  return tree.map((n) => {
    if (n.id === id && n.type === "file") return { ...n, content };
    if (n.type === "folder") {
      return { ...n, children: updateFileContent(n.children, id, content) };
    }
    return n;
  });
}

export function setFileLanguage(
  tree: WorkspaceNode[],
  id: string,
  language: string
): WorkspaceNode[] {
  return tree.map((n) => {
    if (n.id === id && n.type === "file") return { ...n, language };
    if (n.type === "folder") {
      return { ...n, children: setFileLanguage(n.children, id, language) };
    }
    return n;
  });
}

export function flattenFiles(tree: WorkspaceNode[]): WorkspaceFile[] {
  const files: WorkspaceFile[] = [];
  for (const n of tree) {
    if (n.type === "file") files.push(n);
    else files.push(...flattenFiles(n.children));
  }
  return files;
}

export function isDuplicateName(
  tree: WorkspaceNode[],
  parentId: string | null,
  name: string
): boolean {
  const parent = parentId === null ? null : findNode(tree, parentId)?.node;
  const siblings =
    parentId === null
      ? tree
      : parent && parent.type === "folder"
        ? parent.children
        : [];
  return siblings.some((n) => n.name.toLowerCase() === name.toLowerCase());
}

// ── Persistence (browser only) ───────────────────────────────────────────

function defaultWorkspace(): WorkspaceNode[] {
  return [
    {
      type: "file",
      id: uid(),
      name: "main.js",
      language: "javascript",
      content: STARTER_CODE.javascript,
    },
  ];
}

export function loadWorkspace(): WorkspaceNode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return defaultWorkspace();
  } catch {
    return defaultWorkspace();
  }
}

export function saveWorkspace(tree: WorkspaceNode[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  } catch {
    // quota errors ignored
  }
}
