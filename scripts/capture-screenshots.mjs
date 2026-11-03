import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const artifactDir = 'C:/Users/parth/.gemini/antigravity/brain/527c1348-5974-436a-b1bf-03ae0149234b';
const docsDir = path.join(process.cwd(), 'public/docs/screenshots');
fs.mkdirSync(docsDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 }
});

try {
  const base = 'http://localhost:3000';

  // 1. Authenticate
  const loginRes = await context.request.post(`${base}/api/auth/login`, {
    data: {
      email: 'parthasdeyofficial@gmail.com',
      password: process.env.EXPLAINO_ADMIN_PASSWORD || 'Vastavik1234Parth@Hacker'
    }
  });
  console.log('Login status:', loginRes.status());

  const page = await context.newPage();

  // 2. Main Whiteboard Canvas
  console.log('Navigating to main canvas...');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.excalidraw', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const canvasImg = path.join(docsDir, '01-whiteboard-canvas.png');
  await page.screenshot({ path: canvasImg });
  fs.copyFileSync(canvasImg, path.join(artifactDir, '01-whiteboard-canvas.png'));
  console.log('Captured 01-whiteboard-canvas.png');

  // 3. Open Extensions Panel or Live Preview if available
  // Let's check for Extensions button or shortcut
  console.log('Checking for extension / window toggles...');
  const extBtn = await page.$('button[aria-label="Extensions"], button[title*="Extension"]');
  if (extBtn) {
    await extBtn.click();
    await page.waitForTimeout(1000);
    const extImg = path.join(docsDir, '02-extensions-panel.png');
    await page.screenshot({ path: extImg });
    fs.copyFileSync(extImg, path.join(artifactDir, '02-extensions-panel.png'));
    console.log('Captured 02-extensions-panel.png');
  }

  // 4. Student Share View
  console.log('Navigating to student view...');
  const sharePage = await context.newPage();
  await sharePage.goto(`${base}/share/c_mw0crtak_asjpfe`, { waitUntil: 'networkidle' });
  try {
    await sharePage.waitForSelector('.excalidraw, [data-readonly-banner="true"]', { timeout: 15000 });
  } catch {}
  await sharePage.waitForTimeout(1500);
  const shareImg = path.join(docsDir, '03-student-share-view.png');
  await sharePage.screenshot({ path: shareImg });
  fs.copyFileSync(shareImg, path.join(artifactDir, '03-student-share-view.png'));
  console.log('Captured 03-student-share-view.png');
  await sharePage.close();

} catch (err) {
  console.error('Error during capture:', err);
} finally {
  await browser.close();
}
