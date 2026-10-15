// Others → Väder: SMHI's forecast laid out like Apple Weather (now, hours with chance of precipitation, ten days,
// a day's hours, detail tiles), opened from the menu, from Home's week strip and from the iPad home screen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { routeWeather, cors } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'weather-page');
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

async function openWeatherFromMenu(page) {
  await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
  await page.getByRole('button', { name: /^Väder/ }).click();
  await page.locator('[data-testid="weather-page"][data-status="ready"]').waitFor();
  return page.getByTestId('weather-page');
}
const noSidewaysScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    await check('Phone: Others → Väder shows now, the next 24 hours with chance of precipitation, ten days and details from SMHI', async () => {
      const { context, page, errors, state } = await open(browser);
      await page.locator('[data-testid="home-weather"][data-status="ready"]').waitFor();
      await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
      const row = page.getByRole('button', { name: /^Väder/ });
      assert.equal(await row.locator('.others-weather-badge').textContent(), '12°', 'The menu shows the temperature now.');
      assert.equal(await row.locator('.others-weather-badge').getAttribute('aria-label'), '12 grader i Göteborg');
      const wx = await openWeatherFromMenu(page);
      assert.equal(await page.locator('.others-section-heading h2').textContent(), 'Väder');
      assert.equal(await wx.getAttribute('data-source'), 'smhi');
      assert.equal(await wx.getAttribute('data-sky'), 'partly');

      // Now: big temperature, SMHI's wording, today's high and low.
      const hero = wx.locator('.wxp-hero');
      assert.equal(await hero.locator('.wxp-place').textContent(), 'Göteborg');
      assert.equal(await hero.locator('.wxp-temp').textContent(), '12°');
      assert.equal(await hero.locator('.wxp-condition').textContent(), 'Växlande molnighet');
      assert.equal(await hero.locator('.wxp-highlow').textContent(), 'H: 15°L: 4°');
      assert.match(await hero.locator('.wxp-status').textContent(), /Uppdaterat 07:42/);

      // Hourly: Nu first, every hour until the same time tomorrow, sunrise and sunset in between, chance of rain in blue.
      const hourly = wx.locator('.wxp-hourly');
      assert.equal(await hourly.locator('.wxp-summary').textContent(), 'Lätt regn väntas i morgon kring 07:00 (50 % risk). Byar upp till 15 m/s.');
      const hours = hourly.locator('.wxp-hour');
      const times = await hours.locator('.wxp-hour-time').allTextContents();
      assert.equal(times[0], 'Nu');
      assert.equal(times[1], '07:43', 'Sunrise in two minutes.');
      assert.ok(times.includes('18:12'), 'Sunset tonight.');
      assert.equal(await hours.locator(':scope:not(.is-sun)').count(), 24);
      assert.deepEqual(await hours.locator('.wxp-hour-temp').evaluateAll(nodes => nodes.slice(0, 4).map(node => node.textContent)), ['12°', 'Upp', '13°', '13°']);
      const tonight = await hours.evaluateAll(nodes => nodes.filter(node => !node.classList.contains('is-sun')).map(node => [node.querySelector('.wxp-hour-time').textContent, node.querySelector('.weather-icon').dataset.kind, node.querySelector('.wxp-hour-rain').textContent]));
      assert.deepEqual(tonight.find(([time]) => time === '07'), ['07', 'drizzle', '50%'], 'Light rain tomorrow at seven, with its chance.');
      assert.deepEqual(tonight.find(([time]) => time === '12'), ['12', 'cloudy', ''], 'No percentage when the chance is under 10 %.');
      assert.match(await hours.nth(0).getAttribute('aria-label'), /^Nu: 12 grader, Växlande molnighet, 0 procent risk för nederbörd$/);
      assert.ok(await hourly.locator('.wxp-hours').evaluate(list => list.scrollWidth > list.clientWidth), 'The hours scroll sideways inside the card.');

      // Ten days, today first, a temperature bar with a dot for now.
      const days = wx.locator('.wxp-day');
      assert.equal(await days.count(), 10);
      assert.deepEqual(await days.locator('.wxp-day-name').allTextContents(), ['Idag', 'Imorgon', 'Fre', 'Lör', 'Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre']);
      assert.deepEqual(await days.locator('.wxp-day-icon small').allTextContents(), ['20%', '90%', '', '', '', '', '', '30%', '30%', '40%']);
      assert.deepEqual(await days.evaluateAll(nodes => nodes.slice(0, 3).map(node => node.querySelector('.wxp-day-min').textContent + node.querySelector('.wxp-day-max').textContent)), ['4°15°', '10°14°', '6°11°']);
      assert.equal(await days.nth(0).locator('.wxp-range b').count(), 1, 'Today shows where the temperature is now.');
      assert.equal(await days.nth(1).locator('.wxp-range b').count(), 0);
      assert.match(await days.nth(1).getAttribute('aria-label'), /^Torsdag 15 oktober: Regn, högst 14 grader, lägst 10 grader, 87 procent risk för nederbörd\. Visa timprognos\.$/);

      // Details.
      const tile = name => wx.locator('.wxp-tile', { has: page.getByRole('heading', { name, exact: true }) });
      assert.equal(await tile('Nederbörd').locator('.wxp-tile-value').textContent(), '0,7 mm');
      assert.equal(await tile('Nederbörd').locator('.wxp-tile-note').textContent(), 'Störst risk 50 % i morgon kring 07:00. 9,7 mm väntas i morgon.');
      assert.equal(await tile('Vind').locator('.wxp-tile-value').textContent(), '7 m/s');
      assert.match(await tile('Vind').locator('.wxp-tile-caption').textContent(), /vind \((N|NO|O|SO|S|SV|V|NV)\)$/);
      assert.match(await tile('Vind').getByRole('img').getAttribute('aria-label'), /vind, från \d+ grader/);
      assert.equal(await tile('Luftfuktighet').locator('.wxp-tile-value').textContent(), '89 %');
      assert.equal(await tile('Sol').locator('.wxp-sun-times').textContent(), '07:4318:12');
      assert.equal(await tile('Sol').locator('.wxp-tile-note').textContent(), 'Dagen är 10 h 29 min lång.');
      assert.equal(await tile('Sikt').locator('.wxp-tile-value').textContent(), '11 km');
      assert.equal(await tile('Lufttryck').locator('.wxp-tile-value').textContent(), '1020 hPa');
      assert.equal(await wx.locator('.wxp-credit').textContent(), 'Källa: SMHI, prognos från 07:30 · tidigare timmar: Open-Meteo');
      assert.equal(await wx.locator('.wxp-credit a').first().getAttribute('href'), 'https://www.smhi.se/');
      assert.equal(state.smhiCalls.length, 1, 'Home and the weather page share one forecast.');

      assert.ok(await noSidewaysScroll(page), 'No sideways page scroll.');
      await page.screenshot({ path: path.join(out, 'phone.png'), fullPage: true, animations: 'disabled' });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Tapping a day opens its hours: chart, table with chance and amount, day chips, Escape closes', async () => {
      const { context, page, errors } = await open(browser);
      const wx = await openWeatherFromMenu(page);
      await wx.locator('.wxp-day').nth(1).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: 'Torsdag 15 oktober' }).waitFor();
      assert.equal(await dialog.locator('.eyebrow').textContent(), 'Väder i Göteborg');
      const sheet = dialog.getByTestId('weather-day');
      assert.equal(await sheet.locator('.wxp-sheet-label').textContent(), 'Regn');
      assert.equal(await sheet.locator('.wxp-sheet-meta').textContent(), 'H: 14°L: 10°87 % risk9,7 mmByar 14 m/s');
      const rows = sheet.locator('.wxp-table tbody tr');
      assert.equal(await rows.count(), 24, 'Hour by hour.');
      const row = time => rows.filter({ has: page.locator('th', { hasText: time }) }).locator('td').allTextContents();
      assert.deepEqual((await row('11:00')).slice(1, 4), ['77 %', '1,2 mm', '14°']);
      assert.equal(await sheet.locator('.wxp-chart .wxp-chart-bar').count() > 15, true, 'Chance of precipitation as bars.');
      assert.equal(await sheet.locator('.wxp-chart .wxp-chart-line').count(), 1, 'Temperature as a line.');
      assert.match(await sheet.locator('.wxp-chart').getAttribute('aria-label'), /högst 14 grader/);
      assert.equal(await sheet.locator('.wxp-sheet-note').count(), 0, 'Hourly steps need no note.');
      await page.screenshot({ path: path.join(out, 'phone-day.png'), animations: 'disabled' });

      // Day chips switch day; far ahead SMHI gives two steps a day and says so.
      const chips = sheet.getByRole('button', { name: /oktober$/ });
      assert.equal(await chips.count(), 10);
      assert.equal(await sheet.getByRole('button', { name: 'Torsdag 15 oktober' }).getAttribute('aria-pressed'), 'true');
      await sheet.getByRole('button', { name: 'Torsdag 22 oktober' }).click();
      await dialog.getByRole('heading', { name: 'Torsdag 22 oktober' }).waitFor();
      assert.equal(await rows.count(), 2);
      assert.equal(await sheet.locator('.wxp-sheet-note').textContent(), 'Så här långt fram ger SMHI prognos var 12:e timme.');
      // Today starts at the current hour.
      await sheet.getByRole('button', { name: 'Onsdag 14 oktober' }).click();
      await dialog.getByRole('heading', { name: 'Onsdag 14 oktober' }).waitFor();
      assert.equal(await rows.first().locator('th').textContent(), '08:00');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog'));
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Home → the week strip opens the weather page, and a day opens its hours', async () => {
      const { context, page } = await open(browser);
      const strip = page.getByTestId('home-weather');
      await page.locator('[data-testid="home-weather"][data-status="ready"]').waitFor();
      await strip.getByRole('button', { name: 'Öppna vädret för Göteborg' }).click();
      await page.locator('[data-testid="weather-page"][data-status="ready"]').waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.locator('.bottom-nav').getByRole('button', { name: 'Home', exact: true }).click();
      await page.locator('[data-testid="home-weather"] li[data-date="2026-10-16"] button').click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Fredag 16 oktober' }).waitFor();
      await context.close();
    });

    for (const [label, viewport] of [['landscape', { width: 1024, height: 768 }], ['portrait', { width: 768, height: 1024 }]]) {
      await check(`iPad ${label}: a tap on Thursday in the kitchen strip opens Thursday's hours`, async () => {
        const { context, page, errors } = await open(browser, { viewport });
        await page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
        const thursday = page.locator('[data-testid="home-screen-weather"] li[data-date="2026-10-15"] button');
        const box = await thursday.boundingBox();
        assert.ok(box.height >= 44 && box.width >= 44, `The day is a real tap target (${box.width}×${box.height}).`);
        await thursday.click();
        await page.getByRole('dialog').getByRole('heading', { name: 'Torsdag 15 oktober' }).waitFor();
        await page.screenshot({ path: path.join(out, `ipad-${label}-day.png`), animations: 'disabled' });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        await page.screenshot({ path: path.join(out, `ipad-${label}.png`), fullPage: true, animations: 'disabled' });
        assert.ok(await noSidewaysScroll(page));
        assert.deepEqual(errors, []);
        await context.close();
      });
    }

    await check('Desktop, dark: hero and hours across, ten days beside the tiles', async () => {
      const { context, page, errors } = await open(browser, { viewport: { width: 1280, height: 900 }, touch: false, theme: 'dark' });
      const wx = await openWeatherFromMenu(page);
      const days = await wx.locator('.wxp-days').boundingBox();
      const tiles = await wx.locator('.wxp-tiles').boundingBox();
      const hourly = await wx.locator('.wxp-hourly').boundingBox();
      assert.ok(tiles.x > days.x + days.width - 1, 'Tiles sit to the right of the ten days.');
      assert.ok(Math.abs(tiles.y - days.y) < 2, 'Side by side.');
      assert.ok(hourly.width > days.width + tiles.width, 'The hours span the full width.');
      await page.screenshot({ path: path.join(out, 'desktop-dark.png'), fullPage: true, animations: 'disabled' });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Night: the sky turns dark and clear hours show the moon', async () => {
      const { context, page, errors } = await open(browser, { time: '2026-10-15T00:30:00+02:00', shiftDays: -2 });
      const wx = await openWeatherFromMenu(page);
      assert.equal(await wx.getAttribute('data-sky'), 'night');
      assert.equal(await wx.locator('.wxp-hero .wxp-condition').textContent(), 'Klart');
      assert.equal(await wx.locator('.wxp-hour').first().locator('.weather-icon').getAttribute('data-kind'), 'clear-night');
      assert.equal(await wx.locator('.wxp-hour.is-sun').first().getAttribute('data-kind'), 'sunrise');
      await page.screenshot({ path: path.join(out, 'night.png'), fullPage: true, animations: 'disabled' });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('SMHI down: Open-Meteo takes over and the page says so', async () => {
      const { context, page, errors } = await open(browser, { mode: 'smhi-down' });
      const wx = await openWeatherFromMenu(page);
      assert.equal(await wx.getAttribute('data-source'), 'open-meteo');
      assert.equal(await wx.locator('.wxp-day').count(), 10);
      assert.match(await wx.locator('.wxp-credit').textContent(), /^Källa: Open-Meteo \(SMHI svarade inte eller orten ligger utanför SMHI:s område\)$/);
      assert.equal(await wx.locator('.wxp-tile').count(), 6);
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('No network on the first visit: an honest message and Försök igen', async () => {
      const { context, page, state } = await open(browser, { mode: 'fail' });
      await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
      await page.getByRole('button', { name: /^Väder/ }).click();
      const wx = page.locator('[data-testid="weather-page"][data-status="error"]');
      await wx.waitFor();
      assert.equal(await wx.locator('.wxp-condition').textContent(), 'Vädret kunde inte hämtas just nu.');
      state.mode = 'ok';
      await wx.getByRole('button', { name: 'Försök igen' }).click();
      await page.locator('[data-testid="weather-page"][data-status="ready"] .wxp-temp').waitFor();
      await context.close();
    });

    await check('Changing the town on the weather page updates it at once and is remembered', async () => {
      const { context, page } = await open(browser);
      const wx = await openWeatherFromMenu(page);
      await wx.getByRole('button', { name: 'Göteborg' }).click();
      await wx.getByLabel('Sök ort för vädret').fill('Malm');
      await wx.getByRole('button', { name: 'Sök ort' }).click();
      await wx.getByRole('button', { name: /Malmö.*Skåne, Sverige/ }).click();
      await wx.locator('.wxp-place', { hasText: 'Malmö' }).waitFor();
      assert.equal(await wx.locator('#wxp-place-picker').count(), 0, 'The picker closes after choosing.');
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="weather-page"][data-status="ready"] .wxp-day .weather-icon[data-kind="sun"]').length === 10);
      await page.reload();
      await page.locator('.loading-notice').waitFor({ state: 'detached' });
      await page.locator('[data-testid="home-weather"] .wx-place', { hasText: 'Malmö' }).waitFor();
      await context.close();
    });
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} weather page scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
