# Graph Report - explaino_structura  (2026-11-04)

## Corpus Check
- 147 files · ~513,526 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .example 1, .ico 1)

## Summary
- 1282 nodes · 2290 edges · 85 communities (80 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c50b646b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- executors/index.ts
- verify_web_preview_window.mjs
- Canvas Structure & Data Structures
- Excalidraw Canvas Shortcuts & Hooks
- Memory & Variable Visualizer
- ReadOnlyCanvasView.tsx
- Excalidraw Wrapper, TabBar & Auth
- VPS Proxy & External Tab Launch
- CodeMirror Dependencies & Languages
- Canvases SQLite API (CRUD & History)
- Terminal & E2B Execution Service
- VPS Proxy Helper & URL Resolvers
- AI Text Sidebar & Markdown Sanitizer
- Explaino Voice & Visual Clips
- Window Resizing & Breakpoint Tests
- TextToDiagramModal.tsx
- package.json
- challenge_m1_stress_harness.mjs
- verify_canvas_storage_tabs_share.mjs
- mistral.ts
- compilerOptions
- next
- highlight.ts
- AIChatPanel.tsx
- IframePanel.tsx
- WebPreviewPanel.tsx
- playwright
- useCanvasTabs.ts
- react
- manifest.json
- ⚡ Explaino Structura
- emmetExtension.ts
- devDependencies
- adversarial_challenger_m3_r2.mjs
- challenge_m3_2_empirical_stress.mjs
- challenge_m2_2_tabs_boundary_stress.mjs
- ExcalidrawWrapper.tsx
- IframePanel.tsx
- react
- TextToDiagramModal.tsx
- TodoOverlay.tsx
- LaserOverlay.tsx
- TodoOverlay.tsx
- createCodeCardSvg
- authSession.ts
- adversarial_m3_edge_cases.mjs
- challenge_m1_r2_empirical.mjs
- chat/route.ts
- parsePort
- Architecture Overview
- execute_15_prs_lifecycle.mjs
- adversarial_m3_stress_test.mjs
- auditor_m2_adversarial_check.mjs
- mermaid/route.ts
- code-server-login/route.ts
- ref_node_path
- scripts
- empirical_challenge_m2_tabs.mjs
- CodeEditorPanel
- proxy/route.ts
- layout.tsx
- emmet.d.ts
- challenge_m2_state_lifecycle.mjs
- verify_m2_independent_audit_r2.mjs
- CodeEditorPanel.tsx
- FileExplorer.tsx
- optionalDependencies
- postcss.config.mjs
- sw.js
- ExcalidrawErrorBoundary
- 3. Tier 1: Feature Coverage Specification
- 4. Tier 2: Boundary & Corner Cases Specification
- PdfCanvasWindow.tsx
- stress_m1_sql_injection_boundary.mjs
- audit-performance.mjs
- TEST READY: External Web Application Preview System on Excalidraw Canvas
- stress_m1_crud_concurrency.mjs
- E2E Test Infrastructure Specification: External Web Application Preview System
- 6. Tier 4: Real-World Application Scenarios
- verify_m1_sql_api.mjs
- TestReporter
- Detailed Cross-Feature Test Specifications (Selection)
- 7. Test Execution & Reporting Framework
- suppressUnloadViolation.ts

## God Nodes (most connected - your core abstractions)
1. `ExcalidrawWrapper()` - 52 edges
2. `react` - 34 edges
3. `next` - 32 edges
4. `CodeEditorPanel()` - 30 edges
5. `playwright` - 27 edges
6. `lucide-react` - 25 edges
7. `ensureDb()` - 21 edges
8. `AIChatPanel()` - 18 edges
9. `@excalidraw/excalidraw` - 17 edges
10. `GeminiLiveSession` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Architecture Overview` --includes--> `Multi-Canvas Tab Management`  [INFERRED]
  PROJECT.md → src/components/CanvasTabBar.tsx
- `Spotlight Command Palette` --discovers_actions_in--> `Architecture Overview`  [INFERRED]
  src/components/CommandPalette.tsx → PROJECT.md
- `Architecture Overview` --persists_to--> `Turso LibSQL Local SQLite DB`  [INFERRED]
  PROJECT.md → src/lib/db/index.ts
- `GET()` --calls--> `hasTeacherSession()`  [EXTRACTED]
  src/app/api/auth/session/route.ts → src/lib/authSession.ts
- `POST()` --calls--> `ensureDb()`  [EXTRACTED]
  src/app/api/canvases/[id]/clone/route.ts → src/lib/db/index.ts

## Import Cycles
- None detected.

## Communities (85 total, 5 thin omitted)

### Community 0 - "executors/index.ts"
Cohesion: 0.12
Nodes (19): cachedModules, executeC(), executeCpp(), getCompiler(), isClangLoaded(), loadCdnModule(), loadingModules, runClang() (+11 more)

### Community 1 - "verify_web_preview_window.mjs"
Cohesion: 0.18
Nodes (14): ARGS, buildVpsProxyUrl(), DOCS_DIR, main(), parseAddressInput(), reporter, RUN_STANDALONE, startMockServer() (+6 more)

### Community 2 - "Canvas Structure & Data Structures"
Cohesion: 0.07
Nodes (58): CanvasStructureControls(), CanvasStructureControlsProps, ViewportBox, ArrayPreview(), BinaryTreePreview(), BuilderState, DataStructuresPanel(), DataStructuresPanelProps (+50 more)

### Community 3 - "Excalidraw Canvas Shortcuts & Hooks"
Cohesion: 0.07
Nodes (50): @excalidraw/excalidraw, CanvasShortcutHandlers, isEditableElement(), useCanvasShortcuts(), ListMode, ListModeHandle, useListMode(), useQuickShape() (+42 more)

### Community 4 - "Memory & Variable Visualizer"
Cohesion: 0.10
Nodes (32): ArrayVisualizer(), MemoryBlock(), ObjectVisualizer(), VariableCard(), VisualizerPanel(), VisualizerPanelProps, Analysis, analyze() (+24 more)

### Community 5 - "ReadOnlyCanvasView.tsx"
Cohesion: 0.20
Nodes (12): dynamic, SharePage(), ExcalidrawCanvas(), CanvasRenderer, handTool, ReadOnlyCanvasView(), fetchCanvasData(), ReadOnlyCanvasViewProps (+4 more)

### Community 6 - "Excalidraw Wrapper, TabBar & Auth"
Cohesion: 0.10
Nodes (38): performClientLogout(), AITextSidebar, boxOf(), CodeEditorPanel, CommandPalette, CreatorAvatarIcon(), DataStructuresPanel, ExcalidrawWrapper() (+30 more)

### Community 7 - "VPS Proxy & External Tab Launch"
Cohesion: 0.11
Nodes (23): buildDirectVpsUrl, buildExternalTabUrl(), buildLocalPreviewRewriteUrl(), buildRewriteProxyUrl, buildVpsProxyUrl(), DEFAULT_DEV_SERVER_PATH, DEFAULT_DEV_SERVER_PORT, DEFAULT_PREVIEW_PATH (+15 more)

### Community 8 - "CodeMirror Dependencies & Languages"
Cohesion: 0.07
Nodes (30): dependencies, codemirror, @codemirror/commands, @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-javascript, @codemirror/lang-python (+22 more)

### Community 9 - "Canvases SQLite API (CRUD & History)"
Cohesion: 0.07
Nodes (33): dynamic, POST(), runtime, dynamic, GET(), POST(), runtime, dynamic (+25 more)

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
Cohesion: 0.09
Nodes (30): assert(), assertEqual(), classifyBreakpoint(), EmpiricalReporter, getZoomValue(), main(), runSuite1(), runSuite2() (+22 more)

### Community 15 - "TextToDiagramModal.tsx"
Cohesion: 0.13
Nodes (17): @excalidraw/mermaid-to-excalidraw, mermaid, DiagramHistoryItem, EXAMPLE_PROMPTS, ExamplePrompt, formatTimeAgo(), getDiagramType(), INITIAL_MERMAID (+9 more)

### Community 16 - "package.json"
Cohesion: 0.10
Nodes (20): eslintConfig, browserslist, name, private, version, eslint, eslint-config-next, @google/genai (+12 more)

### Community 17 - "challenge_m1_stress_harness.mjs"
Cohesion: 0.10
Nodes (20): adversarialPathInputs, adversarialPortInputs, boolFalseUrl, check(), customTokenUrl, displayUrl, failures, fallbackCases (+12 more)

### Community 18 - "verify_canvas_storage_tabs_share.mjs"
Cohesion: 0.19
Nodes (15): ANSI, ARGS, DOCS_DIR, fetchJson(), main(), reporter, runSuite1_SqlStorageApi(), runSuite2_MultiCanvasTabsUi() (+7 more)

### Community 19 - "mistral.ts"
Cohesion: 0.13
Nodes (24): ExtensionItem, ExtensionsPanel(), GoogleExtensionIcon(), AIModel, ALL_MODELS, chatComplete(), ChatMessage, chatStreamAuto() (+16 more)

### Community 20 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 21 - "next"
Cohesion: 0.14
Nodes (7): nextConfig, next, dynamic, runtime, dynamic, ExecuteBody, LANGUAGE_IDS

### Community 22 - "highlight.ts"
Cohesion: 0.14
Nodes (16): @codemirror/lang-cpp, @codemirror/lang-html, @codemirror/lang-java, @codemirror/lang-python, @codemirror/language, @codemirror/legacy-modes, code(), ALIASES (+8 more)

### Community 23 - "AIChatPanel.tsx"
Cohesion: 0.11
Nodes (16): AIChatPanel(), AIChatPanelProps, AttachedFile, DisplayMessage, loadChatHistory(), nextId(), renderMarkdown(), saveChatHistory() (+8 more)

### Community 24 - "IframePanel.tsx"
Cohesion: 0.16
Nodes (16): CANVAS_SCREEN_STORAGE_KEY, CanvasScreenMode, CanvasScreenSavedState, CanvasViewport, CODE_SERVER_SECURE_URL, IframePanel(), IframePanelLayout, IframePanelProps (+8 more)

### Community 25 - "WebPreviewPanel.tsx"
Cohesion: 0.14
Nodes (15): BREAKPOINT_PRESETS, getZoomValue(), HEADER_HEIGHT, MAX_PREVIEW_HEIGHT, MAX_PREVIEW_WIDTH, MIN_PREVIEW_HEIGHT, MIN_PREVIEW_WIDTH, WEB_PREVIEW_STORAGE_KEY (+7 more)

### Community 26 - "playwright"
Cohesion: 0.10
Nodes (4): playwright, ANSI, report(), runM2Tests()

### Community 27 - "useCanvasTabs.ts"
Cohesion: 0.21
Nodes (6): CanvasTabBarProps, ExtensionsPanelProps, useCanvasTabs(), CanvasSceneSnapshot, CanvasSnapshot, CanvasTabItem

### Community 28 - "react"
Cohesion: 0.12
Nodes (15): lucide-react, react, react-dom, EXPLAINO_AUTH_STORAGE_KEY, CommandPalette(), filterCommands(), fuzzySubsequence(), PaletteCommand (+7 more)

### Community 29 - "manifest.json"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, display_override, icons, name, orientation (+5 more)

### Community 30 - "⚡ Explaino Structura"
Cohesion: 0.10
Nodes (20): 1. Clone & Install, 2. Configure Environment Variables, 3. Run Development Server, 4. Build for Production, 🤖 AI Coding & Syntax-Highlighted Code Cards, ⚡ Command Palette (`Ctrl + Shift + P` / `Ctrl + K`), 👨‍💻 Creator & Community, 💻 Embedded VS Code / Code-Server (+12 more)

### Community 31 - "emmetExtension.ts"
Cohesion: 0.14
Nodes (19): @codemirror/commands, @codemirror/state, @codemirror/view, emmet, OPTIONS, SettingsMenu(), DEFAULTS, EditorSettings (+11 more)

### Community 32 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, playwright, tailwindcss, @tailwindcss/postcss, @types/dompurify, @types/node (+3 more)

### Community 33 - "adversarial_challenger_m3_r2.mjs"
Cohesion: 0.27
Nodes (6): ANSI, ChallengerReporter, createTestCanvas(), deleteTestCanvas(), reporter, runChallengerSuite()

### Community 34 - "challenge_m3_2_empirical_stress.mjs"
Cohesion: 0.29
Nodes (6): ChallengeReporter, fetchJson(), initialElementsSnapshot(), reporter, run(), TARGET_URL

### Community 35 - "challenge_m2_2_tabs_boundary_stress.mjs"
Cohesion: 0.31
Nodes (4): AdversarialReporter, ANSI, reporter, runAdversarialStress()

### Community 36 - "ExcalidrawWrapper.tsx"
Cohesion: 0.28
Nodes (7): dynamic, GET(), dynamic, DEFAULT_PREVIEW_PORT, isServerOfflineError(), REMOTE_VPS_ORIGIN, REMOTE_VPS_TOKEN

### Community 37 - "IframePanel.tsx"
Cohesion: 0.22
Nodes (8): C_FAMILY_SNIPPETS, CPP_SNIPPETS, DART_SNIPPETS, JAVA_SNIPPETS, JAVASCRIPT_SNIPPETS, PYTHON_SNIPPETS, SnippetDef, SNIPPETS_BY_LANGUAGE

### Community 38 - "react"
Cohesion: 0.22
Nodes (6): codemirror, @codemirror/lang-javascript, VSCodeScreenViewProps, vsDarkTheme, vsHighlight, STARTER_CODE

### Community 39 - "TextToDiagramModal.tsx"
Cohesion: 0.43
Nodes (3): ChallengeRunner, runEmpiricalChallenge(), simulateHealthRoute()

### Community 40 - "TodoOverlay.tsx"
Cohesion: 0.25
Nodes (6): t1, t2, t3, t4, t5, t6

### Community 41 - "LaserOverlay.tsx"
Cohesion: 0.36
Nodes (7): drawTipDot(), LASER_RED, LaserOverlay(), paintFrame(), tracePath(), Trail, TrailPoint

### Community 42 - "TodoOverlay.tsx"
Cohesion: 0.36
Nodes (6): loadTodos(), nextTodoId(), saveTodos(), TodoItem, TodoPanel(), TodoStatus

### Community 43 - "createCodeCardSvg"
Cohesion: 0.32
Nodes (5): createCodeCardSvg(), compensateForDarkCanvas(), hexToRgb(), rgbToHex(), toBase64()

### Community 44 - "authSession.ts"
Cohesion: 0.17
Nodes (15): dynamic, POST(), runtime, sameSecret(), dynamic, GET(), runtime, Home() (+7 more)

### Community 45 - "adversarial_m3_edge_cases.mjs"
Cohesion: 0.48
Nodes (5): fetchJson(), getSceneProbe(), makeElement(), runEdgeCases(), waitForExcalidrawApi()

### Community 46 - "challenge_m1_r2_empirical.mjs"
Cohesion: 0.29
Nodes (5): barePortCases, errors, networkEdgeCases, nonStringInputs, traversalVectors

### Community 47 - "chat/route.ts"
Cohesion: 0.48
Nodes (6): callGeminiInteraction(), callMistralChat(), ChatMessage, isChatMessage(), mapToGeminiModel(), POST()

### Community 48 - "parsePort"
Cohesion: 0.48
Nodes (7): buildDirectVpsUrl(), buildIframeUrl(), buildRewriteProxyUrl(), formatDisplayUrl(), normalizePath(), parsePort(), parseTarget()

### Community 49 - "Architecture Overview"
Cohesion: 0.40
Nodes (6): Architecture Overview, Spotlight Command Palette, Multi-Canvas Tab Management, Read-Only Zero-Barrier Sharing, Turso LibSQL Local SQLite DB, Web Preview System

### Community 50 - "execute_15_prs_lifecycle.mjs"
Cohesion: 0.40
Nodes (3): main(), prSpecs, run()

### Community 51 - "adversarial_m3_stress_test.mjs"
Cohesion: 0.53
Nodes (4): fetchJson(), makeElement(), runAdversarialTests(), waitForExcalidrawApi()

### Community 52 - "auditor_m2_adversarial_check.mjs"
Cohesion: 0.47
Nodes (4): fetchCanvasDetail(), record(), results, runAdversarialAudit()

### Community 53 - "mermaid/route.ts"
Cohesion: 0.67
Nodes (5): cleanMermaidCode(), generateMermaidWithGemini(), generateMermaidWithMistral(), getFallbackMermaid(), POST()

### Community 54 - "code-server-login/route.ts"
Cohesion: 0.47
Nodes (5): dynamic, GET(), performLogin(), POST(), runtime

### Community 55 - "ref_node_path"
Cohesion: 0.15
Nodes (9): main(), { chromium }, docsDir, require, { chromium }, docsDir, require, DOCS_DIR (+1 more)

### Community 56 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, prebuild, predev, start

### Community 57 - "empirical_challenge_m2_tabs.mjs"
Cohesion: 0.50
Nodes (4): ANSI, recordResult(), results, runEmpiricalStressTests()

### Community 58 - "CodeEditorPanel"
Cohesion: 0.22
Nodes (16): CodeEditorPanel(), defaultWorkspace(), EXT_TO_LANGUAGE, findChildByName(), findNode(), flattenFiles(), flattenFilesWithPaths(), isDuplicateName() (+8 more)

### Community 59 - "proxy/route.ts"
Cohesion: 0.50
Nodes (4): dynamic, GET(), isDisallowedUrl(), runtime

### Community 60 - "layout.tsx"
Cohesion: 0.25
Nodes (4): assistant, metadata, orbitron, viewport

### Community 61 - "emmet.d.ts"
Cohesion: 0.40
Nodes (4): emmet, ExtractedAbbreviation, ExtractOptions, UserConfig

### Community 62 - "challenge_m2_state_lifecycle.mjs"
Cohesion: 0.67
Nodes (3): ANSI, report(), runAdversarialM2()

### Community 63 - "verify_m2_independent_audit_r2.mjs"
Cohesion: 0.67
Nodes (3): record(), results, runIndependentAudit()

### Community 64 - "CodeEditorPanel.tsx"
Cohesion: 0.16
Nodes (13): baseLangExtension(), cmHighlight, cmTheme, CodeEditorPanelProps, FILE_ICON_COLORS, langExtension(), LANGUAGES, loadPanelState() (+5 more)

### Community 65 - "FileExplorer.tsx"
Cohesion: 0.21
Nodes (15): PanelState, Creating, FileExplorer(), FileExplorerProps, InlineInput(), Renaming, TreeNode(), TreeNodeProps (+7 more)

### Community 66 - "optionalDependencies"
Cohesion: 0.67
Nodes (3): optionalDependencies, lightningcss-win32-x64-msvc, @next/swc-win32-x64-msvc

### Community 70 - "ExcalidrawErrorBoundary"
Cohesion: 0.19
Nodes (6): AuthGate(), ExcalidrawErrorBoundary, Props, State, Canvas, Workspace()

### Community 71 - "3. Tier 1: Feature Coverage Specification"
Cohesion: 0.14
Nodes (14): 3. Tier 1: Feature Coverage Specification, Feature 10: External Browser Tab Launch Button, Feature 11: Remote VPS Reverse Proxy & Port Routing, Feature 12: Live Server (port 5500) Support, Feature 13: Automated Test Suite & Breakpoint Verification, Feature 1: Dedicated macOS Preview Window Frame, Feature 2: Canvas Anchoring & Side-by-Side Coexistence, Feature 3: Smooth Panning & Swiping (+6 more)

### Community 72 - "4. Tier 2: Boundary & Corner Cases Specification"
Cohesion: 0.14
Nodes (14): 4. Tier 2: Boundary & Corner Cases Specification, Boundary Cases: Feature 10 (External Tab Launch), Boundary Cases: Feature 11 (Remote VPS Reverse Proxy), Boundary Cases: Feature 12 (Live Server Port 5500), Boundary Cases: Feature 13 (Automated Test Suite), Boundary Cases: Feature 1 (macOS Window Frame), Boundary Cases: Feature 2 (Canvas Anchoring & Coexistence), Boundary Cases: Feature 3 (Smooth Panning & Swiping) (+6 more)

### Community 73 - "PdfCanvasWindow.tsx"
Cohesion: 0.20
Nodes (10): pdfjs-dist, Annotation, DrawingTool, PdfCanvasWindow(), PdfPage(), PdfWindowItem, Point, Position (+2 more)

### Community 74 - "stress_m1_sql_injection_boundary.mjs"
Cohesion: 0.22
Nodes (9): @libsql/client, destination, source, sourcePath, tableNames, assert(), failures, runAdversarialStress() (+1 more)

### Community 75 - "audit-performance.mjs"
Cohesion: 0.18
Nodes (7): { chromium }, profile, require, assets, destination, root, source

### Community 76 - "TEST READY: External Web Application Preview System on Excalidraw Canvas"
Cohesion: 0.29
Nodes (6): 1. Quick Start: Test Execution, 2. Test Architecture & Coverage Summary, 3. Acceptance Criteria Verification Matrix, 4. Test Execution Health Status, 5. Implementation Roadmap Handoff, TEST READY: External Web Application Preview System on Excalidraw Canvas

### Community 77 - "stress_m1_crud_concurrency.mjs"
Cohesion: 0.53
Nodes (5): assert(), failures, generateMockElement(), runEmpiricalStressSuite(), waitForServer()

### Community 78 - "E2E Test Infrastructure Specification: External Web Application Preview System"
Cohesion: 0.33
Nodes (5): 1.1 Test Runner & Environment, 1. Executive Architecture & 4-Tier Methodology, 2. Authoritative Sources of Truth & Expected Output Derivation, Document Metadata, E2E Test Infrastructure Specification: External Web Application Preview System

### Community 79 - "6. Tier 4: Real-World Application Scenarios"
Cohesion: 0.33
Nodes (6): 6. Tier 4: Real-World Application Scenarios, Scenario S1: Full-Stack Live Server HTML/CSS/JS Development Cycle, Scenario S2: Multi-Breakpoint Responsive Design Inspection, Scenario S3: Multi-Port Microservice Previewing & Port Switching, Scenario S4: Network Latency, Slow Loading, and Cancel/Abort Recovery, Scenario S5: Side-by-Side Dual-Window Canvas Workflow with Pan/Zoom

### Community 80 - "verify_m1_sql_api.mjs"
Cohesion: 0.60
Nodes (3): assert(), runVerification(), waitForServer()

### Community 82 - "Detailed Cross-Feature Test Specifications (Selection)"
Cohesion: 0.40
Nodes (5): 5. Tier 3: Cross-Feature Combinations (Pairwise Interactions), Detailed Cross-Feature Test Specifications (Selection), T3.C3: Interactive Resizing Dynamically Triggering Breakpoints, T3.C7: Address Bar Port Change Propagating to External Tab Launch, T3.C8: Maximize Preview Window with Dual-Window Coexistence

### Community 83 - "7. Test Execution & Reporting Framework"
Cohesion: 0.40
Nodes (5): 7.1 Playwright Test Suite File, 7.2 Execution Command, 7.3 Success & Failure Exit Criteria, 7.4 Test Artifacts, 7. Test Execution & Reporting Framework

## Knowledge Gaps
- **16 isolated node(s):** `@google/genai`, `perfect-freehand`, `react-colorful`, `zustand`, `@next/swc-win32-x64-msvc` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 555 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `ExcalidrawWrapper.tsx`, `ReadOnlyCanvasView.tsx`, `Excalidraw Wrapper, TabBar & Auth`, `ExcalidrawErrorBoundary`, `Canvases SQLite API (CRUD & History)`, `Terminal & E2B Execution Service`, `authSession.ts`, `chat/route.ts`, `package.json`, `mermaid/route.ts`, `code-server-login/route.ts`, `IframePanel.tsx`, `proxy/route.ts`, `layout.tsx`?**
  _High betweenness centrality (0.229) - this node is a cross-community bridge._
- **What connects `@google/genai`, `perfect-freehand`, `react-colorful` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `executors/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11827956989247312 - nodes in this community are weakly interconnected._
- **Why does `playwright` connect `playwright` to `adversarial_challenger_m3_r2.mjs`, `challenge_m3_2_empirical_stress.mjs`, `challenge_m2_2_tabs_boundary_stress.mjs`, `verify_web_preview_window.mjs`, `audit-performance.mjs`, `adversarial_m3_edge_cases.mjs`, `Window Resizing & Breakpoint Tests`, `package.json`, `verify_canvas_storage_tabs_share.mjs`, `adversarial_m3_stress_test.mjs`, `auditor_m2_adversarial_check.mjs`, `ref_node_path`, `empirical_challenge_m2_tabs.mjs`, `challenge_m2_state_lifecycle.mjs`, `verify_m2_independent_audit_r2.mjs`?**
  _High betweenness centrality (0.217) - this node is a cross-community bridge._
- **Should `Canvas Structure & Data Structures` be split into smaller, more focused modules?**
  _Cohesion score 0.07103825136612021 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `Canvas Structure & Data Structures`, `Excalidraw Canvas Shortcuts & Hooks`, `Memory & Variable Visualizer`, `ReadOnlyCanvasView.tsx`, `Excalidraw Wrapper, TabBar & Auth`, `Terminal & E2B Execution Service`, `AI Text Sidebar & Markdown Sanitizer`, `Explaino Voice & Visual Clips`, `TextToDiagramModal.tsx`, `package.json`, `mistral.ts`, `AIChatPanel.tsx`, `IframePanel.tsx`, `WebPreviewPanel.tsx`, `useCanvasTabs.ts`, `emmetExtension.ts`, `react`, `LaserOverlay.tsx`, `TodoOverlay.tsx`, `CodeEditorPanel.tsx`, `FileExplorer.tsx`, `ExcalidrawErrorBoundary`, `PdfCanvasWindow.tsx`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Should `Excalidraw Canvas Shortcuts & Hooks` be split into smaller, more focused modules?**
  _Cohesion score 0.07393483709273183 - nodes in this community are weakly interconnected._