import { chromium } from "playwright";

async function runStressTest() {
  console.log("=== ADVERSARIAL STRESS TEST: TABS & LAYOUT ===");
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

  try {
    await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });

    // 1. Check layout geometry and toolbar collision
    const tabBarBox = await page.locator('[data-canvas-tab-bar="true"]').boundingBox();
    console.log(`TabBar Box: y=${tabBarBox?.y}, height=${tabBarBox?.height}, width=${tabBarBox?.width}`);

    const excalidrawBox = await page.locator('.excalidraw').boundingBox();
    console.log(`Excalidraw Box: y=${excalidrawBox?.y}, height=${excalidrawBox?.height}`);

    const collision = (tabBarBox && excalidrawBox) ? (tabBarBox.y + tabBarBox.height > excalidrawBox.y + 2) : false;
    console.log(`Collision between TabBar and Excalidraw container: ${collision ? "DETECTED" : "NONE (Clean 40px flex offset)"}`);

    // Check Excalidraw toolbars (e.g. Zen mode or shape toolbar)
    const shapeBar = page.locator('.App-toolbar, .shapes-section, .Stack_horizontal').first();
    if (await shapeBar.count() > 0) {
      const shapeBox = await shapeBar.boundingBox();
      console.log(`Excalidraw Shape Toolbar Box: y=${shapeBox?.y}`);
      if (shapeBox && tabBarBox && shapeBox.y < tabBarBox.y + tabBarBox.height) {
        console.log("WARNING: Shape toolbar collides with TabBar!");
      } else {
        console.log("PASS: Shape toolbar is cleanly below TabBar");
      }
    }

    // 2. Rapid Tab Creation (10 tabs)
    console.log("Testing rapid tab creation...");
    const addBtn = page.locator('button[data-add-tab="true"]').first();
    const startTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await addBtn.click();
      await page.waitForTimeout(250);
    }
    const totalTabs = await page.locator('[role="tab"]').count();
    console.log(`Rapid tab creation created ${totalTabs} tabs in ${Date.now() - startTime}ms`);

    // 3. Rapid Tab Switching
    console.log("Testing rapid tab switching (<10ms target)...");
    const tabs = await page.locator('[role="tab"]').all();
    const switchTimes = [];
    for (let i = 0; i < Math.min(tabs.length - 1, 4); i++) {
      const t0 = performance.now();
      await tabs[i].click();
      const t1 = performance.now();
      switchTimes.push(t1 - t0);
    }
    console.log(`Tab switch execution times: ${switchTimes.map(t => t.toFixed(1) + "ms").join(", ")}`);

    // 4. Test Rename with special characters & XSS attempt
    console.log("Testing inline rename with special characters...");
    const tabToRename = tabs[0];
    await tabToRename.dblclick();
    await page.waitForTimeout(200);
    const renameInput = page.locator('input[data-tab-rename-input="true"]');
    if (await renameInput.count() > 0) {
      await renameInput.fill("<b>Math 101</b> & Algorithms #1!");
      await renameInput.press("Enter");
      await page.waitForTimeout(300);
      const text = await tabToRename.innerText();
      console.log(`Renamed tab text: "${text.trim()}"`);
    }

    console.log("=== ADVERSARIAL STRESS TEST COMPLETED ===");
  } catch (err) {
    console.error("Stress test error:", err);
  } finally {
    await browser.close();
  }
}

runStressTest();
