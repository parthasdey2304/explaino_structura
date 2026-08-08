
# Explaino Structura

An Excalidraw-style whiteboard for teaching and visualizing data structures & algorithms, built with **Next.js 16 + TypeScript**, backed by your own **Firebase Firestore**, with a full **multi-language code editor + terminal** and an optional **Mistral AI assistant**.

<img width="2559" height="1599" alt="image" src="https://github.com/user-attachments/assets/162684f8-a1bb-47d8-b79d-d4109e1d8109" />

## Features

### Whiteboard (complete Excalidraw UI)
- All drawing tools: selection, hand, rectangle, diamond, ellipse, arrow, line, freedraw, text, image, eraser, frame, laser
- Full properties panel: stroke & background colors, fill style, stroke width, opacity, fonts, sloppiness, roundness, arrowheads
- Library sidebar, export to PNG/SVG/JSON/clipboard, undo/redo, zoom/pan, grid, snap mode, dark/light theme
- Custom hamburger menu (Open, Save to, Export image, Find on canvas, Help, Reset canvas, GitHub repo link, canvas background) — no third-party social links

### Data Structure Diagrams (on-canvas, not overlays)
- Insert Stack, Queue, Array, Linked List, Binary Tree, Graph, and an editable Table — all rendered as real Excalidraw elements (drag, resize, undo, persist like any other shape)
- Each inserted structure gets on-canvas "+" controls next to it (push/pop, enqueue/dequeue, add/remove node, add row/column, etc.) so you can grow or shrink it directly on the canvas
- Drag-and-drop from the Data Structures panel, or build values first and insert

### Code Editor & Terminal
- Runs **JavaScript, Python, HTML, C, C++, Java, and Dart**
  - JavaScript: sandboxed `<iframe>` (V8) — no API key
  - Python: Pyodide (CPython → WebAssembly) — no API key
  - HTML: sandboxed `<iframe srcdoc>` — no API key
  - C / C++: in-browser Clang → WebAssembly — no API key
  - Java / Dart: cloud compile via Judge0 API
- VS Code–style file explorer, tabs (drag to reorder), resizable output/terminal panel
- Real sandboxed terminal (E2B) with live file sync back into the explorer
- `Ctrl+Enter` run, `Ctrl+\`` terminal, `Ctrl+C` focus editor
- **Snippets & Emmet**: press Tab to expand. Real Emmet abbreviations in HTML (`div.card>h2+p`); IDE-style shorthand in Java/Python/C/C++/JS/Dart (`syso`, `psvm`, `sysout`, `def`, `cl`, `main`, `fori`, etc.)
- **Algorithm Visualizer**: step through JavaScript line-by-line with live variable/array state and console output
- **Settings menu** (gear icon): toggle Emmet/snippets, Terminal, and AI assistant on or off independently

### AI Assistant (Mistral, bring-your-own-key)
- Chat about your code or generate it, using your own Mistral API key (stored only in your browser, never on the server)
- Three write modes: **You write** (chat only), **AI writes** (applies code automatically), **Pair** (review then apply)
- Models: Mistral Large, Mistral Small, Codestral

### Your Database (Firestore)
- Drawings auto-save to Firestore (debounced) with local-first backup in `localStorage`
- Load any saved drawing via `?doc=<drawing-id>`, manual named saves via the **Save** button

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables (`.env.local`)

```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# Sandboxed terminal (E2B) and Java/Dart cloud execution
E2B_API_KEY=your-e2b-api-key
```

Firebase setup: create a project at [Firebase Console](https://console.firebase.google.com), enable **Cloud Firestore**, and copy your web app config above. Dev-only Firestore rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /drawings/{drawingId} {
      allow read, write: if true;
    }
  }
}
```

The Mistral API key for the AI assistant is entered by each user directly in the app (AI panel → key icon) and is **not** an environment variable — it's kept in that browser's `localStorage` only.

## Project Structure

```
src/
  app/
    api/
      ai/chat/              # Mistral chat-completions proxy (BYO key)
      terminal/             # E2B sandbox create/execute/sync/files/destroy
    layout.tsx, page.tsx, globals.css
  components/
    ExcalidrawWrapper.tsx   # Canvas host, Firestore wiring, on-canvas DS controls
    CodeEditorPanel.tsx     # Editor, tabs, run, terminal, settings, AI trigger
    DataStructuresPanel.tsx # Build & insert DS diagrams
    CanvasStructureControls.tsx # On-canvas +/- controls for inserted diagrams
    AIChatPanel.tsx         # Mistral chat UI
    SettingsMenu.tsx        # Emmet/Terminal/AI toggles
    VisualizerPanel.tsx     # Line-by-line JS execution visualizer
    Terminal.tsx, FileExplorer.tsx
  lib/
    firebase.ts, firestore.ts   # Firebase client + Firestore CRUD
    dataStructures.ts       # DS element generators + edit actions
    instrumentation.ts      # JS tracer powering the Visualizer
    snippets.ts, emmetExtension.ts, editorSettings.ts
    ai/mistral.ts           # Mistral client helper
    terminal/service.ts     # E2B sandbox service
    executors/              # javascript, python, html, clang, java, dart
```

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) · [React 19](https://react.dev)
- [@excalidraw/excalidraw](https://www.npmjs.com/package/@excalidraw/excalidraw)
- [CodeMirror 6](https://codemirror.net/) · [emmet](https://emmet.io/)
- [Firebase](https://firebase.google.com) (Firestore) · [E2B](https://e2b.dev) (sandboxed terminal)
- [Pyodide](https://pyodide.org) (Python) · Clang/WASM (C/C++) · Judge0 (Java/Dart) · [Mistral AI](https://mistral.ai)
