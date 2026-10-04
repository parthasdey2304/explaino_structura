# Graph Report - explaino_structura  (2026-10-04)

## Corpus Check
- Corpus is ~43,677 words - fits in a single context window. You may not need a graph.

## Summary
- 535 nodes · 929 edges · 22 communities (15 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- lib/executors
- src/components
- package.json
- src/lib
- lib/ai
- src/components
- src/lib
- package.json
- tsconfig.json
- lib/terminal
- src/lib
- src/lib
- src/components
- src/types
- ai/chat
- api/execute
- src/app
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- src/lib

## God Nodes (most connected - your core abstractions)
1. `CodeEditorPanel()` - 26 edges
2. `AIChatPanel()` - 17 edges
3. `ExcalidrawWrapper()` - 16 edges
4. `GeminiLiveSession` - 16 edges
5. `compilerOptions` - 16 edges
6. `TerminalService` - 14 edges
7. `recognizeShape()` - 13 edges
8. `getEditorSettings()` - 11 edges
9. `AITextSidebar()` - 10 edges
10. `applyAction()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `code()` --calls--> `highlightCode()`  [EXTRACTED]
  src/components/AITextSidebar.tsx → src/lib/ai/highlight.ts
- `AITextSidebar()` --calls--> `chatStreamAuto()`  [EXTRACTED]
  src/components/AITextSidebar.tsx → src/lib/ai/mistral.ts
- `langExtension()` --calls--> `snippetLanguageData()`  [EXTRACTED]
  src/components/CodeEditorPanel.tsx → src/lib/emmetExtension.ts
- `PanelState` --references--> `WorkspaceNode`  [EXTRACTED]
  src/components/CodeEditorPanel.tsx → src/lib/workspace.ts
- `CodeEditorPanel()` --calls--> `getEditorSettings()`  [EXTRACTED]
  src/components/CodeEditorPanel.tsx → src/lib/editorSettings.ts

## Import Cycles
- None detected.

## Communities (22 total, 6 thin omitted)

### Community 0 - "lib/executors"
Cohesion: 0.06
Nodes (62): baseLangExtension(), cmHighlight, cmTheme, CodeEditorPanel(), CodeEditorPanelProps, FILE_ICON_COLORS, langExtension(), LANGUAGES (+54 more)

### Community 1 - "src/components"
Cohesion: 0.06
Nodes (54): CanvasStructureControls(), CanvasStructureControlsProps, ViewportBox, boxOf(), DSMeta, ExcalidrawComponent, ExcalidrawWrapper(), load() (+46 more)

### Community 2 - "package.json"
Cohesion: 0.04
Nodes (49): codemirror, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python, @codemirror/language (+41 more)

### Community 3 - "src/lib"
Cohesion: 0.08
Nodes (37): BuilderState, DataStructuresPanel(), DataStructuresPanelProps, ICONS, initBuilderState(), addChildAt(), applyAction(), arrow() (+29 more)

### Community 4 - "lib/ai"
Cohesion: 0.10
Nodes (27): AIChatPanel(), AIChatPanelProps, AttachedFile, DisplayMessage, loadChatHistory(), nextId(), renderMarkdown(), saveChatHistory() (+19 more)

### Community 5 - "src/components"
Cohesion: 0.08
Nodes (32): AITextSidebar(), AITextSidebarProps, AssistantBody(), CANONICAL_ORDER, code(), copyText(), createSpeechRecognition(), extractSolutions() (+24 more)

### Community 6 - "src/lib"
Cohesion: 0.09
Nodes (28): VisualizerPanel(), VisualizerPanelProps, Analysis, analyze(), AsyncFunctionCtor, BOUNDARY_STOP_WORDS, BraceKind, formatLogArg() (+20 more)

### Community 7 - "package.json"
Cohesion: 0.06
Nodes (32): eslint, eslint-config-next, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc, devDependencies, eslint, eslint-config-next, tailwindcss (+24 more)

### Community 8 - "tsconfig.json"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 9 - "lib/terminal"
Cohesion: 0.11
Nodes (12): POST(), POST(), POST(), POST(), POST(), HistoryEntry, Terminal(), TerminalProps (+4 more)

### Community 10 - "src/lib"
Cohesion: 0.13
Nodes (23): OPTIONS, SettingsMenu(), DEFAULTS, EditorSettings, getEditorSettings(), readFromStorage(), setEditorSettings(), subscribeEditorSettings() (+15 more)

### Community 11 - "src/lib"
Cohesion: 0.15
Nodes (26): angleBetween(), baseOf(), bboxOf(), buildShapeElement(), deflection(), dist(), fitEllipse(), HOLD_MS (+18 more)

### Community 12 - "src/components"
Cohesion: 0.20
Nodes (4): ExcalidrawWrapper, ExcalidrawErrorBoundary, Props, State

### Community 13 - "src/types"
Cohesion: 0.40
Nodes (4): emmet, ExtractedAbbreviation, ExtractOptions, UserConfig

### Community 14 - "ai/chat"
Cohesion: 0.67
Nodes (3): ChatMessage, isChatMessage(), POST()

## Knowledge Gaps
- **160 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+155 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 202 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AIChatPanel()` connect `lib/ai` to `lib/executors`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `CodeEditorPanel()` connect `lib/executors` to `src/components`, `src/lib`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _160 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lib/executors` be split into smaller, more focused modules?**
  _Cohesion score 0.05648148148148148 - nodes in this community are weakly interconnected._
- **Should `src/components` be split into smaller, more focused modules?**
  _Cohesion score 0.059562841530054644 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `src/lib` be split into smaller, more focused modules?**
  _Cohesion score 0.08309178743961353 - nodes in this community are weakly interconnected._