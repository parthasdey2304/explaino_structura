# Graph Report - explaino_structura  (2026-10-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 543 nodes · 943 edges · 22 communities (16 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b5c2cf08`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CodeEditorPanel.tsx
- dataStructures.ts
- dependencies
- AIChatPanel.tsx
- ExcalidrawWrapper.tsx
- AITextSidebar.tsx
- instrumentation.ts
- devDependencies
- compilerOptions
- TerminalService
- quickshape.ts
- getEditorSettings
- ExcalidrawErrorBoundary
- LaserOverlay.tsx
- emmet.d.ts
- chat/route.ts
- api/execute/route.ts
- layout.tsx
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- firebase.ts

## God Nodes (most connected - your core abstractions)
1. `CodeEditorPanel()` - 25 edges
2. `ExcalidrawWrapper()` - 18 edges
3. `AIChatPanel()` - 16 edges
4. `compilerOptions` - 16 edges
5. `GeminiLiveSession` - 15 edges
6. `TerminalService` - 14 edges
7. `recognizeShape()` - 13 edges
8. `getEditorSettings()` - 11 edges
9. `createCodeCardSvg()` - 11 edges
10. `applyAction()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `PanelState` --references--> `WorkspaceNode`  [EXTRACTED]
  src/components/CodeEditorPanel.tsx → src/lib/workspace.ts
- `FileExplorerProps` --references--> `WorkspaceNode`  [EXTRACTED]
  src/components/FileExplorer.tsx → src/lib/workspace.ts
- `TreeNodeProps` --references--> `WorkspaceNode`  [EXTRACTED]
  src/components/FileExplorer.tsx → src/lib/workspace.ts
- `CodeEditorPanel()` --calls--> `getEditorSettings()`  [EXTRACTED]
  src/components/CodeEditorPanel.tsx → src/lib/editorSettings.ts
- `CodeEditorPanel()` --calls--> `subscribeEditorSettings()`  [EXTRACTED]
  src/components/CodeEditorPanel.tsx → src/lib/editorSettings.ts

## Import Cycles
- None detected.

## Communities (22 total, 6 thin omitted)

### Community 0 - "CodeEditorPanel.tsx"
Cohesion: 0.05
Nodes (64): baseLangExtension(), cmHighlight, cmTheme, CodeEditorPanel(), CodeEditorPanelProps, FILE_ICON_COLORS, langExtension(), LANGUAGES (+56 more)

### Community 1 - "dataStructures.ts"
Cohesion: 0.07
Nodes (49): CanvasStructureControls(), CanvasStructureControlsProps, ViewportBox, BuilderState, DataStructuresPanel(), DataStructuresPanelProps, ICONS, initBuilderState() (+41 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (49): codemirror, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python, @codemirror/language (+41 more)

### Community 3 - "AIChatPanel.tsx"
Cohesion: 0.09
Nodes (27): AIChatPanel(), AIChatPanelProps, AttachedFile, DisplayMessage, loadChatHistory(), nextId(), renderMarkdown(), saveChatHistory() (+19 more)

### Community 4 - "ExcalidrawWrapper.tsx"
Cohesion: 0.08
Nodes (38): CanvasTextItem, boxOf(), DSMeta, ExcalidrawComponent, ExcalidrawWrapper(), load(), harvestLabels(), isPointPair() (+30 more)

### Community 5 - "AITextSidebar.tsx"
Cohesion: 0.07
Nodes (35): AITextSidebar(), AITextSidebarProps, AssistantBody(), CANONICAL_ORDER, code(), copyText(), createSpeechRecognition(), extractSolutions() (+27 more)

### Community 6 - "instrumentation.ts"
Cohesion: 0.09
Nodes (28): VisualizerPanel(), VisualizerPanelProps, Analysis, analyze(), AsyncFunctionCtor, BOUNDARY_STOP_WORDS, BraceKind, formatLogArg() (+20 more)

### Community 7 - "devDependencies"
Cohesion: 0.06
Nodes (32): eslint, eslint-config-next, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc, devDependencies, eslint, eslint-config-next, tailwindcss (+24 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 9 - "TerminalService"
Cohesion: 0.11
Nodes (12): POST(), POST(), POST(), POST(), POST(), HistoryEntry, Terminal(), TerminalProps (+4 more)

### Community 10 - "quickshape.ts"
Cohesion: 0.15
Nodes (26): angleBetween(), baseOf(), bboxOf(), buildShapeElement(), deflection(), dist(), fitEllipse(), HOLD_MS (+18 more)

### Community 11 - "getEditorSettings"
Cohesion: 0.13
Nodes (22): OPTIONS, SettingsMenu(), DEFAULTS, EditorSettings, getEditorSettings(), readFromStorage(), setEditorSettings(), subscribeEditorSettings() (+14 more)

### Community 12 - "ExcalidrawErrorBoundary"
Cohesion: 0.20
Nodes (4): ExcalidrawWrapper, ExcalidrawErrorBoundary, Props, State

### Community 13 - "LaserOverlay.tsx"
Cohesion: 0.36
Nodes (7): drawTipDot(), LASER_RED, LaserOverlay(), paintFrame(), tracePath(), Trail, TrailPoint

### Community 14 - "emmet.d.ts"
Cohesion: 0.40
Nodes (4): emmet, ExtractedAbbreviation, ExtractOptions, UserConfig

### Community 15 - "chat/route.ts"
Cohesion: 0.67
Nodes (3): ChatMessage, isChatMessage(), POST()

## Knowledge Gaps
- **163 isolated node(s):** `CodeEditorPanelProps`, `RunStatus`, `Creating`, `Renaming`, `Judge0Response` (+158 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createCodeCardSvg()` connect `AITextSidebar.tsx` to `ExcalidrawWrapper.tsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `CodeEditorPanelProps`, `RunStatus`, `Creating` to the rest of the system?**
  _163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CodeEditorPanel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05495151337055539 - nodes in this community are weakly interconnected._
- **Should `dataStructures.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07071887784921099 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `AIChatPanel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09494949494949495 - nodes in this community are weakly interconnected._
- **Should `ExcalidrawWrapper.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07862679955703211 - nodes in this community are weakly interconnected._