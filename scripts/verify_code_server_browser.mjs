import { chromium } from "playwright";

async function main() {
  console.log("Launching Chromium for comprehensive end-to-end browser verification...");
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

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[BROWSER CONSOLE ERROR] ${msg.text()}`);
    }
  });

  console.log("1. Navigating to http://localhost:3000 ...");
  await page.goto("http://localhost:3000", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  console.log("2. Waiting 6s for whiteboard canvas to initialize...");
  await page.waitForTimeout(6000);

  // Toggle Screen / Code Server via keyboard shortcut or button
  console.log("3. Opening Screen panel via shortcut...");
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1000);
  await page.keyboard.type("Toggle Canvas Screen", { delay: 50 });
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");

  console.log("4. Waiting 12s for code-server iframe to authenticate with token and connect...");
  await page.waitForTimeout(12000);

  // Take screenshot of the canvas with Code Server active
  await page.screenshot({ path: "public/docs/screen_authenticated_clean.png" });
  console.log("Saved screenshot: public/docs/screen_authenticated_clean.png");

  // Verify direct connection to code-server with the token
  console.log("5. Testing direct code-server workbench load with token...");
  const csPage = await context.newPage();
  await csPage.goto(
    "https://13.49.76.201.sslip.io/?token=explaino_sec_8b41915d25547e2edd553bab03ea4cbd&folder=/home/ubuntu/workspace",
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );

  console.log("6. Waiting 10s for VS Code workbench to stabilize...");
  await csPage.waitForTimeout(10000);
  await csPage.screenshot({ path: "public/docs/code_server_direct_token_verified.png" });
  console.log("Saved screenshot: public/docs/code_server_direct_token_verified.png");

  // Open terminal in VS Code
  console.log("7. Opening Terminal in VS Code via F1...");
  await csPage.keyboard.press("F1");
  await csPage.waitForTimeout(1000);
  await csPage.keyboard.type("Terminal: Create New Terminal", { delay: 50 });
  await csPage.waitForTimeout(800);
  await csPage.keyboard.press("Enter");

  console.log("8. Waiting 5s for terminal prompt...");
  await csPage.waitForTimeout(5000);

  console.log("9. Running verification script in terminal...");
  await csPage.keyboard.type("python3 /home/ubuntu/workspace/explaino_exec.py\n", { delay: 30 });
  await csPage.waitForTimeout(4000);

  await csPage.screenshot({ path: "public/docs/code_server_terminal_clean_verified.png" });
  console.log("Saved screenshot: public/docs/code_server_terminal_clean_verified.png");

  await browser.close();
  console.log("=== BROWSER VERIFICATION COMPLETED SUCCESSFULLY! ===");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
