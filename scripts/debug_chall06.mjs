import { chromium } from "playwright";

const TARGET_URL = "http://localhost:3000";

const INJECT_API_HELPER = `
  window.__getExcalidrawApi = function() {
    if (window.__testExcalidrawAPI && typeof window.__testExcalidrawAPI.getSceneElements === "function") {
      return window.__testExcalidrawAPI;
    }
    const excalEl = document.querySelector(".excalidraw");
    if (!excalEl) return null;
    const fiberKey = Object.keys(excalEl).find(k => k.startsWith("__reactFiber$"));
    let fiber = fiberKey ? excalEl[fiberKey] : null;
    let api = null;
    while (fiber) {
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState && typeof s.memoizedState === "object") {
            if (typeof s.memoizedState.getSceneElements === "function") {
              api = s.memoizedState;
              break;
            }
            if (s.memoizedState.current && typeof s.memoizedState.current.getSceneElements === "function") {
              api = s.memoizedState.current;
              break;
            }
          }
          s = s.next;
        }
      }
      if (api) break;
      fiber = fiber.return;
    }
    if (api) {
      window.__testExcalidrawAPI = api;
      return api;
    }
    return null;
  };
`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addInitScript(() => {
    localStorage.setItem(
      "explaino_auth_user",
      JSON.stringify({
        email: "parthasdeyofficial@gmail.com",
        authenticated: true,
        displayName: "Parth Vastavik",
      })
    );
  });
  await context.addInitScript(INJECT_API_HELPER);

  const page = await context.newPage();
  page.on("console", (msg) => console.log(`[BROWSER ${msg.type()}]`, msg.text()));

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Get active tab
  const activeTab = page.locator('[role="tab"][aria-selected="true"]').first();
  const activeTabId = await activeTab.getAttribute("data-tab-id");
  console.log("Current active tab ID:", activeTabId);

  // Draw element on active tab
  console.log("Drawing element on active tab...");
  await page.evaluate(() => {
    const api = window.__getExcalidrawApi();
    if (!api) {
      console.error("NO EXCALIDRAW API FOUND");
      return;
    }
    const elem = {
      id: "active_tab_reload_marker",
      type: "rectangle",
      x: 350,
      y: 350,
      width: 100,
      height: 100,
      strokeColor: "#099268",
      backgroundColor: "#d3f9d8",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 0,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: 888,
      version: 1,
      versionNonce: 888,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
    };
    api.updateScene({ elements: [elem] });
  });

  await page.waitForTimeout(1500);

  // Check SQL before reload
  const sqlBeforeReload = await page.evaluate(async (id) => {
    const res = await fetch(`/api/canvases/${id}`);
    const json = await res.json();
    return {
      elementsCount: json.canvas?.elements?.length,
      hasElem: Array.isArray(json.canvas?.elements) && json.canvas.elements.some((e) => e.id === "active_tab_reload_marker"),
    };
  }, activeTabId);
  console.log("SQL before reload:", sqlBeforeReload);

  // Reload page
  console.log("Reloading page...");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
  await page.waitForTimeout(1500);

  await page.evaluate(INJECT_API_HELPER);

  const afterReloadInfo = await page.evaluate(async (expectedId) => {
    const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
    const activeId = activeTab?.getAttribute("data-tab-id");
    const localActive = localStorage.getItem("explaino_active_canvas_id");
    const scopedKey = `explaino_autosave_${activeId}`;
    const scopedBackup = localStorage.getItem(scopedKey);

    const api = window.__getExcalidrawApi();
    const sceneElements = api ? api.getSceneElements().filter(e => !e.isDeleted) : [];

    const dbRes = await fetch(`/api/canvases/${activeId}`);
    const dbJson = await dbRes.json();

    return {
      activeId,
      expectedId,
      localActive,
      scopedBackupExists: !!scopedBackup,
      sceneElementsCount: sceneElements.length,
      sceneElementIds: sceneElements.map(e => e.id),
      dbElementsCount: dbJson.canvas?.elements?.length,
      dbElementIds: dbJson.canvas?.elements?.map(e => e.id),
    };
  }, activeTabId);

  console.log("After reload debug info:", JSON.stringify(afterReloadInfo, null, 2));

  await browser.close();
}

main().catch(console.error);
