import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem("explaino_session", JSON.stringify({ role: "teacher", email: "teacher@explaino.test" }));
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000");
  await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(async () => {
    const res = await fetch("/api/canvases?include_data=true");
    const json = await res.json();
    const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
    const activeId = activeTab?.getAttribute("data-tab-id");
    const localActive = localStorage.getItem("explaino_active_canvas_id");
    
    // Check excalidraw API
    let apiElements = [];
    if (window.__testExcalidrawAPI) {
      apiElements = window.__testExcalidrawAPI.getSceneElements();
    }
    return {
      canvases: json.canvases?.map((c) => ({
        id: c.id,
        name: c.name,
        elements: c.elements?.map((e) => ({ id: e.id, type: e.type })),
      })),
      activeId,
      localActive,
      apiElementsCount: apiElements.length,
      apiElementIds: apiElements.map((e) => e.id),
      hasWindowTestApi: !!window.__testExcalidrawAPI,
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main();
