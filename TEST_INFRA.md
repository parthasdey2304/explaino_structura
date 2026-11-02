# E2E Test Infrastructure Specification: External Web Application Preview System

## Document Metadata
- **Status**: Published & Authoritative
- **Version**: 1.0.0
- **Authors**: QA & Test Engineering Team (teamwork_test_writer_e2e_1)
- **Target Application**: Explaino Structura — External Web Application Preview System on Excalidraw Canvas
- **Source Documents**: `ORIGINAL_REQUEST.md`, `PROJECT.md`
- **Target Implementation Milestones**: M1 through M5

---

## 1. Executive Architecture & 4-Tier Methodology

This document specifies the end-to-end (E2E) opaque-box testing framework for the external web application preview window embedded on the Excalidraw canvas. The preview system enables engineers to view, interact with, and test web applications hosted on the remote VPS (e.g., Live Server on port 5500, or arbitrary local development servers) directly alongside their Code Editor on the whiteboard canvas.

The testing methodology follows a strict **4-Tier Test Architecture**:

```
+-----------------------------------------------------------------------------------+
|                           TIER 4: REAL-WORLD SCENARIOS                            |
|             (End-to-End User Journeys, Multi-Window Dev Loops, Latency)           |
+-----------------------------------------------------------------------------------+
|                       TIER 3: CROSS-FEATURE COMBINATIONS                          |
|             (Pairwise Interactions, Coexistence + Pan, Resize + Breakpoints)     |
+-----------------------------------------------------------------------------------+
|                        TIER 2: BOUNDARY & CORNER CASES                            |
|             (Extreme Dimensions, Invalid Ports, Race Conditions, Aborts)          |
+-----------------------------------------------------------------------------------+
|                          TIER 1: FEATURE COVERAGE                                 |
|             (13 Core Features x >=5 Deterministic Tests = 65 Baseline Tests)      |
+-----------------------------------------------------------------------------------+
```

### 1.1 Test Runner & Environment
- **Test Runner Engine**: Playwright (`@playwright/test` / `playwright` Chromium headless engine).
- **Automation Harness**: `scripts/verify_web_preview_window.mjs` executed via Node.js v20+.
- **Authentication Bypass**: Pre-injection of authenticated session state into `localStorage` (`explaino_auth_user`).
- **Canvas Interaction**: Direct synthetic dispatch and pointer simulation over `@excalidraw/excalidraw` interactive canvas layers.
- **Reporting & Telemetry**: Observable assertions, DOM state extraction, viewport dimension math, console/network error trapping, and visual screenshot artifacts.

---

## 2. Authoritative Sources of Truth & Expected Output Derivation

All expected outputs and assertions in this test infrastructure are strictly derived from authoritative project specifications:

1. **`ORIGINAL_REQUEST.md` (Approved Task Prompt)**:
   - **R1**: Dedicated macOS-style window frame alongside Code Editor; pan/swipe smoothly; resizable width/height dynamically triggering CSS media queries.
   - **R2**: Minimalist browser navigation header with back/forward history, dynamic reload/cancel toggle (cancel during active load, reload when idle; cancel aborts load), and address bar defaulting to port 5500.
   - **R3**: External device browser tab launch button opening active web application in local browser tab.
   - **R4**: Remote VPS connectivity and reverse proxy routing for port 5500 and arbitrary ports.
2. **`PROJECT.md` (Interface Contracts & Architecture)**:
   - **Layout Contract**: `sceneX = codeEditorSceneX + codeEditorWidth + 40` (side-by-side without overlap or displacement).
   - **Proxy Resolution Contract**: `https://13.49.76.201.sslip.io/proxy/<port>/<path>?token=explaino_sec_8b41915d25547e2edd553bab03ea4cbd`.
   - **Navigation State Contract**: `isLoading`, `canGoBack`, `canGoForward`, `currentUrl`, `port`, `path`, `history`, `historyIndex`.
   - **Breakpoint Constants**: Mobile (`< 640px`), Tablet (`768px` - `1023px`), Desktop (`>= 1024px`).

---

## 3. Tier 1: Feature Coverage Specification

Each of the 13 features defined in `PROJECT.md § Feature Inventory` is mapped to at least 5 deterministic test cases.

### Feature 1: Dedicated macOS Preview Window Frame
*Container with macOS dark surface, 16px corner radius, traffic lights (close, minimize/recenter, maximize).*

- **T1.1.1 — macOS Window Frame Existence & Styles**:
  - *Input*: Open Web Preview Window via canvas toolbar or command palette.
  - *Expected Output*: Container element exists in DOM with macOS dark surface styling (`background-color` dark/slate, `border-radius: 16px`, shadow).
  - *Assertion*: `expect(previewWindow).toHaveCSS('border-radius', '16px')` and container is visible.
- **T1.1.2 — Traffic Light Controls Presence**:
  - *Input*: Inspect header region of Web Preview Window.
  - *Expected Output*: Exactly three circular traffic light controls (close/red, yellow/recenter, green/maximize) rendered in top-left corner.
  - *Assertion*: Header contains 3 traffic buttons with distinctive colors (`#ff5f56`, `#ffbd2e`, `#27c93f`).
- **T1.1.3 — Red Traffic Light Window Dismissal**:
  - *Input*: Click red close button on Web Preview Window.
  - *Expected Output*: Web Preview Window unmounts or hides (`isOpen: false`), without unmounting Code Editor or crashing canvas.
  - *Assertion*: `expect(previewWindow).toBeHidden()` and canvas remains interactive.
- **T1.1.4 — Yellow Traffic Light Recenter**:
  - *Input*: Drag window away from viewport center, then click yellow traffic light button.
  - *Expected Output*: Window coordinates reposition to center of current Excalidraw viewport (`viewportCoordsToSceneCoords`).
  - *Assertion*: Bounding box center coordinates match canvas viewport center within +/- 20px.
- **T1.1.5 — Green Traffic Light Maximize / Restore Toggle**:
  - *Input*: Click green traffic light button when window is at default size, then click again.
  - *Expected Output*: First click expands window to near canvas viewport limits (e.g., width >= 1200px); second click restores previous dimensions.
  - *Assertion*: Window dimensions transition to maximized dimensions, then return to pre-maximized dimensions.

---

### Feature 2: Canvas Anchoring & Side-by-Side Coexistence
*Anchored in Excalidraw scene space alongside Code Editor without closing or displacing either.*

- **T1.2.1 — Simultaneous Side-by-Side Mounting**:
  - *Input*: Activate Code Editor and open Web Preview Window.
  - *Expected Output*: Both Code Editor and Web Preview Window are simultaneously visible in DOM.
  - *Assertion*: `expect(codeEditor).toBeVisible()` AND `expect(previewWindow).toBeVisible()`.
- **T1.2.2 — Horizontal Offset Non-Overlap Contract**:
  - *Input*: Inspect initial scene coordinates of both windows upon mounting.
  - *Expected Output*: `previewSceneX >= codeEditorSceneX + codeEditorWidth + 40`.
  - *Assertion*: `previewRect.left >= codeEditorRect.right + 30px` in canvas coordinate space.
- **T1.2.3 — Non-Displacement on Code Editor Focus**:
  - *Input*: Click and focus Code Editor to type code.
  - *Expected Output*: Web Preview Window remains open and visible in its position without closing or shifting.
  - *Assertion*: `previewWindow` visibility is true; preview coordinates remain unchanged.
