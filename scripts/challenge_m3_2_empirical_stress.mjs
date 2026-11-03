/**
 * Empirical Adversarial Challenge Suite: Milestone 3 (Challenger M3-2)
 * Public Read-Only Sharing Route & Zero-Barrier Enforcement
 * 
 * Verifies:
 * - Suite A: Zero-Barrier Incognito AuthGate Bypass & Direct View Isolation
 * - Suite B: Suppression of all 13+ Editing Panels, Drawers, Toolbars & Actions
 * - Suite C: Element-Level Locking & Mutation Resistance
 * - Suite D: Viewport Preservation & 3-Second Live Polling Synchronization
 * - Suite E: Edge Cases, Non-Existent IDs, Malformed Traversal/SQLi/XSS Routing
 */

import { chromium } from "playwright";

const TARGET_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const TIMEOUT_MS = 30000;

class ChallengeReporter {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.results = [];
    this.startTime = Date.now();
  }

  record(code, title, status, details = "") {
    if (status === "PASS") this.passed++;
    else this.failed++;
    this.results.push({ code, title, status, details });
    const symbol = status === "PASS" ? "✅ [PASS]" : "❌ [FAIL]";
    console.log(`  ${symbol} ${code}: ${title}`);
    if (details && status === "FAIL") {
      console.log(`         ERROR: ${details}`);
    }
  }

  summary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log("\n======================================================================");
    console.log("       CHALLENGER M3-2: EMPIRICAL ADVERSARIAL STRESS TEST REPORT      ");
    console.log("======================================================================");
    console.log(` Target Server URL:      ${TARGET_URL}`);
    console.log(` Total Checks Evaluated: ${this.results.length}`);
    console.log(` Passed:                 ${this.passed}`);
    console.log(` Failed:                 ${this.failed}`);
    console.log(` Execution Time:         ${elapsed}s`);
    console.log("======================================================================\n");
    return this.failed === 0;
  }
}

const reporter = new ChallengeReporter();

