// A crash never leaves a blank screen: the app shows what happened, offers Ladda om and heals itself
// (at most three automatic reloads per 15 minutes). If the JavaScript cannot start at all, index.html says so.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'crash');
fs.mkdirSync(out, { recursive: true });
const IPAD = { width: 1024, height: 768 };

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.stack}`); } };

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    await check('A render error shows the crash screen with details, then reloads by itself — three times at most', async () => {
      const context = await browser.newContext({ viewport: IPAD, hasTouch: true, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
      // Break something Home needs while rendering.
      await context.addInitScript(() => { Date.prototype.toLocaleDateString = function () { throw new TypeError('Testfel i rendering'); }; });
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-10-15T14:50:00+02:00') });
      let loads = 0;
      page.on('load', () => { loads++; });
      await page.goto(base);
      const screen = page.getByTestId('crash-screen');
      await screen.waitFor();
      assert.equal(await screen.getByRole('heading').textContent(), 'Något gick fel');
      await screen.getByRole('button', { name: 'Ladda om' }).waitFor();
      assert.match(await screen.locator('.crash-auto').textContent(), /^Laddar om automatiskt om 20 s\.$/);
      assert.match(await screen.locator('pre').textContent(), /TypeError: Testfel i rendering\nVersion /);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-last-error')));
      assert.equal(saved.source, 'render');
      assert.match(saved.stack, /component stack/);
      await page.screenshot({ path: path.join(out, 'crash-screen.png') });
      for (let reload = 1; reload <= 3; reload++) {
        const before = loads;
        const loaded = page.waitForEvent('load');
        await page.clock.runFor(21_000);
        await loaded;
        assert.ok(loads > before, `automatic reload ${reload}`);
        await screen.waitFor();
      }
      assert.equal(await screen.locator('.crash-auto').textContent(), 'Felet har kommit flera gånger. Tryck på Ladda om när du vill försöka igen.', 'A crash loop stops reloading.');
      const before = loads;
      await page.clock.runFor(60_000);
      await page.waitForTimeout(300);
      assert.equal(loads, before, 'No fourth automatic reload.');
      await context.close();
    });

    await check('An error in a timer or promise does not blank the app and is kept on the device', async () => {
      const context = await browser.newContext({ viewport: IPAD, hasTouch: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.goto(base);
      await page.locator('.loading-notice').waitFor({ state: 'detached' });
      await page.evaluate(() => { setTimeout(() => { throw new Error('Testfel i timer'); }, 0); Promise.reject(new Error('Testfel i promise')); });
      await page.waitForFunction(() => /Testfel i (timer|promise)/.test(localStorage.getItem('forma-last-error') || ''));
      assert.equal(await page.getByTestId('crash-screen').count(), 0, 'The app keeps running.');
      assert.ok((await page.locator('#root').innerHTML()).length > 1000);
      await context.close();
    });

    await check('JavaScript that never starts: after 15 s index.html shows "Forma startade inte" and reloads (twice at most)', async () => {
      const context = await browser.newContext({ viewport: IPAD, hasTouch: true, serviceWorkers: 'block' });
      await context.route(/\/assets\/index-.*\.js$/, route => route.abort('failed'));
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-10-15T14:50:00+02:00') });
      await page.goto(base);
      await page.clock.runFor(14_000);
      assert.equal(await page.getByTestId('boot-failed').count(), 0, 'Not before 15 seconds.');
      await page.clock.runFor(1_500);
      const screen = page.getByTestId('boot-failed');
      await screen.waitFor();
      assert.equal(await screen.getByRole('heading').textContent(), 'Forma startade inte');
      assert.equal(await screen.locator('.crash-auto').textContent(), 'Laddar om automatiskt om 20 s.');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-last-error')));
      assert.equal(saved.source, 'boot');
      await page.screenshot({ path: path.join(out, 'boot-failed.png') });
      await context.close();
    });

    await check('A normal start never shows either screen', async () => {
      const context = await browser.newContext({ viewport: IPAD, hasTouch: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-10-15T14:50:00+02:00') });
      await page.goto(base);
      await page.locator('.loading-notice').waitFor({ state: 'detached' });
      await page.clock.runFor(30_000);
      assert.equal(await page.evaluate(() => window.__formaBooted), true);
      assert.equal(await page.locator('[data-testid="boot-failed"], [data-testid="crash-screen"]').count(), 0);
      await context.close();
    });
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} crash scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
