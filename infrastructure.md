# Architecture & Implementation Guide: Next.js Real-Time Code Visualizer
**Target AI:** Claude Opus 5 (or equivalent advanced LLM)
**Project Goal:** Generate a web-based, real-time code execution and visualization platform (similar to *Staying* or *Python Tutor*) using Next.js.
**Core Functionality:** Users write code (JavaScript/Python) in an editor, and the platform visually steps through the execution line-by-line, dynamically rendering data structures (Arrays, Linked Lists, Trees, Graphs) side-by-side.

---

## 1. Technology Stack Requirements
*   **Framework:** Next.js (App Router, React 18+)
*   **Styling:** Tailwind CSS (for clean, responsive split-pane UI)
*   **Editor:** `@monaco-editor/react` (VS Code engine for web)
*   **Animation/Visualization:** `framer-motion` (crucial for smooth node transitions and layout changes using `layoutId`)
*   **State Management:** Zustand (for managing playback state, code snapshots, and active line numbers)
*   **Execution Engine (JavaScript MVP):** `acorn` or `@babel/parser` (for AST parsing) + `astring` (for code generation) OR a sandboxed `JS-Interpreter`. 

---

## 2. Core Architecture Concept: The "Snapshot" Model
Do not attempt to animate directly from the live execution. Instruct Claude to build a **Snapshot Engine**:
1.  **Parse:** Take user code and convert it to an Abstract Syntax Tree (AST).
2.  **Instrument:** Inject logging functions after every variable declaration, assignment, or structural mutation. 
3.  **Execute (Headless):** Run the instrumented code in a hidden Web Worker or secure sandbox. 
4.  **Capture:** Generate an array of "Snapshots" (a timeline of the program's memory state and the current line number at every step).
5.  **Render:** The React frontend simply acts as a video player, using the slider/Step buttons to change the `currentSnapshotIndex` and rendering the data at that exact state.

---

## 3. Step-by-Step Prompting Flow for Claude
*Copy and paste these phases sequentially into Claude to generate the codebase.*

### Phase 1: Foundation & UI Layout
**Prompt for Claude:**
> "Initialize a Next.js (App Router) project with Tailwind CSS. Create a primary layout component with a resizable split-pane. 
> - **Left Pane:** Integrate `@monaco-editor/react`. Include a language selector (JS/Python) above it.
> - **Right Pane:** The visualization canvas area.
> - **Bottom Bar:** Playback controls (Play, Pause, Step Forward, Step Back, Reset) and a playback speed slider.
> Use Zustand to create a store `useVisualizerStore` that holds `code`, `snapshots` (array), `currentStep` (integer), and `isPlaying` (boolean)."

### Phase 2: The Execution & Instrumentation Engine (The Hard Part)
**Prompt for Claude:**
> "Write the JavaScript execution engine for the visualizer. Use AST (via Babel or Acorn) to instrument the user's code. 
> 1. Parse the code into an AST.
> 2. Traverse the AST and inject a `__captureState(lineNumber, localVariables)` call after every assignment, array push/pop, or loop iteration.
> 3. Write a safe execution wrapper (using `new Function` or a Web Worker) that provides the `__captureState` function.
> 4. When the code runs, it should populate the `snapshots` array in our Zustand store. Handle infinite loop protection (max 1000 steps). Provide the utility file `instrumentation.ts`."

### Phase 3: The Animation Canvas & Framer Motion
**Prompt for Claude:**
> "Build the rendering engine for the right pane using React and `framer-motion`. 
> Read the current state from `useVisualizerStore.getState().snapshots[currentStep]`.
> Focus on Array and Pointer visualization first. 
> - Create a `MemoryBlock` component for array elements.
> - Use Framer Motion's `layout` and `layoutId` props so that if an element moves in the array (e.g., during a sorting algorithm), it physically glides to its new position on screen rather than instantly snapping.
> - Render arrows or highlights for active pointers (like `i` and `j` in a loop)."

### Phase 4: Advanced Data Structures (Trees & Graphs)
**Prompt for Claude:**
> "Extend the visualization canvas to support complex data structures based on the captured state.
> - **Linked Lists:** If an object has a `next` property pointing to another object, render it as a node with a directional SVG arrow to the next node.
> - **Binary Trees:** If objects have `left` and `right` properties, use a recursive React component to calculate horizontal spacing and render them as a hierarchical tree. Draw SVG lines connecting parents to children.
> - Ensure all nodes use `framer-motion` for entrance animations."

### Phase 5: Editor Integration & Line Highlighting
**Prompt for Claude:**
> "Connect the current snapshot's `lineNumber` back to the Monaco Editor. Use Monaco's `decorations` API to highlight the currently executing line in the left pane. As the user clicks 'Step Forward', the highlighted line in the code editor should move synchronously with the visualizer changes."

---

## 4. Edge Cases to Remind Claude About
When interacting with Claude, explicitly ask it to handle these:
1.  **Infinite Loops:** User writes `while(true)`. The sandbox *must* have a timeout or a maximum iteration limit (e.g., 2000 snapshots).
2.  **Object References:** The snapshot engine must deeply clone the state at each step. If you just push references into an array, every snapshot will look exactly like the final state of the program. 
3.  **Sandbox Security:** Ensure `window`, `document`, and `fetch` are stubbed out in the execution environment so malicious code cannot damage the client.
