// Workspace model for the code editor's file explorer.
//
// The entire workspace is kept in browser storage ONLY (localStorage). Nothing
// is ever uploaded or shared anywhere.

/**
 * Represents a single file node in the in-browser workspace tree.
 */
export interface WorkspaceFile {
  type: "file";
  /** Unique ID of the file. */
  id: string;
  /** Display name including file extension (e.g. `main.js`). */
  name: string;
  /** Language identifier for syntax highlighting and code execution. */
  language: string;
  /** File contents string. */
  content: string;
}

/**
 * Represents a folder node in the in-browser workspace tree containing children.
 */
export interface WorkspaceFolder {
  type: "folder";
  /** Unique ID of the folder. */
  id: string;
  /** Name of the directory. */
  name: string;
  /** Child files and subfolders. */
  children: WorkspaceNode[];
}

/**
 * Union type representing any item in the workspace tree (file or folder).
 */
export type WorkspaceNode = WorkspaceFile | WorkspaceFolder;

const STORAGE_KEY = "explaino-workspace-v1";

/**
 * Generates a collision-resistant unique identifier string for workspace nodes.
 */
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

/**
 * Detects the language ID for a given file name based on its file extension.
 *
 * @param fileName - File name or path (e.g. `script.py`).
 * @returns Language string identifier (e.g. `"python"`, `"javascript"`, `"text"`).
 */
export function detectLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? "text";
}

export const STARTER_CODE: Record<string, string> = {
  javascript: `// JavaScript — try the Visualize button (Eye icon) to step through!
let x = 5;
let y = 10;
let sum = x + y;
let arr = [3, 1, 4, 1, 5];
arr.sort();
for (let i = 0; i < arr.length; i++) {
  sum += arr[i];
}
let message = "Done";
console.log(message, sum);
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
  java: `// Java — compiles and runs via cloud API, no JDK install needed
public class Main {
  public static void main(String[] args) {
    System.out.println("Hello from Java!");
    System.out.println("2 + 2 = " + (2 + 2));
  }
}
`,
  dart: `// Dart — compiles and runs via cloud API, no SDK install needed
void main() {
  print('Hello from Dart!');
  var sum = 0;
  for (var i = 1; i <= 10; i++) sum += i;
  print('Sum 1..10 = $sum');

  // List demo
  var names = ['Explaino', 'Dart', 'Browser'];
  for (var name in names) {
    print(name);
  }
}
`,
};

/**
 * Returns starter template code for a newly created file in the specified language.
 *
 * @param language - Target language ID.
 * @param fileName - Name of the file.
 */
export function starterFor(language: string, fileName: string): string {
  const starter = STARTER_CODE[language];
  if (starter !== undefined) return starter;
  return `// ${fileName}\n`;
}

// ── Tree helpers (immutable) ─────────────────────────────────────────────

/**
 * Searches the tree recursively for a node with the given ID.
 *
 * @param tree - Root array of workspace nodes.
 * @param id - The target node ID.
 * @returns Object with the matched node and its parent ID, or null if not found.
 */
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

/**
 * Immutably adds a new node to the workspace tree under the specified parent folder.
 */
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

/**
 * Immutably removes a node and all of its descendants from the workspace tree by ID.
 */
export function deleteNode(tree: WorkspaceNode[], id: string): WorkspaceNode[] {
  const without = tree.filter((n) => n.id !== id);
  if (without.length !== tree.length) return without;
  return tree.map((n) =>
    n.type === "folder" ? { ...n, children: deleteNode(n.children, id) } : n
  );
}

/**
 * Immutably renames a node within the workspace tree.
 */
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

/**
 * Immutably updates the text content of a file node in the workspace tree.
 */
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

/**
 * Immutably updates the associated language of a file node in the workspace tree.
 */
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

/**
 * Recursively extracts all file nodes from the tree into a flat array.
 */
export function flattenFiles(tree: WorkspaceNode[]): WorkspaceFile[] {
  const files: WorkspaceFile[] = [];
  for (const n of tree) {
    if (n.type === "file") files.push(n);
    else files.push(...flattenFiles(n.children));
  }
  return files;
}