- **T1.2.4 — Non-Displacement on Web Preview Focus**:
  - *Input*: Click inside Web Preview Window header/address bar.
  - *Expected Output*: Code Editor remains mounted with existing code buffer intact without closing.
  - *Assertion*: `codeEditor` visibility is true; editor document content is unmodified.
- **T1.2.5 — Scene Coordinates Virtual Space Persistence**:
  - *Input*: Note scene coordinates `{sceneX, sceneY}`, toggle window closed and re-open.
  - *Expected Output*: Window restores to its persisted scene coordinate location via `localStorage` state.
  - *Assertion*: Window mounts at restored `sceneX, sceneY` rather than defaulting to origin.

---

### Feature 3: Smooth Panning & Swiping
*Wheel and trackpad gestures forward smoothly across virtual canvas coordinate space.*

- **T1.3.1 — Wheel Event Forwarding over Preview Header**:
  - *Input*: Dispatch synthetic `wheel` event with `{ deltaX: 100, deltaY: 50 }` over Web Preview header.
  - *Expected Output*: Event forwards to Excalidraw canvas; canvas `scrollX` and `scrollY` update accordingly.
  - *Assertion*: Canvas viewport scroll changes proportionally without native browser scrolling.
- **T1.3.2 — Synchronized Pan Gliding of Both Windows**:
  - *Input*: Pan canvas by `deltaX = 200, deltaY = 150`.
  - *Expected Output*: Both Code Editor and Web Preview Window translate synchronously on screen.
  - *Assertion*: Relative distance `(previewRect.left - editorRect.left)` remains invariant across pan.
- **T1.3.3 — Trackpad Horizontal Swiping**:
  - *Input*: Dispatch two-finger horizontal swipe (`deltaX = 300, deltaY = 0`).
  - *Expected Output*: Canvas smoothly pans horizontally across the workspace.
  - *Assertion*: `canvas.scrollX` decreases by 300; both windows move left across viewport.
- **T1.3.4 — Canvas Zoom Coordinate Scaling**:
  - *Input*: Dispatch pinch-to-zoom (`ctrlKey: true, deltaY: -50`) to zoom in canvas.
  - *Expected Output*: Both windows scale their rendered screen dimensions via `sceneCoordsToViewportCoords`.
  - *Assertion*: Window viewport width/height scale by zoom factor `zoom.value`.
- **T1.3.5 — Inactive Overlay Pointer-Events Forwarding**:
  - *Input*: Hover over preview window when inactive (`isActive: false`).
  - *Expected Output*: Dragging/panning gestures pass through overlay to canvas underneath.
  - *Assertion*: Pointer events on canvas trigger canvas pan without trapping mouse in iframe.

---

### Feature 4: Interactive Width & Height Resizing
*Pointer-captured resizing handles with pointer-events protection and dynamic dimension updates.*

- **T1.4.1 — Resizing Handle Visibility & Cursor Style**:
  - *Input*: Inspect right edge and bottom-right corner of Web Preview Window.
  - *Expected Output*: Resizing handles exist with appropriate CSS cursors (`ew-resize` and `nwse-resize`).
  - *Assertion*: Resizing handle elements exist; computed `cursor` matches resize direction.
- **T1.4.2 — Drag Width Resizing via Right Handle**:
  - *Input*: Drag right resize handle horizontally by +200px.
  - *Expected Output*: Window width increases by 200px in real time; embedded iframe width updates to match.
  - *Assertion*: `previewWindow.clientWidth` increases by `200px +/- 2px`.
- **T1.4.3 — Drag Height Resizing via Bottom-Right Corner**:
  - *Input*: Drag bottom-right corner handle diagonally by `(dx: +150px, dy: +100px)`.
  - *Expected Output*: Both width and height increase smoothly; iframe dimensions track container.
  - *Assertion*: Width increased by 150px, height increased by 100px.
- **T1.4.4 — Iframe Mouse-Trap Protection during Resize**:
  - *Input*: Initiate pointer drag over resize handle and move pointer across embedded iframe.
  - *Expected Output*: Pointer capture or overlay overlay activates; iframe does not consume pointer events.
  - *Assertion*: Mouse drag continues uninterrupted; no pointer events drop or stutter during drag.
- **T1.4.5 — Minimum Dimension Constraints**:
  - *Input*: Drag corner handle inward attempting to reduce size to `100px x 100px`.
  - *Expected Output*: Resizing clamps to minimum allowable dimensions (e.g., width >= 320px, height >= 240px).
  - *Assertion*: `previewWindow.clientWidth >= 320` and `previewWindow.clientHeight >= 240`.

---

### Feature 5: Dynamic Breakpoint Layout Changes
*Resizing viewport dynamically triggers CSS media query breakpoints (<640px, 768px, 1024px).*

- **T1.5.1 — Mobile Breakpoint Trigger (< 640px)**:
  - *Input*: Resize Web Preview Window width to 500px (`< 640px`).
  - *Expected Output*: Rendered web page matches `@media (max-width: 639px)`; mobile layout/styles activate.
  - *Assertion*: Iframe inner document evaluates `window.matchMedia('(max-width: 639px)').matches === true`.
- **T1.5.2 — Tablet Breakpoint Trigger (768px - 1023px)**:
  - *Input*: Resize Web Preview Window width to 768px.
  - *Expected Output*: Rendered web page matches `@media (min-width: 768px) and (max-width: 1023px)`; tablet layout activates.
  - *Assertion*: Iframe inner document evaluates tablet media query to `true`.
- **T1.5.3 — Desktop Breakpoint Trigger (>= 1024px)**:
  - *Input*: Resize Web Preview Window width to 1200px (`>= 1024px`).
  - *Expected Output*: Rendered web page matches `@media (min-width: 1024px)`; desktop navigation and multi-column grid render.
  - *Assertion*: Iframe inner document evaluates desktop media query to `true`.
- **T1.5.4 — Dynamic Bidirectional Breakpoint Transition**:
  - *Input*: Drag resize handle continuously from 400px up to 1100px, then back down to 500px.
  - *Expected Output*: Breakpoints transition dynamically without requiring iframe reload.
  - *Assertion*: Styles dynamically update in real time from mobile -> tablet -> desktop -> mobile.
- **T1.5.5 — Responsive Dimension Indicator in Header**:
  - *Input*: Resize window width and observe header dimension readout.
  - *Expected Output*: Header displays active viewport pixel dimensions (e.g. `500 x 600 px`).
  - *Assertion*: Text indicator in header matches current iframe dimensions.

---

### Feature 6: Minimalist Navigation Header Bar
*Clean title bar integrating traffic lights, navigation, omnibox, and external launch.*

- **T1.6.1 — Header Controls Layout & Hierarchy**:
  - *Input*: Inspect preview window header bar.
  - *Expected Output*: Linear uncluttered layout: Left traffic lights, center navigation (back, forward, reload/cancel, address bar), right external launch button.
  - *Assertion*: Elements rendered in correct horizontal flex order without wrapping or clipping.
- **T1.6.2 — Visual Contrast & Sleek macOS Theme**:
  - *Input*: Check computed styles of header container.
  - *Expected Output*: Dark header surface with subtle border divider, clean icon buttons, and muted typography.
  - *Assertion*: Header has border-bottom separating controls from the preview content.
- **T1.6.3 — Control Hover States & Tooltips**:
  - *Input*: Hover over back, forward, reload, and launch buttons.
  - *Expected Output*: Buttons display subtle hover background highlights and informative `title` tooltips.
  - *Assertion*: Hover triggers CSS background color transition; `title` attribute is present on all buttons.
