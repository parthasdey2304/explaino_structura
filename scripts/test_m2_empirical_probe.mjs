import { chromium } from "playwright";

async function probe() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

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
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      console.log("Main frame navigated to:", frame.url());
    }
  });

  await page.goto("http://localhost:3000");
  await page.waitForSelector('[data-canvas-tab-bar="true"]', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const tabs = await page.locator('[role="tab"]').all();
  console.log("Found tabs:", tabs.length);
  for (let i = 0; i < tabs.length; i++) {
    console.log(`Clicking tab ${i}...`);
    await tabs[i].click();
    await page.waitForTimeout(500);
  }

  await browser.close();
}

probe().catch(console.error);
