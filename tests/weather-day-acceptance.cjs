// A day's weather hour by hour (SMHI): tap a day or the town in the week strip on Home or the iPad home screen.
// The sheet closes back to where you were; there is no separate weather page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { routeWeather, cors } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'weather-day');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const created = '2026-09-01T09:00:00.000Z';
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
  projects: [], tasks: [{ id: 'a', title: 'Handla', description: '', columnId: 'todo', labels: [], checklist: [], deadline: '2026-10-16', comments: [], projectId: null, createdAt: created }],
  nutritionHabits: [{ id: 'dv', title: 'D-vitamin', amount: '1', unit: 'st', createdAt: created, time: 'morning' }], nutritionCompletions: [],
  birthdays: [], birthdayNotifications: [],
} };
const MORNING = '2026-10-14T07:42:00+02:00'; // Wednesday; SMHI's real forecast from a Thursday morning, moved one day.
const PHONE = { width: 402, height: 874 };

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.stack}`); } };

async function open(browser, { viewport = PHONE, touch = true, time = MORNING, mode = 'ok', shiftDays, theme = 'light', homescreen } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 2, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
  const state = { mode, geocodeCalls: 0 };
  await routeWeather(context, state, time, shiftDays);
  await context.route('https://geocoding-api.open-meteo.com/**', route => { state.geocodeCalls++; return route.fulfill({ headers: cors, json: { results: [{ name: 'Malmö', latitude: 55.605, longitude: 13.0038, admin1: 'Skåne', country: 'Sverige' }] } }); });
  await context.addInitScript(({ key, value, theme, homescreen }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('forma-theme', theme);
    if (homescreen) localStorage.setItem('forma-homescreen', homescreen);
  }, { key, value: fixture, theme, homescreen });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(time) });
  await page.goto(base);
  await page.locator('.loading-notice').waitFor({ state: 'detached' });
  return { context, page, errors, state };
}

const strip = page => page.locator('[data-testid="home-weather"][data-status="ready"], [data-testid="home-screen-weather"][data-status="ready"]');
async function openDay(page, date) {
  await strip(page).waitFor();
  await strip(page).locator(`li[data-date="${date}"] button`).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('weather-day').waitFor();
  return dialog;
}
const noSidewaysScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    await check('Phone Home: tap Thursday for its hours — chart, chance, amount, temperature, wind', async () => {
      const { context, page, errors, state } = await open(browser);
      const dialog = await openDay(page, '2026-10-15');
      await dialog.getByRole('heading', { name: 'Torsdag 15 oktober' }).waitFor();
      assert.equal(await dialog.locator('.eyebrow').textContent(), 'Väder i Göteborg');
      const sheet = dialog.getByTestId('weather-day');
      assert.equal(await sheet.locator('.wxp-sheet-label').textContent(), 'Regn');
      assert.equal(await sheet.locator('.wxp-sheet-meta').textContent(), 'H: 14°L: 10°87 % risk9,7 mmByar 14 m/s');
      const rows = sheet.locator('.wxp-table tbody tr');
      assert.equal(await rows.count(), 24, 'Hour by hour.');
      const row = time => rows.filter({ has: page.locator('th', { hasText: time }) }).locator('td').allTextContents();
      assert.deepEqual((await row('11:00')).slice(1, 4), ['77 %', '1,2 mm', '14°']);
      assert.ok(await sheet.locator('.wxp-chart .wxp-chart-bar').count() > 15, 'Chance of precipitation as bars.');
      assert.equal(await sheet.locator('.wxp-chart .wxp-chart-line').count(), 1, 'Temperature as a line.');
      assert.match(await sheet.locator('.wxp-chart').getAttribute('aria-label'), /högst 14 grader/);
      assert.equal(await sheet.locator('.wxp-sheet-note').count(), 0, 'Hourly steps need no note.');
      assert.equal(state.smhiCalls.length, 1, 'The sheet uses the forecast Home already has.');
      await page.screenshot({ path: path.join(out, 'phone-day.png'), animations: 'disabled' });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Day chips switch day; far ahead SMHI gives two steps a day; today starts now', async () => {
      const { context, page, errors } = await open(browser);
      const dialog = await openDay(page, '2026-10-15');
      const sheet = dialog.getByTestId('weather-day');
      const rows = sheet.locator('.wxp-table tbody tr');
      assert.equal(await sheet.getByRole('button', { name: /oktober$/ }).count(), 10, 'Ten days to choose from.');
      assert.equal(await sheet.getByRole('button', { name: 'Torsdag 15 oktober' }).getAttribute('aria-pressed'), 'true');
      await sheet.getByRole('button', { name: 'Torsdag 22 oktober' }).click();
      await dialog.getByRole('heading', { name: 'Torsdag 22 oktober' }).waitFor();
      assert.equal(await rows.count(), 2);
      assert.equal(await sheet.locator('.wxp-sheet-note').textContent(), 'Så här långt fram ger SMHI prognos var 12:e timme.');
      await sheet.getByRole('button', { name: 'Onsdag 14 oktober' }).click();
      await dialog.getByRole('heading', { name: 'Onsdag 14 oktober' }).waitFor();
      assert.equal(await rows.first().locator('th').textContent(), '08:00', 'Today starts at the current hour.');
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Closing the sheet (X or Esc) returns to Home — no separate weather page, no Väder in Others', async () => {
      const { context, page, errors } = await open(browser);
      let dialog = await openDay(page, '2026-10-16');
      await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('dialog'));
      await page.getByTestId('home-overview').waitFor();
      assert.equal(await page.locator('.wxp, [data-testid="weather-page"]').count(), 0, 'Nothing else opens behind the sheet.');
      assert.equal(await page.locator('.nav-item.active').getAttribute('aria-label'), 'Home');
      // The town opens today's hours; Esc closes too.
      await page.getByTestId('home-weather').getByRole('button', { name: 'Visa timprognos för idag i Göteborg' }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: 'Onsdag 14 oktober' }).waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog'));
      await page.getByTestId('home-overview').waitFor();
      // Past days are not tappable.
      assert.equal(await page.locator('[data-testid="home-weather"] li[data-date="2026-10-13"] button').count(), 0);
      await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: /^Väder/ }).count(), 0, 'Others has no weather module.');
      assert.deepEqual(errors, []);
      await context.close();
    });

    for (const [label, viewport] of [['landscape', { width: 1024, height: 768 }], ['portrait', { width: 768, height: 1024 }]]) {
      await check(`iPad ${label}: tap Thursday in the kitchen strip, close, and the home screen is still one screen`, async () => {
        const { context, page, errors } = await open(browser, { viewport });
        await strip(page).waitFor();
        const thursday = page.locator('[data-testid="home-screen-weather"] li[data-date="2026-10-15"] button');
        const box = await thursday.boundingBox();
        assert.ok(box.height >= 44 && box.width >= 44, `The day is a real tap target (${box.width}×${box.height}).`);
        await thursday.click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('heading', { name: 'Torsdag 15 oktober' }).waitFor();
        await page.screenshot({ path: path.join(out, `ipad-${label}-day.png`), animations: 'disabled' });
        await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('dialog'));
        await page.getByTestId('home-screen').waitFor();
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: innerHeight }));
        assert.ok(size.scroll <= size.inner + 1, 'Still no page scroll.');
        assert.deepEqual(errors, []);
        await context.close();
      });
    }

    await check('Night: clear hours in the sheet show the moon (dark theme)', async () => {
      const { context, page, errors } = await open(browser, { time: '2026-10-15T00:30:00+02:00', shiftDays: -2, theme: 'dark' });
      const dialog = await openDay(page, '2026-10-15');
      const kinds = await dialog.locator('.wxp-table tbody tr').evaluateAll(rows => rows.map(row => [row.querySelector('th').textContent, row.querySelector('.weather-icon').dataset.kind]));
      assert.deepEqual(kinds[0], ['01:00', 'clear-night']);
      assert.ok(kinds.some(([, kind]) => kind === 'sun'), 'The sun returns in daylight.');
      await page.screenshot({ path: path.join(out, 'night-dark.png'), animations: 'disabled' });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('SMHI down: Open-Meteo fills the strip and the sheet', async () => {
      const { context, page, errors } = await open(browser, { mode: 'smhi-down' });
      await strip(page).waitFor();
      assert.equal(await page.getByTestId('home-weather').getAttribute('data-source'), 'open-meteo');
      assert.match(await page.locator('[data-testid="home-weather"] .wx-credit').textContent(), /^Källa: Open-Meteo$/);
      const dialog = await openDay(page, '2026-10-16');
      assert.equal(await dialog.locator('.wxp-table tbody tr').count(), 24);
      assert.deepEqual(errors, []);
      await context.close();
    });
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} weather day scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