- **T1.6.4 — Responsive Header Truncation**:
  - *Input*: Reduce window width to 360px.
  - *Expected Output*: Address bar smoothly shrinks with ellipsis truncation; button controls remain clickable.
  - *Assertion*: Buttons do not overflow or overlap; address bar text truncates cleanly.
- **T1.6.5 — Keyboard Focus Accessibility in Header**:
  - *Input*: Press Tab key to navigate through header controls.
  - *Expected Output*: Focus moves in sequence: Back -> Forward -> Reload -> Address Bar -> External Launch.
  - *Assertion*: `document.activeElement` matches the expected control sequence.

---

### Feature 7: Back and Forward Navigation
*History traversal buttons traversing frame browsing history.*

- **T1.7.1 — Initial State Disabled Buttons**:
  - *Input*: Open fresh Web Preview Window with initial URL.
  - *Expected Output*: Back and forward buttons are disabled (or have disabled styling) since no history exists.
  - *Assertion*: `backBtn.disabled === true` AND `forwardBtn.disabled === true` (or `aria-disabled="true"`).
- **T1.7.2 — Back Button Enabled upon Subpage Navigation**:
  - *Input*: In address bar, navigate from `/` to `/about.html`.
  - *Expected Output*: Page loads `/about.html`; back button becomes enabled; forward button remains disabled.
  - *Assertion*: `backBtn.disabled === false` AND `forwardBtn.disabled === true`.
- **T1.7.3 — Back Button Traversal**:
  - *Input*: Click Back button after navigating to `/about.html`.
  - *Expected Output*: Frame navigates back to `/`; address bar updates to `/`; forward button becomes enabled.
  - *Assertion*: Iframe location returns to `/`; `forwardBtn.disabled === false`.
- **T1.7.4 — Forward Button Traversal**:
  - *Input*: Click Forward button after traversing back.
  - *Expected Output*: Frame traverses forward to `/about.html`; address bar updates to `/about.html`.
  - *Assertion*: Iframe location returns to `/about.html`; forward button disables at history tip.
- **T1.7.5 — Multi-Step History Stack Traversal**:
  - *Input*: Navigate `A -> B -> C`, click Back twice to return to `A`, then Forward once to `B`.
  - *Expected Output*: Address bar and frame state accurately track history index at each step.
  - *Assertion*: URL reflects `A`, then `B`, with both Back and Forward buttons enabled.

---

### Feature 8: Dynamic Reload / Cancel Button
*Seamlessly interchanges: Cancel/Stop during active load, Reload when idle; Cancel aborts load.*

- **T1.8.1 — Idle State Displays Reload Control**:
  - *Input*: Observe button when page has finished loading.
  - *Expected Output*: Button displays circular reload / refresh icon (`RotateCw` / `RefreshCw`).
  - *Assertion*: Button icon corresponds to reload; tooltip reads "Reload" or "Refresh".
- **T1.8.2 — Active Loading State Displays Cancel Control**:
  - *Input*: Trigger navigation to a large or delayed page.
  - *Expected Output*: Button instantly switches to Cancel / Stop icon (`X` or `Square`).
  - *Assertion*: Button state reflects `isLoading === true`; icon is cancel/stop; tooltip reads "Stop" or "Cancel".
- **T1.8.3 — Clicking Reload Triggers Page Refresh**:
  - *Input*: Click Reload button while idle.
  - *Expected Output*: Iframe reloads its current source; reload event fires.
  - *Assertion*: Iframe reload counter or `load` event fires on the iframe element.
- **T1.8.4 — Clicking Cancel Aborts Active Page Load**:
  - *Input*: Click Cancel button while page is actively loading.
  - *Expected Output*: Active navigation is aborted immediately; button transitions back to Reload icon.
  - *Assertion*: Loading state reverts to `isLoading === false`; button icon reverts to reload.
- **T1.8.5 — Automatic Reversion to Reload upon Load Completion**:
  - *Input*: Allow slow loading page to complete loading naturally.
  - *Expected Output*: As soon as `load` event fires, button automatically transitions from Cancel to Reload.
  - *Assertion*: `isLoading` turns false; reload button is visible.

---

### Feature 9: Address Bar with Port & Path Configuration
*Displays current URL/port, allows configuring port/path, defaults to port 5500.*

- **T1.9.1 — Default Port 5500 Initialization**:
  - *Input*: Inspect address bar upon initial mount without custom props.
  - *Expected Output*: Address bar displays port `5500` (e.g. `http://localhost:5500/` or `:5500/`).
  - *Assertion*: Address input value contains `5500` and path `/`.
- **T1.9.2 — Port Editing and Enter Key Navigation**:
  - *Input*: Click address bar, replace `5500` with `3000`, and press `Enter`.
  - *Expected Output*: Preview target updates to port 3000; iframe src updates to proxy port 3000.
  - *Assertion*: Iframe `src` contains `/proxy/3000/`.
- **T1.9.3 — Path Editing and Navigation**:
  - *Input*: Append `test.html` to address bar (e.g. `:5500/test.html`) and press `Enter`.
  - *Expected Output*: Iframe navigates to target path `/test.html`.
  - *Assertion*: Iframe `src` contains `/proxy/5500/test.html`.
- **T1.9.4 — Active URL Synchronization on In-Frame Link Click**:
  - *Input*: Click a link inside the preview iframe navigating from `/index.html` to `/subpage.html`.
  - *Expected Output*: Address bar text automatically synchronizes to reflect new path `/subpage.html`.
  - *Assertion*: Address input value matches updated path.
- **T1.9.5 — Port Selection Preset Dropdown / Quick Switch**:
  - *Input*: Click port selector or quick switch menu.
  - *Expected Output*: Common ports shown (5500 Live Server, 3000 Next.js, 5173 Vite, 8080 HTTP).
  - *Assertion*: Selecting port 5173 updates address bar and triggers preview reload.

---

### Feature 10: External Browser Tab Launch Button
*Button on top right of header opens active web app in separate local browser tab.*

- **T1.10.1 — External Launch Button Presence**:
  - *Input*: Inspect top-right corner of preview window header.
  - *Expected Output*: Launch button with external link icon (`ExternalLink`) is rendered.
  - *Assertion*: `expect(launchBtn).toBeVisible()`.
- **T1.10.2 — Target URL Generation with Port & Path**:
  - *Input*: Set address bar to port 5500 and path `/app.html`, click External Launch button.
  - *Expected Output*: Browser triggers `window.open` targeting `https://13.49.76.201.sslip.io/proxy/5500/app.html`.
  - *Assertion*: Intercepted open URL has host `13.49.76.201.sslip.io`, port path `5500`, and file `app.html`.
- **T1.10.3 — Security Token Injection in External URL**:
  - *Input*: Verify query parameters of generated external launch URL.
  - *Expected Output*: URL contains required `token=explaino_sec_8b41915d25547e2edd553bab03ea4cbd`.
  - *Assertion*: `new URL(openedUrl).searchParams.get('token') === 'explaino_sec_8b41915d25547e2edd553bab03ea4cbd'`.
- **T1.10.4 — Blank Target & Noopener Rel Attribute**:
  - *Input*: Inspect link or `window.open` parameters.
  - *Expected Output*: External tab opens with `target="_blank"` and `rel="noopener noreferrer"` for security.
  - *Assertion*: Security attributes prevent reverse tab hijacking.
- **T1.10.5 — External Launch with Dynamic Port Change**:
  - *Input*: Change port to 8080, then immediately click External Launch button.
  - *Expected Output*: Opened URL targets port 8080 (`/proxy/8080/`).
  - *Assertion*: Opened URL dynamically reflects current address bar state.

