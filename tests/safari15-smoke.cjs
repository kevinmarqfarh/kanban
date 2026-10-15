// Smoke test in a real WebKit 15.4 engine (the Safari generation on iPads stuck on iPadOS 15).
// Setup (once, see docs/ipad.md → "Testa i Safari 15-motorn"):
//   npm i --prefix /tmp/pw120 playwright-core@1.20.2
//   download https://playwright.azureedge.net/builds/webkit/1616/webkit-ubuntu-20.04.zip and unzip
// Run: PLAYWRIGHT_MODULE=/tmp/pw120/node_modules/playwright-core SAFARI15_WEBKIT=/path/to/pw_run.sh node tests/safari15-smoke.cjs
// Covers start, the weather strip, every day's hours (open, switch day, close), a reload from saved data, and the crash screen.
const assert = require('node:assert/strict');
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const { smhiFor, openMeteoFor } = require('./helpers/weather-mock.cjs');
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const executablePath = process.env.SAFARI15_WEBKIT;
if (!executablePath) { console.error('Set SAFARI15_WEBKIT to the pw_run.sh of WebKit build 1616.'); process.exit(2); }
const json = body => ({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(body) });

(async () => {
  const browser = await webkit.launch({ executablePath, headless: true });
  const failures = [];
  const run = async (name, fn) => { try { await fn(); console.log(`PASS ${name}`); } catch (error) { failures.push(name); console.log(`FAIL ${name}: ${error.message}`); } };
  async function open({ crash = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
    // iPadOS 15 lacks these; the app must not depend on them.
    await context.addInitScript(broken => {
      delete AbortSignal.timeout; delete AbortSignal.any;
      if (broken) Date.prototype.toLocaleDateString = function () { throw new TypeError('Testfel'); };
    }, crash);
    const now = new Date().toISOString();
    await context.route('https://opendata-download-metfcst.smhi.se/**', route => route.fulfill(json(smhiFor(now))));
    await context.route('https://api.open-meteo.com/**', route => route.fulfill(json(openMeteoFor(new URL(route.request().url()).searchParams))));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForTimeout(5000);
    return { context, page, errors };
  }
  const ua = await (async () => { const { context, page } = await open(); const value = await page.evaluate(() => navigator.userAgent); await context.close(); return value; })();
  console.log(`Engine: ${ua}`);

  await run('Starts on the iPad home screen with the weather strip', async () => {
    const { context, page, errors } = await open();
    assert.equal(await page.evaluate(() => window.__formaBooted), true);
    await page.waitForSelector('[data-testid="home-screen"]');
    await page.waitForSelector('[data-testid="home-screen-weather"][data-status="ready"]');
    assert.deepEqual(errors, []);
    await context.close();
  });

  await run('Every day opens its hours, switches day and closes back to the home screen; a reload from saved data works', async () => {
    const { context, page, errors } = await open();
    await page.waitForSelector('[data-testid="home-screen-weather"][data-status="ready"]');
    const days = await page.locator('.wx-day-button').count();
    assert.ok(days >= 1);
    for (let index = 0; index < days; index++) {
      await page.locator('.wx-day-button').nth(index).click();
      await page.waitForSelector('dialog[open] [data-testid="weather-day"]');
      await page.locator('.wxp-chip').last().click();
      await page.locator('dialog button[aria-label="Stäng"]').click();
      await page.waitForFunction(() => !document.querySelector('dialog'));
      await page.waitForSelector('[data-testid="home-screen"]');
    }
    await page.reload();
    await page.waitForSelector('[data-testid="home-screen-weather"][data-status="ready"]');
    assert.deepEqual(errors, []);
    await context.close();
  });

  await run('A render error shows the crash screen instead of a blank page', async () => {
    const { context, page } = await open({ crash: true });
    await page.waitForSelector('[data-testid="crash-screen"]');
    await context.close();
  });

  await browser.close();
  console.log(failures.length ? `Safari 15: ${failures.length} failed.` : 'Safari 15: all smoke checks passed.');
  if (failures.length) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
