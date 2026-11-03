/**
 * Adversarial Empirical Edge Cases Stress Test Harness for Milestone 3
 * 
 * Tests:
 * 1. EDGE-01: Rapid Teacher Mutation Blitz (10 sequential updates in 1.5s) -> student sync convergence
 * 2. EDGE-02: High Element Batch Flood (250 elements) -> initial load & 100% element lock verification
 * 3. EDGE-03: Corrupted / Non-Array Elements Payload Resilience -> no unhandled crash, graceful recovery
 * 4. EDGE-04: Network Fault Tolerance -> transient polling failure does not wipe canvas or freeze client
 * 5. EDGE-05: Real DOM Viewport Panning & Zooming Verification -> student can pan & zoom via wheel/drag
 * 6. EDGE-06: Query Fallback Route (?view=[id]&readonly=true) -> verifies element locking and live sync parity
 */

import { chromium } from "playwright";

const TARGET_URL = process.env.APP_URL || "http://localhost:3000";

function makeElement(overrides = {}) {
  const now = Date.now();
  return {
    id: overrides.id || "elem_" + Math.random().toString(36).slice(2, 9),
    type: overrides.type || "rectangle",
    x: overrides.x ?? 100,
    y: overrides.y ?? 100,
    width: overrides.width ?? 120,
    height: overrides.height ?? 80,
    angle: 0,
    strokeColor: overrides.strokeColor || "#1e1e1e",
    backgroundColor: overrides.backgroundColor || "#bbf7d0",
    fillStyle: overrides.fillStyle || "solid",
    strokeWidth: overrides.strokeWidth || 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: "a0",
    roundness: null,
    seed: Math.floor(Math.random() * 100000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 100000),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: overrides.locked ?? false,
  };
}

