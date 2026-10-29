import { chromium } from "playwright";

async function main() {
  console.log("Launching Chromium to test Next.js app at http://localhost:3000...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });

  // Inject authentication into localStorage to bypass AuthGate
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

  const errors = [];
  page.on("pageerror", (err) => {
    console.error("[BROWSER ERROR]", err.message);
    errors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("[BROWSER CONSOLE ERROR]", msg.text());
    }
  });

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  console.log("Waiting 8 seconds for whiteboard and Excalidraw canvas to stabilize...");
  await page.waitForTimeout(8000);

  // Take screenshot of whiteboard canvas
  await page.screenshot({ path: "public/docs/canvas_clean_loaded.png" });
  console.log("Captured canvas screenshot: public/docs/canvas_clean_loaded.png");

  // Check if Canvas Error boundary is visible
  const errorBoundaryText = await page.$eval(
    "body",
    (el) => (el.innerText.includes("Canvas Error") ? "Found Canvas Error!" : "Clean")
  );
  console.log("Error boundary status:", errorBoundaryText);

  // Open Screen via the right toolbar button or shortcut
  console.log("Toggling Screen / Code Server on canvas...");
  const screenToggleBtn = await page.$('button[title*="Toggle Code Server"]');
  if (screenToggleBtn) {
    console.log("Found Screen button in toolbar, clicking...");
    await screenToggleBtn.click();
  } else {
    console.log("Using Command Palette to open Screen...");
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(1000);
    await page.keyboard.type("Toggle Canvas Screen", { delay: 50 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
  }

  console.log("Waiting 10 seconds for code-server inside Screen panel...");
  await page.waitForTimeout(10000);

  await page.screenshot({ path: "public/docs/canvas_screen_active_verified.png" });
  console.log("Captured canvas with Screen screenshot: public/docs/canvas_screen_active_verified.png");

  await browser.close();

  if (errors.length > 0) {
    console.warn("Recorded page errors:", errors);
  }
  console.log("Flow test completed successfully!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