---

### Feature 11: Remote VPS Reverse Proxy & Port Routing
*Connects preview window to remote VPS localhost servers (port 5500 and arbitrary ports).*

- **T1.11.1 — VPS Domain & Reverse Proxy Routing**:
  - *Input*: Configure preview window to port 5500.
  - *Expected Output*: Target resolves to `https://13.49.76.201.sslip.io/proxy/5500/`.
  - *Assertion*: Network request reaches reverse proxy domain with SSL validation.
- **T1.11.2 — Arbitrary Port Routing (Vite port 5173)**:
  - *Input*: Configure preview window to port 5173.
  - *Expected Output*: Target resolves to `https://13.49.76.201.sslip.io/proxy/5173/`.
  - *Assertion*: Request targets port 5173 without hardcoded port restrictions.
- **T1.11.3 — Next.js Route Rewrite Proxy Fallback**:
  - *Input*: Configure same-origin proxy `/preview/5500/index.html`.
  - *Expected Output*: Next.js server proxies request to VPS loopback without CORS violations.
  - *Assertion*: HTTP response status is 200 OK.
- **T1.11.4 — Web Socket / HMR Tunneling Compatibility**:
  - *Input*: Connect to a dev server requiring WebSocket / hot-reloading.
  - *Expected Output*: Reverse proxy handles Upgrade headers for WebSockets without connection termination.
  - *Assertion*: WebSocket handshake succeeds or fallback polling functions.
- **T1.11.5 — Security Token Forwarding & Header Sanitization**:
  - *Input*: Verify proxy request headers and query parameters.
  - *Expected Output*: Security token is included; unauthorized requests are rejected with 401/403.
  - *Assertion*: Proxied request carries authenticating credentials.

---

### Feature 12: Live Server (port 5500) Support
*End-to-end support for Live Server on remote VPS loopback.*

- **T1.12.1 — Live Server Default Route Auto-Loading**:
  - *Input*: Open preview window without supplying specific file path.
  - *Expected Output*: Automatically queries default Live Server root (`/proxy/5500/`).
  - *Assertion*: Iframe attempts connection to port 5500.
- **T1.12.2 — Live Server HTML Injection Compatibility**:
  - *Input*: Load an HTML document served by Live Server containing its injected `<script>` tag.
  - *Expected Output*: Live Server script executes inside iframe without throwing sandbox security errors.
  - *Assertion*: Console does not report fatal script execution errors; live-reload listener attaches.
- **T1.12.3 — Live Server Asset Path Resolution**:
  - *Input*: Load page with relative assets (`<link href="style.css">`, `<img src="logo.png">`).
  - *Expected Output*: Assets resolve relative to `/proxy/5500/` and load correctly.
  - *Assertion*: Styles and images load with HTTP 200.
- **T1.12.4 — Live Server Port Offline Notice / Retry**:
  - *Input*: Connect to port 5500 when Live Server extension is stopped.
  - *Expected Output*: Clean offline / connection error overlay with Retry button.
  - *Assertion*: Informative UI displays "Live Server not detected on port 5500" with "Retry" action.
- **T1.12.5 — Live Server Auto-Refresh on File Change**:
  - *Input*: Simulate live-reload trigger message from Live Server.
  - *Expected Output*: Iframe content refreshes automatically.
  - *Assertion*: Preview DOM reflects new content.

---

### Feature 13: Automated Test Suite & Breakpoint Verification
*Automated tests for window layout, resizing breakpoints, navigation controls, and tab launch.*

- **T1.13.1 — Automated Test Script Execution**:
  - *Input*: Execute `node scripts/verify_web_preview_window.mjs`.
  - *Expected Output*: Test runner launches Playwright, executes test suites, and exits with detailed log.
  - *Assertion*: Process exits with code 0 on test success.
- **T1.13.2 — Test Result Metric Aggregation**:
  - *Input*: Run test suite.
  - *Expected Output*: Terminal displays summary table with total tests, passed, failed, and duration.
  - *Assertion*: Summary statistics output to stdout.
- **T1.13.3 — Visual Regression & Artifact Capture**:
  - *Input*: Run test suite in artifact-generation mode.
  - *Expected Output*: Screenshots of window layout at breakpoints captured in `public/docs/`.
  - *Assertion*: Screenshot files exist and are non-empty.
- **T1.13.4 — Error Boundary & Crash Detection in Test Runner**:
  - *Input*: Simulate unhandled React error in preview window during test.
  - *Expected Output*: Test runner catches page error, reports stack trace, and logs failure.
  - *Assertion*: Unhandled browser error causes test failure.
- **T1.13.5 — Configurable Target URL Flag**:
  - *Input*: Execute `node scripts/verify_web_preview_window.mjs --url http://127.0.0.1:3000`.
  - *Expected Output*: Test suite targets provided URL rather than default.
  - *Assertion*: Log verifies connection to custom URL.

---

## 4. Tier 2: Boundary & Corner Cases Specification

Each of the 13 features is evaluated under boundary conditions, stress states, and corner edge cases (>=5 test cases per feature).

### Boundary Cases: Feature 1 (macOS Window Frame)
- **T2.B1.1 — Rapid Successive Traffic Light Clicking**:
  - *Boundary Condition*: Click green maximize button 10 times in 500ms.
  - *Expected Behavior*: State toggles cleanly without race conditions or stuck intermediate states.
  - *Failure Mitigated*: Desynchronized maximize/restore state or UI freeze.
- **T2.B1.2 — Extreme Canvas Zoom Out (0.1x)**:
  - *Boundary Condition*: Zoom out Excalidraw canvas to 10% (`zoom: 0.1`).
  - *Expected Behavior*: Window frame scales proportionally; traffic lights remain visually intact without clipping.
  - *Failure Mitigated*: Floating point overflow or NaN transform coordinates.
- **T2.B1.3 — Extreme Canvas Zoom In (5.0x)**:
  - *Boundary Condition*: Zoom in Excalidraw canvas to 500% (`zoom: 5.0`).
  - *Expected Behavior*: Window frame scales without breaking layout or overflowing parent boundaries.
  - *Failure Mitigated*: Visual distortion or crash under high zoom.
- **T2.B1.4 — Zero / Negative Initial Scene Coordinates**:
  - *Boundary Condition*: Stored scene state contains negative coordinates `{ sceneX: -5000, sceneY: -5000 }`.
  - *Expected Behavior*: Window handles negative scene space gracefully or recenters within viewport.
  - *Failure Mitigated*: Invisible off-canvas window permanently lost to user.
- **T2.B1.5 — LocalStorage Corruption Recovery**:
  - *Boundary Condition*: Stored window state in `localStorage` contains invalid JSON (`"corrupted{{{{..."`).
  - *Expected Behavior*: Window falls back to default side-by-side coordinates without throwing uncaught exception.
  - *Failure Mitigated*: Application crash on initial mount.

---

### Boundary Cases: Feature 2 (Canvas Anchoring & Coexistence)
- **T2.B2.1 — Multi-Window Overlap Threshold**:
  - *Boundary Condition*: Place Code Editor at maximum canvas right boundary (`sceneX = 10000`).
  - *Expected Behavior*: Web Preview Window calculates `sceneX = 10000 + codeEditorWidth + 40` without arithmetic wrap.
  - *Failure Mitigated*: Coordinate collision or overlapping windows.
