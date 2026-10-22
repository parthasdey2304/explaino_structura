<div align="center">

# ⚡ Explaino Structura

### The Ultimate AI-Powered Whiteboard for Teaching, Coding & Visualizing Algorithms

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Excalidraw](https://img.shields.io/badge/Canvas-Excalidraw-6965db?style=for-the-badge&logo=excalidraw&logoColor=white)](https://excalidraw.com/)
[![Firebase](https://img.shields.io/badge/Database-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**[🌐 Live Production Web App](https://explaino.vastaviklearning.online)** • **[🚀 Quick Start](#-quick-start)** • **[✨ Key Features](#-key-features)** • **[📐 Data Structures](#-interactive-data-structures)** • **[💻 Embedded VS Code](#-embedded-vs-code--code-server)**

---

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/readme_canvas_dark.png" alt="Explaino Structura Dark Mode Canvas Overview" width="94%" />
</p>

</div>

---

## 🌟 Overview

**Explaino Structura** merges an infinite **Excalidraw hand-drawn whiteboard**, a full-fledged **in-canvas VS Code / code-server IDE**, **interactive data structures** with live mutation controls, **AI text-to-diagram Mermaid conversion**, and **BYOK AI coding assistants** into a cohesive teaching and engineering workspace.

Built with **Next.js 16 (Turbopack)**, **TypeScript**, **Tailwind CSS v4**, and **Firebase Firestore**, it is engineered from the ground up for educators, software architects, interviewers, and students.

---

## 🚀 Key Features

```
┌────────────────────────────────────────────────────────────────────────┐
│                        EXPLAINO STRUCTURA CORE                         │
├─────────────────┬──────────────────┬─────────────────┬─────────────────┤
│ 📐 Canvas       │ 💻 VS Code Screen│ 🔮 AI Diagrams  │ 🧠 Data Structs │
│ Infinite Canvas │ Full code-server │ Text-to-Mermaid │ Stack, Queue    │
│ Dark & Light    │ Dual Modes       │ Native Elements │ Tree, Graph     │
│ Hand & Pen Draw │ Multi-Ratios     │ Smart Lifelines │ Dynamic Tables  │
└─────────────────┴──────────────────┴─────────────────┴─────────────────┘
```

---

### 💻 Embedded VS Code / Code-Server

Embed a real **VS Code / code-server** editor directly inside the whiteboard coordinate space with a sleek macOS-style window frame.

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/readme_vscode_screen_dark.png" alt="Embedded VS Code Screen in Dark Mode" width="92%" />
</p>

- **Dual Interaction Modes**:
  - **🖱️ Interact Mode**: Full mouse and keyboard interaction inside the editor, terminal, file explorer, and extensions.
  - **✏️ Draw Mode**: Draw directly on top of your code, highlight execution paths, and diagram variable references.
- **Dynamic Status Indicator**: Real-time heartbeat dot (🟢 *Healthy & Online*, 🟡 *Connecting / Booting*, 🔴 *Offline / 502*).
- **Multi-Aspect Ratio Selection**: Switch viewports on the fly:
  - Landscape: `16:10` (macOS default), `16:9` (presentation), `20:9` (ultra-wide)
  - Portrait: `10:16`, `9:16`, `9:20` (mobile app view)
- **Automatic Auth Injection**: Auto-logs into code-server session with secure cookie sync.
- **Trackpad Safety**: Dedicated gesture shielding prevents browser swipe-back navigation while panning code.

---

### 🔮 Text to Diagram & Mermaid AI Studio

Transform natural language descriptions into fully editable, native Excalidraw whiteboard elements using Gemini / LLM generation or raw Mermaid definitions.

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/modal_elements_fixed.png" alt="Text to Diagram Prompt Studio in Dark Mode" width="48%" />
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/modal_mermaid_tab_fixed.png" alt="Mermaid Code Editor in Dark Mode" width="48%" />
</p>

- **Prompt Studio**: Describe complex microservices, sequence flows, or database schemas.
- **Native Shape Conversion**: Diagrams insert as individual, editable shapes (move, resize, recolor, regroup).
- **Smart Lifeline Segmentation**: Automatically segments sequence diagram vertical lifelines around overlapping notes so lines never cut through text or containers.
- **Interactive Preview HUD**: Zoom, fit-to-frame, copy code, and live render preview with whiteboard dot grid.

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/canvas_lifelines_fixed.png" alt="Sequence Diagram inserted onto Canvas" width="90%" />
</p>

---

### 📐 Interactive Data Structures

Insert fully interactive data structures directly onto the whiteboard with on-canvas `+` / `-` visual mutation controls.

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/readme_data_structures_dark.png" alt="Data Structures Panel in Dark Mode" width="92%" />
</p>

| Data Structure | Insertion Mode | Interactive Controls |
|:---|:---|:---|
| **Stack** | LIFO visual column | `Push` element, `Pop` top element |
| **Queue** | FIFO visual row with front/rear pointers | `Enqueue` back, `Dequeue` front |
| **Array** | Continuous indexed cells with index labels | Append, pop, resize, value editing |
| **Singly Linked List** | Node boxes with arrows and `HEAD`/`NULL` | Insert after, remove node, update pointer |
| **Binary Search Tree** | Hierarchical nodes with directional branches | Add left/right child, balance visualization |
| **Graph** | Vertices with weighted/directed edges | Add vertex, connect edge, drag nodes |
| **Editable Table** | Column/row grid with headers | Add/remove rows & columns, inline cell editing |

---

### 🤖 AI Coding & Syntax-Highlighted Code Cards

Chat with an in-canvas AI coding assistant powered by **Mistral AI** (Bring-Your-Own-Key) with instant whiteboard code card generation.

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/readme_ai_text_dock_dark.png" alt="AI Text Dock in Dark Mode" width="92%" />
</p>

- **Multi-Model Routing**: Switch seamlessly between **Mistral Large**, **Mistral Small**, and **Codestral**.
- **Insert Code to Canvas**: One-click converts highlighted code snippets into dark-mode SVG cards rendered directly onto the whiteboard.
- **Privacy First**: API keys are stored exclusively in your browser's local storage and never transmitted to our backend.

---

### ⚡ Command Palette (`Ctrl + Shift + P` / `Ctrl + K`)

A keyboard-centric command palette provides instant access to all canvas tools, layout triggers, and structure actions.

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/readme_command_palette_dark.png" alt="Command Palette in Dark Mode" width="85%" />
</p>

- Fuzzy search for tools: `Text to Diagram`, `Code-Server Screen`, `Insert Stack`, `Export SVG`, `Toggle Theme`.
- Dedicated keyboard shortcut display for rapid workflow execution.

---

### 📱 Smart Board & PWA Installability

Designed to run smoothly on large school interactive touchscreens (including low-memory Android smartboards with **1GB RAM**) as well as tablets and desktop browsers.

<p align="center">
  <img src="https://raw.githubusercontent.com/parthasdey2304/explaino_structura/main/docs/assets/creator_menu_install_app.png" alt="Creator Profile & PWA Install App" width="55%" />
</p>

- **Progressive Web App**: Install as a standalone desktop or mobile application via the top-left **Creator Menu**.
- **Touch & Stylus Optimization**:
  - **Pen Mode**: Dedicated pressure-sensitive stylus drawing.
  - **Hand Mode**: Touch pan and zoom navigation without accidental drawing strokes.
- **Memory Efficiency**: Lightweight DOM foot-printing, throttled canvas re-renders, and debounced Firestore sync.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|:---|:---|
| **Framework** | [Next.js 16 (App Router)](https://nextjs.org/) with Turbopack compilation |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) (strict type-safety) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) with `@layer base` reset isolation |
| **Whiteboard Engine** | [@excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) + [@excalidraw/mermaid-to-excalidraw](https://github.com/excalidraw/mermaid-to-excalidraw) |
| **Database & Auth** | [Google Cloud Firestore](https://firebase.google.com/docs/firestore) + Session Cookies |
| **Execution Engines** | WebAssembly (Pyodide, Clang WASM), E2B Sandboxed Terminal, Judge0 Cloud API |
| **Deployment** | [Vercel Edge Platform](https://vercel.com/) |

---

## 🏁 Quick Start

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher

### 1. Clone & Install
```bash
git clone https://github.com/parthasdey2304/explaino_structura.git
cd explaino_structura
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
# Firebase Firestore Database
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Cloud Execution Sandboxes (Optional)
E2B_API_KEY=your_e2b_api_key
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
npm run start
```

---

## 🔒 Firebase Security Rules

For development or personal deployment, configure your Firestore rules in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /drawings/{drawingId} {
      allow read, write: if true;
    }
  }
}
```

---

## 👨‍💻 Creator & Community

Crafted with ❤️ by **Partha Sarathi Dey**.

- **GitHub**: [@parthasdey2304](https://github.com/parthasdey2304)
- **Repository**: [parthasdey2304/explaino_structura](https://github.com/parthasdey2304/explaino_structura)
- **Live Demo**: [explaino.vastaviklearning.online](https://explaino.vastaviklearning.online)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
