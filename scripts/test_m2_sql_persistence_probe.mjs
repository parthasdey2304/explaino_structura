import { chromium } from "playwright";

async function probeLocalStorageCollision() {
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

  const page = await context.newPage();
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Helper to extract Excalidraw API
  const getApi = () => page.evaluate(() => {
    const excalEl = document.querySelector(".excalidraw");
    const fiberKey = Object.keys(excalEl || {}).find(k => k.startsWith("__reactFiber$"));
    let fiber = fiberKey ? excalEl[fiberKey] : null;
    let api = null;
    while (fiber) {
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState?.current?.getSceneElements) {
            api = s.memoizedState.current;
            break;
          }
          if (s.memoizedState?.getSceneElements) {
            api = s.memoizedState;
            break;
          }
          s = s.next;
        }
      }
      if (api) break;
      fiber = fiber.return;
    }
    return api ? true : false;
  });

  console.log("Initial API acquisition:", await getApi());

  // Step 1: Ensure we have Tab 0 ("Main Tab") and Tab 1 ("Second Tab")
  const addBtn = page.locator('button[data-add-tab="true"]').first();
  await addBtn.click();
  await page.waitForTimeout(600);

  const tabs = await page.locator('[role="tab"]').all();
  console.log("Tabs count:", tabs.length);
  const tab0 = tabs[0];
  const tab1 = tabs[1];

  // Draw distinct shape on Tab 0
  await tab0.click();
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const excalEl = document.querySelector(".excalidraw");
    const fiberKey = Object.keys(excalEl || {}).find(k => k.startsWith("__reactFiber$"));
    let fiber = fiberKey ? excalEl[fiberKey] : null;
    let api = null;
    while (fiber) {
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState?.current?.getSceneElements) {
            api = s.memoizedState.current;
            break;
          }
          s = s.next;
        }
      }
      if (api) break;
      fiber = fiber.return;
    }
    const elem0 = {
      id: "SHAPE_TAB_0",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      strokeColor: "#ff0000",
      backgroundColor: "#ffcccc",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 0,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: 111,
      version: 1,
      versionNonce: 111,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
    };
    api.updateScene({ elements: [elem0] });
  });

  // Switch to Tab 1 (this saves Tab 0 into cacheRef and triggers background save for Tab 0)
  await tab1.click();
  await page.waitForTimeout(1000); // let Tab 0 save to SQLite

  // Now draw a DIFFERENT shape on Tab 1
  await page.evaluate(() => {
    const excalEl = document.querySelector(".excalidraw");
    const fiberKey = Object.keys(excalEl || {}).find(k => k.startsWith("__reactFiber$"));
    let fiber = fiberKey ? excalEl[fiberKey] : null;
    let api = null;
    while (fiber) {
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState?.current?.getSceneElements) {
            api = s.memoizedState.current;
            break;
          }
          s = s.next;
        }
      }
      if (api) break;
      fiber = fiber.return;
    }
    const elem1 = {
      id: "SHAPE_TAB_1",
      type: "ellipse",
      x: 300,
      y: 300,
      width: 150,
      height: 150,
      strokeColor: "#0000ff",
      backgroundColor: "#ccccff",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 0,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: 222,
      version: 1,
      versionNonce: 222,
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
    };
    api.updateScene({ elements: [elem1] });
  });

  // Wait 2000ms so handleOnChange writes SHAPE_TAB_1 to localStorage
  await page.waitForTimeout(2000);

  // Check what localStorage has right now
  const localStoredJson = await page.evaluate(() => {
    const raw = localStorage.getItem("explaino_drawing_scene_v1") || localStorage.getItem("excalidraw");
    if (!raw) {
      // Find all keys in localStorage
      return Object.keys(localStorage).map(k => ({ key: k, preview: localStorage.getItem(k)?.slice(0, 100) }));
    }
    return { keyFound: true, length: raw.length, raw: raw.slice(0, 200) };
  });
  console.log("LocalStorage content before reload:", localStoredJson);

  // Now reload the page without switching back to Tab 0!
  console.log("Reloading page...");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // After reload, what is the active tab?
  const activeTabName = await page.locator('[role="tab"][aria-selected="true"]').innerText();
  console.log("Active tab after reload:", activeTabName.trim());

  // What elements are currently rendered on the active tab?
  const renderedElements = await page.evaluate(() => {
    const excalEl = document.querySelector(".excalidraw");
    const fiberKey = Object.keys(excalEl || {}).find(k => k.startsWith("__reactFiber$"));
    let fiber = fiberKey ? excalEl[fiberKey] : null;
    let api = null;
    while (fiber) {
      if (fiber.memoizedState) {
        let s = fiber.memoizedState;
        while (s) {
          if (s.memoizedState?.current?.getSceneElements) {
            api = s.memoizedState.current;
            break;
          }
          s = s.next;
        }
      }
      if (api) break;
      fiber = fiber.return;
    }
    if (!api) return "NO_API";
    return api.getSceneElements().filter(e => !e.isDeleted).map(e => e.id);
  });
  console.log("Rendered elements on active tab after reload:", renderedElements);

  // Check what is in SQLite for Tab 0 and Tab 1
  const sqlContent = await page.evaluate(async () => {
    const res = await fetch("/api/canvases");
    const json = await res.json();
    const results = [];
    for (const c of json.canvases) {
      const detail = await fetch(`/api/canvases/${c.id}`).then(r => r.json());
      results.push({
        id: c.id,
        name: c.name,
        elements: detail.canvas?.elements?.map(e => e.id)
      });
    }
    return results;
  });
  console.log("SQLite database content:", JSON.stringify(sqlContent, null, 2));

  await browser.close();
}

probeLocalStorageCollision().catch(console.error);