- **T2.B2.2 — Code Editor Sudden Resize**:
  - *Boundary Condition*: Dynamically change Code Editor width from 800px to 1400px.
  - *Expected Behavior*: Web Preview Window does not overlap; auto-adjusts or preserves clear gap.
  - *Failure Mitigated*: Overlapping panels obscuring code or preview.
- **T2.B2.3 — Rapid Alternating Window Focus**:
  - *Boundary Condition*: Alternate focus between Code Editor and Web Preview 50 times rapidly.
  - *Expected Behavior*: Both windows preserve active buffers, cursors, and scroll positions without flickering.
  - *Failure Mitigated*: Focus thrashing or state re-initialization.
- **T2.B2.4 — Closing Code Editor Independent Lifecycle**:
  - *Boundary Condition*: Close Code Editor while Web Preview is active.
  - *Expected Behavior*: Web Preview Window remains open and operational on canvas.
  - *Failure Mitigated*: Cascade unmounting of preview window.
- **T2.B2.5 — Closing Web Preview Independent Lifecycle**:
  - *Boundary Condition*: Close Web Preview Window while Code Editor is actively compiling code.
  - *Expected Behavior*: Code Editor execution continues uninterrupted.
  - *Failure Mitigated*: Interrupted terminal or code execution.

---

### Boundary Cases: Feature 3 (Smooth Panning & Swiping)
- **T2.B3.1 — High-Frequency Wheel Event Storm**:
  - *Boundary Condition*: Dispatch 200 synthetic wheel events in 100ms.
  - *Expected Behavior*: Canvas pans smoothly via `requestAnimationFrame` debouncing without dropping frames.
  - *Failure Mitigated*: Event loop lag or browser stutter.
- **T2.B3.2 — Diagonal Trackpad Swipes with Fractional Deltas**:
  - *Boundary Condition*: Wheel event with fractional values `{ deltaX: 0.333, deltaY: 0.667 }`.
  - *Expected Behavior*: Canvas coordinates update with subpixel accuracy without rounding accumulation error.
  - *Failure Mitigated*: Jittery panning movement.
- **T2.B3.3 — Wheel Event with Active Iframe Selection**:
  - *Boundary Condition*: User is highlighting text inside preview iframe while scrolling wheel.
  - *Expected Behavior*: Wheel events inside active iframe scroll iframe content; wheel events on header pan canvas.
  - *Failure Mitigated*: Accidental canvas pan while attempting to read web page content.
- **T2.B3.4 — Panning across Viewport Boundaries**:
  - *Boundary Condition*: Pan canvas until preview window is partially off-screen.
  - *Expected Behavior*: Window renders partially clipped by canvas container without DOM layout break.
  - *Failure Mitigated*: Canvas viewport overflow or scrollbar appearance.
- **T2.B3.5 — Shift-Key Modified Horizontal Scroll**:
  - *Boundary Condition*: Dispatch wheel event with `shiftKey: true, deltaY: 100`.
  - *Expected Behavior*: Converted correctly to horizontal canvas scroll (`deltaX`).
  - *Failure Mitigated*: Ignoring standard macOS horizontal scroll gesture.

---

### Boundary Cases: Feature 4 (Interactive Resizing)
- **T2.B4.1 — Exact Boundary Pixel Resize (639px vs 640px)**:
  - *Boundary Condition*: Resize window to exactly 639px, then exactly 640px.
  - *Expected Behavior*: 639px evaluates `< 640px` (mobile); 640px evaluates `>= 640px` (tablet).
  - *Failure Mitigated*: Off-by-one pixel breakpoint logic errors.
- **T2.B4.2 — Dragging Resize Handle Outside Canvas Viewport**:
  - *Boundary Condition*: Drag resize handle 500px beyond screen edge.
  - *Expected Behavior*: Pointer capture continues tracking; releasing mouse cleanly terminates resize.
  - *Failure Mitigated*: Stuck resizing state ("sticky mouse").
- **T2.B4.3 — Zero Delta Pointer Movement**:
  - *Boundary Condition*: Mouse down on resize handle without moving, then mouse up.
  - *Expected Behavior*: Dimensions remain exactly unchanged; no unnecessary re-renders.
  - *Failure Mitigated*: Micro-resizing jitter or iframe reload.
- **T2.B4.4 — Window Width Exceeding Maximum Viewport**:
  - *Boundary Condition*: Drag width to 5000px.
  - *Expected Behavior*: Clamped to maximum allowed scene width (e.g. 3840px) or scales cleanly.
  - *Failure Mitigated*: Memory exhaustion from huge iframe rendering.
- **T2.B4.5 — Rapid Mouse Release and Immediate Drag**:
  - *Boundary Condition*: Release resize drag and immediately click-drag again within 5ms.
  - *Expected Behavior*: Second drag initializes cleanly without referencing stale drag start coordinates.
  - *Failure Mitigated*: Sudden jump in window size.

---

### Boundary Cases: Feature 5 (Dynamic Breakpoints)
- **T2.B5.1 — Boundary Pixel 767px vs 768px**:
  - *Boundary Condition*: Transition from 767px to 768px.
  - *Expected Behavior*: Layout transitions precisely from mobile to tablet.
  - *Failure Mitigated*: Overlapping or unhandled media query ranges.
- **T2.B5.2 — Boundary Pixel 1023px vs 1024px**:
  - *Boundary Condition*: Transition from 1023px to 1024px.
  - *Expected Behavior*: Layout transitions precisely from tablet to desktop.
  - *Failure Mitigated*: Broken layout on standard 1024px desktop breakpoint.
- **T2.B5.3 — Viewport Height-Constrained Media Queries**:
  - *Boundary Condition*: Resize height to 200px while width is 1200px.
  - *Expected Behavior*: CSS `@media (max-height: 400px)` rules fire without affecting width queries.
  - *Failure Mitigated*: Height/width cross-contamination in media query evaluation.
- **T2.B5.4 — Orientation Breakpoints**:
  - *Boundary Condition*: Dimensions where `width < height` (portrait) vs `width > height` (landscape).
  - *Expected Behavior*: `@media (orientation: portrait)` and `(orientation: landscape)` respond accurately.
  - *Failure Mitigated*: Broken mobile orientation testing.
- **T2.B5.5 — High DPI (Retina) Viewport Emulation**:
  - *Boundary Condition*: Browser device pixel ratio set to `window.devicePixelRatio = 2`.
  - *Expected Behavior*: CSS pixel dimensions in iframe match container dimensions regardless of DPR.
  - *Failure Mitigated*: Miscalculated breakpoints on high-density displays.

---

### Boundary Cases: Feature 6 (Navigation Header Bar)
- **T2.B6.1 — Super Long URL Text in Address Bar**:
  - *Boundary Condition*: Path contains 1000 characters (`/very/deep/.../index.html?param=value...`).
  - *Expected Behavior*: Text truncates gracefully with horizontal scroll or ellipsis; buttons remain fully accessible.
  - *Failure Mitigated*: Layout blowout pushing action buttons off-screen.
- **T2.B6.2 — Ultra-Narrow Header Width (320px)**:
  - *Boundary Condition*: Resize window to minimum 320px.
  - *Expected Behavior*: Header collapses or adapts gracefully without visual clipping of vital controls.
  - *Failure Mitigated*: Overlapping text and buttons.
- **T2.B6.3 — Special Characters in Path**:
  - *Boundary Condition*: Address bar contains spaces, Unicode, or encoded characters (`/test%20folder/日本語.html`).
  - *Expected Behavior*: URL encoder handles characters properly without breaking proxy routing.
  - *Failure Mitigated*: Malformed URI exceptions.