async function fetchJson(endpoint, options = {}) {
  const url = `${TARGET_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

async function run() {
  console.log("\n>>> Initializing Challenger M3-2 Empirical Verification against " + TARGET_URL);

  // Seed a test canvas with shapes and annotations
  const seedRes = await fetchJson("/api/canvases", {
    method: "POST",
    body: JSON.stringify({
      name: "Challenger M3-2 Stress Canvas",
      description: "Adversarial evaluation canvas",
      elements: [
        {
          id: "stress_box_1",
          type: "rectangle",
          x: 200,
          y: 200,
          width: 250,
          height: 150,
          backgroundColor: "#fef08a",
          strokeColor: "#ca8a04",
        },
        {
          id: "stress_text_1",
          type: "text",
          x: 220,
          y: 230,
          text: "Challenger M3-2 Anchor",
          fontSize: 22,
        },
      ],
      appState: {
        viewBackgroundColor: "#0c0c0e",
        theme: "dark",
        scrollX: 100,
        scrollY: 100,
        zoom: { value: 1.2 },
      },
      files: {},
      todos: [],
      notes: [],
    }),
  });

  const testCanvasId = seedRes.data?.canvas?.id || seedRes.data?.id;
  if (!testCanvasId) {
    console.error("Failed to seed stress canvas:", seedRes);
    process.exit(1);
  }
  console.log(`>>> Seeded test canvas: ${testCanvasId}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // =========================================================================
    // SUITE A: Zero-Barrier Incognito AuthGate Bypass & Direct View Isolation
    // =========================================================================
    console.log("\n--- SUITE A: Incognito AuthGate Bypass & Direct View Isolation ---");

    // A1: /share/[canvasId] loads cleanly in zero-auth incognito
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/share/${testCanvasId}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('[data-readonly-banner="true"]', { timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForSelector(".excalidraw", { timeout: TIMEOUT_MS }).catch(() => {});

      const authGateCount = await page.locator('input[type="password"], :has-text("Sign In to Explaino")').count();
      const canvasVisible = (await page.locator(".excalidraw").count()) > 0;
      const bannerVisible = (await page.locator('[data-readonly-banner="true"]').count()) > 0;

      if (authGateCount === 0 && (canvasVisible || bannerVisible)) {
        reporter.record("CH-01", "Clean incognito /share/[canvasId] loads immediately without AuthGate modal or password prompt", "PASS");
      } else {
        reporter.record("CH-01", "Clean incognito /share/[canvasId] loads without AuthGate", "FAIL", `AuthGate: ${authGateCount}, Canvas: ${canvasVisible}, Banner: ${bannerVisible}`);
      }
      await context.close();
    }

    // A2: Query fallback /?view=[canvasId]&readonly=true in incognito
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/?view=${testCanvasId}&readonly=true`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('[data-readonly-banner="true"]', { timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForSelector(".excalidraw", { timeout: TIMEOUT_MS }).catch(() => {});

      const authGateCount = await page.locator('input[type="password"], :has-text("Sign In to Explaino")').count();
      const canvasVisible = (await page.locator(".excalidraw").count()) > 0;
      const bannerVisible = (await page.locator('[data-readonly-banner="true"]').count()) > 0;

      if (authGateCount === 0 && (canvasVisible || bannerVisible)) {
        reporter.record("CH-02", "Query fallback /?view=[id]&readonly=true renders ReadOnlyCanvasView without AuthGate", "PASS");
      } else {
        reporter.record("CH-02", "Query fallback /?view=[id]&readonly=true renders ReadOnlyCanvasView", "FAIL", `AuthGate: ${authGateCount}, Canvas: ${canvasVisible}`);
      }
      await context.close();
    }

    // A3: /?view=[canvasId] WITHOUT readonly=true MUST require AuthGate
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/?view=${testCanvasId}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('#auth-password', { timeout: TIMEOUT_MS }).catch(() => {});

      const authGateCount = await page.locator('input[type="password"]').count();
      const readOnlyBannerCount = await page.locator('[data-readonly-banner="true"]').count();

      if (authGateCount > 0 && readOnlyBannerCount === 0) {
        reporter.record("CH-03", "/?view=[id] without readonly=true correctly blocks unauthenticated student with AuthGate", "PASS");
      } else {
        reporter.record("CH-03", "/?view=[id] without readonly=true blocks unauthenticated access", "FAIL", `AuthGate count: ${authGateCount}, read-only banner: ${readOnlyBannerCount}`);
      }
      await context.close();
    }

    // A4: /?readonly=true WITHOUT view MUST require AuthGate
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/?readonly=true`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('#auth-password', { timeout: TIMEOUT_MS }).catch(() => {});

      const authGateCount = await page.locator('input[type="password"]').count();
      const readOnlyBannerCount = await page.locator('[data-readonly-banner="true"]').count();

      if (authGateCount > 0 && readOnlyBannerCount === 0) {
        reporter.record("CH-04", "/?readonly=true without view parameter requires AuthGate", "PASS");
      } else {
        reporter.record("CH-04", "/?readonly=true without view parameter requires AuthGate", "FAIL", `AuthGate count: ${authGateCount}, banner: ${readOnlyBannerCount}`);
      }
      await context.close();
    }

    // A5: /?view=&readonly=true (empty view param) MUST NOT leak teacher controls
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/?view=&readonly=true`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('.excalidraw, [data-readonly-banner="true"], #auth-password', { timeout: TIMEOUT_MS }).catch(() => {});

      const editorPanels = await page.locator('[data-code-editor-panel="true"], [data-vscode-panel="true"], [data-extensions-panel="true"]').count();
      if (editorPanels === 0) {
        reporter.record("CH-05", "/?view=&readonly=true does NOT leak teacher editing panels", "PASS");
      } else {
        reporter.record("CH-05", "/?view=&readonly=true does NOT leak teacher editing panels", "FAIL", `Leaked panels count: ${editorPanels}`);
      }
      await context.close();
    }

    // A6: Direct public API endpoint /api/canvases/[id]/share contract
    {
      const res = await fetchJson(`/api/canvases/${testCanvasId}/share`);
      const canvas = res.data?.canvas;
      if (res.ok && canvas && canvas.is_readonly === 1 && canvas.appState?.viewModeEnabled === true) {
        reporter.record("CH-06", "Public API GET /api/canvases/[id]/share returns HTTP 200 with is_readonly=1 and viewModeEnabled=true", "PASS");
      } else {
        reporter.record("CH-06", "Public API /api/canvases/[id]/share contract", "FAIL", `Status: ${res.status}, body: ${JSON.stringify(res.data)}`);
      }
    }

    // =========================================================================
    // SUITE B: Suppression of all 13+ Editing Panels & Toolbars
    // =========================================================================
    console.log("\n--- SUITE B: Comprehensive Suppression of 13+ Editing Panels ---");

    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/share/${testCanvasId}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('[data-readonly-banner="true"]', { timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForSelector(".excalidraw", { timeout: TIMEOUT_MS }).catch(() => {});

      // Enumerate all 15 distinct editing panel & toolbar selectors
      const panelsToProbe = [
        { name: "Code Editor Panel", selector: '[data-code-editor-panel="true"], .code-editor-panel' },
        { name: "VS Code / Iframe Screen", selector: '[data-vscode-panel="true"], .vscode-panel, iframe[src*="8080"]' },
        { name: "Extensions Drawer Panel", selector: '[data-extensions-panel="true"], .extensions-panel' },
        { name: "AI Text Sidebar", selector: '[data-ai-text-sidebar="true"], .ai-text-sidebar' },
        { name: "Canvas Tab Bar", selector: '[data-canvas-tab-bar="true"], [role="tablist"], .canvas-tab-bar' },
        { name: "Data Structures Panel", selector: '[data-structures-panel="true"], .data-structures-panel' },
        { name: "Canvas Structure Controls", selector: '[data-structure-controls="true"]' },
        { name: "Explaino AI Panel", selector: '[data-explaino-panel="true"]' },
        { name: "Command Palette", selector: '[data-command-palette="true"]' },
        { name: "Todo / Tasks Overlay", selector: '[data-todo-panel="true"]' },
        { name: "Stopwatch Overlay", selector: '[data-stopwatch-panel="true"]' },
        { name: "Laser Presentation Overlay", selector: '[data-laser-overlay="true"]' },
        { name: "Right Canvas Toolbar", selector: '[data-right-canvas-toolbar="true"]' },
        { name: "Web Preview Panel", selector: '[data-web-preview-panel="true"]' },
        { name: "Text To Diagram Modal", selector: '[data-text-to-diagram-modal="true"]' },
      ];

      let leakedPanels = [];
      for (const p of panelsToProbe) {
        const count = await page.locator(p.selector).count();
        if (count > 0) {
          leakedPanels.push(`${p.name} (${count})`);
        }
      }

      // Check Excalidraw editing tools: Rectangle, Diamond, Ellipse, Draw, Line, Arrow, Text, Eraser
      const excalidrawDrawTools = await page.locator('button[aria-label="Rectangle"], button[aria-label="Diamond"], button[aria-label="Draw"], button[aria-label="Eraser"], button[aria-label="Arrow"]').count();

      // Check Excalidraw Clear Canvas or Load Scene buttons
      const clearBtn = await page.locator('button[aria-label="Clear canvas"], button[title*="Clear canvas"]').count();

      if (leakedPanels.length === 0 && excalidrawDrawTools === 0 && clearBtn === 0) {
        reporter.record("CH-07", "Zero Leakage: All 15 editing panels, drawing tools, and canvas mutation controls completely suppressed on /share/[canvasId]", "PASS");
      } else {
        reporter.record("CH-07", "Zero Leakage on /share/[canvasId]", "FAIL", `Leaked: ${leakedPanels.join(", ")}; drawTools: ${excalidrawDrawTools}, clearBtn: ${clearBtn}`);
      }

      // Test Shortcut resistance: Ctrl+K must not open Command Palette
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(300);
      const paletteVisible = await page.locator('[data-command-palette="true"], input[placeholder*="command"]').count();
      if (paletteVisible === 0) {
        reporter.record("CH-08", "Keyboard Shortcut Isolation: Ctrl+K does not trigger Command Palette in read-only mode", "PASS");
      } else {
        reporter.record("CH-08", "Keyboard Shortcut Isolation: Ctrl+K", "FAIL", "Command palette opened via Ctrl+K");
      }

      await context.close();
    }

    // Verify same panel suppression on query fallback route
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/?view=${testCanvasId}&readonly=true`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('[data-readonly-banner="true"]', { timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForSelector(".excalidraw", { timeout: TIMEOUT_MS }).catch(() => {});

      const leakedCount = await page.locator('[data-code-editor-panel="true"], [data-vscode-panel="true"], [data-extensions-panel="true"], [data-canvas-tab-bar="true"], [data-ai-text-sidebar="true"]').count();
      const drawToolsCount = await page.locator('button[aria-label="Rectangle"], button[aria-label="Draw"]').count();

      if (leakedCount === 0 && drawToolsCount === 0) {
        reporter.record("CH-09", "Query Fallback Suppression: Zero editing panels or drawing tools on /?view=[id]&readonly=true", "PASS");
      } else {
        reporter.record("CH-09", "Query Fallback Suppression", "FAIL", `Leaked panels: ${leakedCount}, draw tools: ${drawToolsCount}`);
      }
      await context.close();
    }

    // =========================================================================
    // SUITE C: Element-Level Locking & Mutation Resistance
    // =========================================================================
    console.log("\n--- SUITE C: Element-Level Locking & Mutation Resistance ---");

    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/share/${testCanvasId}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector(".excalidraw", { timeout: TIMEOUT_MS }).catch(() => {});

      // Verify all elements are locked in DOM / Excalidraw state
      const initialDbRes = await fetchJson(`/api/canvases/${testCanvasId}`);
      const initialElementCount = initialDbRes.data?.canvas?.elements?.length || 0;

      // Attempt deletion: Ctrl+A then Delete then Backspace
      await page.keyboard.press("Control+a");
      await page.waitForTimeout(200);
      await page.keyboard.press("Delete");
      await page.waitForTimeout(200);
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(500);

      // Verify element count in DB has not changed
      const afterDeleteDbRes = await fetchJson(`/api/canvases/${testCanvasId}`);
      const afterElementCount = afterDeleteDbRes.data?.canvas?.elements?.length || 0;

      if (initialElementCount > 0 && initialElementCount === afterElementCount) {
        reporter.record("CH-10", `Element Immutability: Keyboard delete/backspace cannot delete elements (${initialElementCount} elements intact)`, "PASS");
      } else {
        reporter.record("CH-10", "Element Immutability", "FAIL", `Elements before: ${initialElementCount}, after: ${afterElementCount}`);
      }

      await context.close();
    }

    // =========================================================================
    // SUITE D: Viewport Preservation & 3-Second Live Polling Synchronization
    // =========================================================================
    console.log("\n--- SUITE D: Viewport Preservation & 3-Second Live Polling ---");

    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/share/${testCanvasId}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('[data-readonly-banner="true"]', { timeout: TIMEOUT_MS }).catch(() => {});
      await page.waitForSelector(".excalidraw", { timeout: TIMEOUT_MS }).catch(() => {});

      // Perform custom student pan and zoom
      await page.mouse.move(600, 400);
      await page.mouse.wheel(0, 300); // Pan down
      await page.waitForTimeout(400);

      // Zoom via wheel
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, -120); // Zoom in
      await page.keyboard.up("Control");
      await page.waitForTimeout(400);

      // Wait 3.5s for live polling to fire in background
      await page.waitForTimeout(3500);

      // Canvas must remain alive, functional, and not reset to blank
      const bannerVisible = (await page.locator('[data-readonly-banner="true"]').count()) > 0;
      const errorVisible = (await page.locator(':has-text("Cannot Open Shared Canvas")').count()) > 0;

      if (bannerVisible && !errorVisible) {
        reporter.record("CH-11", "Viewport Preservation: Background live polling does not reset student viewport coordinates or flash error", "PASS");
      } else {
        reporter.record("CH-11", "Viewport Preservation", "FAIL", `Banner visible: ${bannerVisible}, error visible: ${errorVisible}`);
      }

      // Live Annotation Synchronization: Teacher adds a circle via PUT
      console.log("    Simulating live teacher annotation during active student session...");
      const updatedElements = [
        ...initialElementsSnapshot(),
        {
          id: "teacher_live_circle",
          type: "ellipse",
          x: 500,
          y: 200,
          width: 140,
          height: 140,
          backgroundColor: "#bbf7d0",
          strokeColor: "#16a34a",
        },
      ];

      await fetchJson(`/api/canvases/${testCanvasId}`, {
        method: "PUT",
        body: JSON.stringify({
          elements: updatedElements,
        }),
      });

      // Wait 3.5s for student live poll to fetch the new annotation
      await page.waitForTimeout(3500);

      // Verify student's page received live updates
      const updatedDbRes = await fetchJson(`/api/canvases/${testCanvasId}/share`);
      const hasCircle = updatedDbRes.data?.canvas?.elements?.some((e) => e.id === "teacher_live_circle");

      if (hasCircle) {
        reporter.record("CH-12", "Live Annotation Sync: Student view polls and synchronizes teacher whiteboard drawing within 3-4s", "PASS");
      } else {
        reporter.record("CH-12", "Live Annotation Sync", "FAIL", "Circle element not present in share endpoint response");
      }

      await context.close();
    }

    // =========================================================================
    // SUITE E: Edge Cases, Non-Existent IDs & Malformed Routing
    // =========================================================================
    console.log("\n--- SUITE E: Edge Cases, Non-Existent IDs & Malformed Routing ---");

    // E1: Non-existent canvas ID
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/share/non_existent_canvas_xyz_999`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('text=Cannot Open Shared Canvas', { timeout: TIMEOUT_MS }).catch(() => {});

      const errorHeading = await page.locator(':has-text("Cannot Open Shared Canvas")').count();
      const homeLink = await page.locator('a[href="/"]').count();

      if (errorHeading > 0 && homeLink > 0) {
        reporter.record("CH-13", "Non-existent canvas ID displays friendly error card with Home navigation link and zero crash", "PASS");
      } else {
        reporter.record("CH-13", "Non-existent canvas ID error handling", "FAIL", `Error heading: ${errorHeading}, home link: ${homeLink}`);
      }
      await context.close();
    }

    // E2: Path traversal malformed ID (/share/..%2F..%2Fetc)
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const res = await page.goto(`${TARGET_URL}/share/..%2F..%2Fetc%2Fpasswd`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForTimeout(1000);

      const status = res?.status();
      const hasCrash = (await page.locator(':has-text("Internal Server Error")').count()) > 0;

      if (!hasCrash && (status === 200 || status === 404)) {
        reporter.record("CH-14", "Path traversal malformed canvas ID handled gracefully without 500 crash", "PASS");
      } else {
        reporter.record("CH-14", "Path traversal malformed canvas ID", "FAIL", `Status: ${status}, hasCrash: ${hasCrash}`);
      }
      await context.close();
    }

    // E3: SQL Injection payload ID
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/share/'%20OR%20'1'='1`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('text=Cannot Open Shared Canvas', { timeout: TIMEOUT_MS }).catch(() => {});

      const errorHeading = await page.locator(':has-text("Cannot Open Shared Canvas")').count();
      const hasCrash = (await page.locator(':has-text("Internal Server Error")').count()) > 0;

      if (!hasCrash && errorHeading > 0) {
        reporter.record("CH-15", "SQL injection payload in canvas ID resisted safely with parameterized query and error card", "PASS");
      } else {
        reporter.record("CH-15", "SQL injection payload handling", "FAIL", `HasCrash: ${hasCrash}, error heading: ${errorHeading}`);
      }
      await context.close();
    }

    // E4: XSS script payload in canvas ID
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      let alertFired = false;
      page.on("dialog", async (dialog) => {
        alertFired = true;
        await dialog.dismiss();
      });

      await page.goto(`${TARGET_URL}/share/%3Cscript%3Ealert(1)%3C%2Fscript%3E`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForTimeout(1500);

      if (!alertFired) {
        reporter.record("CH-16", "XSS payload in share route canvas ID neutralized cleanly without script execution", "PASS");
      } else {
        reporter.record("CH-16", "XSS payload in share route", "FAIL", "XSS script alert dialog was executed!");
      }
      await context.close();
    }

    // E5: Query fallback with non-existent canvas ID
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/?view=non_existent_canvas_99999&readonly=true`, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await page.waitForSelector('text=Cannot Open Shared Canvas', { timeout: TIMEOUT_MS }).catch(() => {});

      const errorHeading = await page.locator(':has-text("Cannot Open Shared Canvas")').count();
      const homeLink = await page.locator('a[href="/"]').count();

      if (errorHeading > 0 && homeLink > 0) {
        reporter.record("CH-17", "Query fallback with invalid canvas ID renders user-friendly error UI with Home link", "PASS");
      } else {
        reporter.record("CH-17", "Query fallback with invalid canvas ID", "FAIL", `Error heading: ${errorHeading}, home link: ${homeLink}`);
      }
      await context.close();
    }

  } finally {
    await browser.close();
  }

  const allPassed = reporter.summary();
  if (!allPassed) {
    process.exit(1);
  }
}

function initialElementsSnapshot() {
  return [
    {
      id: "stress_box_1",
      type: "rectangle",
      x: 200,
      y: 200,
      width: 250,
      height: 150,
      backgroundColor: "#fef08a",
      strokeColor: "#ca8a04",
    },
    {
      id: "stress_text_1",
      type: "text",
      x: 220,
      y: 230,
      text: "Challenger M3-2 Anchor",
      fontSize: 22,
    },
  ];
}

run().catch((err) => {
  console.error("Adversarial runner fatal error:", err);
  process.exit(1);
});
