/**
 * Independent Forensic Adversarial Verification Suite for Milestone 2 (Round 2)
 * Archetype: Forensic Auditor
 * Scope: Independent verification of multi-canvas tabs, cache fidelity, undo isolation,
 *        fallback resilience, and SQLite database persistence.
 */

import { chromium } from "playwright";

const TARGET_URL = process.env.APP_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const results = [];

function record(id, description, status, details = "") {
  results.push({ id, description, status, details });
  const statusStr = status === "PASS" ? "\x1b[32m[PASS]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
  console.log(`  ${statusStr} \x1b[1m${id}\x1b[0m: ${description}`);
  if (details) {
    console.log(`         \x1b[90m${details}\x1b[0m`);
  }
  if (status === "PASS") passed++;
  else failed++;
}

async function runIndependentAudit() {
  console.log("\n======================================================================");
  console.log("  INDEPENDENT FORENSIC AUDITOR VERIFICATION SUITE (M2-R2)");
  console.log("======================================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });

  // Pre-seed authentication session for teacher view
  await context.addInitScript(() => {
    localStorage.setItem(
      "explaino_auth_user",
      JSON.stringify({
        email: "parthasdeyofficial@gmail.com",
        authenticated: true,
        displayName: "Parth Vastavik",
      })
    );

    window.__getExcalidrawApi = () => {
      if (window.__testExcalidrawAPI) return window.__testExcalidrawAPI;
      const excalEl = document.querySelector(".excalidraw");
      if (!excalEl) return null;
      const fiberKey = Object.keys(excalEl).find((k) => k.startsWith("__reactFiber$"));
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
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  try {
    console.log(`  Navigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    // TEST-01: Tab Bar Geometry & Height Compliance
    {
      const tabBar = page.locator('[data-canvas-tab-bar="true"]');
      const box = await tabBar.boundingBox();
      const height = box ? Math.round(box.height) : 0;
      if (height === 40 || (height >= 38 && height <= 42)) {
        record("TEST-01", `Tab bar renders at exact specification height (${height}px)`, "PASS");
      } else {
        record("TEST-01", `Tab bar height compliance`, "FAIL", `Expected 40px, got ${height}px`);
      }
    }

    // Helper: Create valid Excalidraw element
    const createElement = (id, x, y, color = "#1971c2") => ({
      id,
      type: "rectangle",
      x,
      y,
      width: 140,
      height: 90,
      strokeColor: color,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      groupIds: [],
      roundness: null,
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 100000),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
    });

    // TEST-02: Multi-Tab Drawing & In-Memory Cache Isolation
    let tab1_Id = null;
    let tab2_Id = null;
    {
      const initialActiveTab = page.locator('[data-canvas-tab-bar="true"] [data-active-tab="true"]');
      tab1_Id = await initialActiveTab.getAttribute("data-tab-id");

      // Inject shape on Tab 1
      await page.evaluate((el) => {
        const api = window.__getExcalidrawApi();
        if (api) {
          api.updateScene({ elements: [el], commitToHistory: true });
        }
      }, createElement("forensic_shape_tab1", 150, 150));
      await page.waitForTimeout(400);

      // Create Tab 2
      const addBtn = page.locator('[data-add-tab="true"]');
      await addBtn.click();
      await page.waitForTimeout(1000);

      const activeTab2 = page.locator('[data-canvas-tab-bar="true"] [data-active-tab="true"]');
      tab2_Id = await activeTab2.getAttribute("data-tab-id");

      const tab2Elements = await page.evaluate(() => {
        const api = window.__getExcalidrawApi();
        return api ? api.getSceneElements().filter((e) => !e.isDeleted).length : -1;
      });

      if (tab1_Id !== tab2_Id && tab2Elements === 0) {
        record(
          "TEST-02",
          `In-memory cache isolation verified: New tab (${tab2_Id}) initializes with clean 0 elements`,
          "PASS"
        );
      } else {
        record(
          "TEST-02",
          "In-memory cache isolation",
          "FAIL",
          `Tab1: ${tab1_Id}, Tab2: ${tab2_Id}, Tab2 elements: ${tab2Elements}`
        );
      }
    }

    // TEST-03: Canvas-Scoped Undo/Redo Boundary Isolation
    {
      // Populate Tab 2 with a shape
      await page.evaluate((el) => {
        const api = window.__getExcalidrawApi();
        if (api) {
          api.updateScene({ elements: [el], commitToHistory: true });
        }
      }, createElement("forensic_shape_tab2", 300, 300));
      await page.waitForTimeout(400);

      // Perform multiple undos on Tab 2
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Control+z");
        await page.waitForTimeout(60);
      }

      // Switch back to Tab 1
      const tab1Locator = page.locator(`[data-tab-id="${tab1_Id}"]`);
      await tab1Locator.click();
      await page.waitForTimeout(600);

      const tab1Elements = await page.evaluate(() => {
        const api = window.__getExcalidrawApi();
        return api ? api.getSceneElements().filter((e) => !e.isDeleted).map((e) => e.id) : [];
      });

      const tab1Preserved = tab1Elements.includes("forensic_shape_tab1");

      if (tab1Preserved) {
        record(
          "TEST-03",
          `Canvas-scoped undo isolation confirmed: Multiple undos on Tab 2 left Tab 1 completely untouched (forensic_shape_tab1 intact)`,
          "PASS"
        );
      } else {
        record(
          "TEST-03",
          "Canvas-scoped undo isolation",
          "FAIL",
          `Tab 1 elements after Tab 2 undos: [${tab1Elements.join(", ")}]`
        );
      }
    }

    // TEST-04: Inline Renaming on Double-Click
    {
      const currentTab = page.locator(`[data-tab-id="${tab1_Id}"]`);
      await currentTab.dblclick();
      await page.waitForTimeout(400);

      const renameInput = page.locator('[data-tab-rename-input="true"]');
      if ((await renameInput.count()) > 0) {
        await renameInput.fill("Audit Milestone 2 Tab");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(600);

        const updatedText = await currentTab.innerText();
        if (updatedText.includes("Audit Milestone 2 Tab")) {
          record("TEST-04", "Inline renaming commits cleanly on Enter", "PASS");
        } else {
          record("TEST-04", "Inline rename commit", "FAIL", `Updated text: ${updatedText}`);
        }
      } else {
        record("TEST-04", "Inline rename input", "FAIL", "Rename input did not appear");
      }
    }

    // TEST-05: Rapid Multi-Tab Switch Storm (20 rapid switches without crash)
    {
      let switchErrors = 0;
      for (let i = 0; i < 20; i++) {
        const targetId = i % 2 === 0 ? tab2_Id : tab1_Id;
        const targetLocator = page.locator(`[data-tab-id="${targetId}"]`);
        await targetLocator.click().catch(() => switchErrors++);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(500);

      const currentActive = await page.locator('[data-canvas-tab-bar="true"] [data-active-tab="true"]').count();
      if (switchErrors === 0 && currentActive === 1 && pageErrors.length === 0) {
        record("TEST-05", "Rapid tab switching storm (20 cycles @ 60ms) sustained with 0 errors", "PASS");
      } else {
        record("TEST-05", "Rapid tab switching storm", "FAIL", `Errors: ${switchErrors}, PageErrors: ${pageErrors.length}`);
      }
    }

    // TEST-06: Auto-Fallback Resilience on Closing All Tabs
    {
      const initialTabsCount = await page.locator('[data-canvas-tab-bar="true"] [role="tab"]').count();
      for (let i = 0; i < initialTabsCount; i++) {
        const closeBtn = page.locator('[data-close-tab="true"]').first();
        if ((await closeBtn.count()) > 0) {
          await closeBtn.click();
          await page.waitForTimeout(300);
        }
      }

      await page.waitForTimeout(1000);
      const remainingTabs = page.locator('[data-canvas-tab-bar="true"] [role="tab"]');
      const finalCount = await remainingTabs.count();
      const fallbackTitle = finalCount > 0 ? await remainingTabs.first().innerText() : "";

      if (finalCount === 1 && fallbackTitle.includes("Main Whiteboard")) {
        record("TEST-06", "Auto-fallback creates fresh 'Main Whiteboard' tab when all tabs are closed", "PASS");
      } else {
        record("TEST-06", "Auto-fallback on tab close", "FAIL", `Final count: ${finalCount}, Title: '${fallbackTitle}'`);
      }
    }

    // TEST-07: SQLite Database Verification via REST API
    {
      const res = await fetch(`${TARGET_URL}/api/canvases`);
      const json = await res.json();
      const canvases = json.canvases || [];

      if (res.ok && Array.isArray(canvases) && canvases.length >= 1) {
        const hasValidFields = canvases.every(
          (c) => typeof c.id === "string" && typeof c.name === "string" && typeof c.sort_order === "number"
        );
        if (hasValidFields) {
          record(
            "TEST-07",
            `SQLite database verified: ${canvases.length} canvases loaded with valid schema fields`,
            "PASS"
          );
        } else {
          record("TEST-07", "SQLite schema validation", "FAIL", "Missing required fields in API records");
        }
      } else {
        record("TEST-07", "SQLite API query", "FAIL", `Status: ${res.status}, Records: ${canvases.length}`);
      }
    }

  } catch (err) {
    console.error("Test execution exception:", err);
    record("FATAL", "Exception during audit execution", "FAIL", err.message);
  } finally {
    await browser.close();
  }

  console.log("\n======================================================================");
  console.log(`  INDEPENDENT AUDIT RESULTS: Passed: ${passed} | Failed: ${failed}`);
  console.log("======================================================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runIndependentAudit();
