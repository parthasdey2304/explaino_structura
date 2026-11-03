# Graph Report - explaino_structura  (2026-11-03)

## Corpus Check
- 265 files · ~476,953 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 2, .example 1, .db 1)

## Summary
- 1135 nodes · 2101 edges · 70 communities (64 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.85)
- Token cost: 1,250 input · 420 output

## Community Hubs (Navigation)
- Code Editor & Syntax Highlighting
- System, Process & LibSQL Storage
- Canvas Structure & Data Structures
- Excalidraw Canvas Shortcuts & Hooks
- Memory & Variable Visualizer
- App Page & Canvas Root View
- Excalidraw Wrapper, TabBar & Auth
- VPS Proxy & External Tab Launch
- CodeMirror Dependencies & Languages
- Canvases SQLite API (CRUD & History)
- Terminal & E2B Execution Service
- VPS Proxy Helper & URL Resolvers
- AI Text Sidebar & Markdown Sanitizer
- Explaino Voice & Visual Clips
- Window Resizing & Breakpoint Tests
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68

## God Nodes (most connected - your core abstractions)
1. `ExcalidrawWrapper()` - 53 edges
2. `react` - 33 edges
3. `CodeEditorPanel()` - 32 edges
4. `next` - 27 edges
5. `lucide-react` - 24 edges
6. `playwright` - 24 edges
7. `ensureDb()` - 21 edges
8. `@excalidraw/excalidraw` - 18 edges
9. `AIChatPanel()` - 18 edges
10. `GeminiLiveSession` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Architecture Overview` --includes--> `Multi-Canvas Tab Management`  [EXTRACTED]
  PROJECT.md → src/components/CanvasTabBar.tsx
- `Architecture Overview` --persists_to--> `Turso LibSQL Local SQLite DB`  [EXTRACTED]
  PROJECT.md → src/lib/db/index.ts
- `Spotlight Command Palette` --discovers_actions_in--> `Architecture Overview`  [EXTRACTED]
  src/components/CommandPalette.tsx → PROJECT.md
- `POST()` --calls--> `ensureDb()`  [EXTRACTED]
  src/app/api/canvases/[id]/history/[snapshotId]/restore/route.ts → src/lib/db/index.ts
- `GET()` --calls--> `ensureDb()`  [EXTRACTED]
  src/app/api/canvases/route.ts → src/lib/db/index.ts

## Import Cycles
- None detected.

## Communities (70 total, 6 thin omitted)

### Community 0 - "Code Editor & Syntax Highlighting"
Cohesion: 0.05
Nodes (74): baseLangExtension(), cmHighlight, cmTheme, CodeEditorPanel(), CodeEditorPanelProps, FILE_ICON_COLORS, langExtension(), LANGUAGES (+66 more)

### Community 1 - "System, Process & LibSQL Storage"
Cohesion: 0.06
Nodes (43): @libsql/client, main(), assert(), assertEqual(), classifyBreakpoint(), EmpiricalReporter, getZoomValue(), main() (+35 more)

### Community 2 - "Canvas Structure & Data Structures"
Cohesion: 0.07
Nodes (58): CanvasStructureControls(), CanvasStructureControlsProps, ViewportBox, ArrayPreview(), BinaryTreePreview(), BuilderState, DataStructuresPanel(), DataStructuresPanelProps (+50 more)

### Community 3 - "Excalidraw Canvas Shortcuts & Hooks"
Cohesion: 0.07
Nodes (49): @excalidraw/excalidraw, CanvasShortcutHandlers, isEditableElement(), useCanvasShortcuts(), ListMode, ListModeHandle, useListMode(), useQuickShape() (+41 more)

### Community 4 - "Memory & Variable Visualizer"
Cohesion: 0.10
Nodes (32): ArrayVisualizer(), MemoryBlock(), ObjectVisualizer(), VariableCard(), VisualizerPanel(), VisualizerPanelProps, Analysis, analyze() (+24 more)

### Community 5 - "App Page & Canvas Root View"
Cohesion: 0.08
Nodes (19): ExcalidrawWrapper, Home(), HomeContent(), dynamic, SharePage(), AuthGate(), AUTHORIZED_EMAIL, AUTHORIZED_PASSWORD (+11 more)

### Community 6 - "Excalidraw Wrapper, TabBar & Auth"
Cohesion: 0.12
Nodes (30): performClientLogout(), CanvasTabBar(), boxOf(), CreatorAvatarIcon(), ExcalidrawComponent, ExcalidrawWrapper(), load(), ExcalidrawWrapperProps (+22 more)

### Community 7 - "VPS Proxy & External Tab Launch"
Cohesion: 0.11
Nodes (23): buildDirectVpsUrl, buildExternalTabUrl(), buildLocalPreviewRewriteUrl(), buildRewriteProxyUrl, buildVpsProxyUrl(), DEFAULT_DEV_SERVER_PATH, DEFAULT_DEV_SERVER_PORT, DEFAULT_PREVIEW_PATH (+15 more)

### Community 8 - "CodeMirror Dependencies & Languages"
Cohesion: 0.07
Nodes (29): dependencies, codemirror, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python (+21 more)

### Community 9 - "Canvases SQLite API (CRUD & History)"
Cohesion: 0.11
Nodes (21): dynamic, POST(), runtime, dynamic, GET(), POST(), runtime, DELETE() (+13 more)

### Community 10 - "Terminal & E2B Execution Service"
Cohesion: 0.11
Nodes (13): e2b, POST(), POST(), POST(), POST(), POST(), HistoryEntry, Terminal() (+5 more)

### Community 11 - "VPS Proxy Helper & URL Resolvers"
Cohesion: 0.08
Nodes (25): buildLocalPreviewRewriteUrl, buildLocalPreviewUrl, BuildUrlOptions, buildVpsProxyUrl, DEFAULT_DEV_SERVER_PATH, DEFAULT_DEV_SERVER_PORT, isConnectionRefusedError, normalizePort (+17 more)

### Community 12 - "AI Text Sidebar & Markdown Sanitizer"
Cohesion: 0.13
Nodes (22): dompurify, marked, AITextSidebar(), AITextSidebarProps, AssistantBody(), CANONICAL_ORDER, copyText(), createSpeechRecognition() (+14 more)

### Community 13 - "Explaino Voice & Visual Clips"
Cohesion: 0.12
Nodes (18): firebase, blobToDataUrl(), buildFrameThumbs(), clipElementsToRegion(), clipSceneToRegion(), contentBBox(), ExplainoFrame, ExplainoNote (+10 more)

### Community 14 - "Window Resizing & Breakpoint Tests"
Cohesion: 0.13
Nodes (19): ARGS, BREAKPOINTS, clampDimensions(), classifyBreakpoint(), main(), MAX_HEIGHT, MAX_WIDTH, MIN_HEIGHT (+11 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (17): @excalidraw/mermaid-to-excalidraw, mermaid, DiagramHistoryItem, EXAMPLE_PROMPTS, ExamplePrompt, formatTimeAgo(), getDiagramType(), INITIAL_MERMAID (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (19): eslintConfig, name, private, version, eslint, eslint-config-next, @google/genai, lightningcss-win32-x64-msvc (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (20): adversarialPathInputs, adversarialPortInputs, boolFalseUrl, check(), customTokenUrl, displayUrl, failures, fallbackCases (+12 more)

### Community 18 - "Community 18"
Cohesion: 0.19
Nodes (15): ANSI, ARGS, DOCS_DIR, fetchJson(), main(), reporter, runSuite1_SqlStorageApi(), runSuite2_MultiCanvasTabsUi() (+7 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (19): AIModel, ALL_MODELS, chatComplete(), ChatMessage, chatStreamAuto(), DEFAULT_GEMINI_KEY, DEFAULT_MISTRAL_KEY, GEMINI_MODELS (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (9): nextConfig, next, dynamic, runtime, dynamic, runtime, dynamic, ExecuteBody (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (16): @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-python, @codemirror/language, @codemirror/legacy-modes, code(), ALIASES (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (15): AIChatPanel(), AIChatPanelProps, AttachedFile, DisplayMessage, loadChatHistory(), nextId(), renderMarkdown(), saveChatHistory() (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.16
Nodes (16): CANVAS_SCREEN_STORAGE_KEY, CanvasScreenMode, CanvasScreenSavedState, CanvasViewport, CODE_SERVER_SECURE_URL, IframePanel(), IframePanelLayout, IframePanelProps (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (17): BREAKPOINT_PRESETS, classifyBreakpoint(), getZoomValue(), HEADER_HEIGHT, loadSavedPreviewState(), MAX_PREVIEW_HEIGHT, MAX_PREVIEW_WIDTH, MIN_PREVIEW_HEIGHT (+9 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (11): CanvasTabBarProps, ExtensionsPanelProps, useCanvasTabs(), UseCanvasTabsOptions, CanvasDetail, CanvasMetadata, CanvasPayload, CanvasSnapshotItem (+3 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (12): lucide-react, react, Props, State, ExtensionItem, ExtensionsPanel(), GoogleExtensionIcon(), GoogleExtensionIconProps (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, display_override, icons, name, orientation (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.20
Nodes (8): @codemirror/commands, @codemirror/state, @codemirror/view, emmet, EmmetExpansion, snippetSource(), tryExpandEmmet(), snippetsForLanguage()

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, playwright, tailwindcss, @tailwindcss/postcss, @types/dompurify, @types/node (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.27
Nodes (6): ANSI, ChallengerReporter, createTestCanvas(), deleteTestCanvas(), reporter, runChallengerSuite()

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (6): ChallengeReporter, fetchJson(), initialElementsSnapshot(), reporter, run(), TARGET_URL

### Community 35 - "Community 35"
Cohesion: 0.31
Nodes (4): AdversarialReporter, ANSI, reporter, runAdversarialStress()

### Community 36 - "Community 36"
Cohesion: 0.28
Nodes (7): dynamic, GET(), dynamic, DEFAULT_PREVIEW_PORT, isServerOfflineError(), REMOTE_VPS_ORIGIN, REMOTE_VPS_TOKEN

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (8): C_FAMILY_SNIPPETS, CPP_SNIPPETS, DART_SNIPPETS, JAVA_SNIPPETS, JAVASCRIPT_SNIPPETS, PYTHON_SNIPPETS, SnippetDef, SNIPPETS_BY_LANGUAGE

### Community 38 - "Community 38"
Cohesion: 0.25
Nodes (6): codemirror, @codemirror/lang-javascript, VSCodeScreenViewProps, vsDarkTheme, vsHighlight, STARTER_CODE

### Community 39 - "Community 39"
Cohesion: 0.43
Nodes (3): ChallengeRunner, runEmpiricalChallenge(), simulateHealthRoute()

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (6): t1, t2, t3, t4, t5, t6

### Community 41 - "Community 41"
Cohesion: 0.36
Nodes (7): drawTipDot(), LASER_RED, LaserOverlay(), paintFrame(), tracePath(), Trail, TrailPoint

### Community 42 - "Community 42"
Cohesion: 0.36
Nodes (6): loadTodos(), nextTodoId(), saveTodos(), TodoItem, TodoPanel(), TodoStatus

### Community 43 - "Community 43"
Cohesion: 0.32
Nodes (5): createCodeCardSvg(), compensateForDarkCanvas(), hexToRgb(), rgbToHex(), toBase64()

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (4): react-dom, playTimerChime(), Stopwatch(), StopwatchProps

### Community 45 - "Community 45"
Cohesion: 0.48
Nodes (5): fetchJson(), getSceneProbe(), makeElement(), runEdgeCases(), waitForExcalidrawApi()

### Community 46 - "Community 46"
Cohesion: 0.29
Nodes (5): barePortCases, errors, networkEdgeCases, nonStringInputs, traversalVectors

### Community 47 - "Community 47"
Cohesion: 0.48
Nodes (6): callGeminiInteraction(), callMistralChat(), ChatMessage, isChatMessage(), mapToGeminiModel(), POST()

### Community 48 - "Community 48"
Cohesion: 0.48
Nodes (7): buildDirectVpsUrl(), buildIframeUrl(), buildRewriteProxyUrl(), formatDisplayUrl(), normalizePath(), parsePort(), parseTarget()

### Community 49 - "Community 49"
Cohesion: 0.40
Nodes (6): Architecture Overview, Spotlight Command Palette, Multi-Canvas Tab Management, Read-Only Zero-Barrier Sharing, Turso LibSQL Local SQLite DB, Web Preview System

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (3): main(), prSpecs, run()

### Community 51 - "Community 51"
Cohesion: 0.53
Nodes (4): fetchJson(), makeElement(), runAdversarialTests(), waitForExcalidrawApi()

### Community 52 - "Community 52"
Cohesion: 0.47
Nodes (4): fetchCanvasDetail(), record(), results, runAdversarialAudit()

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (5): cleanMermaidCode(), generateMermaidWithGemini(), generateMermaidWithMistral(), getFallbackMermaid(), POST()

### Community 54 - "Community 54"
Cohesion: 0.47
Nodes (5): dynamic, GET(), performLogin(), POST(), runtime

### Community 55 - "Community 55"
Cohesion: 0.53
Nodes (5): CommandPalette(), filterCommands(), fuzzySubsequence(), PaletteCommand, scoreCommand()

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

### Community 57 - "Community 57"
Cohesion: 0.50
Nodes (4): ANSI, recordResult(), results, runEmpiricalStressTests()

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (4): dynamic, GET(), POST(), runtime

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (4): dynamic, GET(), isDisallowedUrl(), runtime

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (4): emmet, ExtractedAbbreviation, ExtractOptions, UserConfig

### Community 62 - "Community 62"
Cohesion: 0.67
Nodes (3): ANSI, report(), runAdversarialM2()

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (3): record(), results, runIndependentAudit()

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (3): ANSI, report(), runM2Tests()

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (3): dynamic, POST(), runtime

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (3): optionalDependencies, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc

## Knowledge Gaps
- **16 isolated node(s):** `@google/genai`, `perfect-freehand`, `react-colorful`, `zustand`, `@next/swc-win32-x64-msvc` (+11 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 456 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `playwright` connect `Community 26` to `Community 64`, `Community 33`, `System, Process & LibSQL Storage`, `Community 35`, `Community 34`, `Community 45`, `Window Resizing & Breakpoint Tests`, `Community 16`, `Community 18`, `Community 51`, `Community 52`, `Community 57`, `Community 62`, `Community 63`?**
  _High betweenness centrality (0.307) - this node is a cross-community bridge._
- **What connects `@google/genai`, `perfect-freehand`, `react-colorful` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Code Editor & Syntax Highlighting` be split into smaller, more focused modules?**
  _Cohesion score 0.05119214586255259 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Community 21` to `Community 65`, `Community 36`, `App Page & Canvas Root View`, `Excalidraw Wrapper, TabBar & Auth`, `Canvases SQLite API (CRUD & History)`, `Terminal & E2B Execution Service`, `Community 47`, `Community 16`, `Community 53`, `Community 54`, `Community 58`, `Community 59`, `Community 60`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Should `System, Process & LibSQL Storage` be split into smaller, more focused modules?**
  _Cohesion score 0.05547785547785548 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Community 28` to `Code Editor & Syntax Highlighting`, `Canvas Structure & Data Structures`, `Excalidraw Canvas Shortcuts & Hooks`, `Memory & Variable Visualizer`, `App Page & Canvas Root View`, `Excalidraw Wrapper, TabBar & Auth`, `Terminal & E2B Execution Service`, `AI Text Sidebar & Markdown Sanitizer`, `Explaino Voice & Visual Clips`, `Community 15`, `Community 16`, `Community 23`, `Community 24`, `Community 25`, `Community 27`, `Community 38`, `Community 41`, `Community 42`, `Community 44`, `Community 55`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Should `Canvas Structure & Data Structures` be split into smaller, more focused modules?**
  _Cohesion score 0.07103825136612021 - nodes in this community are weakly interconnected._