- **T2.B6.4 — Rapid Repeated Clicking on Header Action Buttons**:
  - *Boundary Condition*: Click external launch button 10 times in 1 second.
  - *Expected Behavior*: Debounced or cleanly handles tab openings without browser hang.
  - *Failure Mitigated*: Popup spam or browser freeze.
- **T2.B6.5 — Empty Address Bar Submission**:
  - *Boundary Condition*: User clears address bar input completely and presses Enter.
  - *Expected Behavior*: Reverts to default path `/` or retains previous valid URL.
  - *Failure Mitigated*: Blank navigation error or undefined URL.

---

### Boundary Cases: Feature 7 (Back & Forward Navigation)
- **T2.B7.1 — Back Button at History Root**:
  - *Boundary Condition*: User clicks Back button when history index is 0.
  - *Expected Behavior*: Click is ignored or button is disabled; does not navigate out of preview.
  - *Failure Mitigated*: Parent window navigating back or leaving canvas.
- **T2.B7.2 — Forward Button at History Tip**:
  - *Boundary Condition*: User clicks Forward button when history index is at latest page.
  - *Expected Behavior*: Click is ignored; forward button remains disabled.
  - *Failure Mitigated*: Attempted navigation to undefined history entry.
- **T2.B7.3 — Branching History on New Navigation**:
  - *Boundary Condition*: User goes back 2 pages in history, then enters a new URL.
  - *Expected Behavior*: Forward history is truncated; new URL becomes new history tip.
  - *Failure Mitigated*: Stale forward history causing corrupted navigation stack.
- **T2.B7.4 — Deep History Traversal (50 entries)**:
  - *Boundary Condition*: Navigate through 50 successive pages and traverse back.
  - *Expected Behavior*: Memory consumption remains bounded; history stack operates accurately.
  - *Failure Mitigated*: Memory leak in history array.
- **T2.B7.5 — Cross-Origin History Traversal Restrictions**:
  - *Boundary Condition*: Page navigates across different internal proxy paths.
  - *Expected Behavior*: Navigation stack preserves state even when iframe sandbox security policies restrict `window.history`.
  - *Failure Mitigated*: SecurityError thrown from cross-origin iframe history access.

---

### Boundary Cases: Feature 8 (Dynamic Reload / Cancel Button)
- **T2.B8.1 — Immediate Cancel (< 10ms after Navigation)**:
  - *Boundary Condition*: Click Cancel button immediately after triggering navigation.
  - *Expected Behavior*: Iframe loading halts; `window.stop()` or equivalent halts network connection.
  - *Failure Mitigated*: Race condition where cancel is clicked after load completes.
- **T2.B8.2 — Cancel on Already Failed Request (404/500)**:
  - *Boundary Condition*: Click Cancel while error page is rendering.
  - *Expected Behavior*: Cleanly transitions to idle Reload state without getting stuck in loading.
  - *Failure Mitigated*: Infinite loading spinner state.
- **T2.B8.3 — Repeated Reload Rapid Fire**:
  - *Boundary Condition*: Click Reload button 5 times rapidly.
  - *Expected Behavior*: Each reload supersedes previous; cancels in-flight request and re-requests.
  - *Failure Mitigated*: Stale request race condition or server overload.
- **T2.B8.4 — Infinite Pending Request Timeout**:
  - *Boundary Condition*: Server does not respond for 30 seconds.
  - *Expected Behavior*: Cancel button remains available and operational throughout entire duration.
  - *Failure Mitigated*: User trapped in unresponsive loading state.
- **T2.B8.5 — Reversion to Reload on Network Abort**:
  - *Boundary Condition*: Server resets connection (ECONNRESET) mid-transfer.
  - *Expected Behavior*: Button transitions from Cancel back to Reload when connection fails.
  - *Failure Mitigated*: Desynchronized button icon vs actual loading status.

---

### Boundary Cases: Feature 9 (Address Bar Configuration)
- **T2.B9.1 — Non-Numeric Port Entry**:
  - *Boundary Condition*: User types `port: "abc"` or `"80-invalid"` into address bar.
  - *Expected Behavior*: Input validation rejects non-numeric port; displays error toast or reverts to 5500.
  - *Failure Mitigated*: Malformed proxy URL construction.
- **T2.B9.2 — Out of Range Port Entry (Port 0 or 70000)**:
  - *Boundary Condition*: User inputs port `0` or `65536`.
  - *Expected Behavior*: Clamped or rejected as invalid TCP port range (`1-65535`).
  - *Failure Mitigated*: Operating system socket error.
- **T2.B9.3 — Path with Leading / Trailing Slashes**:
  - *Boundary Condition*: User inputs `///index.html` or `folder/`.
  - *Expected Behavior*: Path normalizer standardizes path to `/index.html` and `/folder/`.
  - *Failure Mitigated*: Malformed double slashes `//` in reverse proxy routing.
- **T2.B9.4 — Query Parameters and Hash Fragments in Address Bar**:
  - *Boundary Condition*: Input `:5500/dashboard?user=123#analytics`.
  - *Expected Behavior*: Query parameters and hash preserved and passed to iframe.
  - *Failure Mitigated*: Stripped query parameters breaking client-side routers.
- **T2.B9.5 — Full URL Paste into Address Bar**:
  - *Boundary Condition*: User pastes `http://localhost:5500/test.html` or `https://13.49.76.201.sslip.io/proxy/5500/test.html`.
  - *Expected Behavior*: Address bar parser extracts port `5500` and path `/test.html` cleanly.
  - *Failure Mitigated*: Redundant nested URL strings.

---

### Boundary Cases: Feature 10 (External Tab Launch)
- **T2.B10.1 — Popup Blocker Detection**:
  - *Boundary Condition*: Local browser has aggressive popup blocker preventing `window.open`.
  - *Expected Behavior*: UI detects blocked popup and provides direct fallback anchor link or notification.
  - *Failure Mitigated*: Silent launch failure without user feedback.
- **T2.B10.2 — Launching with Empty / Root Path**:
  - *Boundary Condition*: Launch external tab when address bar has no path specified.
  - *Expected Behavior*: Defaults cleanly to `/` and constructs valid URL.
  - *Failure Mitigated*: Trailing undefined in generated URL.
- **T2.B10.3 — External Launch with Hash Fragment**:
  - *Boundary Condition*: Path is `/index.html#section2`.
  - *Expected Behavior*: External tab opens directly at anchor `#section2` with security token in query parameters.
  - *Assertion*: Correct URL structure `.../proxy/5500/index.html?token=...#section2`.
  - *Failure Mitigated*: Broken anchor deep links.
- **T2.B10.4 — Special Query Parameter Characters**:
  - *Boundary Condition*: Path contains existing query parameters `?q=hello&filter=true`.
  - *Expected Behavior*: Token parameter appends with `&token=...` rather than duplicate `?`.
  - *Failure Mitigated*: Malformed query strings.
- **T2.B10.5 — Offline VPS External Launch**:
  - *Boundary Condition*: VPS server is unreachable when external tab is opened.
  - *Expected Behavior*: External tab loads standard browser connection error rather than crashing parent window.
  - *Failure Mitigated*: Parent application crash or memory leak.

---

### Boundary Cases: Feature 11 (Remote VPS Reverse Proxy)
- **T2.B11.1 — VPS Port Unreachable (502 / Connection Refused)**:
  - *Boundary Condition*: Target port (e.g. 8089) is not listening on VPS.
  - *Expected Behavior*: Reverse proxy returns 502 Bad Gateway; preview window displays graceful offline notice.
  - *Failure Mitigated*: Indefinite loading hang.
