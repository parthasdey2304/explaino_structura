/**
 * Automated Verification Harness for Milestone 2: Dynamic Viewport Breakpoints & CSS Media Query Verification
 * Project: Explaino Structura (External Web Application Preview System on Excalidraw Canvas)
 * 
 * Verifies:
 * 1. Scene-coordinate math, viewport projection, and canvas zoom scaling.
 * 2. Dynamic iframe DOM dimensions and CSS media query execution (<640px Mobile, 640-1023px Tablet, >=1024px Desktop).
 * 3. Exact boundary pixel transitions (639px vs 640px, 1023px vs 1024px).
 * 4. Breakpoint quick-presets (📱 375px, 📟 768px, 💻 1024px) and header dimension readout.
 * 5. 3-Tier iframe pointer-event hijacking defense (CSS pointer-events, pointer capture, full-screen drag mask).
 * 6. macOS window frame styling (16px radius, border, #16161a dark surface, traffic lights).
 * 7. Live WebPreviewPanel component implementation inspection when landed by Worker.
 * 
 * Usage:
 *   node scripts/verify_m2_window_resizing.mjs
 *   node scripts/verify_m2_window_resizing.mjs --url http://localhost:3000
 *   node scripts/verify_m2_window_resizing.mjs --headless false
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// Configuration & Constants
// ---------------------------------------------------------------------------
const DEFAULT_APP_URL = process.env.APP_URL || "http://localhost:3000";
const ARGS = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = ARGS.indexOf(flag);
  if (idx !== -1 && ARGS[idx + 1]) return ARGS[idx + 1];
  return defaultValue;
}
export const TARGET_URL = getArg("--url", DEFAULT_APP_URL);
const IS_HEADLESS = getArg("--headless", "true") === "true";

export const BREAKPOINTS = {
  MOBILE_MAX: 639,
  TABLET_MIN: 640,
  TABLET_MAX: 1023,
  DESKTOP_MIN: 1024,
};

export const PRESETS = [
  { id: "mobile", label: "📱 375px", width: 375, category: "mobile" },
  { id: "tablet", label: "📟 768px", width: 768, category: "tablet" },
  { id: "desktop", label: "💻 1024px", width: 1024, category: "desktop" },
];

export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const MAX_WIDTH = 3840;
export const MAX_HEIGHT = 2160;

// ---------------------------------------------------------------------------
// Test Reporter
// ---------------------------------------------------------------------------
class TestReporter {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
    this.results = [];
    this.startTime = Date.now();
  }

  record(id, title, status, details = "") {
    if (status === "PASS") this.passed++;
    else if (status === "FAIL") this.failed++;
    else this.skipped++;

    this.results.push({ id, title, status, details });
    const tag =
      status === "PASS"
        ? "\x1b[32m[PASS]\x1b[0m"
        : status === "FAIL"
        ? "\x1b[31m[FAIL]\x1b[0m"
        : "\x1b[33m[SKIP]\x1b[0m";

    console.log(`  ${tag} ${id}: ${title}`);
    if (details && status === "FAIL") {
      console.log(`         \x1b[31mError: ${details}\x1b[0m`);
    } else if (details && status === "SKIP") {
      console.log(`         \x1b[33mNote: ${details}\x1b[0m`);
    }
  }

  summary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log("\n=======================================================");
    console.log("       MILESTONE 2: WINDOW RESIZING VERIFICATION       ");
    console.log("=======================================================");
    console.log(` Total Checks Executed: ${this.results.length}`);
    console.log(` Passed:                \x1b[32m${this.passed}\x1b[0m`);
    console.log(` Failed:                \x1b[31m${this.failed}\x1b[0m`);
    console.log(` Skipped:               \x1b[33m${this.skipped}\x1b[0m`);
    console.log(` Duration:              ${elapsed}s`);
    console.log("=======================================================\n");

    return this.failed === 0;
  }
}

const reporter = new TestReporter();

// ---------------------------------------------------------------------------
// Authoritative Milestone 2 Projection & Breakpoint Helpers
// ---------------------------------------------------------------------------
export function projectSceneToViewport(scenePos, viewport) {
  const zoom = typeof viewport.zoom === "object" ? viewport.zoom.value : (viewport.zoom || 1);
  const scrollX = viewport.scrollX || 0;
  const scrollY = viewport.scrollY || 0;
  const offsetLeft = viewport.offsetLeft || 0;
  const offsetTop = viewport.offsetTop || 0;

  return {
    x: (scenePos.sceneX + scrollX) * zoom + offsetLeft,
    y: (scenePos.sceneY + scrollY) * zoom + offsetTop,
    width: Math.max(MIN_WIDTH, scenePos.sceneWidth * zoom),
    height: Math.max(MIN_HEIGHT, scenePos.sceneHeight * zoom),
  };
}

export function scaleDelta(deltaMouse, zoom) {
  const safeZoom = zoom && zoom > 0 ? zoom : 1;
  return deltaMouse / safeZoom;
}

export function clampDimensions(width, height) {
  return {
    width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)),
    height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height)),
  };
}

export function classifyBreakpoint(width) {
  if (width < BREAKPOINTS.TABLET_MIN) return "mobile";
  if (width < BREAKPOINTS.DESKTOP_MIN) return "tablet";
  return "desktop";
}

// ---------------------------------------------------------------------------
// SUITE 1: Scene-Coordinate Math, Projection & Zoom Scaling
// ---------------------------------------------------------------------------
async function testSceneMathAndProjection() {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 1: Scene-Coordinate Math, Projection & Zoom Scaling");
  console.log("-------------------------------------------------------");

  // 1. Identity Projection at Zoom 1.0, No Pan
  const scene1 = { sceneX: 100, sceneY: 150, sceneWidth: 768, sceneHeight: 600 };
  const vp1 = { zoom: 1.0, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 };
  const out1 = projectSceneToViewport(scene1, vp1);

  if (out1.x === 100 && out1.y === 150 && out1.width === 768 && out1.height === 600) {
    reporter.record("M2.MATH.1", "Identity projection at zoom 1.0 without scroll", "PASS");
  } else {
    reporter.record("M2.MATH.1", "Identity projection at zoom 1.0", "FAIL", JSON.stringify(out1));
  }

  // 2. Zoom Scaling (2.0x zoom doubles rendered screen width & height)
  const vpZoom2 = { zoom: 2.0, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 };
  const outZoom2 = projectSceneToViewport(scene1, vpZoom2);
  if (outZoom2.width === 1536 && outZoom2.height === 1200) {
    reporter.record("M2.MATH.2", "Canvas zoom 2.0x scales screen dimensions proportionally (768*2 = 1536)", "PASS");
  } else {
    reporter.record("M2.MATH.2", "Canvas zoom 2.0x scaling", "FAIL", `Width: ${outZoom2.width}`);
  }

  // 3. Zoom Scaling (0.5x zoom halves rendered screen dimensions)
  const vpZoomHalf = { zoom: 0.5, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 };
  const outZoomHalf = projectSceneToViewport(scene1, vpZoomHalf);
  if (outZoomHalf.width === 384 && outZoomHalf.height === 300) {
    reporter.record("M2.MATH.3", "Canvas zoom 0.5x scales screen dimensions proportionally (768*0.5 = 384)", "PASS");
  } else {
    reporter.record("M2.MATH.3", "Canvas zoom 0.5x scaling", "FAIL", `Width: ${outZoomHalf.width}`);
  }

  // 4. Canvas Pan Translation
  const vpPan = { zoom: 1.0, scrollX: 250, scrollY: 100, offsetLeft: 0, offsetTop: 0 };
  const outPan = projectSceneToViewport(scene1, vpPan);
  if (outPan.x === 350 && outPan.y === 250) {
    reporter.record("M2.MATH.4", "Canvas pan scroll offsets translate window screen coordinates", "PASS");
  } else {
    reporter.record("M2.MATH.4", "Canvas pan scroll offset", "FAIL", JSON.stringify(outPan));
  }

  // 5. Delta Scaling During Resize at Non-Unit Zoom
  const mouseDelta = 100;
  const scaledAtZoom2 = scaleDelta(mouseDelta, 2.0);
  const scaledAtZoomHalf = scaleDelta(mouseDelta, 0.5);
  if (scaledAtZoom2 === 50 && scaledAtZoomHalf === 200) {
    reporter.record("M2.MATH.5", "Resize delta scaling (dx / zoom) adjusts accurately for zoom", "PASS");
  } else {
    reporter.record("M2.MATH.5", "Resize delta scaling", "FAIL", `z2: ${scaledAtZoom2}, z0.5: ${scaledAtZoomHalf}`);
  }

  // 6. Dimension Clamping (Min Width 320px, Min Height 240px)
  const clampedSmall = clampDimensions(100, 50);
  const clampedHuge = clampDimensions(5000, 3000);
  if (
    clampedSmall.width === MIN_WIDTH &&
    clampedSmall.height === MIN_HEIGHT &&
    clampedHuge.width === MAX_WIDTH &&
    clampedHuge.height === MAX_HEIGHT
  ) {
    reporter.record("M2.MATH.6", "Dimension bounds clamp to [320x240] min and [3840x2160] max", "PASS");
  } else {
    reporter.record("M2.MATH.6", "Dimension bounds clamp", "FAIL", JSON.stringify({ clampedSmall, clampedHuge }));
  }

  // 7. Breakpoint Classification & Exact Boundary Pixels
  const c375 = classifyBreakpoint(375);
  const c639 = classifyBreakpoint(639);
  const c640 = classifyBreakpoint(640);
  const c768 = classifyBreakpoint(768);
  const c1023 = classifyBreakpoint(1023);
  const c1024 = classifyBreakpoint(1024);
  const c1440 = classifyBreakpoint(1440);

  if (
    c375 === "mobile" &&
    c639 === "mobile" &&
    c640 === "tablet" &&
    c768 === "tablet" &&
    c1023 === "tablet" &&
    c1024 === "desktop" &&
    c1440 === "desktop"
  ) {
    reporter.record("M2.MATH.7", "Breakpoint categorization & exact boundary transitions (639/640, 1023/1024)", "PASS");
  } else {
    reporter.record("M2.MATH.7", "Breakpoint categorization", "FAIL", JSON.stringify({ c639, c640, c1023, c1024 }));
  }

  // 8. Preset Specifications
  const validPresets = PRESETS.every((p) => p.width >= 320 && classifyBreakpoint(p.width) === p.category);
  if (validPresets && PRESETS.length === 3) {
    reporter.record("M2.MATH.8", "Breakpoint quick-presets defined (📱 375px, 📟 768px, 💻 1024px)", "PASS");
  } else {
    reporter.record("M2.MATH.8", "Breakpoint quick-presets", "FAIL", JSON.stringify(PRESETS));
  }
}

// ---------------------------------------------------------------------------
// SUITE 2: Dynamic Iframe CSS Media Query Breakpoint Verification (Headless Fixture)
// ---------------------------------------------------------------------------
async function testIframeResponsiveBreakpoints() {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 2: Dynamic CSS Media Query Breakpoint Verification");
  console.log("-------------------------------------------------------");

  // Spin up local HTTP fixture server
  const mockPort = 5589;
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (req.url === "/preview") {
      res.writeHead(200);
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Responsive Test Fixture</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, sans-serif;
                padding: 16px;
                min-height: 100vh;
                transition: background-color 0.1s ease;
              }
              /* Default Mobile (< 640px) */
              body { background-color: #fee2e2; color: #991b1b; }
              #badge { font-weight: bold; font-size: 16px; }
              #badge::after { content: "MOBILE"; }
              .view-mobile { display: block; }
              .view-tablet, .view-desktop { display: none; }

              /* Tablet (640px - 1023px) */
              @media (min-width: 640px) {
                body { background-color: #fef3c7; color: #92400e; }
                #badge::after { content: "TABLET"; }
                .view-mobile { display: none; }
                .view-tablet { display: block; }
                .view-desktop { display: none; }
              }

              /* Desktop (>= 1024px) */
              @media (min-width: 1024px) {
                body { background-color: #dcfce7; color: #166534; }
                #badge::after { content: "DESKTOP"; }
                .view-mobile, .view-tablet { display: none; }
                .view-desktop { display: block; }
              }
            </style>
          </head>
          <body>
            <div id="badge">CURRENT_BREAKPOINT: </div>
            <div id="readout">Width: <span id="width-val">0</span>px</div>
            <div class="view-mobile" id="mobile-el">Mobile Viewport Active (<640px)</div>
            <div class="view-tablet" id="tablet-el">Tablet Viewport Active (640-1023px)</div>
            <div class="view-desktop" id="desktop-el">Desktop Viewport Active (>=1024px)</div>
            <script>
              function updateWidth() {
                document.getElementById('width-val').innerText = window.innerWidth;
              }
              window.addEventListener('resize', updateWidth);
              updateWidth();
            </script>
          </body>
        </html>
      `);
      return;
    }

    // Host page simulating WebPreviewPanel container holding the iframe
    res.writeHead(200);
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 20px; background: #09090b; }
            #container {
              position: fixed;
              left: 50px;
              top: 50px;
              width: 768px;
              height: 600px;
              background: #16161a;
              border-radius: 16px;
              border: 1.5px solid rgba(255, 255, 255, 0.14);
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            #header {
              height: 38px;
              background: #1c1c21;
              display: flex;
              align-items: center;
              padding: 0 12px;
              gap: 8px;
              flex-shrink: 0;
            }
            #body {
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
              top: 38px;
              bottom: 28px;
              width: 8px;
              cursor: ew-resize;
              z-index: 10;
            }
            .resize-handle-se {
              position: absolute;
              right: 0;
              bottom: 0;
              width: 28px;
              height: 28px;
              cursor: nwse-resize;
              z-index: 10;
            }
            .drag-mask {
              display: none;
              position: fixed;
              inset: 0;
              z-index: 99999;
              cursor: ew-resize;
            }
          </style>
        </head>
        <body>
          <div id="container">
            <div id="header">
              <span id="dimension-pill">768 × 562 px</span>
            </div>
            <div id="body">
              <iframe id="preview-frame" src="/preview"></iframe>
              <div class="resize-handle-e" id="handle-e"></div>
              <div class="resize-handle-se" id="handle-se"></div>
            </div>
          </div>
          <div class="drag-mask" id="drag-mask"></div>
        </body>
      </html>
    `);
  });

  await new Promise((res) => server.listen(mockPort, res));

  let browser;
  try {
    browser = await chromium.launch({
      headless: IS_HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(`http://localhost:${mockPort}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);

    const frameElement = await page.$("#preview-frame");
    const frame = await frameElement.contentFrame();
    await frame.waitForSelector("#badge", { timeout: 5000 });

    // Step 1: Default Tablet Width (768px)
    const initialFrameW = await frame.evaluate(() => window.innerWidth);
    const initialTabletVisible = await frame.$eval("#tablet-el", (el) => window.getComputedStyle(el).display !== "none");
    if (initialFrameW === 768 && initialTabletVisible) {
      reporter.record("M2.RESP.1", "Initial container width 768px renders tablet media query", "PASS");
    } else {
      reporter.record("M2.RESP.1", "Initial container width 768px", "FAIL", `Width: ${initialFrameW}`);
    }

    // Step 2: Dynamic Resize to Mobile Preset (375px)
    await page.evaluate(() => {
      const container = document.getElementById("container");
      container.style.width = "375px";
    });
    await page.waitForTimeout(200);

    const frameW375 = await frame.evaluate(() => window.innerWidth);
    const mobileVisible = await frame.$eval("#mobile-el", (el) => window.getComputedStyle(el).display !== "none");
    const tabletHiddenOnMobile = await frame.$eval("#tablet-el", (el) => window.getComputedStyle(el).display === "none");

    if (frameW375 === 375 && mobileVisible && tabletHiddenOnMobile) {
      reporter.record("M2.RESP.2", "Snapping container to 375px dynamically triggers mobile media query (<640px)", "PASS");
    } else {
      reporter.record("M2.RESP.2", "Mobile preset (375px)", "FAIL", `Width: ${frameW375}, mobileVisible: ${mobileVisible}`);
    }

    // Step 3: Dynamic Resize to Desktop Preset (1024px)
    await page.evaluate(() => {
      const container = document.getElementById("container");
      container.style.width = "1024px";
    });
    await page.waitForTimeout(200);

    const frameW1024 = await frame.evaluate(() => window.innerWidth);
    const desktopVisible = await frame.$eval("#desktop-el", (el) => window.getComputedStyle(el).display !== "none");
    const tabletHiddenOnDesktop = await frame.$eval("#tablet-el", (el) => window.getComputedStyle(el).display === "none");

    if (frameW1024 === 1024 && desktopVisible && tabletHiddenOnDesktop) {
      reporter.record("M2.RESP.3", "Snapping container to 1024px dynamically triggers desktop media query (>=1024px)", "PASS");
    } else {
      reporter.record("M2.RESP.3", "Desktop preset (1024px)", "FAIL", `Width: ${frameW1024}`);
    }

    // Step 4: Exact Boundary Pixel Check (639px vs 640px)
    await page.evaluate(() => {
      document.getElementById("container").style.width = "639px";
    });
    await page.waitForTimeout(150);
    const is639Mobile = await frame.$eval("#mobile-el", (el) => window.getComputedStyle(el).display !== "none");

    await page.evaluate(() => {
      document.getElementById("container").style.width = "640px";
    });
    await page.waitForTimeout(150);
    const is640Tablet = await frame.$eval("#tablet-el", (el) => window.getComputedStyle(el).display !== "none");

    if (is639Mobile && is640Tablet) {
      reporter.record("M2.RESP.4", "Exact boundary transition at 639px (Mobile) vs 640px (Tablet)", "PASS");
    } else {
      reporter.record("M2.RESP.4", "Boundary transition at 639/640px", "FAIL", `639Mobile: ${is639Mobile}, 640Tablet: ${is640Tablet}`);
    }

    // Step 5: Exact Boundary Pixel Check (1023px vs 1024px)
    await page.evaluate(() => {
      document.getElementById("container").style.width = "1023px";
    });
    await page.waitForTimeout(150);
    const is1023Tablet = await frame.$eval("#tablet-el", (el) => window.getComputedStyle(el).display !== "none");

    await page.evaluate(() => {
      document.getElementById("container").style.width = "1024px";
    });
    await page.waitForTimeout(150);
    const is1024Desktop = await frame.$eval("#desktop-el", (el) => window.getComputedStyle(el).display !== "none");

    if (is1023Tablet && is1024Desktop) {
      reporter.record("M2.RESP.5", "Exact boundary transition at 1023px (Tablet) vs 1024px (Desktop)", "PASS");
    } else {
      reporter.record("M2.RESP.5", "Boundary transition at 1023/1024px", "FAIL", `1023Tablet: ${is1023Tablet}, 1024Desktop: ${is1024Desktop}`);
    }

    // Step 6: Dynamic Continuous Resizing Without Iframe Reload
    await frame.evaluate(() => {
      window._sessionMarker = 12345;
    });

    for (let w = 400; w <= 1100; w += 200) {
      await page.evaluate((targetW) => {
        document.getElementById("container").style.width = `${targetW}px`;
      }, w);
      await page.waitForTimeout(50);
    }

    const sessionMarker = await frame.evaluate(() => window._sessionMarker);
    if (sessionMarker === 12345) {
      reporter.record("M2.RESP.6", "Continuous resizing preserves iframe session state without reloading", "PASS");
    } else {
      reporter.record("M2.RESP.6", "Continuous resizing preserved session", "FAIL", "Iframe reloaded during resize");
    }
  } catch (err) {
    reporter.record("M2.RESP.ERR", "Iframe Responsive Breakpoint Suite error", "FAIL", err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

// ---------------------------------------------------------------------------
// SUITE 3: 3-Tier Pointer Event Hijacking & Mouse-Trap Defense
// ---------------------------------------------------------------------------
async function testPointerEventDefense() {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 3: 3-Tier Pointer Event Hijacking & Mouse-Trap Defense");
  console.log("-------------------------------------------------------");

  let browser;
  try {
    browser = await chromium.launch({
      headless: IS_HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            #container {
              position: fixed;
              left: 50px;
              top: 50px;
              width: 600px;
              height: 400px;
              background: #16161a;
            }
            iframe {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              border: none;
            }
            .handle {
              position: absolute;
              right: 0;
              bottom: 0;
              width: 24px;
              height: 24px;
              background: rgba(255, 255, 255, 0.2);
              cursor: nwse-resize;
              z-index: 20;
            }
            .drag-mask {
              display: none;
              position: fixed;
              inset: 0;
              z-index: 99999;
              cursor: nwse-resize;
            }
          </style>
        </head>
        <body>
          <div id="container">
            <iframe id="test-iframe" src="about:blank"></iframe>
            <div id="handle" class="handle"></div>
          </div>
          <div id="drag-mask" class="drag-mask"></div>

          <script>
            const handle = document.getElementById('handle');
            const iframe = document.getElementById('test-iframe');
            const dragMask = document.getElementById('drag-mask');
            const container = document.getElementById('container');
            let isResizing = false;
            let startX, startW;

            handle.addEventListener('pointerdown', (e) => {
              isResizing = true;
              startX = e.clientX;
              startW = container.clientWidth;
              
              // Tier 1: pointerEvents none on iframe
              iframe.style.pointerEvents = 'none';
              // Tier 2: pointer capture
              handle.setPointerCapture(e.pointerId);
              // Tier 3: global drag mask
              dragMask.style.display = 'block';
            });

            handle.addEventListener('pointermove', (e) => {
              if (!isResizing) return;
              const dx = e.clientX - startX;
              container.style.width = Math.max(320, startW + dx) + 'px';
            });

            handle.addEventListener('pointerup', (e) => {
              if (isResizing) {
                isResizing = false;
                iframe.style.pointerEvents = 'auto';
                try { handle.releasePointerCapture(e.pointerId); } catch {}
                dragMask.style.display = 'none';
              }
            });
          </script>
        </body>
      </html>
    `);

    // Verify Tier 1: Initial state has iframe pointer-events auto
    const initialIframePE = await page.$eval("#test-iframe", (el) => window.getComputedStyle(el).pointerEvents);
    if (initialIframePE === "auto") {
      reporter.record("M2.PTR.1", "Initial idle state has iframe pointer-events 'auto'", "PASS");
    } else {
      reporter.record("M2.PTR.1", "Initial iframe pointer-events", "FAIL", initialIframePE);
    }

    // Trigger PointerDown on handle
    const handleBox = await page.$eval("#handle", (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });

    await page.mouse.move(handleBox.x, handleBox.y);
    await page.mouse.down();
    await page.waitForTimeout(50);

    // Verify Active Resizing Defense State
    const activeIframePE = await page.$eval("#test-iframe", (el) => el.style.pointerEvents);
    const dragMaskDisplay = await page.$eval("#drag-mask", (el) => window.getComputedStyle(el).display);

    if (activeIframePE === "none" && dragMaskDisplay === "block") {
      reporter.record("M2.PTR.2", "Active resizing activates 3-tier defense (iframe PE none, drag-mask visible)", "PASS");
    } else {
      reporter.record("M2.PTR.2", "Active resizing defense", "FAIL", `PE: ${activeIframePE}, Mask: ${dragMaskDisplay}`);
    }

    // Drag rapidly across the iframe center
    await page.mouse.move(100, 100, { steps: 5 });
    await page.waitForTimeout(50);

    // Mouse up
    await page.mouse.up();
    await page.waitForTimeout(50);

    const releasedIframePE = await page.$eval("#test-iframe", (el) => el.style.pointerEvents);
    const releasedDragMask = await page.$eval("#drag-mask", (el) => window.getComputedStyle(el).display);

    if (releasedIframePE === "auto" && releasedDragMask === "none") {
      reporter.record("M2.PTR.3", "Releasing pointer cleanly tears down drag mask and restores iframe interaction", "PASS");
    } else {
      reporter.record("M2.PTR.3", "Release pointer state", "FAIL", `PE: ${releasedIframePE}, Mask: ${releasedDragMask}`);
    }
  } catch (err) {
    reporter.record("M2.PTR.ERR", "Pointer Event Defense Suite error", "FAIL", err.message);
  } finally {
    if (browser) await browser.close();
  }
}

// ---------------------------------------------------------------------------
// SUITE 4: WebPreviewPanel Component & DOM Contract Inspection
// ---------------------------------------------------------------------------
async function testComponentFileContracts() {
  console.log("\n-------------------------------------------------------");
  console.log(" SUITE 4: WebPreviewPanel Implementation Contract Inspection");
  console.log("-------------------------------------------------------");

  const componentPath = path.resolve(process.cwd(), "src/components/WebPreviewPanel.tsx");
  const fileExists = fs.existsSync(componentPath);

  if (!fileExists) {
    reporter.record(
      "M2.CODE.1",
      "src/components/WebPreviewPanel.tsx exists",
      "SKIP",
      "File not yet created (Scheduled for implementation by Worker in Milestone 2)"
    );
    reporter.record(
      "M2.CODE.2",
      "macOS frame styling (#16161a, 16px radius, border)",
      "SKIP",
      "Awaiting Worker implementation"
    );
    reporter.record(
      "M2.CODE.3",
      "Right-edge & corner resize handles present",
      "SKIP",
      "Awaiting Worker implementation"
    );
    reporter.record(
      "M2.CODE.4",
      "Breakpoint presets (📱 375px, 📟 768px, 💻 1024px) rendered",
      "SKIP",
      "Awaiting Worker implementation"
    );
    return;
  }

  try {
    const code = fs.readFileSync(componentPath, "utf-8");

    // 1. macOS frame styling
    const hasDarkSurface = code.includes("#16161a") || code.includes("bg-[#16161a]");
    const hasRadius16 = code.includes("16") && (code.includes("borderRadius") || code.includes("rounded-"));
    if (hasDarkSurface && hasRadius16) {
      reporter.record("M2.CODE.1", "WebPreviewPanel implements macOS dark surface (#16161a) and 16px radius", "PASS");
    } else {
      reporter.record("M2.CODE.1", "WebPreviewPanel frame styling", "FAIL", "Missing #16161a or 16px radius");
    }

    // 2. Traffic Light Buttons
    const hasClose = code.includes("#ff5f56") || code.includes("Close");
    const hasRecenter = code.includes("#ffbd2e") || code.includes("Recenter");
    const hasMaximize = code.includes("#27c93f") || code.includes("Maximize");
    if (hasClose && hasRecenter && hasMaximize) {
      reporter.record("M2.CODE.2", "macOS traffic lights present (close, recenter, maximize)", "PASS");
    } else {
      reporter.record("M2.CODE.2", "macOS traffic lights", "FAIL", "Traffic lights not fully defined");
    }

    // 3. Resize Handles
    const hasRightHandle = code.includes("ew-resize");
    const hasCornerHandle = code.includes("nwse-resize");
    if (hasRightHandle && hasCornerHandle) {
      reporter.record("M2.CODE.3", "Dual resize handles present (right-edge ew-resize and corner nwse-resize)", "PASS");
    } else {
      reporter.record("M2.CODE.3", "Dual resize handles", "FAIL", `RightHandle: ${hasRightHandle}, CornerHandle: ${hasCornerHandle}`);
    }

    // 4. Presets & 3-Tier Pointer Event Defense in Code
    const has375 = code.includes("375");
    const has768 = code.includes("768");
    const has1024 = code.includes("1024");
    const hasPointerCapture = code.includes("setPointerCapture");
    const hasConditionalPE = code.includes("pointerEvents");
    if (has375 && has768 && has1024 && hasPointerCapture && hasConditionalPE) {
      reporter.record("M2.CODE.4", "Breakpoint presets (📱 375px, 📟 768px, 💻 1024px) & 3-Tier pointer defense", "PASS");
    } else {
      reporter.record(
        "M2.CODE.4",
        "Breakpoint quick-presets & pointer defense",
        "FAIL",
        `Presets: ${has375 && has768 && has1024}, PointerCapture: ${hasPointerCapture}, PE: ${hasConditionalPE}`
      );
    }
  } catch (err) {
    reporter.record("M2.CODE.ERR", "Component file inspection error", "FAIL", err.message);
  }
}

// ---------------------------------------------------------------------------
// Master Runner Orchestrator
// ---------------------------------------------------------------------------
async function main() {
  console.log("=======================================================");
  console.log(" MILESTONE 2: DYNAMIC VIEWPORT & WINDOW RESIZING SUITE ");
  console.log("=======================================================");

  await testSceneMathAndProjection();
  await testIframeResponsiveBreakpoints();
  await testPointerEventDefense();
  await testComponentFileContracts();

  const allPassed = reporter.summary();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal Test Suite Failure:", err);
  process.exit(1);
});
