/**
 * Auditor Independent Adversarial Verification Suite for Milestone 2
 * Tests real drawing, cache fidelity, undo isolation, inline rename edge cases, and crash resilience.
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

async function fetchCanvasDetail(id) {
  const res = await fetch(`${TARGET_URL}/api/canvases/${id}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.canvas;
}

async function runAdversarialAudit() {
  console.log("\n======================================================================");
  console.log("  AUDITOR INDEPENDENT ADVERSARIAL INTEGRITY VERIFICATION (M2)");
  console.log("======================================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
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

  // Listen for uncaught browser errors
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  try {
    console.log(`  Navigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    // ADV-01: Tab Bar Layout Compliance
    {
      const tabBar = page.locator('[data-canvas-tab-bar="true"]');
      const box = await tabBar.boundingBox();
      const height = box ? Math.round(box.height) : 0;
      const classAttr = await tabBar.getAttribute("class");
      // Tailwind h-10 is 2.5rem. Under root fontSize of 14px, 2.5rem = 35px. Under 16px, 2.5rem = 40px.
      const hasH10Class = classAttr?.includes("h-10");
      if (hasH10Class && (height === 35 || height === 40 || (height >= 34 && height <= 42))) {
        record("ADV-01", `Tab bar adheres to 'h-10' specification (measured: ${height}px with 14px root font)`, "PASS");
      } else {
        record("ADV-01", `Tab bar height compliance`, "FAIL", `Expected h-10 (~35-40px), got ${height}px, class: ${classAttr}`);
      }
    }

    // Helper to draw a shape on Excalidraw canvas
    async function drawShape(x1, y1, x2, y2) {
      const rectRadio = page.locator('input[data-testid="toolbar-rectangle"]');
      await rectRadio.check({ force: true });
      await page.waitForTimeout(300);

      const canvas = page.locator(".excalidraw canvas.interactive, .excalidraw canvas").first();
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Canvas boundingBox not found");

      await page.mouse.move(box.x + x1, box.y + y1);
      await page.mouse.down();
      await page.mouse.move(box.x + x2, box.y + y2, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }

    // ADV-02: Drawing on Canvas & Caching across Tabs
    let tabA_Id = null;
    let tabB_Id = null;
    {
      const activeTab = page.locator('[role="tab"][aria-selected="true"]').first();
      tabA_Id = await activeTab.getAttribute("data-tab-id");

      // Draw a rectangle on Tab A
      await drawShape(250, 150, 450, 280);

      // Click '+' to create Tab B (triggers persistCurrentSceneToCache on Tab A)
      const addBtn = page.locator('button[data-add-tab="true"]').first();
      await addBtn.click();
      await page.waitForTimeout(1500);

      const activeTabB = page.locator('[role="tab"][aria-selected="true"]').first();
      tabB_Id = await activeTabB.getAttribute("data-tab-id");

      // Verify Tab A has 1 element in DB and Tab B is clean
      const detailA = await fetchCanvasDetail(tabA_Id);
      const detailB = await fetchCanvasDetail(tabB_Id);

      const countA = detailA?.elements?.length ?? 0;
      const countB = detailB?.elements?.length ?? 0;

      if (tabA_Id !== tabB_Id && countA >= 1 && countB === 0) {
        record("ADV-02", `Drawing preserved on Tab A (${countA} elements) and clean slate on Tab B (${countB} elements)`, "PASS");
      } else {
        record("ADV-02", "Drawing preservation and clean slate across tabs", "FAIL", `Tab A elements: ${countA}, Tab B elements: ${countB}`);
      }
    }

    // ADV-03: Undo Scoping Verification (api.history.clear() prevents undo bleeding)
    {
      // On Tab B, draw a rectangle
      await drawShape(300, 200, 500, 320);

      // Switch to Tab A and then switch back to Tab B (persisting Tab B's drawing)
      const tabAEl = page.locator(`[role="tab"][data-tab-id="${tabA_Id}"]`);
      await tabAEl.click();
      await page.waitForTimeout(1000);

      const tabBEl = page.locator(`[role="tab"][data-tab-id="${tabB_Id}"]`);
      await tabBEl.click();
      await page.waitForTimeout(1000);

      // Now on Tab B: press Ctrl+Z to undo
      console.log(`[ADV-03] Before undo on Tab B: fetching ${tabA_Id}...`);
      const detailA_Mid = await fetchCanvasDetail(tabA_Id);
      console.log(`[ADV-03] Mid Tab A elements: ${detailA_Mid?.elements?.length}`);

      await page.keyboard.press("Control+z");
      await page.waitForTimeout(400);

      console.log(`[ADV-03] After undo on Tab B: fetching ${tabA_Id}...`);
      const detailA_AfterUndo = await fetchCanvasDetail(tabA_Id);
      console.log(`[ADV-03] After Undo Tab A elements: ${detailA_AfterUndo?.elements?.length}`);

      // Switch back to Tab A (triggers persist of Tab B)
      console.log(`[ADV-03] Switching back to Tab A (${tabA_Id})...`);
      await tabAEl.click();
      await page.waitForTimeout(1500);

      // Verify Tab A's drawing was NOT undone!
      const detailA_Restored = await fetchCanvasDetail(tabA_Id);
      const countA_Restored = detailA_Restored?.elements?.length ?? 0;
      console.log(`[ADV-03] Restored Tab A elements: ${countA_Restored}`);

      if (countA_Restored >= 1) {
        record("ADV-03", `Canvas-scoped undo isolation confirmed: Undo on Tab B did NOT touch Tab A drawings (${countA_Restored} elements preserved)`, "PASS");
      } else {
        record("ADV-03", "Canvas-scoped undo isolation", "FAIL", `Tab A drawing was lost: count is ${countA_Restored}`);
      }
    }

    // ADV-04: Inline Rename - Escape Key Cancellation
    {
      const activeTab = page.locator('[role="tab"][aria-selected="true"]').first();
      const originalName = (await activeTab.innerText()).trim();

      await activeTab.dblclick();
      await page.waitForTimeout(300);

      const renameInput = page.locator('input[data-tab-rename-input="true"]').first();
      if ((await renameInput.count()) > 0) {
        await renameInput.fill("Should Be Cancelled By Escape");
        await renameInput.press("Escape");
        await page.waitForTimeout(400);

        const currentName = (await activeTab.innerText()).trim();
        const inputStillOpen = (await renameInput.count()) > 0;

        if (currentName === originalName && !inputStillOpen) {
          record("ADV-04", `Inline rename cancels on Escape without modifying tab name ('${originalName}')`, "PASS");
        } else {
          record("ADV-04", "Inline rename Escape cancellation", "FAIL", `Original: '${originalName}', Current: '${currentName}', Input open: ${inputStillOpen}`);
        }
      } else {
        record("ADV-04", "Inline rename Escape cancellation", "FAIL", "Rename input did not open");
      }
    }

    // ADV-05: Inline Rename - Whitespace Ignored
    {
      const activeTab = page.locator('[role="tab"][aria-selected="true"]').first();
      const nameBefore = (await activeTab.innerText()).trim();

      await activeTab.dblclick();
      await page.waitForTimeout(300);

      const renameInput = page.locator('input[data-tab-rename-input="true"]').first();
      if ((await renameInput.count()) > 0) {
        await renameInput.fill("     ");
        await renameInput.press("Enter");
        await page.waitForTimeout(400);

        const nameAfter = (await activeTab.innerText()).trim();
        if (nameAfter === nameBefore && nameAfter.length > 0) {
          record("ADV-05", `Whitespace-only rename ignored gracefully; tab retains '${nameBefore}'`, "PASS");
        } else {
          record("ADV-05", "Whitespace rename handling", "FAIL", `Before: '${nameBefore}', After: '${nameAfter}'`);
        }
      } else {
        record("ADV-05", "Whitespace rename handling", "FAIL", "Rename input did not open");
      }
    }

    // ADV-06: Rapid Tab Switching Stress Test
    {
      const tabs = page.locator('[role="tab"]');
      const count = await tabs.count();
      if (count >= 2) {
        for (let i = 0; i < 6; i++) {
          const targetIndex = i % count;
          await tabs.nth(targetIndex).click();
          await page.waitForTimeout(80);
        }
        await page.waitForTimeout(400);

        if (pageErrors.length === 0) {
          record("ADV-06", "Rapid tab switching stress (6 switches at 80ms intervals) passed with 0 unhandled exceptions", "PASS");
        } else {
          record("ADV-06", "Rapid tab switching stress", "FAIL", `Errors caught: ${pageErrors.join("; ")}`);
        }
      } else {
        record("ADV-06", "Rapid tab switching stress", "SKIP", "Need at least 2 tabs");
      }
    }

    // ADV-07: Auto-Fallback Resilience (Close all tabs down to 0)
    {
      const tabItems = page.locator('[role="tab"]');
      let remaining = await tabItems.count();

      for (let i = 0; i < remaining + 5; i++) {
        const closeBtn = page.locator('[role="tab"] button[data-close-tab="true"]').first();
        if ((await closeBtn.count()) > 0) {
          await closeBtn.click();
          await page.waitForTimeout(350);
        } else {
          break;
        }
      }

      await page.waitForTimeout(1000);
      const fallbackTab = page.locator('[role="tab"]').first();
      const fallbackCount = await page.locator('[role="tab"]').count();
      const fallbackName = (await fallbackTab.innerText()).trim();
      const canvasVisible = (await page.locator(".excalidraw").count()) > 0;

      if (fallbackCount === 1 && canvasVisible && fallbackName.includes("Main Whiteboard")) {
        record("ADV-07", `Auto-fallback creates fresh 'Main Whiteboard' tab when all tabs are closed without crashing canvas`, "PASS");
      } else {
        record("ADV-07", "Auto-fallback on closing all tabs", "FAIL", `Count: ${fallbackCount}, Canvas visible: ${canvasVisible}, Name: '${fallbackName}'`);
      }
    }

  } catch (err) {
    record("ADV-ERR", "Unexpected exception during adversarial audit", "FAIL", err.stack || err.message);
  } finally {
    await browser.close();
  }

  console.log("\n======================================================================");
  console.log(`  ADVERSARIAL AUDIT RESULTS: Passed: \x1b[32m${passed}\x1b[0m | Failed: \x1b[31m${failed}\x1b[0m`);
  console.log("======================================================================\n");

  return failed === 0;
}

runAdversarialAudit()
  .then((clean) => process.exit(clean ? 0 : 1))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
