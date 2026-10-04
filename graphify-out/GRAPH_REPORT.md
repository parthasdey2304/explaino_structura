# Graph Report - explaino_structura  (2026-10-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 555 nodes · 961 edges · 23 communities (17 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7065ebbe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- CodeEditorPanel.tsx
- ExcalidrawWrapper.tsx
- dataStructures.ts
- AITextSidebar.tsx
- dependencies
- instrumentation.ts
- devDependencies
- compilerOptions
- TerminalService
- getEditorSettings
- highlight.ts
- ExplanioPanel.tsx
- GeminiLiveSession
- ExcalidrawErrorBoundary
- LaserOverlay.tsx
- TodoOverlay.tsx
- emmet.d.ts
- chat/route.ts
- api/execute/route.ts
- layout.tsx
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs

## God Nodes (most connected - your core abstractions)
1. `CodeEditorPanel()` - 25 edges
2. `ExcalidrawWrapper()` - 18 edges
3. `AIChatPanel()` - 16 edges
4. `compilerOptions` - 16 edges
5. `GeminiLiveSession` - 15 edges
6. `TerminalService` - 14 edges
7. `recognizeShape()` - 13 edges
8. `createCodeCardSvg()` - 11 edges
9. `getEditorSettings()` - 11 edges
10. `ExplanioPanel()` - 10 edges

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

## Communities (23 total, 6 thin omitted)

### Community 0 - "CodeEditorPanel.tsx"
Cohesion: 0.05
Nodes (64): baseLangExtension(), cmHighlight, cmTheme, CodeEditorPanel(), CodeEditorPanelProps, FILE_ICON_COLORS, langExtension(), LANGUAGES (+56 more)

### Community 1 - "ExcalidrawWrapper.tsx"
Cohesion: 0.07
Nodes (56): boxOf(), DSMeta, ExcalidrawComponent, ExcalidrawWrapper(), load(), harvestLabels(), isPointPair(), LINEAR_TYPES (+48 more)

### Community 2 - "dataStructures.ts"
Cohesion: 0.07
Nodes (49): CanvasStructureControls(), CanvasStructureControlsProps, ViewportBox, BuilderState, DataStructuresPanel(), DataStructuresPanelProps, ICONS, initBuilderState() (+41 more)

### Community 3 - "AITextSidebar.tsx"
Cohesion: 0.08
Nodes (45): AIChatPanel(), AIChatPanelProps, AttachedFile, DisplayMessage, loadChatHistory(), nextId(), renderMarkdown(), saveChatHistory() (+37 more)

### Community 4 - "dependencies"
Cohesion: 0.04
Nodes (49): codemirror, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python, @codemirror/language (+41 more)

### Community 5 - "instrumentation.ts"
Cohesion: 0.09
Nodes (28): VisualizerPanel(), VisualizerPanelProps, Analysis, analyze(), AsyncFunctionCtor, BOUNDARY_STOP_WORDS, BraceKind, formatLogArg() (+20 more)

### Community 6 - "devDependencies"
Cohesion: 0.06
Nodes (32): eslint, eslint-config-next, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc, devDependencies, eslint, eslint-config-next, tailwindcss (+24 more)

### Community 7 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 8 - "TerminalService"
Cohesion: 0.11
Nodes (12): POST(), POST(), POST(), POST(), POST(), HistoryEntry, Terminal(), TerminalProps (+4 more)

### Community 9 - "getEditorSettings"
Cohesion: 0.13
Nodes (22): OPTIONS, SettingsMenu(), DEFAULTS, EditorSettings, getEditorSettings(), readFromStorage(), setEditorSettings(), subscribeEditorSettings() (+14 more)

### Community 10 - "highlight.ts"
Cohesion: 0.14
Nodes (15): code(), ALIASES, createCodeCardSvg(), compensateForDarkCanvas(), hexToRgb(), rgbToHex(), CSS_LANG, escapeHtml() (+7 more)

### Community 11 - "ExplanioPanel.tsx"
Cohesion: 0.18
Nodes (15): blobToDataUrl(), buildFrameThumbs(), clipElementsToRegion(), clipSceneToRegion(), contentBBox(), ExplanioFrame, ExplanioNote, ExplanioPanel() (+7 more)

### Community 13 - "ExcalidrawErrorBoundary"
Cohesion: 0.20
Nodes (4): ExcalidrawWrapper, ExcalidrawErrorBoundary, Props, State

### Community 14 - "LaserOverlay.tsx"
Cohesion: 0.36
Nodes (7): drawTipDot(), LASER_RED, LaserOverlay(), paintFrame(), tracePath(), Trail, TrailPoint

### Community 15 - "TodoOverlay.tsx"
Cohesion: 0.36
Nodes (7): loadTodos(), nextTodoId(), saveTodos(), TodoCornerButton(), TodoItem, TodoPanel(), TodoStatus

### Community 16 - "emmet.d.ts"
Cohesion: 0.40
Nodes (4): emmet, ExtractedAbbreviation, ExtractOptions, UserConfig

### Community 17 - "chat/route.ts"
Cohesion: 0.67
Nodes (3): ChatMessage, isChatMessage(), POST()

## Knowledge Gaps
- **167 isolated node(s):** `CodeEditorPanelProps`, `RunStatus`, `Creating`, `Renaming`, `Judge0Response` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GeminiLiveSession` connect `GeminiLiveSession` to `AITextSidebar.tsx`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `createCodeCardSvg()` connect `highlight.ts` to `ExcalidrawWrapper.tsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `CodeEditorPanelProps`, `RunStatus`, `Creating` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CodeEditorPanel.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05495151337055539 - nodes in this community are weakly interconnected._
- **Should `ExcalidrawWrapper.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0655367231638418 - nodes in this community are weakly interconnected._
- **Should `dataStructures.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07071887784921099 - nodes in this community are weakly interconnected._
- **Should `AITextSidebar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07541478129713423 - nodes in this community are weakly interconnected._