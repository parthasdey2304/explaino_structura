import { chromium } from "playwright";

async function main() {
  console.log("Launching Chromium...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  console.log("Navigating to code-server: https://13.49.76.201.sslip.io/?folder=/home/ubuntu/workspace");
  await page.goto("https://13.49.76.201.sslip.io/?folder=/home/ubuntu/workspace", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  console.log("Waiting for workbench to load...");
  // Wait for the workbench container or welcome tab
  await page.waitForTimeout(10000);

  // Take screenshot of initial code-server state
  await page.screenshot({ path: "public/docs/code_server_workbench.png" });
  console.log("Captured initial workbench screenshot: public/docs/code_server_workbench.png");

  // Press F1 or Ctrl+Shift+P to open Command Palette
  console.log("Opening Command Palette with F1...");
  await page.keyboard.press("F1");
  await page.waitForTimeout(1500);

  // Type 'View: Toggle Terminal' or 'Terminal: Create New Terminal'
  console.log("Typing 'Terminal: Create New Terminal' into Command Palette...");
  await page.keyboard.type("Terminal: Create New Terminal", { delay: 50 });
  await page.waitForTimeout(1000);
  await page.keyboard.press("Enter");

  console.log("Waiting 6 seconds for terminal session to initialize...");
  await page.waitForTimeout(6000);

  // In the terminal, create a python file with commands
  console.log("Sending shell commands to terminal to create python script and run it...");
  const pythonScript = `cat << 'EOF' > /home/ubuntu/workspace/explaino_exec.py
# Explaino Structura - Code Server Workspace Execution Test
import sys
import platform
import os

print("=== EXPLAINO STRUCTURA TERMINAL VERIFICATION ===")
print(f"OS: {platform.system()} {platform.release()} (Ubuntu on AWS EC2)")
print(f"Python: {sys.version.split()[0]}")
print(f"Current Directory: {os.getcwd()}")
print(f"Workspace User: {os.environ.get('USER', 'ubuntu')}")
print("Status: Python file successfully created and executed in Ubuntu workspace!")
print("==================================================")
EOF
`;

  await page.keyboard.type(pythonScript, { delay: 10 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);

  // Run the python script
  console.log("Executing 'python3 explaino_exec.py' in the terminal...");
  await page.keyboard.type("python3 /home/ubuntu/workspace/explaino_exec.py\n", { delay: 20 });
  await page.waitForTimeout(4000);

  // Take screenshot of terminal output
  await page.screenshot({ path: "public/docs/code_server_terminal_verified.png" });
  console.log("Captured terminal verification screenshot: public/docs/code_server_terminal_verified.png");

  // Also open the file in the editor so it is visible in the file tree and editor tab
  console.log("Opening file in editor via Command Palette...");
  await page.keyboard.press("F1");
  await page.waitForTimeout(1000);
  await page.keyboard.type("File: Open File...", { delay: 50 });
  await page.waitForTimeout(1000);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  await page.keyboard.type("/home/ubuntu/workspace/explaino_exec.py", { delay: 30 });
  await page.waitForTimeout(1000);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4000);

  await page.screenshot({ path: "public/docs/code_server_editor_file_verified.png" });
  console.log("Captured editor verification screenshot: public/docs/code_server_editor_file_verified.png");

  await browser.close();
  console.log("Finished code-server workspace verification successfully!");
}

main().catch((err) => {
  console.error("Error during verification:", err);
  process.exit(1);
});
