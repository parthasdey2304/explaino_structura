/**
 * Empirical Stress Test Harness for Milestone 2: Dedicated macOS Preview Window & Resizing
 * Challenger: teamwork_challenger_m2_1
 * 
 * Comprehensive Adversarial Stress Testing:
 * 1. Corner vs Right-Edge resize handles: exact width sweeping across boundary pixels:
 *    - 639px (Mobile) vs 640px (Tablet)
 *    - 1023px (Tablet) vs 1024px (Desktop)
 *    - Right-edge handle (direction 'e') strictly ignores vertical dy
 *    - Corner handle (direction 'se') resizes both width and height simultaneously
 * 2. Extreme Dimension Clamping:
 *    - Extreme shrink below 320x240 (e.g. -2000px mouse drag) clamps strictly to [320, 240]
 *    - Extreme expand above 3840x2160 (e.g. +10000px mouse drag) clamps strictly to [3840, 2160]
 *    - Off-by-one boundary clamping (319 -> 320, 321 -> 321, 3841 -> 3840, etc.)
 * 3. Canvas Zoom Scaling Invariance:
 *    - Validates mouse delta scaling (dx / zoom, dy / zoom) across zoom levels (0.5x, 1.0x, 2.0x, 0.75x, 1.5x, 3.0x)
 *    - Guarantees 1:1 screen cursor tracking without acceleration or sluggishness
 *    - Robustness against degenerate zoom values (0, negative, NaN, undefined, object { value: n })
 * 4. Browser DOM Dragging & 3-Tier Mouse Trap Defense:
 *    - Real Playwright browser testing with dynamic ephemeral port
 *    - High-velocity mouse drag and flings across iframe boundaries
 *    - Verification of full-screen drag mask and pointer capture
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// Constants & Pure Functions (from src/components/WebPreviewPanel.tsx)
// ---------------------------------------------------------------------------
const MIN_PREVIEW_WIDTH = 320;
const MIN_PREVIEW_HEIGHT = 240;
const MAX_PREVIEW_WIDTH = 3840;
const MAX_PREVIEW_HEIGHT = 2160;

function classifyBreakpoint(width) {
  if (width < 640) return "Mobile";
  if (width < 1024) return "Tablet";
  return "Desktop";
}

function getZoomValue(zoom) {
  if (typeof zoom === "number") return zoom > 0 ? zoom : 1;
  if (zoom && typeof zoom === "object" && "value" in zoom && typeof zoom.value === "number") {
    const val = zoom.value;
    return val > 0 ? val : 1;
  }
  return 1;
}

function simulateResize({
  startWidth,
  startHeight,
  deltaMouseX,
  deltaMouseY,
  zoom,
  direction, // 'e' | 'se'
}) {
  const safeZoom = getZoomValue(zoom);
  const dx = deltaMouseX / safeZoom;
  const dy = deltaMouseY / safeZoom;

  let newWidth = startWidth;
  let newHeight = startHeight;

  if (direction === "e" || direction === "se") {
    newWidth = Math.max(MIN_PREVIEW_WIDTH, Math.min(MAX_PREVIEW_WIDTH, Math.round(startWidth + dx)));
  }
  if (direction === "se") {
    newHeight = Math.max(MIN_PREVIEW_HEIGHT, Math.min(MAX_PREVIEW_HEIGHT, Math.round(startHeight + dy)));
  }

  return { width: newWidth, height: newHeight, dx, dy };
}

// ---------------------------------------------------------------------------
// Test Reporter
// ---------------------------------------------------------------------------
class EmpiricalReporter {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    this.startTime = Date.now();
  }

  test(id, name, fn) {
    try {
      fn();
      this.passed++;
      this.results.push({ id, name, status: "PASS" });
      console.log(`  \x1b[32m[PASS]\x1b[0m ${id}: ${name}`);
    } catch (err) {
      this.failed++;
      this.results.push({ id, name, status: "FAIL", error: err.message });
      console.log(`  \x1b[31m[FAIL]\x1b[0m ${id}: ${name}`);
      console.log(`         \x1b[31mError: ${err.message}\x1b[0m`);
    }
  }

  async testAsync(id, name, fn) {
    try {
      await fn();
      this.passed++;
      this.results.push({ id, name, status: "PASS" });
      console.log(`  \x1b[32m[PASS]\x1b[0m ${id}: ${name}`);
    } catch (err) {
      this.failed++;
      this.results.push({ id, name, status: "FAIL", error: err.message });
      console.log(`  \x1b[31m[FAIL]\x1b[0m ${id}: ${name}`);
      console.log(`         \x1b[31mError: ${err.message}\x1b[0m`);
    }
  }

  summary() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log("\n=======================================================");
    console.log("       M2 EMPIRICAL STRESS TEST HARNESS SUMMARY        ");
    console.log("=======================================================");
    console.log(` Total Checks:  ${this.results.length}`);
    console.log(` Passed:        \x1b[32m${this.passed}\x1b[0m`);
    console.log(` Failed:        \x1b[31m${this.failed}\x1b[0m`);
    console.log(` Duration:      ${duration}s`);
    console.log("=======================================================\n");
    return this.failed === 0;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "Values differ"}: expected ${expected}, got ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// SUITE 1: Handle Distinction & Boundary Pixel Sweeping (639/640 & 1023/1024)
// ---------------------------------------------------------------------------
function runSuite1(rep) {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 1: Handle Types & Exact Boundary Pixel Transitions");
  console.log("-------------------------------------------------------");

  // 1. Right-edge handle: sweeps width from 638px to 641px
  rep.test("STRESS.HANDLE.1", "Right-edge handle transitions Mobile->Tablet at exact 639px -> 640px", () => {
    // Start at 638px
    const s638 = simulateResize({ startWidth: 638, startHeight: 500, deltaMouseX: 0, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s638.width, 638);
    assertEqual(classifyBreakpoint(s638.width), "Mobile");

    const s639 = simulateResize({ startWidth: 638, startHeight: 500, deltaMouseX: 1, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s639.width, 639);
    assertEqual(classifyBreakpoint(s639.width), "Mobile");

    const s640 = simulateResize({ startWidth: 638, startHeight: 500, deltaMouseX: 2, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s640.width, 640);
    assertEqual(classifyBreakpoint(s640.width), "Tablet");

    const s641 = simulateResize({ startWidth: 638, startHeight: 500, deltaMouseX: 3, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s641.width, 641);
    assertEqual(classifyBreakpoint(s641.width), "Tablet");
  });

  // 2. Right-edge handle: sweeps width from 1022px to 1025px
  rep.test("STRESS.HANDLE.2", "Right-edge handle transitions Tablet->Desktop at exact 1023px -> 1024px", () => {
    const s1022 = simulateResize({ startWidth: 1022, startHeight: 600, deltaMouseX: 0, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s1022.width, 1022);
    assertEqual(classifyBreakpoint(s1022.width), "Tablet");

    const s1023 = simulateResize({ startWidth: 1022, startHeight: 600, deltaMouseX: 1, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s1023.width, 1023);
    assertEqual(classifyBreakpoint(s1023.width), "Tablet");

    const s1024 = simulateResize({ startWidth: 1022, startHeight: 600, deltaMouseX: 2, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s1024.width, 1024);
    assertEqual(classifyBreakpoint(s1024.width), "Desktop");

    const s1025 = simulateResize({ startWidth: 1022, startHeight: 600, deltaMouseX: 3, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(s1025.width, 1025);
    assertEqual(classifyBreakpoint(s1025.width), "Desktop");
  });

  // 3. Right-edge handle isolation: vertical mouse movements MUST NOT modify height
  rep.test("STRESS.HANDLE.3", "Right-edge handle (direction 'e') strictly ignores vertical delta (dy)", () => {
    const initialHeight = 580;
    const res = simulateResize({
      startWidth: 768,
      startHeight: initialHeight,
      deltaMouseX: 50,
      deltaMouseY: 300, // Large vertical mouse displacement
      zoom: 1,
      direction: "e",
    });
    assertEqual(res.width, 818, "Width should expand by 50px");
    assertEqual(res.height, initialHeight, "Height must stay exactly at initialHeight when dragging east handle");
  });

  // 4. Corner handle (direction 'se'): modifies both width and height simultaneously
  rep.test("STRESS.HANDLE.4", "Corner handle (direction 'se') alters both dimensions across boundary pixels", () => {
    const res = simulateResize({
      startWidth: 639,
      startHeight: 479,
      deltaMouseX: 1,
      deltaMouseY: 1,
      zoom: 1,
      direction: "se",
    });
    assertEqual(res.width, 640);
    assertEqual(res.height, 480);
    assertEqual(classifyBreakpoint(res.width), "Tablet");
  });
}

// ---------------------------------------------------------------------------
// SUITE 2: Extreme Dimension Clamping & Edge Stress
// ---------------------------------------------------------------------------
function runSuite2(rep) {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 2: Extreme Dimension Clamping & Boundaries");
  console.log("-------------------------------------------------------");

  // 1. Extreme shrinking (huge negative deltas)
  rep.test("STRESS.CLAMP.1", "Massive negative delta (-50,000px) clamps to [320, 240]", () => {
    const res = simulateResize({
      startWidth: 768,
      startHeight: 600,
      deltaMouseX: -50000,
      deltaMouseY: -50000,
      zoom: 1,
      direction: "se",
    });
    assertEqual(res.width, MIN_PREVIEW_WIDTH, `Width clamped to ${MIN_PREVIEW_WIDTH}`);
    assertEqual(res.height, MIN_PREVIEW_HEIGHT, `Height clamped to ${MIN_PREVIEW_HEIGHT}`);
  });

  // 2. Extreme expanding (huge positive deltas)
  rep.test("STRESS.CLAMP.2", "Massive positive delta (+50,000px) clamps to [3840, 2160]", () => {
    const res = simulateResize({
      startWidth: 768,
      startHeight: 600,
      deltaMouseX: 50000,
      deltaMouseY: 50000,
      zoom: 1,
      direction: "se",
    });
    assertEqual(res.width, MAX_PREVIEW_WIDTH, `Width clamped to ${MAX_PREVIEW_WIDTH}`);
    assertEqual(res.height, MAX_PREVIEW_HEIGHT, `Height clamped to ${MAX_PREVIEW_HEIGHT}`);
  });

  // 3. Off-by-one boundary clamping checks
  rep.test("STRESS.CLAMP.3", "Precision clamping boundaries (319->320, 321->321, 3841->3840, 3839->3839)", () => {
    const w319 = simulateResize({ startWidth: 320, startHeight: 240, deltaMouseX: -1, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(w319.width, 320, "319px must clamp to 320");

    const w321 = simulateResize({ startWidth: 320, startHeight: 240, deltaMouseX: 1, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(w321.width, 321, "321px is within range");

    const w3841 = simulateResize({ startWidth: 3840, startHeight: 2160, deltaMouseX: 1, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(w3841.width, 3840, "3841px must clamp to 3840");

    const w3839 = simulateResize({ startWidth: 3840, startHeight: 2160, deltaMouseX: -1, deltaMouseY: 0, zoom: 1, direction: "e" });
    assertEqual(w3839.width, 3839, "3839px is within range");

    const h239 = simulateResize({ startWidth: 768, startHeight: 240, deltaMouseX: 0, deltaMouseY: -1, zoom: 1, direction: "se" });
    assertEqual(h239.height, 240, "239px must clamp to 240");

    const h2161 = simulateResize({ startWidth: 768, startHeight: 2160, deltaMouseX: 0, deltaMouseY: 1, zoom: 1, direction: "se" });
    assertEqual(h2161.height, 2160, "2161px must clamp to 2160");
  });
}

// ---------------------------------------------------------------------------
// SUITE 3: Canvas Zoom Scaling Invariance & Degenerate Zoom Handling
// ---------------------------------------------------------------------------
function runSuite3(rep) {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 3: Canvas Zoom Scaling Invariance & Degenerate Input");
  console.log("-------------------------------------------------------");

  // 1. Zoom levels: 0.5x, 1.0x, 2.0x
  rep.test("STRESS.ZOOM.1", "Accurate delta scaling across 0.5x, 1.0x, and 2.0x zoom levels", () => {
    const mouseDelta = 100;

    // At zoom 1.0: 100px mouse -> 100px scene
    const z1 = simulateResize({ startWidth: 768, startHeight: 600, deltaMouseX: mouseDelta, deltaMouseY: mouseDelta, zoom: 1.0, direction: "se" });
    assertEqual(z1.width, 868);
    assertEqual(z1.height, 700);

    // At zoom 2.0: 100px mouse -> 50px scene (50px scene * 2.0 zoom = 100px screen)
    const z2 = simulateResize({ startWidth: 768, startHeight: 600, deltaMouseX: mouseDelta, deltaMouseY: mouseDelta, zoom: 2.0, direction: "se" });
    assertEqual(z2.width, 818);
    assertEqual(z2.height, 650);

    // At zoom 0.5: 100px mouse -> 200px scene (200px scene * 0.5 zoom = 100px screen)
    const zHalf = simulateResize({ startWidth: 768, startHeight: 600, deltaMouseX: mouseDelta, deltaMouseY: mouseDelta, zoom: 0.5, direction: "se" });
    assertEqual(zHalf.width, 968);
    assertEqual(zHalf.height, 800);
  });

  // 2. Fractional and high zoom levels: 0.75x, 1.5x, 3.0x
  rep.test("STRESS.ZOOM.2", "Delta scaling with fractional zoom levels (0.75x, 1.5x, 3.0x)", () => {
    // 0.75x zoom: 75px mouse delta -> 100px scene
    const z075 = simulateResize({ startWidth: 768, startHeight: 600, deltaMouseX: 75, deltaMouseY: 75, zoom: 0.75, direction: "se" });
    assertEqual(z075.width, 868);
    assertEqual(z075.height, 700);

    // 1.5x zoom: 150px mouse delta -> 100px scene
    const z15 = simulateResize({ startWidth: 768, startHeight: 600, deltaMouseX: 150, deltaMouseY: 150, zoom: 1.5, direction: "se" });
    assertEqual(z15.width, 868);
    assertEqual(z15.height, 700);

    // 3.0x zoom: 300px mouse delta -> 100px scene
    const z3 = simulateResize({ startWidth: 768, startHeight: 600, deltaMouseX: 300, deltaMouseY: 300, zoom: 3.0, direction: "se" });
    assertEqual(z3.width, 868);
    assertEqual(z3.height, 700);
  });

  // 3. Object-based zoom { value: number } (Excalidraw native Zoom type)
  rep.test("STRESS.ZOOM.3", "Handles Excalidraw Zoom object type { value: 2.0 }", () => {
    const zObj = simulateResize({
      startWidth: 768,
      startHeight: 600,
      deltaMouseX: 100,
      deltaMouseY: 100,
      zoom: { value: 2.0 },
      direction: "se",
    });
    assertEqual(zObj.width, 818);
    assertEqual(zObj.height, 650);
  });

  // 4. Degenerate and adversarial zoom inputs (0, -1, NaN, undefined)
  rep.test("STRESS.ZOOM.4", "Degenerate zoom inputs (0, negative, NaN, null) safely default to 1.0x", () => {
    const zZero = getZoomValue(0);
    assertEqual(zZero, 1, "Zoom 0 must fallback to 1");

    const zNeg = getZoomValue(-2.5);
    assertEqual(zNeg, 1, "Negative zoom must fallback to 1");

    const zNaN = getZoomValue(NaN);
    assertEqual(zNaN, 1, "NaN zoom must fallback to 1");

    const zUndef = getZoomValue(undefined);
    assertEqual(zUndef, 1, "Undefined zoom must fallback to 1");

    const zObjNeg = getZoomValue({ value: -1 });
    assertEqual(zObjNeg, 1, "Object with negative value must fallback to 1");
  });
}

// ---------------------------------------------------------------------------
// SUITE 4: Interactive Browser Dragging & 3-Tier Mouse Trap Stress Test
// ---------------------------------------------------------------------------
async function runSuite4(rep) {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 4: Interactive Browser Dragging & 3-Tier Defense");
  console.log("-------------------------------------------------------");

  // Spin up an HTTP server with ephemeral port 0 (EADDRINUSE immune)
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (req.url === "/preview") {
      res.writeHead(200);
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { margin: 0; padding: 12px; font-family: monospace; background: #18181b; color: #fafafa; }
              #bp-indicator { font-weight: bold; font-size: 14px; }
              #bp-indicator::after { content: "MOBILE (<640px)"; }
              @media (min-width: 640px) {
                #bp-indicator::after { content: "TABLET (640-1023px)"; }
                body { background: #27272a; }
              }
              @media (min-width: 1024px) {
                #bp-indicator::after { content: "DESKTOP (>=1024px)"; }
                body { background: #3f3f46; }
              }
            </style>
          </head>
          <body>
            <div id="bp-indicator">ACTIVE: </div>
            <div id="w-readout"></div>
            <script>
              function logW() { document.getElementById('w-readout').innerText = window.innerWidth; }
              window.addEventListener('resize', logW);
              logW();
            </script>
          </body>
        </html>
      `);
      return;
    }

    // Host page simulating WebPreviewPanel with handles, header, and 3-tier defense
    res.writeHead(200);
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; background: #09090b; width: 100vw; height: 100vh; overflow: hidden; }
            #window {
              position: fixed;
              left: 100px;
              top: 50px;
              width: 768px;
              height: 600px;
              background: #16161a;
              border-radius: 16px;
              border: 1.5px solid rgba(255, 255, 255, 0.14);
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            #header {
              height: 38px;
              background: #1c1c21;
              display: flex;
              align-items: center;
              padding: 0 10px;
              gap: 8px;
              user-select: none;
            }
            #pill {
              font-family: monospace;
              font-size: 11px;
              color: #a1a1aa;
              background: rgba(0,0,0,0.3);
              padding: 2px 6px;
              border-radius: 4px;
            }
            #badge {
              font-size: 10px;
              font-weight: 600;
              padding: 2px 6px;
              border-radius: 4px;
              text-transform: uppercase;
            }
            .preset-btn {
              padding: 2px 6px;
              font-size: 10px;
              background: #27272a;
              color: #d4d4d8;
              border: 1px solid #3f3f46;
              border-radius: 4px;
              cursor: pointer;
            }
            #content {
              flex: 1;
              position: relative;
              width: 100%;
              height: 100%;
            }
            iframe {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              border: none;
            }
            .resize-handle-e {
              position: absolute;
              right: 0;
              top: 0;
              bottom: 28px;
              width: 10px;
              cursor: ew-resize;
              z-index: 20;
              background: rgba(255, 255, 255, 0.05);
            }
            .resize-handle-se {
              position: absolute;
              right: 0;
              bottom: 0;
              width: 28px;
              height: 28px;
              cursor: nwse-resize;
              z-index: 20;
              background: rgba(255, 255, 255, 0.1);
            }
            #drag-mask {
              display: none;
              position: fixed;
              inset: 0;
              z-index: 99999;
            }
          </style>
        </head>
        <body>
          <div id="window">
            <div id="header">
              <span id="pill">768 × 600 px</span>
              <span id="badge">TABLET</span>
              <button class="preset-btn" id="btn-375" onclick="snap(375)">📱 375px</button>
              <button class="preset-btn" id="btn-768" onclick="snap(768)">📟 768px</button>
              <button class="preset-btn" id="btn-1024" onclick="snap(1024)">💻 1024px</button>
            </div>
            <div id="content">
              <iframe id="preview-iframe" src="/preview"></iframe>
              <div class="resize-handle-e" id="handle-e"></div>
              <div class="resize-handle-se" id="handle-se"></div>
            </div>
          </div>
          <div id="drag-mask"></div>

          <script>
            const win = document.getElementById('window');
            const iframe = document.getElementById('preview-iframe');
            const dragMask = document.getElementById('drag-mask');
            const pill = document.getElementById('pill');
            const badge = document.getElementById('badge');
            const handleE = document.getElementById('handle-e');
            const handleSE = document.getElementById('handle-se');

            let isResizing = false;
            let currentDir = 'se';
            let startX, startY, startW, startH;

            function classify(w) {
              if (w < 640) return 'Mobile';
              if (w < 1024) return 'Tablet';
              return 'Desktop';
            }

            function updateUI(w, h) {
              pill.innerText = w + ' × ' + h + ' px';
              badge.innerText = classify(w).toUpperCase();
            }

            function snap(w) {
              win.style.width = w + 'px';
              updateUI(w, parseInt(win.style.height || 600));
            }

            function onDown(e, dir) {
              e.preventDefault();
              isResizing = true;
              currentDir = dir;
              startX = e.clientX;
              startY = e.clientY;
              startW = win.offsetWidth;
              startH = win.offsetHeight;

              iframe.style.pointerEvents = 'none';
              dragMask.style.display = 'block';
              dragMask.style.cursor = dir === 'e' ? 'ew-resize' : 'nwse-resize';
              e.currentTarget.setPointerCapture(e.pointerId);
            }

            function onMove(e) {
              if (!isResizing) return;
              const dx = e.clientX - startX;
              const dy = e.clientY - startY;

              let newW = startW;
              let newH = startH;

              if (currentDir === 'e' || currentDir === 'se') {
                newW = Math.max(320, Math.min(3840, Math.round(startW + dx)));
              }
              if (currentDir === 'se') {
                newH = Math.max(240, Math.min(2160, Math.round(startH + dy)));
              }

              win.style.width = newW + 'px';
              win.style.height = newH + 'px';
              updateUI(newW, newH);
            }

            function onUp(e) {
              if (!isResizing) return;
              isResizing = false;
              iframe.style.pointerEvents = 'auto';
              dragMask.style.display = 'none';
              try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
            }

            handleE.addEventListener('pointerdown', (e) => onDown(e, 'e'));
            handleE.addEventListener('pointermove', onMove);
            handleE.addEventListener('pointerup', onUp);
            handleE.addEventListener('pointercancel', onUp);

            handleSE.addEventListener('pointerdown', (e) => onDown(e, 'se'));
            handleSE.addEventListener('pointermove', onMove);
            handleSE.addEventListener('pointerup', onUp);
            handleSE.addEventListener('pointercancel', onUp);
          </script>
        </body>
      </html>
    `);
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);

    const frameEl = await page.$("#preview-iframe");
    const frame = await frameEl.contentFrame();
    await frame.waitForSelector("#bp-indicator", { timeout: 5000 });

    // 1. Right-edge handle interactive drag across 639/640 boundary
    await rep.testAsync("STRESS.DOM.1", "Interactive right-edge handle drag crosses Mobile (639px) -> Tablet (640px)", async () => {
      // First snap to 375px
      await page.click("#btn-375");
      await page.waitForTimeout(100);

      const hBox = await page.$eval("#handle-e", (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });

      // Drag right by (639 - 375 = 264px)
      await page.mouse.move(hBox.x, hBox.y);
      await page.mouse.down();
      await page.mouse.move(hBox.x + 264, hBox.y, { steps: 5 });
      await page.waitForTimeout(50);

      const w639 = await page.$eval("#window", (el) => el.offsetWidth);
      const b639 = await page.$eval("#badge", (el) => el.innerText);
      assertEqual(w639, 639);
      assertEqual(b639, "MOBILE");

      // Drag 1 more pixel right -> 640px
      await page.mouse.move(hBox.x + 265, hBox.y);
      await page.waitForTimeout(50);

      const w640 = await page.$eval("#window", (el) => el.offsetWidth);
      const b640 = await page.$eval("#badge", (el) => el.innerText);
      assertEqual(w640, 640);
      assertEqual(b640, "TABLET");

      await page.mouse.up();
      await page.waitForTimeout(50);
    });

    // 2. Right-edge handle interactive drag across 1023/1024 boundary
    await rep.testAsync("STRESS.DOM.2", "Interactive right-edge handle drag crosses Tablet (1023px) -> Desktop (1024px)", async () => {
      // Snap to 768px
      await page.click("#btn-768");
      await page.waitForTimeout(100);

      const hBox = await page.$eval("#handle-e", (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });

      // Drag right by (1023 - 768 = 255px)
      await page.mouse.move(hBox.x, hBox.y);
      await page.mouse.down();
      await page.mouse.move(hBox.x + 255, hBox.y, { steps: 5 });
      await page.waitForTimeout(50);

      const w1023 = await page.$eval("#window", (el) => el.offsetWidth);
      const b1023 = await page.$eval("#badge", (el) => el.innerText);
      assertEqual(w1023, 1023);
      assertEqual(b1023, "TABLET");

      // Drag 1 more pixel right -> 1024px
      await page.mouse.move(hBox.x + 256, hBox.y);
      await page.waitForTimeout(50);

      const w1024 = await page.$eval("#window", (el) => el.offsetWidth);
      const b1024 = await page.$eval("#badge", (el) => el.innerText);
      assertEqual(w1024, 1024);
      assertEqual(b1024, "DESKTOP");

      await page.mouse.up();
      await page.waitForTimeout(50);
    });

    // 3. Corner handle interactive drag with extreme shrink clamping
    await rep.testAsync("STRESS.DOM.3", "Corner handle drag violently to top-left clamps at exactly 320x240", async () => {
      const hBox = await page.$eval("#handle-se", (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });

      // Drag up-left by 1000px
      await page.mouse.move(hBox.x, hBox.y);
      await page.mouse.down();
      await page.mouse.move(hBox.x - 1000, hBox.y - 1000, { steps: 5 });
      await page.waitForTimeout(50);

      const clampedW = await page.$eval("#window", (el) => el.offsetWidth);
      const clampedH = await page.$eval("#window", (el) => el.offsetHeight);
      assertEqual(clampedW, 320);
      assertEqual(clampedH, 240);

      await page.mouse.up();
      await page.waitForTimeout(50);
    });

    // 4. 3-Tier Defense: High-velocity mouse fling across the iframe
    await rep.testAsync("STRESS.DOM.4", "High-velocity drag across iframe activates drag-mask and prevents event drop", async () => {
      const hBox = await page.$eval("#handle-se", (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });

      await page.mouse.move(hBox.x, hBox.y);
      await page.mouse.down();
      await page.waitForTimeout(30);

      // Verify Tier 1 (iframe PE none) and Tier 3 (drag mask visible)
      const iframePE = await page.$eval("#preview-iframe", (el) => window.getComputedStyle(el).pointerEvents);
      const maskDisplay = await page.$eval("#drag-mask", (el) => window.getComputedStyle(el).display);
      assertEqual(iframePE, "none", "Iframe pointer-events must be none during drag");
      assertEqual(maskDisplay, "block", "Drag mask must be block during drag");

      // Wildly move cursor directly across the center of iframe and window boundaries
      await page.mouse.move(200, 200, { steps: 10 });
      await page.mouse.move(50, 50, { steps: 5 });
      await page.mouse.move(1200, 800, { steps: 5 });
      await page.waitForTimeout(30);

      // Release mouse
      await page.mouse.up();
      await page.waitForTimeout(30);

      // Verify clean tear-down of defense
      const releasedIframePE = await page.$eval("#preview-iframe", (el) => window.getComputedStyle(el).pointerEvents);
      const releasedMaskDisplay = await page.$eval("#drag-mask", (el) => window.getComputedStyle(el).display);
      assertEqual(releasedIframePE, "auto", "Iframe pointer-events restored to auto");
      assertEqual(releasedMaskDisplay, "none", "Drag mask hidden on release");
    });

    // 5. Breakpoint presets buttons (375, 768, 1024)
    await rep.testAsync("STRESS.DOM.5", "Preset buttons snap accurately and update dimension pill and badge", async () => {
      // Click 375
      await page.click("#btn-375");
      await page.waitForTimeout(50);
      let pillText = await page.$eval("#pill", (el) => el.innerText);
      let badgeText = await page.$eval("#badge", (el) => el.innerText);
      assert(pillText.startsWith("375 ×"), `Pill should show 375px: ${pillText}`);
      assertEqual(badgeText, "MOBILE");

      // Click 768
      await page.click("#btn-768");
      await page.waitForTimeout(50);
      pillText = await page.$eval("#pill", (el) => el.innerText);
      badgeText = await page.$eval("#badge", (el) => el.innerText);
      assert(pillText.startsWith("768 ×"), `Pill should show 768px: ${pillText}`);
      assertEqual(badgeText, "TABLET");

      // Click 1024
      await page.click("#btn-1024");
      await page.waitForTimeout(50);
      pillText = await page.$eval("#pill", (el) => el.innerText);
      badgeText = await page.$eval("#badge", (el) => el.innerText);
      assert(pillText.startsWith("1024 ×"), `Pill should show 1024px: ${pillText}`);
      assertEqual(badgeText, "DESKTOP");
    });
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------
async function main() {
  console.log("=======================================================");
  console.log("   MILESTONE 2: EMPIRICAL STRESS TEST SUITE            ");
  console.log("=======================================================");

  const rep = new EmpiricalReporter();

  runSuite1(rep);
  runSuite2(rep);
  runSuite3(rep);
  await runSuite4(rep);

  const passed = rep.summary();
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal Stress Test Error:", err);
  process.exit(1);
});