/**
 * Flat representation of a workspace file including its relative directory path.
 */
export interface WorkspaceFileWithPath {
  /** Full relative path from the workspace root (e.g. `src/utils/math.js`). */
  path: string;
  name: string;
  language: string;
  content: string;
}

/**
 * Recursively flattens the tree into a list of files with their full relative path strings.
 */
export function flattenFilesWithPaths(
  tree: WorkspaceNode[],
  prefix = ""
): WorkspaceFileWithPath[] {
  const files: WorkspaceFileWithPath[] = [];
  for (const n of tree) {
    if (n.type === "file") {
      files.push({
        path: prefix ? `${prefix}/${n.name}` : n.name,
        name: n.name,
        language: n.language,
        content: n.content,
      });
    } else {
      files.push(
        ...flattenFilesWithPaths(n.children, prefix ? `${prefix}/${n.name}` : n.name)
      );
    }
  }
  return files;
}

function findChildByName(
  nodes: WorkspaceNode[],
  name: string
): WorkspaceNode | undefined {
  return nodes.find(
    (n) => n.name.toLowerCase() === name.toLowerCase()
  );
}

function mergeNode(
  tree: WorkspaceNode[],
  sandboxNode: WorkspaceNode
): { tree: WorkspaceNode[]; changed: boolean } {
  const existing = findChildByName(tree, sandboxNode.name);

  // Sandbox file that already exists locally → refresh its content if needed.
  if (sandboxNode.type === "file") {
    if (existing && existing.type === "file") {
      if (existing.content !== sandboxNode.content) {
        return {
          tree: tree.map((n) =>
            n === existing
              ? { ...existing, content: sandboxNode.content }
              : n
          ),
          changed: true,
        };
      }
      return { tree, changed: false };
    }
    return { tree: [...tree, sandboxNode], changed: true };
  }

  // Sandbox folder.
  if (existing && existing.type === "folder") {
    let changed = false;
    let children = (existing as WorkspaceFolder).children;
    for (const child of sandboxNode.children) {
      const res = mergeNode(children, child);
      children = res.tree;
      changed = changed || res.changed;
    }
    if (!changed) return { tree, changed: false };
    return {
      tree: tree.map((n) => (n === existing ? { ...existing, children } : n)),
      changed: true,
    };
  }

  // Folder name collides with an existing file → keep both at same level.
  return { tree: [...tree, sandboxNode], changed: true };
}

/**
 * Merge a flat list of sandbox file paths (relative to the workspace root)
 * into the workspace tree. Adds new files/folders and updates content of
 * existing same-name files. Never deletes workspace entries — local-only
 * files are preserved and synced back to the sandbox.
 */
/**
 * Merges a list of remote or sandbox files into the local workspace tree immutably.
 */
export function mergeSandboxFiles(
  tree: WorkspaceNode[],
  sandboxFiles: { path: string; content: string }[]
): WorkspaceNode[] {
  if (sandboxFiles.length === 0) return tree;

  // Build a WorkspaceNode tree from the flat sandbox listing.
  const sandboxTree: WorkspaceNode[] = [];
  for (const file of sandboxFiles) {
    const segments = file.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    const fileName = segments[segments.length - 1];
    const newFile: WorkspaceNode = {
      type: "file",
      id: uid(),
      name: fileName,
      language: detectLanguage(fileName),
      content: file.content,
    };

    let level = sandboxTree;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      let folder = findChildByName(level, seg);
      if (!folder || folder.type !== "folder") {
        folder = {
          type: "folder",
          id: uid(),
          name: seg,
          children: [],
        };
        level.push(folder);
      }
      level = (folder as WorkspaceFolder).children;
    }
    level.push(newFile);
  }

  let result = tree;
  for (const node of sandboxTree) {
    const res = mergeNode(result, node);
    result = res.tree;
  }
  return result;
}

/**
 * Checks if a sibling node with the same name already exists in the given folder.
 */
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

/**
 * Loads the workspace tree from browser localStorage or returns default files.
 */
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

/**
 * Persists the workspace tree snapshot to browser localStorage.
 */
export function saveWorkspace(tree: WorkspaceNode[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  } catch {
    // quota errors ignored
  }
}