- **T2.B11.2 — Invalid Security Token**:
  - *Boundary Condition*: Request sent with tampered or expired token.
  - *Expected Behavior*: VPS reverse proxy returns 401 Unauthorized or 403 Forbidden.
  - *Failure Mitigated*: Unauthorized access or silent proxy failures.
- **T2.B11.3 — Large Asset Transfer (10MB Image / Video)**:
  - *Boundary Condition*: Preview iframe requests large media file through proxy.
  - *Expected Behavior*: Reverse proxy streams response without buffering entire file in memory or timing out.
  - *Failure Mitigated*: Reverse proxy memory spike or timeout.
- **T2.B11.4 — Chunked Transfer Encoding**:
  - *Boundary Condition*: Server returns `Transfer-Encoding: chunked`.
  - *Expected Behavior*: Streamed data renders incrementally inside iframe.
  - *Failure Mitigated*: Broken streaming responses.
- **T2.B11.5 — HTTPS to HTTP Mixed Content Avoidance**:
  - *Boundary Condition*: Next.js served over HTTPS, target web server running over HTTP localhost.
  - *Expected Behavior*: All requests route through HTTPS VPS domain (`https://13.49.76.201.sslip.io`), eliminating mixed-content blocks.
  - *Failure Mitigated*: Browser blocking iframe as Mixed Content.

---

### Boundary Cases: Feature 12 (Live Server Port 5500)
- **T2.B12.1 — Live Server WebSocket Auto-Reconnect**:
  - *Boundary Condition*: Live Server restarted on VPS.
  - *Expected Behavior*: Live Server client script detects reconnection and refreshes preview frame.
  - *Failure Mitigated*: Broken live reload requiring manual browser refresh.
- **T2.B12.2 — Multiple Concurrent Live Server Tabs**:
  - *Boundary Condition*: Preview window and external browser tab open simultaneously on port 5500.
  - *Expected Behavior*: Both connections receive live reload broadcasts concurrently.
  - *Failure Mitigated*: Single-client connection locking.
- **T2.B12.3 — Live Server SVG and CSS Injection**:
  - *Boundary Condition*: User modifies only CSS file in editor.
  - *Expected Behavior*: Live Server hot-reloads stylesheet without full page refresh.
  - *Failure Mitigated*: Unnecessary full page reload destroying form state.
- **T2.B12.4 — Live Server Custom Workspace Subfolder**:
  - *Boundary Condition*: Live Server serving from nested subfolder `/workspace/project1`.
  - *Expected Behavior*: Relative paths resolve correctly within project root.
  - *Failure Mitigated*: 404 errors for assets in subdirectories.
- **T2.B12.5 — Non-HTML File Preview (Direct Image / JSON)**:
  - *Boundary Condition*: User requests `:5500/data.json` or `:5500/diagram.svg`.
  - *Expected Behavior*: Preview renders raw JSON or SVG cleanly inside iframe.
  - *Failure Mitigated*: Render failure on non-HTML assets.

---

### Boundary Cases: Feature 13 (Automated Test Suite)
- **T2.B13.1 — Dev Server Startup Latency**:
  - *Boundary Condition*: Next.js dev server takes 15 seconds to compile initial page.
  - *Expected Behavior*: Test runner polls with exponential backoff until server is responsive.
  - *Failure Mitigated*: False test failures due to cold compilation start.
- **T2.B13.2 — Playwright Headless Browser Sandbox Permissions**:
  - *Boundary Condition*: Executing in restricted container or CI environment without GPU.
  - *Expected Behavior*: Browser launches with `--no-sandbox` and `--disable-setuid-sandbox`.
  - *Failure Mitigated*: Process crash during browser launch in CI.
- **T2.B13.3 — Flaky Element Detection with Auto-Waiting**:
  - *Boundary Condition*: DOM elements take 500ms to mount during animation.
  - *Expected Behavior*: Test runner uses `waitForSelector` with explicit timeout rather than hardcoded sleep.
  - *Failure Mitigated*: Timing-dependent test flakiness.
- **T2.B13.4 — Partial Test Suite Execution via Flags**:
  - *Boundary Condition*: Run single feature test suite (e.g. `--feature resize`).
  - *Expected Behavior*: Executes only requested feature tests and outputs isolated results.
  - *Failure Mitigated*: Long execution times during focused development.
- **T2.B13.5 — Test Runner Exit Code Propagation**:
  - *Boundary Condition*: Single test fails among 50 tests.
  - *Expected Behavior*: Entire process exits with code 1; logs failing test ID and stack trace.
  - *Failure Mitigated*: False positive green builds in CI pipelines.

---

## 5. Tier 3: Cross-Feature Combinations (Pairwise Interactions)

The matrix below illustrates the pairwise interaction coverage across all 13 features:

| Feature Pair | Interaction Focus | Cross-Feature Test ID | Verification Goal |
|---|---|---|---|
| **F1 x F4** | Window Frame x Resizing | **T3.C1** | Traffic lights and frame curvature remain crisp during and after drag resize |
| **F2 x F3** | Coexistence x Smooth Panning | **T3.C2** | Panning canvas moves both Code Editor and Preview Window synchronously |
| **F4 x F5** | Resizing x Breakpoints | **T3.C3** | Width drag crossing 640px, 768px, 1024px dynamically triggers responsive layouts |
| **F5 x F9** | Breakpoints x Address Bar | **T3.C4** | Changing port/path preserves current responsive viewport width without reset |
| **F7 x F8** | History x Reload / Cancel | **T3.C5** | Reloading page maintains correct Back/Forward navigation stack indices |
| **F8 x F11** | Cancel x Remote Proxy | **T3.C6** | Aborting in-flight proxy request cleanly resets connection without hanging proxy |
| **F9 x F10** | Address Bar x External Tab | **T3.C7** | Editing port to 8080 immediately reflects in external launch button URL |
| **F1 x F2** | Window Frame x Coexistence | **T3.C8** | Maximizing preview window does not unmount or close Code Editor |
| **F6 x F9** | Navigation Header x Address Bar | **T3.C9** | Focusing address bar does not interfere with header dragging or other buttons |
| **F11 x F12** | Remote Proxy x Live Server | **T3.C10** | Live Server WebSocket reload signals pass through VPS proxy seamlessly |
| **F3 x F4** | Panning x Resizing | **T3.C11** | Panning canvas while resizing handle is active maintains accurate pointer deltas |
| **F2 x F10** | Coexistence x External Launch | **T3.C12** | Launching external tab leaves both on-canvas windows completely intact |
| **F6 x F8** | Header Bar x Dynamic Reload | **T3.C13** | Dynamic icon toggle (reload -> cancel -> reload) causes zero header layout shift |
| **F7 x F9** | History x Address Bar | **T3.C14** | Manual port change creates new history entry and enables Back button |
| **F5 x F12** | Breakpoints x Live Server | **T3.C15** | Live Server live-reloaded page immediately renders at current resized breakpoint |

### Detailed Cross-Feature Test Specifications (Selection)

#### T3.C3: Interactive Resizing Dynamically Triggering Breakpoints
1. *Setup*: Mount Preview Window at default 920px (tablet breakpoint). Embedded mock page has green background (`>= 1024px`), yellow (`768px - 1023px`), and red (`< 640px`).
2. *Action 1*: Drag right resize handle leftward until window width is 580px.
3. *Assertion 1*: Frame width is 580px; page background switches to red; header dimension indicator reads `580px`.
4. *Action 2*: Drag right resize handle rightward until window width is 1150px.
5. *Assertion 2*: Frame width is 1150px; page background switches to green; header reads `1150px`.
6. *Action 3*: Drag handle leftward to 800px.
7. *Assertion 3*: Frame width is 800px; page background switches to yellow.

