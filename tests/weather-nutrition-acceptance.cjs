// Weekly weather on the iPad home screen, Morgon/Kväll for supplements, and the airier phone Home.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'weather-nutrition');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const created = '2026-09-01T09:00:00.000Z';
const habit = (id, title, time) => ({ id, title, amount: '1', unit: 'st', createdAt: created, ...(time === undefined ? {} : { time }) });
const task = (id, title, v = {}) => ({ id, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: created, ...v });
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
  projects: [],
  tasks: [task('a', 'Hälsoformulär', { deadline: '2026-10-13', priority: 'high' }), task('b', 'Ring logopeden', { deadline: '2026-10-14', columnId: 'doing' }), task('c', 'Handla', { deadline: '2026-10-17' }), task('d', 'Rensa förrådet', { columnId: 'doing' })],
  nutritionHabits: [habit('dv', 'D-vitamin', 'morning'), habit('om', 'Omega-3', 'morning'), habit('mg', 'Magnesium', 'evening'), habit('zn', 'Zink', 'evening'), habit('wa', 'Vatten', null), habit('old', 'Protein')],
  nutritionCompletions: [{ id: 'nutrition:dv:2026-10-14', habitId: 'dv', date: '2026-10-14', completed: true }],
  birthdays: [{ id: 'mira', name: 'Mira', birthDate: '2019-10-20', reminders: [], createdAt: created, generatedReminders: [], tag: null }], birthdayNotifications: [],
} };
const { routeWeather, cors } = require('./helpers/weather-mock.cjs');

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.stack}`); } };
const cache = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).workspace, key);
const weather = page => page.getByTestId('home-screen-weather');

async function open(browser, { viewport = { width: 1024, height: 768 }, touch = true, time = '2026-10-14T07:42:00+02:00', weatherRoute = 'ok', theme = 'light', homescreen } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 2, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
  const state = { geocodeCalls: 0, mode: weatherRoute };
  await routeWeather(context, state, time);
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
  // The app is inert while it loads; a person cannot type before this either.
  await page.locator('.loading-notice').waitFor({ state: 'detached' });
  return { context, page, errors, state };
}

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const [label, viewport] of [['landscape', { width: 1024, height: 768 }], ['portrait', { width: 768, height: 1024 }]]) {
      await check(`iPad ${label}: Monday–Sunday weather with Apple-style icons, still one screen`, async () => {
        const { context, page, errors, state } = await open(browser, { viewport });
        await page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
        const days = weather(page).locator('.wx-day');
        assert.deepEqual(await days.evaluateAll(nodes => nodes.map(node => node.dataset.date)), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
        assert.deepEqual(await days.locator('.wx-day-name').allTextContents(), ['Mån', 'Tis', 'Idag', 'Tor', 'Fre', 'Lör', 'Sön']);
        assert.deepEqual(await weather(page).locator('.weather-icon').evaluateAll(nodes => nodes.map(node => node.dataset.kind)), ['rain', 'sun', 'cloudy', 'rain', 'sun', 'sun', 'sun']);
        assert.deepEqual(await days.locator('.wx-rain-chance').allTextContents(), ['85%', '', '', '87%', '', '', '']);
        assert.deepEqual(await days.locator('.wx-temps').allTextContents(), ['10°6°', '13°3°', '15°4°', '14°10°', '11°6°', '11°3°', '12°3°']);
        assert.match(await days.nth(2).getAttribute('class'), /is-today/);
        assert.match(await days.nth(0).getAttribute('class'), /is-past/);
        assert.match(await days.nth(0).getAttribute('aria-label'), /måndag 12 oktober: Lätt regn, högst 10 grader, lägst 6 grader, 85 procent risk för nederbörd/);
        assert.match(await days.nth(3).locator('button').getAttribute('aria-label'), /torsdag 15 oktober: Regn, högst 14 grader, lägst 10 grader, 87 procent risk för nederbörd\. Visa timprognos\./);
        assert.equal(await days.nth(1).locator('button').count(), 0, 'Past days are not tappable.');
        assert.equal(await days.locator('button').count(), 5, 'Today and the rest of the week open the weather page.');
        assert.match(await weather(page).textContent(), /Göteborg.*Källa: SMHI · Open-Meteo/s);
        assert.equal(await weather(page).locator('.wx-place small').count(), 0, 'A fresh forecast shows no time: quiet when all is well.');
        assert.equal(await weather(page).locator('.wx-credit').getAttribute('title'), 'Källa: SMHI · Open-Meteo', 'The source is a small info icon.');
        assert.equal(await weather(page).getAttribute('data-source'), 'smhi');
        assert.equal(state.smhiCalls.length, 1, 'SMHI is the forecast.');
        assert.match(state.smhiCalls[0], /snow1g\/version\/1\/geotype\/point\/lon\/11\.9746\/lat\/57\.7089\/data\.json$/);
        assert.equal(state.forecastCalls[0].get('start_date'), '2026-10-12', 'Open-Meteo fills in Monday and Tuesday.');
        const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: innerHeight }));
        assert.ok(size.scroll <= size.inner + 1, `${label}: no page scroll (${size.scroll} > ${size.inner})`);
        const inView = await page.locator('.wx-day, .hs-focus-row, .hs-quick, .bottom-nav').evaluateAll(nodes => nodes.every(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5; }));
        assert.ok(inView, `${label}: weather, Gör först, quick add and nav are fully visible.`);
        await page.screenshot({ path: path.join(out, `ipad-${label}.png`), animations: 'disabled' });
        assert.deepEqual(errors, []);
        await context.close();
      });
    }

    await check('Weather survives offline: cached week stays with a note; first load without network offers retry', async () => {
      const { context, page, state } = await open(browser);
      await page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
      state.mode = 'fail';
      await page.clock.runFor(31 * 60_000);
      await page.locator('[data-testid="home-screen-weather"][data-status="stale"]').waitFor();
      assert.equal(await weather(page).locator('.weather-icon').count(), 7, 'The cached week is still shown.');
      assert.match(await weather(page).locator('.wx-place small').textContent(), /Sparat 07:42 · offline/);
      state.mode = 'ok';
      await weather(page).getByRole('button', { name: 'Försök igen' }).click();
      await page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
      await context.close();

      const cold = await open(browser, { weatherRoute: 'fail' });
      await cold.page.locator('[data-testid="home-screen-weather"][data-status="error"]').waitFor();
      assert.match(await weather(cold.page).textContent(), /Vädret kunde inte hämtas/);
      cold.state.mode = 'ok';
      await weather(cold.page).getByRole('button', { name: 'Försök igen' }).click();
      await cold.page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
      await cold.context.close();
    });

    await check('Choosing another town in Inställningar → Hemskärm updates the forecast at once', async () => {
      const { context, page, state } = await open(browser);
      await page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
      await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
      const dialog = page.getByRole('dialog');
      assert.match(await dialog.locator('.weather-place-current').textContent(), /Väder för Göteborg/);
      await dialog.getByLabel('Sök ort för vädret').fill('Malm');
      await dialog.getByRole('button', { name: 'Sök ort' }).click();
      await dialog.getByRole('button', { name: /Malmö.*Skåne, Sverige/ }).click();
      await dialog.getByText('Vädret visas nu för Malmö.').waitFor();
      await dialog.getByRole('button', { name: 'Stäng', exact: true }).last().click();
      await weather(page).locator('.wx-place strong', { hasText: 'Malmö' }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="home-screen-weather"] .weather-icon[data-kind="sun"]').length === 7);
      assert.equal(state.forecastCalls.at(-1).get('latitude'), '55.6050');
      await page.reload();
      await weather(page).locator('.wx-place strong', { hasText: 'Malmö' }).waitFor();
      await context.close();
    });

    await check('A supplement is set to Morgon or Kväll and shows a small pill everywhere, with no extra layout', async () => {
      const { context, page } = await open(browser, { viewport: { width: 402, height: 874 } });
      const pills = (scope, attr) => page.locator(scope).evaluateAll((nodes, attr) => nodes.map(node => [node.dataset[attr], node.querySelector('.time-pill')?.textContent ?? null]), attr);
      // Phone Home: every supplement listed, in stored order, each with its pill.
      // Home orders by time of day: at 07:42 the morning ones first, then those without a time, then the evening.
      assert.deepEqual(await pills('.home-habits [data-home-habit-id]', 'homeHabitId'), [['dv', 'Morgon'], ['om', 'Morgon'], ['wa', null], ['old', null], ['mg', 'Kväll'], ['zn', 'Kväll']]);
      assert.equal(await page.locator('.nutrition-time-toggle, .home-time-toggle').count(), 0, 'No morning/evening switch.');
      await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
      await page.getByRole('button', { name: /^Kost/ }).first().click();
      assert.equal(await page.locator('.nutrition-group').count(), 0, 'Kost is one list, not grouped.');
      assert.deepEqual(await pills('.nutrition-habits [data-habit-id]', 'habitId'), [['dv', 'Morgon'], ['om', 'Morgon'], ['mg', 'Kväll'], ['zn', 'Kväll'], ['wa', null], ['old', null]]);
      // New habit: Morgon by default, switch to Kväll.
      await page.getByRole('button', { name: 'Ny kostvana' }).click();
      const dialog = page.getByRole('dialog');
      const group = dialog.getByRole('group', { name: 'När' });
      assert.deepEqual(await group.getByRole('button').allTextContents(), ['Morgon', 'Kväll']);
      assert.equal(await group.getByRole('button', { name: 'Morgon' }).getAttribute('aria-pressed'), 'true');
      await dialog.getByLabel('Titel', { exact: true }).fill('Melatonin');
      await dialog.getByLabel('Mängd', { exact: true }).fill('1');
      await group.getByRole('button', { name: 'Kväll' }).click();
      await dialog.getByRole('button', { name: 'Spara', exact: true }).click();
      assert.equal((await cache(page)).nutritionHabits.find(h => h.title === 'Melatonin').time, 'evening');
      // An older habit without a time: nothing selected until chosen.
      await page.getByRole('button', { name: 'Redigera kostvana Protein' }).click();
      assert.deepEqual(await dialog.getByRole('group', { name: 'När' }).getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed'))), ['false', 'false']);
      await dialog.getByRole('group', { name: 'När' }).getByRole('button', { name: 'Morgon' }).click();
      await dialog.getByRole('button', { name: 'Spara', exact: true }).click();
      assert.equal((await cache(page)).nutritionHabits.find(h => h.title === 'Protein').time, 'morning');
      assert.equal(await page.locator('[data-habit-id="old"] .time-pill').textContent(), 'Morgon');
      await page.screenshot({ path: path.join(out, 'kost-pills.png'), fullPage: true, animations: 'disabled' });
      await context.close();

      // iPad home screen: same pills, all supplements visible, still one screen.
      const ipad = await open(browser);
      assert.deepEqual(await ipad.page.locator('.hs-habit').evaluateAll(nodes => nodes.map(node => [node.dataset.habitId, node.querySelector('.time-pill')?.textContent ?? null])), [['dv', 'Morgon'], ['om', 'Morgon'], ['wa', null], ['old', null], ['mg', 'Kväll'], ['zn', 'Kväll']]);
      const size = await ipad.page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: innerHeight }));
      assert.ok(size.scroll <= size.inner + 1);
      await ipad.page.locator('[data-habit-id="mg"]').click();
      assert.equal(await ipad.page.locator('[data-habit-id="mg"]').getAttribute('aria-pressed'), 'true');
      await ipad.context.close();
    });

    await check('Phone Home breathes: five centred stat tiles, two reasons per task, one suggestion at a time', async () => {
      const { context, page, errors } = await open(browser, { viewport: { width: 402, height: 874 } });
      const briefing = page.getByTestId('daily-briefing');
      await briefing.waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No sideways page scroll.');
      const tops = await briefing.locator('.briefing-stat').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
      assert.equal(new Set(tops).size, 1, 'All stats on one line.');
      assert.ok(await briefing.locator('.briefing-stats').evaluate(node => node.scrollWidth <= node.clientWidth), 'All five fit without sideways scrolling.');
      const edges = await briefing.evaluate(card => { const box = card.getBoundingClientRect(); const tiles = [...card.querySelectorAll('.briefing-stat')].map(t => t.getBoundingClientRect()); return { left: tiles[0].left - box.left, right: box.right - tiles.at(-1).right, widths: new Set(tiles.map(t => Math.round(t.width))).size }; });
      assert.ok(Math.abs(edges.left - edges.right) <= 1, `Stats are centred in the card (${edges.left} vs ${edges.right}).`);
      assert.equal(edges.widths, 1, 'Equal tile widths.');
      assert.deepEqual(await briefing.locator('.briefing-stat dt').allTextContents(), ['Försenat', 'Idag', '7 dagar', 'Pågår', 'Fyller år']);
      for (const row of await briefing.locator('.briefing-reasons').all()) {
        const visible = await row.locator(':scope > *').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').length);
        assert.ok(visible <= 2, `At most two reasons per task (${visible}).`);
      }
      assert.equal(await briefing.locator('[data-tip]').count(), 1, 'One suggestion first.');
      const more = briefing.getByRole('button', { name: /^Visa \d+ förslag till/ });
      await more.click();
      assert.ok(await briefing.locator('[data-tip]').count() > 1);
      assert.equal(await briefing.locator('.briefing-footnote').isVisible(), false);
      const heading = await briefing.locator('.briefing-summary').boundingBox();
      const card = await briefing.boundingBox();
      assert.ok(heading.width > card.width - 60, 'The summary uses the full card width.');
      await page.screenshot({ path: path.join(out, 'phone-home.png'), fullPage: true, animations: 'disabled' });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('A calm, steady day shows no empty Förslag heading', async () => {
      const steady = structuredClone(fixture);
      steady.workspace.tasks = [task('x', 'Läs boken', { deadline: '2026-10-18', priority: 'high', createdAt: '2026-10-10T09:00:00.000Z', columnId: 'doing' })];
      steady.workspace.birthdays = [];
      const context = await browser.newContext({ viewport: { width: 402, height: 874 }, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm' });
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value: steady });
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-10-15T07:42:00+02:00') });
      await page.goto(base);
      await page.getByTestId('daily-briefing').waitFor();
      assert.equal(await page.getByTestId('briefing-tips').count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Förslag' }).count(), 0);
      await page.getByTestId('briefing-focus').waitFor();
      await context.close();
    });

    await check('A phone never gets the tablet home screen, even set to På, and shows the weather on its regular Home', async () => {
      for (const width of [402, 320]) {
        const { context, page, errors } = await open(browser, { viewport: { width, height: 874 }, homescreen: 'on' });
        await page.getByTestId('daily-briefing').waitFor();
        assert.equal(await page.getByTestId('home-screen').count(), 0, `${width}px: no home-screen layout on a phone.`);
        await page.locator('[data-testid="home-weather"][data-status="ready"]').waitFor();
        assert.equal(await page.locator('[data-testid="home-weather"] .wx-day').count(), 7);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: no sideways scroll`);
        assert.ok(await page.locator('[data-testid="home-weather"] .wx-day').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1)), `${width}px: each day fits`);
        await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('heading', { name: 'Väder' }).waitFor();
        assert.equal(await dialog.getByRole('heading', { name: 'Hemskärm' }).count(), 0, 'Hemskärm is offered only where it can apply.');
        assert.deepEqual(errors, []);
        await context.close();
      }
      // The same "På" still works on a tablet.
      const ipad = await open(browser, { homescreen: 'on' });
      await ipad.page.getByTestId('home-screen').waitFor();
      await ipad.context.close();
    });

    await check('Dark iPad home screen with weather', async () => {
      const { context, page } = await open(browser, { theme: 'dark' });
      await page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
      await page.screenshot({ path: path.join(out, 'ipad-dark.png'), animations: 'disabled' });
      await context.close();
    });
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} weather/nutrition/phone scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
