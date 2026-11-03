import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const lighthouse = (await import(pathToFileURL('D:/npm-cache/_npx/0f94ee7615faf582/node_modules/lighthouse/core/index.js').href)).default;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'explaino-perf-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  args: ['--remote-debugging-port=9226'],
  viewport: { width: 1400, height: 900 }
});

try {
  const base = 'http://localhost:3000';
  const login = await context.request.post(base + '/api/auth/login', {
    data: {
      email: process.env.EXPLAINO_ADMIN_EMAIL || 'parthasdeyofficial@gmail.com',
      password: process.env.EXPLAINO_ADMIN_PASSWORD || 'Vastavik1234Parth@Hacker'
    }
  });
  if (!login.ok()) console.warn('Login status:', login.status());

  const route = process.argv[2] || '/';
  const name = process.argv[3] || 'audit';
  const page = context.pages()[0];
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  try {
    await page.locator('.excalidraw').waitFor({ timeout: 15000 });
  } catch (e) {
    console.warn('Excalidraw locator wait:', e.message);
  }
  const session = await context.newCDPSession(page);
  await session.send('Network.clearBrowserCache');

  const result = await lighthouse(base + route, {
    port: 9226,
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance'],
    disableStorageReset: true
  });

  fs.writeFileSync('scratch/last-audit.json', JSON.stringify(result.lhr, null, 2));
  const a = result.lhr.audits;
  const perfScore = Math.round(result.lhr.categories.performance.score * 100);
  console.log(`\n=== LIGHTHOUSE RESULT (${name}) ===`);
  console.log(`Performance Score: ${perfScore}`);
  console.log(`FCP: ${a['first-contentful-paint']?.displayValue}`);
  console.log(`LCP: ${a['largest-contentful-paint']?.displayValue}`);
  console.log(`TBT: ${a['total-blocking-time']?.displayValue}`);
  console.log(`Speed Index: ${a['speed-index']?.displayValue}`);
  console.log(`CLS: ${a['cumulative-layout-shift']?.displayValue}`);

  console.log('\n--- Render Blocking Resources ---');
  console.log(a['render-blocking-resources']?.displayValue || 'None');
  if (a['render-blocking-resources']?.details?.items) {
    console.log(a['render-blocking-resources'].details.items);
  }

  console.log('\n--- Font Display ---');
  console.log(a['font-display']?.displayValue || a['font-display']?.score);
  if (a['font-display']?.details?.items) {
    console.log(a['font-display'].details.items);
  }

  console.log('\n--- Legacy JS ---');
  console.log(a['legacy-javascript']?.displayValue || a['legacy-javascript']?.score);
  if (a['legacy-javascript']?.details?.items) {
    console.log(a['legacy-javascript'].details.items);
  }

  console.log('\n--- Long Tasks ---');
  const longTasks = a['long-tasks']?.details?.items || [];
  longTasks.forEach(t => console.log(`  - duration: ${t.duration}ms, start: ${t.startTime}ms`));

  console.log('\n--- Main Thread Breakdown ---');
  const mainThread = a['mainthread-work-breakdown']?.details?.items || [];
  mainThread.slice(0, 8).forEach(m => console.log(`  - ${m.group}: ${m.duration}ms`));
} finally {
  await context.close();
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {}
}