#### T3.C7: Address Bar Port Change Propagating to External Tab Launch
1. *Setup*: Mount Preview Window with default port 5500.
2. *Action*: Click address bar, replace `5500` with `8080`, path `/dashboard`, and press Enter.
3. *Assertion 1*: Address bar value updates to `:8080/dashboard`.
4. *Action 2*: Click External Browser Tab Launch button (`[data-testid="external-launch-btn"]`).
5. *Assertion 2*: Intercepted `window.open` target URL equals:
   `https://13.49.76.201.sslip.io/proxy/8080/dashboard?token=explaino_sec_8b41915d25547e2edd553bab03ea4cbd`.

#### T3.C8: Maximize Preview Window with Dual-Window Coexistence
1. *Setup*: Code Editor is mounted at `sceneX: 100, sceneY: 100, width: 800, height: 600`. Web Preview is at `sceneX: 940, sceneY: 100, width: 800, height: 600`.
2. *Action*: Click green traffic light button to maximize Web Preview.
3. *Assertion 1*: Web Preview expands to cover canvas viewport.
4. *Assertion 2*: Code Editor remains mounted in React DOM tree; editor content is not destroyed.
5. *Action 2*: Click green traffic light button again to restore.
6. *Assertion 3*: Web Preview returns to `sceneX: 940, sceneY: 100, width: 800, height: 600`; side-by-side layout restored.

---

## 6. Tier 4: Real-World Application Scenarios

These 5 end-to-end user workflows represent authentic day-to-day engineering usage on the Excalidraw canvas.

### Scenario S1: Full-Stack Live Server HTML/CSS/JS Development Cycle
- **Persona**: Frontend Developer building an interactive landing page.
- **Workflow Journey**:
  1. Developer opens Explaino Structura on Excalidraw canvas.
  2. Developer toggles Code Editor and writes `index.html` with Tailwind CSS classes.
  3. Developer clicks "Canvas Screen / Web Preview" in toolbar to open Web Preview Window.
  4. Web Preview automatically mounts alongside Code Editor at port `5500`.
  5. The landing page renders inside the preview window.
  6. Developer updates heading text in Code Editor from `"Hello World"` to `"Explaino Canvas Preview"`.
  7. Live Server on remote VPS detects file change and triggers live reload.
  8. Web Preview reflects new heading in real time without manual browser refresh.
  9. Code Editor and Web Preview remain side-by-side with undisturbed cursor position.
- **Acceptance Criteria**: Zero manual refreshes needed; both windows stay open; sub-second live reload latency.

---

### Scenario S2: Multi-Breakpoint Responsive Design Inspection
- **Persona**: UI/UX Designer / QA Engineer auditing responsive layouts across devices.
- **Workflow Journey**:
  1. Preview window displays a responsive web app with mobile drawer, tablet sidebar, and desktop grid.
  2. Tester drags resize handle to width `375px` (iPhone portrait).
  3. Verifies mobile hamburger menu renders and desktop navigation is hidden.
  4. Tester drags handle to `768px` (iPad portrait).
  5. Verifies tablet sidebar appears and mobile drawer collapses.
  6. Tester drags handle to `1280px` (Desktop).
  7. Verifies multi-column dashboard grid layout renders.
  8. Tester pans the Excalidraw canvas to view design diagrams next to the live responsive preview.
- **Acceptance Criteria**: Clean media query responsiveness at each breakpoint without layout stutter or canvas lag.

---

### Scenario S3: Multi-Port Microservice Previewing & Port Switching
- **Persona**: Full-Stack Engineer developing a frontend (Vite port 5173), API mock (port 8080), and documentation (port 5500).
- **Workflow Journey**:
  1. Preview window starts on port 5500 showing documentation.
  2. Developer enters `5173` into the address bar and presses Enter.
  3. Preview switches to Vite dev server on VPS loopback; address bar updates; iframe loads Vite app.
  4. Developer tests user login flow in Vite app.
  5. Developer enters `8080/health` into address bar to inspect backend API status.
  6. Health JSON displays in preview window.
  7. Developer clicks Back button twice to return to Vite app, then documentation.
  8. Developer clicks External Tab Launch to open the Vite app on their local mobile device via external URL.
- **Acceptance Criteria**: Seamless port switching; full history traversal across ports; external URL contains valid token.

---

### Scenario S4: Network Latency, Slow Loading, and Cancel/Abort Recovery
- **Persona**: Developer testing application under high-latency network conditions.
- **Workflow Journey**:
  1. Developer triggers navigation to a heavy reporting page (`/reports/annual-data.html`).
  2. Reload button immediately transitions into Cancel button (`X` icon).
  3. Page takes longer than expected to respond (simulated network lag).
  4. Developer decides not to wait and clicks Cancel.
  5. In-flight request is aborted immediately; loading spinner disappears.
  6. Button transitions back to Reload icon.
  7. Developer edits address bar to lighter endpoint (`/reports/summary.html`) and presses Enter.
  8. Summary page loads quickly and successfully.
- **Acceptance Criteria**: Immediate network abort on Cancel click; no infinite hanging state; graceful recovery.

---

### Scenario S5: Side-by-Side Dual-Window Canvas Workflow with Pan/Zoom
- **Persona**: Computer Science Educator presenting algorithms and live web visualization.
- **Workflow Journey**:
  1. Educator sets up Excalidraw canvas with flowcharts and notes on the left.
  2. Code Editor is placed in the center showing sorting algorithm code.
  3. Web Preview is placed on the right showing a live React sorting visualizer.
  4. Educator uses trackpad to smoothly pan from whiteboard notes -> code -> live visualizer.
  5. Educator pinches to zoom in to 150% to focus on a particular algorithm step.
  6. Both Code Editor and Web Preview scale smoothly in canvas scene space.
  7. Educator interacts with live sorting visualizer inside Web Preview to trigger visual animation.
  8. Educator draws annotations on canvas around the preview window without disrupting the preview.
- **Acceptance Criteria**: Rock-solid canvas coordination; non-interfering annotations; smooth zooming and panning.

---

## 7. Test Execution & Reporting Framework

### 7.1 Playwright Test Suite File
- File location: `d:\projects\explaino_structura\scripts\verify_web_preview_window.mjs`.

### 7.2 Execution Command
```bash
# Direct Node runner against dev server
node scripts/verify_web_preview_window.mjs

# Custom port or URL
node scripts/verify_web_preview_window.mjs --url http://localhost:3000

# Standalone mock & contract verification mode (when dev server is offline)
node scripts/verify_web_preview_window.mjs --mock
```

### 7.3 Success & Failure Exit Criteria
- **Pass (Exit Code 0)**: 100% of executed test assertions succeed; no fatal unhandled browser errors.
- **Fail (Exit Code 1)**: Any assertion fails; stack trace and failure context printed to stderr.

### 7.4 Test Artifacts
- Screenshots captured during execution are persisted to `public/docs/`:
  - `canvas_preview_side_by_side.png`
  - `canvas_preview_breakpoint_mobile.png`
  - `canvas_preview_breakpoint_tablet.png`
  - `canvas_preview_breakpoint_desktop.png`
  - `canvas_preview_nav_controls.png`
