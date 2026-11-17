import { chromium } from 'playwright-core';
import fs from 'fs';
const shots = JSON.parse(fs.readFileSync(process.argv[2] || 'shots.json', 'utf8'));
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('CONSOLE:', m.type(), m.text()));
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message, e.stack));
page.on('requestfailed', (r) => console.log('REQFAIL:', r.url(), r.failure()?.errorText));
console.log('Navigating to http://localhost:5178/?shot=1 ...');
await page.goto('http://localhost:5178/?shot=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('DOM loaded, waiting for __ready or error...');
for (let i = 0; i < 60; i++) {
  const st = await page.evaluate(() => ({ ready: window.__ready, msg: document.getElementById('lmsg')?.textContent }));
  console.log(`tick ${i}:`, st);
  if (st.ready) break;
  await page.waitForTimeout(2000);
}
for (const s of shots) {
  await page.evaluate((a) => window.__cam(...a.cam), s);
  if (s.time !== undefined) await page.evaluate((t) => { const e = document.getElementById('time'); e.value = t; e.dispatchEvent(new Event('input')); }, s.time);
  if (s.fp) await page.evaluate((a) => window.__fp(...a), s.fp);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: s.out });
  console.log('Saved', s.out);
}
await browser.close();
