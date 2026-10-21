# Graph Report - explaino_structura  (2026-10-21)

## Corpus Check
- 61 files · ~108,806 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .ico 1)

## Summary
- 600 nodes · 1191 edges · 23 communities (21 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6fddf69a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CodeEditorPanel.tsx
- dataStructures.ts
- dependencies
- ExcalidrawWrapper.tsx
- hooks/index.ts
- instrumentation.ts
- devDependencies
- compilerOptions
- AIChatPanel.tsx
- TerminalService
- quickshape.ts
- GeminiLiveSession
- ExplainoPanel.tsx
- emmet.d.ts
- package.json
- highlight.ts
- emmetExtension.ts
- eslint.config.mjs
- Features
- postcss.config.mjs
- createCodeCardSvg
- scripts
- optionalDependencies

## God Nodes (most connected - your core abstractions)
1. `ExcalidrawWrapper()` - 33 edges
2. `CodeEditorPanel()` - 32 edges
3. `react` - 21 edges
4. `AIChatPanel()` - 18 edges
5. `GeminiLiveSession` - 16 edges
6. `compilerOptions` - 16 edges
7. `lucide-react` - 15 edges
8. `DataStructuresPanel()` - 14 edges
9. `TerminalService` - 14 edges
10. `recognizeShape()` - 13 edges

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

## Communities (23 total, 2 thin omitted)

### Community 0 - "CodeEditorPanel.tsx"
Cohesion: 0.06
Nodes (64): baseLangExtension(), cmHighlight, cmTheme, CodeEditorPanel(), CodeEditorPanelProps, FILE_ICON_COLORS, langExtension(), LANGUAGES (+56 more)

### Community 1 - "dataStructures.ts"
Cohesion: 0.07
Nodes (57): CanvasStructureControls(), CanvasStructureControlsProps, ViewportBox, ArrayPreview(), BinaryTreePreview(), BuilderState, DataStructuresPanel(), DataStructuresPanelProps (+49 more)

### Community 2 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, codemirror, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python (+17 more)

### Community 3 - "ExcalidrawWrapper.tsx"
Cohesion: 0.05
Nodes (54): lucide-react, react, ExcalidrawWrapper, Home(), CommandPalette(), fuzzyMatch(), PaletteCommand, ExcalidrawErrorBoundary (+46 more)

### Community 4 - "hooks/index.ts"
Cohesion: 0.14
Nodes (24): @excalidraw/excalidraw, ExcalidrawComponent, CanvasShortcutHandlers, isEditableElement(), useCanvasShortcuts(), ListMode, ListModeHandle, useListMode() (+16 more)

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
Cohesion: 0.07
Nodes (18): nextConfig, e2b, next, ChatMessage, isChatMessage(), POST(), ExecuteBody, LANGUAGE_IDS (+10 more)

### Community 10 - "quickshape.ts"
Cohesion: 0.15
Nodes (27): useQuickShape(), angleBetween(), baseOf(), bboxOf(), buildShapeElement(), deflection(), dist(), fitEllipse() (+19 more)

### Community 12 - "ExplainoPanel.tsx"
Cohesion: 0.12
Nodes (18): firebase, blobToDataUrl(), buildFrameThumbs(), clipElementsToRegion(), clipSceneToRegion(), contentBBox(), ExplainoFrame, ExplainoNote (+10 more)

### Community 16 - "emmet.d.ts"
Cohesion: 0.40
Nodes (4): emmet, ExtractedAbbreviation, ExtractOptions, UserConfig

### Community 17 - "package.json"
Cohesion: 0.11
Nodes (17): name, private, version, codemirror, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc, perfect-freehand, react-colorful (+9 more)

### Community 18 - "highlight.ts"
Cohesion: 0.13
Nodes (17): @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python, @codemirror/language, @codemirror/legacy-modes, code() (+9 more)

### Community 19 - "emmetExtension.ts"
Cohesion: 0.09
Nodes (27): @codemirror/commands, @codemirror/state, @codemirror/view, emmet, OPTIONS, SettingsMenu(), DEFAULTS, EditorSettings (+19 more)

### Community 20 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslintConfig, eslint, eslint-config-next

### Community 21 - "Features"
Cohesion: 0.17
Nodes (11): AI Assistant (Mistral, bring-your-own-key), Code Editor & Terminal, Data Structure Diagrams (on-canvas, not overlays), Environment Variables (`.env.local`), Explaino Structura, Features, Getting Started, Project Structure (+3 more)

### Community 25 - "createCodeCardSvg"
Cohesion: 0.32
Nodes (5): createCodeCardSvg(), compensateForDarkCanvas(), hexToRgb(), rgbToHex(), toBase64()

### Community 26 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

### Community 28 - "optionalDependencies"
Cohesion: 0.67
Nodes (3): optionalDependencies, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc

## Knowledge Gaps
- **13 isolated node(s):** `perfect-freehand`, `react-colorful`, `react-dom`, `zustand`, `@next/swc-win32-x64-msvc` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 217 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `ExcalidrawWrapper.tsx` to `CodeEditorPanel.tsx`, `dataStructures.ts`, `hooks/index.ts`, `instrumentation.ts`, `AIChatPanel.tsx`, `quickshape.ts`, `ExplainoPanel.tsx`, `package.json`, `emmetExtension.ts`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **What connects `perfect-freehand`, `react-colorful`, `react-dom` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CodeEditorPanel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05771604938271605 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `ExcalidrawWrapper.tsx` to `CodeEditorPanel.tsx`, `dataStructures.ts`, `instrumentation.ts`, `AIChatPanel.tsx`, `ExplainoPanel.tsx`, `package.json`, `emmetExtension.ts`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Should `dataStructures.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07288135593220339 - nodes in this community are weakly interconnected._
- **Why does `@excalidraw/excalidraw` connect `hooks/index.ts` to `dataStructures.ts`, `ExcalidrawWrapper.tsx`, `TerminalService`, `quickshape.ts`, `ExplainoPanel.tsx`, `package.json`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._