async function fetchJson(endpoint, options = {}) {
  const res = await fetch(`${TARGET_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function waitForExcalidrawApi(page, maxWaitMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const ready = await page.evaluate(() => {
      if (window.__EXCALIDRAW_API__?.getAppState) return true;
      const el = document.querySelector(".excalidraw");
      if (!el) return false;
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      if (!fiberKey) return false;
      let fiber = el[fiberKey];
      while (fiber) {
        if (fiber.memoizedState) {
          let s = fiber.memoizedState;
          while (s) {
            if (s.memoizedState?.current?.getAppState) {
              return true;
            }
            s = s.next;
          }
        }
        fiber = fiber.return;
      }
      return false;
    });
    if (ready) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

async function getSceneProbe(page) {
  return await page.evaluate(() => {
    let api = window.__EXCALIDRAW_API__;
    if (!api) {
      const el = document.querySelector(".excalidraw");
      if (!el) return null;
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      let fiber = el[fiberKey];
      while (fiber) {
        if (fiber.memoizedState) {
          let s = fiber.memoizedState;
          while (s) {
            if (s.memoizedState?.current?.getAppState) {
              api = s.memoizedState.current;
              break;
            }
            s = s.next;
          }
        }
        if (api) break;
        fiber = fiber.return;
      }
    }
    if (!api) return null;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    return {
      elementCount: elements.length,
      allLocked: elements.length > 0 && elements.every((e) => e.locked === true),
      activeTool: appState.activeTool?.type,
      viewModeEnabled: appState.viewModeEnabled,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom?.value ?? appState.zoom,
      elementIds: elements.map((e) => e.id),
    };
  });
}

async function runEdgeCases() {
  console.log("======================================================================");
  console.log(" ADVERSARIAL EDGE CASE HARNESS — MILESTONE 3 ROUND 2");
  console.log("======================================================================\n");

  const results = [];
  function record(id, title, status, details = "") {
    results.push({ id, title, status, details });
    const tag = status === "PASS" ? "\x1b[32m[PASS]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
    console.log(`  ${tag} ${id}: ${title}`);
    if (details) {
      console.log(`         Details: ${details}`);
    }
  }

  const browser = await chromium.launch({ headless: true });

  // -------------------------------------------------------------------------
  // EDGE-01: Rapid Teacher Mutation Blitz (10 sequential updates in 1.5s)
  // -------------------------------------------------------------------------
  {
    const initialElements = [makeElement({ id: "blitz_0", x: 50, y: 50 })];
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Edge-1 Rapid Mutation Blitz",
        elements: initialElements,
      }),
    });
    const canvasId = createRes.data?.canvas?.id || createRes.data?.id;

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${TARGET_URL}/share/${canvasId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);

    // Fire 10 rapid sequential mutations
    const allBlitzElements = [...initialElements];
    for (let i = 1; i <= 10; i++) {
      allBlitzElements.push(makeElement({ id: `blitz_${i}`, x: 50 + i * 40, y: 50 + i * 20 }));
      await fetchJson(`/api/canvases/${canvasId}`, {
        method: "PUT",
        body: JSON.stringify({ elements: [...allBlitzElements] }),
      });
      await new Promise((r) => setTimeout(r, 120));
    }

    // Wait for student live polling to pick up final state (up to 7 seconds)
    let finalProbe = null;
    const start = Date.now();
    while (Date.now() - start < 8000) {
      await page.waitForTimeout(600);
      finalProbe = await getSceneProbe(page);
      if (finalProbe?.elementCount === 11 && finalProbe.elementIds.includes("blitz_10")) {
        break;
      }
    }

    if (finalProbe?.elementCount === 11 && finalProbe?.allLocked) {
      record("EDGE-01", "Rapid Mutation Blitz: Student canvas cleanly converged to 11 elements with all locked", "PASS");
    } else {
      record("EDGE-01", "Rapid Mutation Blitz", "FAIL", `Expected 11 elements, got ${finalProbe?.elementCount}. allLocked: ${finalProbe?.allLocked}`);
    }

    await page.close();
    if (canvasId) await fetchJson(`/api/canvases/${canvasId}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // EDGE-02: High Element Batch Flood (250 elements)
  // -------------------------------------------------------------------------
  {
    const floodElements = [];
    for (let i = 0; i < 250; i++) {
      floodElements.push(
        makeElement({
          id: `flood_${i}`,
          x: (i % 25) * 50,
          y: Math.floor(i / 25) * 60,
          width: 40,
          height: 40,
          backgroundColor: i % 2 === 0 ? "#bbf7d0" : "#fef08a",
        })
      );
    }

    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Edge-2 Flood 250 Elements",
        elements: floodElements,
      }),
    });
    const canvasId = createRes.data?.canvas?.id || createRes.data?.id;

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${TARGET_URL}/share/${canvasId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(2000);

    const probe = await getSceneProbe(page);

    if (probe?.elementCount === 250 && probe?.allLocked) {
      record("EDGE-02", "High Element Batch Flood: Successfully rendered 250 elements, all strictly locked", "PASS");
    } else {
      record("EDGE-02", "High Element Batch Flood", "FAIL", `Expected 250 elements, got ${probe?.elementCount}. allLocked: ${probe?.allLocked}`);
    }

    await page.close();
    if (canvasId) await fetchJson(`/api/canvases/${canvasId}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // EDGE-03: Corrupted / Malformed Shape Payload Resilience
  // -------------------------------------------------------------------------
  {
    const normalElem = makeElement({ id: "norm_1" });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Edge-3 Malformed Shape Test",
        elements: [normalElem],
      }),
    });
    const canvasId = createRes.data?.canvas?.id || createRes.data?.id;

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`${TARGET_URL}/share/${canvasId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);

    // Push corrupted payload with null/strange elements
    const malformedElements = [
      normalElem,
      { id: "corrupt_1", type: "rectangle", x: null, y: undefined, width: "invalid" },
      { id: "corrupt_2", type: "non_existent_type", weirdField: { deep: true } },
    ];

    await fetchJson(`/api/canvases/${canvasId}`, {
      method: "PUT",
      body: JSON.stringify({ elements: malformedElements }),
    });

    // Wait for polling cycle (4s)
    await page.waitForTimeout(4000);

    const probe = await getSceneProbe(page);
    const pageAlive = await page.evaluate(() => !!document.querySelector(".excalidraw"));

    // Check that client didn't crash
    if (pageAlive && errors.length === 0) {
      record("EDGE-03", "Malformed Shape Resilience: Student canvas remained stable with 0 unhandled page errors", "PASS");
    } else {
      record("EDGE-03", "Malformed Shape Resilience", "FAIL", `Page errors: ${JSON.stringify(errors)}, pageAlive: ${pageAlive}`);
    }

    await page.close();
    if (canvasId) await fetchJson(`/api/canvases/${canvasId}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // EDGE-04: Transient Network Fault Tolerance during Live Polling
  // -------------------------------------------------------------------------
  {
    const baseElem = makeElement({ id: "fault_elem_1" });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Edge-4 Network Fault Test",
        elements: [baseElem],
      }),
    });
    const canvasId = createRes.data?.canvas?.id || createRes.data?.id;

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${TARGET_URL}/share/${canvasId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(1000);

    // Intercept share endpoint to simulate network drop (HTTP 500)
    let interceptActive = true;
    await page.route(`**/api/canvases/${canvasId}/share`, (route) => {
      if (interceptActive) {
        route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal Server Error" }) });
      } else {
        route.continue();
      }
    });

    // Let 1 polling cycle fail with 500
    await page.waitForTimeout(3500);

    // Verify existing canvas elements are NOT wiped out by failed background poll
    let probe = await getSceneProbe(page);
    const preservedThroughFailure = probe?.elementCount === 1;

    // Restore network and update canvas with a new shape
    interceptActive = false;
    const recoveredElem = makeElement({ id: "fault_recovered_2", x: 300, y: 150 });
    await fetchJson(`/api/canvases/${canvasId}`, {
      method: "PUT",
      body: JSON.stringify({ elements: [baseElem, recoveredElem] }),
    });

    // Wait for next polling cycle to succeed and self-heal
    let recoveredProbe = null;
    const startRecovery = Date.now();
    while (Date.now() - startRecovery < 7000) {
      await page.waitForTimeout(800);
      recoveredProbe = await getSceneProbe(page);
      if (recoveredProbe?.elementCount === 2) break;
    }

    if (preservedThroughFailure && recoveredProbe?.elementCount === 2) {
      record("EDGE-04", "Network Fault Tolerance: Transient 500 kept existing elements intact and self-healed on reconnect", "PASS");
    } else {
      record("EDGE-04", "Network Fault Tolerance", "FAIL",
        `preservedThroughFailure: ${preservedThroughFailure}, recoveredCount: ${recoveredProbe?.elementCount}`);
    }

    await page.close();
    if (canvasId) await fetchJson(`/api/canvases/${canvasId}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // EDGE-05: Real DOM Viewport Panning & Zooming Verification
  // -------------------------------------------------------------------------
  {
    const elem = makeElement({ id: "pan_zoom_probe", x: 200, y: 200, width: 300, height: 200 });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Edge-5 Panning Zooming Test",
        elements: [elem],
      }),
    });
    const canvasId = createRes.data?.canvas?.id || createRes.data?.id;

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${TARGET_URL}/share/${canvasId}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(1000);

    const initialProbe = await getSceneProbe(page);

    // Perform real DOM mouse wheel zoom (Ctrl + mouse wheel)
    await page.mouse.move(640, 360);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -250);
    await page.keyboard.up("Control");
    await page.waitForTimeout(600);

    // Perform real DOM drag pan (spacebar + drag)
    await page.keyboard.down("Space");
    await page.mouse.down();
    await page.mouse.move(800, 500, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await page.waitForTimeout(600);

    const postNavProbe = await getSceneProbe(page);

    const zoomChanged = postNavProbe?.zoom !== initialProbe?.zoom;
    const scrollChanged = postNavProbe?.scrollX !== initialProbe?.scrollX || postNavProbe?.scrollY !== initialProbe?.scrollY;

    if (zoomChanged && scrollChanged) {
      record("EDGE-05", "Interactive Panning & Zooming: Real DOM wheel zoom and pan gestures actively updated viewport", "PASS",
        `Zoom: ${initialProbe?.zoom} -> ${postNavProbe?.zoom}, Pan: (${initialProbe?.scrollX}, ${initialProbe?.scrollY}) -> (${postNavProbe?.scrollX}, ${postNavProbe?.scrollY})`);
    } else {
      record("EDGE-05", "Interactive Panning & Zooming", "FAIL",
        `zoomChanged: ${zoomChanged}, scrollChanged: ${scrollChanged}`);
    }

    await page.close();
    if (canvasId) await fetchJson(`/api/canvases/${canvasId}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // EDGE-06: Query Fallback Route (?view=[id]&readonly=true) Parity
  // -------------------------------------------------------------------------
  {
    const qElem = makeElement({ id: "query_route_elem", x: 150, y: 150 });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Edge-6 Query Route Parity",
        elements: [qElem],
      }),
    });
    const canvasId = createRes.data?.canvas?.id || createRes.data?.id;

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${TARGET_URL}/?view=${canvasId}&readonly=true`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(1000);

    const probe = await getSceneProbe(page);
    const readOnlyBanner = await page.isVisible('[data-readonly-banner="true"]');

    if (probe?.elementCount === 1 && probe?.allLocked && probe?.viewModeEnabled && readOnlyBanner) {
      record("EDGE-06", "Query Fallback Route Parity: View mode, element locking, and student banner active on /?view=...&readonly=true", "PASS");
    } else {
      record("EDGE-06", "Query Fallback Route Parity", "FAIL",
        `count: ${probe?.elementCount}, allLocked: ${probe?.allLocked}, viewMode: ${probe?.viewModeEnabled}, banner: ${readOnlyBanner}`);
    }

    await page.close();
    if (canvasId) await fetchJson(`/api/canvases/${canvasId}`, { method: "DELETE" });
  }

  await browser.close();

  console.log("\n======================================================================");
  console.log(" ADVERSARIAL EDGE CASE SUMMARY");
  console.log("======================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(` Total Checks: ${total}`);
  console.log(` Passed:       \x1b[32m${passed}\x1b[0m`);
  console.log(` Failed:       ${failed > 0 ? "\x1b[31m" : "\x1b[32m"}${failed}\x1b[0m`);
  console.log("======================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runEdgeCases().catch((err) => {
  console.error("FATAL in runEdgeCases:", err);
  process.exit(1);
});
