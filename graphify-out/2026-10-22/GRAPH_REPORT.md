# Graph Report - explaino_structura  (2026-10-22)

## Corpus Check
- 74 files · ~199,449 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .ico 1)

## Summary
- 695 nodes · 1336 edges · 36 communities (31 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e60b13d1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CodeEditorPanel.tsx
- dataStructures.ts
- dependencies
- ExcalidrawWrapper.tsx
- react
- instrumentation.ts
- devDependencies
- compilerOptions
- AIChatPanel.tsx
- TerminalService
- quickshape.ts
- GeminiLiveSession
- ExplainoPanel.tsx
- manifest.json
- service.ts
- next
- emmet.d.ts
- package.json
- highlight.ts
- emmetExtension.ts
- eslint.config.mjs
- ⚡ Explaino Structura
- postcss.config.mjs
- VSCodeScreenView.tsx
- LaserOverlay.tsx
- createCodeCardSvg
- scripts
- login/route.ts
- optionalDependencies
- code-server-login/route.ts
- proxy/route.ts
- layout.tsx
- chat/route.ts
- mermaid/route.ts
- logout/route.ts
- sw.js

## God Nodes (most connected - your core abstractions)
1. `ExcalidrawWrapper()` - 40 edges
2. `CodeEditorPanel()` - 32 edges
3. `react` - 25 edges
4. `lucide-react` - 19 edges
5. `next` - 18 edges
6. `AIChatPanel()` - 18 edges
7. `GeminiLiveSession` - 16 edges
8. `compilerOptions` - 16 edges
9. `DataStructuresPanel()` - 14 edges
10. `TerminalService` - 14 edges

## Surprising Connections (you probably didn't know these)
- `AIChatPanel()` --calls--> `GeminiLiveSession`  [EXTRACTED]
  src/components/AIChatPanel.tsx → src/lib/ai/gemini-live.ts
- `CodeEditorPanel()` --calls--> `AIChatPanel()`  [EXTRACTED]
  src/components/CodeEditorPanel.tsx → src/components/AIChatPanel.tsx
- `code()` --calls--> `highlightCode()`  [EXTRACTED]
  src/components/AITextSidebar.tsx → src/lib/ai/highlight.ts
- `SolutionTabs()` --calls--> `highlightCode()`  [EXTRACTED]
  src/components/AITextSidebar.tsx → src/lib/ai/highlight.ts
- `ExcalidrawWrapper()` --calls--> `AITextSidebar()`  [EXTRACTED]
  src/components/ExcalidrawWrapper.tsx → src/components/AITextSidebar.tsx

## Import Cycles
- None detected.

## Communities (36 total, 5 thin omitted)

### Community 0 - "CodeEditorPanel.tsx"
Cohesion: 0.06
Nodes (64): baseLangExtension(), cmHighlight, cmTheme, CodeEditorPanel(), CodeEditorPanelProps, FILE_ICON_COLORS, langExtension(), LANGUAGES (+56 more)

### Community 1 - "dataStructures.ts"
Cohesion: 0.07
Nodes (58): CanvasStructureControls(), CanvasStructureControlsProps, ViewportBox, ArrayPreview(), BinaryTreePreview(), BuilderState, DataStructuresPanel(), DataStructuresPanelProps (+50 more)

### Community 2 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, codemirror, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python (+19 more)

### Community 3 - "ExcalidrawWrapper.tsx"
Cohesion: 0.05
Nodes (68): @excalidraw/excalidraw, performClientLogout(), CommandPalette(), fuzzyMatch(), PaletteCommand, boxOf(), CreatorAvatarIcon(), ExcalidrawComponent (+60 more)

### Community 4 - "react"
Cohesion: 0.06
Nodes (28): @excalidraw/mermaid-to-excalidraw, lucide-react, mermaid, react, ExcalidrawWrapper, Home(), AuthGate(), AUTHORIZED_EMAIL (+20 more)

### Community 5 - "instrumentation.ts"
Cohesion: 0.10
Nodes (32): ArrayVisualizer(), MemoryBlock(), ObjectVisualizer(), VariableCard(), VisualizerPanel(), VisualizerPanelProps, Analysis, analyze() (+24 more)

### Community 6 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/dompurify, @types/node, @types/react (+2 more)

### Community 7 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 8 - "AIChatPanel.tsx"
Cohesion: 0.07
Nodes (48): dompurify, marked, AIChatPanel(), AIChatPanelProps, AttachedFile, DisplayMessage, loadChatHistory(), nextId() (+40 more)

### Community 9 - "TerminalService"
Cohesion: 0.16
Nodes (5): POST(), POST(), POST(), POST(), TerminalService

### Community 10 - "quickshape.ts"
Cohesion: 0.15
Nodes (26): angleBetween(), baseOf(), bboxOf(), buildShapeElement(), deflection(), dist(), fitEllipse(), HOLD_MS (+18 more)

### Community 12 - "ExplainoPanel.tsx"
Cohesion: 0.12
Nodes (18): firebase, blobToDataUrl(), buildFrameThumbs(), clipElementsToRegion(), clipSceneToRegion(), contentBBox(), ExplainoFrame, ExplainoNote (+10 more)

### Community 13 - "manifest.json"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, display_override, icons, name, orientation (+5 more)

### Community 14 - "service.ts"
Cohesion: 0.21
Nodes (8): e2b, POST(), HistoryEntry, Terminal(), TerminalProps, SandboxFileEntry, TerminalResult, WorkspaceSyncFile

### Community 15 - "next"
Cohesion: 0.20
Nodes (5): nextConfig, next, dynamic, ExecuteBody, LANGUAGE_IDS

### Community 16 - "emmet.d.ts"
Cohesion: 0.40
Nodes (4): emmet, ExtractedAbbreviation, ExtractOptions, UserConfig

### Community 17 - "package.json"
Cohesion: 0.12
Nodes (16): name, private, version, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc, perfect-freehand, react-colorful, react-dom (+8 more)

### Community 18 - "highlight.ts"
Cohesion: 0.14
Nodes (16): @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-python, @codemirror/language, @codemirror/legacy-modes, code(), ALIASES (+8 more)

### Community 19 - "emmetExtension.ts"
Cohesion: 0.10
Nodes (26): @codemirror/commands, @codemirror/state, @codemirror/view, emmet, OPTIONS, SettingsMenu(), DEFAULTS, EditorSettings (+18 more)

### Community 20 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslintConfig, eslint, eslint-config-next

### Community 21 - "⚡ Explaino Structura"
Cohesion: 0.10
Nodes (20): 1. Clone & Install, 2. Configure Environment Variables, 3. Run Development Server, 4. Build for Production, 🤖 AI Coding & Syntax-Highlighted Code Cards, ⚡ Command Palette (`Ctrl + Shift + P` / `Ctrl + K`), 👨‍💻 Creator & Community, 💻 Embedded VS Code / Code-Server (+12 more)

### Community 23 - "VSCodeScreenView.tsx"
Cohesion: 0.25
Nodes (6): codemirror, @codemirror/lang-javascript, VSCodeScreenViewProps, vsDarkTheme, vsHighlight, STARTER_CODE

### Community 24 - "LaserOverlay.tsx"
Cohesion: 0.38
Nodes (6): drawTipDot(), LASER_RED, paintFrame(), tracePath(), Trail, TrailPoint

### Community 25 - "createCodeCardSvg"
Cohesion: 0.32
Nodes (5): createCodeCardSvg(), compensateForDarkCanvas(), hexToRgb(), rgbToHex(), toBase64()

### Community 26 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

### Community 27 - "login/route.ts"
Cohesion: 0.33
Nodes (4): AUTHORIZED_EMAIL, AUTHORIZED_PASSWORD, dynamic, runtime

### Community 28 - "optionalDependencies"
Cohesion: 0.67
Nodes (3): optionalDependencies, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc

### Community 29 - "code-server-login/route.ts"
Cohesion: 0.47
Nodes (5): dynamic, GET(), performLogin(), POST(), runtime

### Community 30 - "proxy/route.ts"
Cohesion: 0.50
Nodes (4): dynamic, GET(), isDisallowedUrl(), runtime

### Community 32 - "chat/route.ts"
Cohesion: 0.67
Nodes (3): ChatMessage, isChatMessage(), POST()

### Community 33 - "mermaid/route.ts"
Cohesion: 0.83
Nodes (3): cleanMermaidCode(), getFallbackMermaid(), POST()

## Knowledge Gaps
- **13 isolated node(s):** `perfect-freehand`, `react-colorful`, `react-dom`, `zustand`, `@next/swc-win32-x64-msvc` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 277 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `CodeEditorPanel.tsx`, `dataStructures.ts`, `ExcalidrawWrapper.tsx`, `instrumentation.ts`, `AIChatPanel.tsx`, `quickshape.ts`, `ExplainoPanel.tsx`, `service.ts`, `package.json`, `emmetExtension.ts`, `VSCodeScreenView.tsx`, `LaserOverlay.tsx`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **What connects `perfect-freehand`, `react-colorful`, `react-dom` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CodeEditorPanel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05802469135802469 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `chat/route.ts`, `mermaid/route.ts`, `logout/route.ts`, `ExcalidrawWrapper.tsx`, `react`, `TerminalService`, `service.ts`, `package.json`, `login/route.ts`, `code-server-login/route.ts`, `proxy/route.ts`, `layout.tsx`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Should `dataStructures.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07103825136612021 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `react` to `CodeEditorPanel.tsx`, `dataStructures.ts`, `ExcalidrawWrapper.tsx`, `instrumentation.ts`, `AIChatPanel.tsx`, `ExplainoPanel.tsx`, `package.json`, `emmetExtension.ts`, `VSCodeScreenView.tsx`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._