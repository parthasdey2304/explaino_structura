# Explaino

A full-featured Excalidraw-style whiteboard built with **Next.js 16 + TypeScript**, wired to your own **Firebase Firestore** database — plus a built-in **code editor terminal** that runs JavaScript, Python, and HTML entirely in the browser with **zero API keys**.

![Excalidraw](https://excalidraw.com/og-image.png)

## Features

### Whiteboard (complete Excalidraw UI)
- All drawing tools: selection, hand, rectangle, diamond, ellipse, arrow, line, freedraw, text, image, eraser, frame, laser
- Full properties panel: stroke & background colors, fill style, stroke width, opacity, fonts, sloppiness, roundness, arrowheads
- Library sidebar with drag-and-drop shapes
- Export to PNG, SVG, JSON, and clipboard
- Undo/Redo, zoom, pan, scroll-to-content, grid, snap mode
- Dark / Light theme, canvas background color
- Copy/paste, duplicate, group, align, distribute
- Keyboard shortcuts for every tool

### Your Database (Firestore)
- Drawings auto-save to Firestore (debounced)
- Load any saved drawing via `?doc=<drawing-id>`
- Manual named saves via the **Save** button
- Local-first backup in `localStorage`

### Code Editor Terminal (Zero-API)
- Runs **JavaScript**, **Python**, and **HTML** entirely in the browser
- **No API keys, no server, no accounts** — code executes locally
  - JavaScript: sandboxed `<iframe>` (V8)
  - Python: Pyodide (CPython → WebAssembly)
  - HTML: sandboxed `<iframe srcdoc>`
- Captures stdout / stderr with execution-time + status badges
- `Ctrl+Enter` to run

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Firebase Setup

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Cloud Firestore**
3. Copy your web app config into `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

4. Optional Firestore rules (dev):

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

## Project Structure

```
src/
  app/                     # Next.js App Router
    layout.tsx             # Root layout (loads Excalidraw CSS)
    page.tsx               # Entry page (client-only render)
    globals.css            # Global styles
  components/
    ExcalidrawWrapper.tsx  # Full Excalidraw UI + Firestore wiring
    CodeEditorPanel.tsx    # Code editor with Run button + terminal output
  lib/
    firebase.ts            # Firebase client init
    firestore.ts           # Firestore CRUD for drawings
    executors/             # Browser-only code execution engines
      javascript.ts        # Sandboxed iframe executor
      python.ts            # Pyodide (WASM) executor
      html.ts              # HTML iframe executor
      types.ts             # Shared executor types
```

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [@excalidraw/excalidraw](https://www.npmjs.com/package/@excalidraw/excalidraw)
- [Firebase](https://firebase.google.com) (Firestore)
- [Pyodide](https://pyodide.org) (Python in the browser)
