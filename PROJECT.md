# Project: External Web Application Preview System on Excalidraw Canvas

## Architecture
- **Framework & Runtime**: Next.js 16.3.0 (App Router, Webpack bundler mode via `next dev --webpack`), React 19.2.8, Tailwind CSS v4, Lucide React.
- **Canvas System**: `@excalidraw/excalidraw` with dynamic viewport tracking (`scrollX`, `scrollY`, `zoom`, `offsetLeft`, `offsetTop`).
- **Window Management**: Dedicated macOS-style window component (`src/components/WebPreviewPanel.tsx`) anchored in Excalidraw virtual scene space (`scenePos: { sceneX, sceneY, sceneWidth, sceneHeight }`). Converted to screen pixels via `sceneCoordsToViewportCoords`.
- **Canvas Interaction**: Transparent overlay forwards wheel/trackpad gestures to the interactive canvas when inactive, allowing smooth panning and swiping. Positioned alongside the Code Editor window (`sceneX = codeEditorSceneX + codeEditorWidth + 40`) without displacement or closing.
- **Responsive Viewport & Breakpoints**: Interactive resizing via pointer capture updates container dimensions in real time, dynamically resizing the embedded `<iframe>` and triggering CSS media query breakpoints (<640px mobile, 768px tablet, 1024px desktop).
- **Navigation Controls**: Minimalist macOS header (`src/components/WebPreviewHeader.tsx`) containing traffic lights, back/forward history traversal, dynamic reload/cancel button (interchanging state based on loading vs idle), and an address bar with port/path configuration (defaulting to port 5500).
- **VPS Connectivity**: Remote VPS code-server reverse proxy at `https://13.49.76.201.sslip.io/proxy/<port>/` (and `/preview/:port/:path*` rewrite in Next.js).
- **External Tab Launch**: Top-right launch button opening the active web app URL in a separate browser tab on the user's local device.
- **Spotlight Search (CommandPalette)**: All application actions and tools (Web Preview, Export Image, Todos, Models, Code Editor, AI Assistant, etc.) registered in the CommandPalette for keyboard discovery (`Cmd/Ctrl+K`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Dedicated macOS Preview Window Frame | macOS-style container with 16px radius, dark surface, traffic lights, rendered on canvas | M2 | R1 |
| 2 | Canvas Anchoring & Side-by-Side Coexistence | Window rendered in Excalidraw scene space alongside Code Editor without closing or displacing it | M2, M4 | R1 |
| 3 | Smooth Panning & Swiping | Canvas gestures glide both windows smoothly across canvas coordinate space | M2 | R1 |
| 4 | Interactive Width & Height Resizing | Pointer-captured resizing handles (corner & right edge) with pointer-events protection | M2 | R1 |
| 5 | Dynamic Breakpoint Layout Changes | Resizing viewport dynamically triggers CSS media query breakpoints in rendered app | M2 | R1 |
| 6 | Minimalist Navigation Header Bar | Clean title bar integrating traffic lights, navigation, omnibox, and external launch | M3 | R2 |
| 7 | Back and Forward Navigation | Buttons traversing frame history stack when previous/next entries exist | M3 | R2 |
| 8 | Dynamic Reload / Cancel Button | Seamlessly toggles: Cancel while page is loading, Reload when idle; cancel aborts load | M3 | R2 |
| 9 | Address Bar with Port & Path Configuration | Displays current URL/port, allows configuring port/path, defaults to port 5500 | M3 | R2 |
| 10 | External Browser Tab Launch Button | Button on top right of header opens active web app in separate local browser tab | M3 | R3 |
| 11 | Remote VPS Reverse Proxy & Port Routing | Connects preview window to remote VPS localhost servers (port 5500 and arbitrary ports) | M1 | R4 |
| 12 | Live Server (port 5500) Support | End-to-end support for Live Server on remote VPS loopback | M1, M4 | R4 |
| 13 | Automated Test Suite & Breakpoint Verification | Automated tests for window layout, resizing breakpoints, navigation controls, and tab launch | E2E, M5 | Acceptance Criteria |
| 14 | Spotlight Search (CommandPalette) Discovery | All features (Export Image, Todos, Models, Web Preview, etc.) registered in Spotlight Search | M4 | Follow-up |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite Track | Design test runner, test harness, and Tiers 1-4 tests; publish TEST_READY.md | none | **DONE** |
| M1 | Remote VPS Connectivity & Proxy Routing | Next.js rewrites/routing, token injection, port/path resolving for VPS servers | none | **DONE** |
| M2 | Dedicated macOS Preview Window & Resizing | `WebPreviewPanel.tsx` scene coordinates, canvas pan/swipe, resizing, breakpoint triggers | M1 | **IN_PROGRESS** |
| M3 | Minimalist Browser Navigation Header | `WebPreviewHeader.tsx`: traffic lights, back/forward, reload/cancel, address bar, external launch | M2 | **PLANNED** |
| M4 | Canvas Integration & Window Coexistence & Spotlight Search | Integrate into `ExcalidrawWrapper.tsx`, toolbar toggle, side-by-side positioning, CommandPalette registration | M2, M3 | **PLANNED** |
| M5 | Final Milestone: E2E Test Pass & Hardening | Pass 100% of E2E test suite (Tiers 1-4), then adversarial coverage hardening (Tier 5) | E2E, M4 | **PLANNED** |

## Interface Contracts
### `WebPreviewPanel` Props & State
```ts
export interface WebPreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  viewport: {
    zoom: number;
    scrollX: number;
    scrollY: number;
    offsetLeft: number;
    offsetTop: number;
  };
  initialPort?: number; // defaults to 5500
  initialPath?: string; // defaults to "/"
  siblingWindowPos?: {
    sceneX: number;
    sceneY: number;
    sceneWidth: number;
    sceneHeight: number;
  };
}
```

### Remote VPS Proxy Endpoint Contract
```ts
// URL Resolution Contract:
// Input: port (e.g. 5500), path (e.g. "/index.html" or "/")
// Output for iframe: https://13.49.76.201.sslip.io/proxy/<port>/<path>?token=explaino_sec_8b41915d25547e2edd553bab03ea4cbd
// Output for external browser tab: same HTTPS URL with token
```

### Navigation State Contract
```ts
export interface NavigationState {
  currentUrl: string;
  port: number;
  path: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  history: string[];
  historyIndex: number;
}
```

## Code Layout
- `src/components/WebPreviewPanel.tsx`: Dedicated macOS-style window component for web app preview.
- `src/components/WebPreviewHeader.tsx`: Minimalist browser navigation header with controls.
- `src/components/ExcalidrawWrapper.tsx`: Canvas integration, viewport tracking, side-by-side layout.
- `src/components/CommandPalette.tsx`: Spotlight search palette registering all application actions.
- `src/lib/vpsProxy.ts`: VPS URL construction, port/path parsing, and security token management.
- `src/app/api/preview-health/route.ts`: Health check endpoint for VPS dev ports.
- `next.config.ts`: Rewrites for `/preview/:port/:path*` (if needed for same-origin proxying).
- `scripts/verify_web_preview_window.mjs`: Automated Playwright E2E verification test suite.
