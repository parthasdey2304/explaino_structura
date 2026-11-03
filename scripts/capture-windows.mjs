import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const artifactDir = 'C:/Users/parth/.gemini/antigravity/brain/527c1348-5974-436a-b1bf-03ae0149234b';
const docsDir = path.join(process.cwd(), 'public/docs/screenshots');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

try {
  const base = 'http://localhost:3000';
  await context.request.post(`${base}/api/auth/login`, {
    data: {
      email: 'parthasdeyofficial@gmail.com',
      password: process.env.EXPLAINO_ADMIN_PASSWORD || 'Vastavik1234Parth@Hacker'
    }
  });

  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.excalidraw', { timeout: 15000 });

  // Open Extensions
  const extBtn = await page.$('button[aria-label="Extensions"], button[title*="Extension"]');
  if (extBtn) {
    await extBtn.click();
    await page.waitForTimeout(500);

    // Look for Web Preview button in extensions panel
    const webPreviewBtn = await page.$('button:has-text("Web Preview"), button:has-text("Live Preview")');
    if (webPreviewBtn) {
      console.log('Clicking Web Preview button...');
      await webPreviewBtn.click();
      await page.waitForTimeout(1000);

      const previewWinImg = path.join(docsDir, '04-live-web-preview-window.png');
      await page.screenshot({ path: previewWinImg });
      fs.copyFileSync(previewWinImg, path.join(artifactDir, '04-live-web-preview-window.png'));
      console.log('Captured 04-live-web-preview-window.png');
    }

    // Look for Screen / Code Server button in extensions panel
    const screenBtn = await page.$('button:has-text("Code Server"), button:has-text("Screen IDE"), button:has-text("Screen")');
    if (screenBtn) {
      console.log('Clicking Code Server button...');
      await screenBtn.click();
      await page.waitForTimeout(1000);

      const codeServerImg = path.join(docsDir, '05-code-server-window.png');
      await page.screenshot({ path: codeServerImg });
      fs.copyFileSync(codeServerImg, path.join(artifactDir, '05-code-server-window.png'));
      console.log('Captured 05-code-server-window.png');
    }
  }
} catch (err) {
  console.error('Error during window capture:', err);
} finally {
  await browser.close();
}
