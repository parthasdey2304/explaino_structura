/**
 * Adversarial Empirical Stress Test Suite for Milestone 3
 * (Public Read-Only Sharing Route & Zero-Barrier Enforcement)
 *
 * Verifies:
 * 1. Initial Load Element Hydration & Race Condition Probe
 * 2. Viewport Preservation under Live Polling (pan 450, -300, zoom 1.5x)
 * 3. Teacher Viewport Drift Immunity (teacher viewport changes do not clobber student)
 * 4. Live Annotation Arrival under Polling (teacher adds element -> student receives it)
 * 5. Element Immutability under Adversarial Mouse & Keyboard (Delete, Backspace, Ctrl+A+Del)
 * 6. Zero Redraw Churn on Idempotent Background Polls
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
    width: overrides.width ?? 200,
    height: overrides.height ?? 120,
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

async function runAdversarialTests() {
  console.log("======================================================================");
  console.log(" ADVERSARIAL EMPIRICAL STRESS TEST HARNESS — MILESTONE 3");
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
  // TEST 1: Initial Load Element Hydration & Race Condition Probe
  // -------------------------------------------------------------------------
  {
    const elem1 = makeElement({ id: "shape_init_1", x: 100, y: 100, width: 200, height: 100 });
    const elem2 = makeElement({ id: "shape_init_2", x: 400, y: 100, width: 150, height: 150, backgroundColor: "#fef08a" });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Test-1 Initial Hydration",
        elements: [elem1, elem2],
        appState: { viewBackgroundColor: "#0c0c0e", scrollX: 0, scrollY: 0, zoom: { value: 1.0 } },
      }),
    });

    const canvasId1 = createRes.data?.canvas?.id || createRes.data?.id;

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${TARGET_URL}/share/${canvasId1}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(3500);

    const probe = await page.evaluate(() => {
      const el = document.querySelector(".excalidraw");
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      let fiber = el[fiberKey];
      let api = null;
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
      if (!api) return { error: "Excalidraw API not found in fiber" };
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      return {
        count: elements.length,
        elements,
        allLocked: elements.length > 0 && elements.every((e) => e.locked === true),
        viewModeEnabled: appState.viewModeEnabled,
      };
    });

    if (probe.count === 2 && probe.allLocked) {
      record("ADV-01", "Initial Load Element Hydration: Elements rendered on Excalidraw scene with locked: true", "PASS");
    } else {
      record("ADV-01", "Initial Load Element Hydration: Elements rendered on Excalidraw scene with locked: true", "FAIL",
        `Expected 2 elements on initial load, found ${probe.count}. Elements: ${JSON.stringify(probe.elements)}. (Unmounted setState race condition in handleExcalidrawAPI)`);
    }

    await context.close();
    if (canvasId1) await fetchJson(`/api/canvases/${canvasId1}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // TEST 2: Viewport Preservation & Live Annotation Arrival under Polling
  // -------------------------------------------------------------------------
  {
    const elem1 = makeElement({ id: "shape_p2_1", x: 100, y: 100, width: 200, height: 100 });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Test-2 Viewport Preservation",
        elements: [elem1],
        appState: { viewBackgroundColor: "#0c0c0e", scrollX: 0, scrollY: 0, zoom: { value: 1.0 } },
      }),
    });

    const canvasId2 = createRes.data?.canvas?.id || createRes.data?.id;

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${TARGET_URL}/share/${canvasId2}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(1000);

    // Apply student viewport navigation: Pan to (scrollX=450, scrollY=-300) and Zoom to 1.5x
    await page.evaluate(() => {
      const el = document.querySelector(".excalidraw");
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      let fiber = el[fiberKey];
      let api = null;
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
      if (!api) return;

      api.updateScene({
        appState: {
          scrollX: 450,
          scrollY: -300,
          zoom: { value: 1.5 },
        },
      });
    });

    // Simulate Teacher adding a new live shape and moving teacher's viewport
    const newShape = makeElement({ id: "shape_live_3", x: 700, y: 300, width: 120, height: 120, backgroundColor: "#f43f5e" });
    const elemU1 = makeElement({ id: "shape_p2_1", x: 100, y: 100, width: 200, height: 100 });

    await fetchJson(`/api/canvases/${canvasId2}`, {
      method: "PUT",
      body: JSON.stringify({
        elements: [elemU1, newShape],
        appState: { scrollX: 999, scrollY: 999, zoom: { value: 0.5 } }, // Teacher viewport drifts
      }),
    });

    // Wait up to 8s for student 3-second live polling cycle to trigger and receive new element
    let postPollState = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 8000) {
      await page.waitForTimeout(800);
      postPollState = await page.evaluate(() => {
        const el = document.querySelector(".excalidraw");
        const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
        let fiber = el[fiberKey];
        let api = null;
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
        if (!api) return null;
        const elements = api.getSceneElements();
        const s = api.getAppState();
        return {
          count: elements.length,
          hasLiveShape: elements.some((e) => e.id === "shape_live_3"),
          scrollX: s.scrollX,
          scrollY: s.scrollY,
          zoom: s.zoom.value,
        };
      });
      if (postPollState?.hasLiveShape) break;
    }

    // Verify Viewport Preservation
    const viewportPreserved =
      postPollState &&
      postPollState.scrollX === 450 &&
      postPollState.scrollY === -300 &&
      postPollState.zoom === 1.5;

    if (viewportPreserved) {
      record("ADV-02", "Viewport Preservation: Student scrollX=450, scrollY=-300, zoom=1.5x preserved during live polling", "PASS");
    } else {
      record("ADV-02", "Viewport Preservation: Student scrollX=450, scrollY=-300, zoom=1.5x preserved during live polling", "FAIL",
        `Viewport reset or changed: scrollX=${postPollState?.scrollX}, scrollY=${postPollState?.scrollY}, zoom=${postPollState?.zoom}`);
    }

    // Verify Teacher Viewport Drift does not clobber student
    const teacherDriftIgnored =
      postPollState &&
      postPollState.scrollX !== 999 &&
      postPollState.scrollY !== 999 &&
      postPollState.zoom !== 0.5;

    if (teacherDriftIgnored) {
      record("ADV-03", "Teacher Viewport Drift Immunity: Student viewport immune to teacher's saved pan/zoom coordinates", "PASS");
    } else {
      record("ADV-03", "Teacher Viewport Drift Immunity", "FAIL", "Student viewport was clobbered by teacher's saved coordinates (999, 999, 0.5x)");
    }

    // Verify Live Elements arrived
    if (postPollState && postPollState.hasLiveShape) {
      record("ADV-04", "Live Annotation Arrival: New teacher shape 'shape_live_3' successfully arrived on student canvas", "PASS");
    } else {
      record("ADV-04", "Live Annotation Arrival", "FAIL", `New shape not found in student scene elements. Count: ${postPollState?.count}`);
    }

    await context.close();
    if (canvasId2) await fetchJson(`/api/canvases/${canvasId2}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // TEST 3: Element Immutability under Adversarial Mouse & Keyboard Interactions
  // -------------------------------------------------------------------------
  {
    const elem1 = makeElement({ id: "shape_p3_1", x: 100, y: 100, width: 200, height: 100 });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Test-3 Element Immutability",
        elements: [elem1],
        appState: { viewBackgroundColor: "#0c0c0e" },
      }),
    });

    const canvasId3 = createRes.data?.canvas?.id || createRes.data?.id;

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${TARGET_URL}/share/${canvasId3}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(1000);

    // Ensure elements are present in Excalidraw scene for immutability testing
    await page.evaluate(() => {
      const el = document.querySelector(".excalidraw");
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      let fiber = el[fiberKey];
      let api = null;
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
      if (!api) return;
      if (api.getSceneElements().length === 0) {
        api.updateScene({
          elements: [
            {
              id: "shape_locked_1",
              type: "rectangle",
              x: 100,
              y: 100,
              width: 200,
              height: 100,
              angle: 0,
              strokeColor: "#1e1e1e",
              backgroundColor: "#bbf7d0",
              fillStyle: "solid",
              strokeWidth: 2,
              strokeStyle: "solid",
              roughness: 1,
              opacity: 100,
              groupIds: [],
              frameId: null,
              index: "a0",
              roundness: null,
              seed: 12345,
              version: 1,
              versionNonce: 54321,
              isDeleted: false,
              boundElements: null,
              updated: Date.now(),
              link: null,
              locked: true,
            },
          ],
        });
      }
    });

    const beforeCount = await page.evaluate(() => {
      const el = document.querySelector(".excalidraw");
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      let fiber = el[fiberKey];
      let api = null;
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
      return api ? api.getSceneElements().length : 0;
    });

    // 1. Attack: Try Select All + Delete key
    await page.click(".excalidraw");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(300);

    // 2. Attack: Try Backspace
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(300);

    // 3. Attack: Try Mouse Drag to resize or move element
    await page.mouse.move(200, 150);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 4. Attack: Keyboard drawing tool shortcut 'r' (rectangle), 'd' (draw)
    await page.keyboard.press("r");
    await page.waitForTimeout(200);
    await page.mouse.move(500, 500);
    await page.mouse.down();
    await page.mouse.move(600, 600, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const postAttackState = await page.evaluate(() => {
      const el = document.querySelector(".excalidraw");
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      let fiber = el[fiberKey];
      let api = null;
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
      if (!api) return null;
      const elements = api.getSceneElements();
      const s = api.getAppState();
      return {
        count: elements.length,
        selectedIds: Object.keys(s.selectedElementIds || {}),
        activeToolType: s.activeTool.type,
      };
    });

    const elementsPreserved = postAttackState && postAttackState.count === beforeCount && beforeCount > 0;
    const noElementsSelected = postAttackState && postAttackState.selectedIds.length === 0;
    const handToolLocked = postAttackState && postAttackState.activeToolType === "hand";

    if (elementsPreserved && noElementsSelected && handToolLocked) {
      record("ADV-05", "Element Immutability: Elements immune to Delete, Backspace, Ctrl+A, drag-mutation, and tool shortcuts", "PASS");
    } else {
      record("ADV-05", "Element Immutability", "FAIL",
        `Count changed from ${beforeCount} to ${postAttackState?.count}, selectedIds=${JSON.stringify(postAttackState?.selectedIds)}, tool=${postAttackState?.activeToolType}`);
    }

    await context.close();
    if (canvasId3) await fetchJson(`/api/canvases/${canvasId3}`, { method: "DELETE" });
  }

  // -------------------------------------------------------------------------
  // TEST 4: Zero Redraw Churn on Idempotent Background Polls
  // -------------------------------------------------------------------------
  {
    const elem1 = makeElement({ id: "shape_p4_1", x: 100, y: 100, width: 200, height: 100 });
    const createRes = await fetchJson("/api/canvases", {
      method: "POST",
      body: JSON.stringify({
        name: "Adv-Test-4 Redraw Churn",
        elements: [elem1],
        appState: { viewBackgroundColor: "#0c0c0e" },
      }),
    });

    const canvasId4 = createRes.data?.canvas?.id || createRes.data?.id;

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${TARGET_URL}/share/${canvasId4}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".excalidraw", { timeout: 30000 });
    await waitForExcalidrawApi(page);
    await page.waitForTimeout(2000);

    // Instrument updateScene call count
    const instrumented = await page.evaluate(() => {
      const el = document.querySelector(".excalidraw");
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      let fiber = el[fiberKey];
      let api = null;
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
      if (!api) return false;

      window.__updateSceneCount = 0;
      const originalUpdateScene = api.updateScene.bind(api);
      api.updateScene = function (...args) {
        window.__updateSceneCount++;
        return originalUpdateScene(...args);
      };
      return true;
    });

    if (instrumented) {
      // Wait 7 seconds (2 full polling cycles of 3s each) with NO modifications made
      await page.waitForTimeout(7000);

      const churnCount = await page.evaluate(() => window.__updateSceneCount ?? -1);

      if (churnCount === 0) {
        record("ADV-06", "Zero Redraw Churn: Polling with no modifications invoked updateScene 0 times across 7 seconds", "PASS");
      } else {
        record("ADV-06", "Zero Redraw Churn: Polling with no modifications invoked updateScene 0 times", "FAIL",
          `updateScene was invoked ${churnCount} times despite canvas having no modifications (flicker/churn)`);
      }
    } else {
      record("ADV-06", "Zero Redraw Churn", "FAIL", "Could not instrument updateScene API");
    }

    await context.close();
    if (canvasId4) await fetchJson(`/api/canvases/${canvasId4}`, { method: "DELETE" });
  }

  await browser.close();

  console.log("\n======================================================================");
  console.log(" ADVERSARIAL STRESS TEST SUMMARY");
  console.log("======================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(` Total Checks: ${total}`);
  console.log(` Passed:       \x1b[32m${passed}\x1b[0m`);
  console.log(` Failed:       ${failed > 0 ? "\x1b[31m" : "\x1b[32m"}${failed}\x1b[0m`);
  console.log("======================================================================\n");

  return { total, passed, failed, results };
}

runAdversarialTests().catch(console.error);
