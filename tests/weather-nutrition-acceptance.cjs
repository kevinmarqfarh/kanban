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
const forecast = { daily: { time: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'], weather_code: [3, 61, 2, 0, 80, 1, 63], temperature_2m_max: [11.2, 9.6, 12.4, 13.8, 10.1, 12.9, 8.7], temperature_2m_min: [5.1, 6.0, 4.4, 3.2, 6.6, 5.0, 4.9], precipitation_probability_max: [20, 85, 10, 0, 60, 5, 90] } };
const malmo = { daily: { ...forecast.daily, weather_code: [0, 0, 0, 0, 0, 0, 0] } };
const cors = { 'access-control-allow-origin': '*' };

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.stack}`); } };
const cache = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).workspace, key);
const weather = page => page.getByTestId('home-screen-weather');

async function open(browser, { viewport = { width: 1024, height: 768 }, touch = true, time = '2026-10-14T07:42:00+02:00', weatherRoute = 'ok', theme = 'light', homescreen } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 2, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
  const state = { forecastCalls: [], geocodeCalls: 0, mode: weatherRoute };
  await context.route('https://api.open-meteo.com/**', route => {
    const url = new URL(route.request().url());
    state.forecastCalls.push(url.searchParams);
    if (state.mode === 'fail') return route.abort('internetdisconnected');
    return route.fulfill({ headers: cors, json: url.searchParams.get('latitude') === '55.6050' ? malmo : forecast });
  });
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
        assert.deepEqual(await weather(page).locator('.weather-icon').evaluateAll(nodes => nodes.map(node => node.dataset.kind)), ['cloudy', 'rain', 'partly-cloudy', 'sun', 'showers', 'mostly-sunny', 'rain']);
        assert.deepEqual(await days.locator('.wx-rain-chance').allTextContents(), ['', '85%', '', '', '60%', '', '90%']);
        assert.deepEqual(await days.locator('.wx-temps').allTextContents(), ['11°5°', '10°6°', '12°4°', '14°3°', '10°7°', '13°5°', '9°5°']);
        assert.match(await days.nth(2).getAttribute('class'), /is-today/);
        assert.match(await days.nth(0).getAttribute('class'), /is-past/);
        assert.match(await days.nth(1).getAttribute('aria-label'), /tisdag 13 oktober: Regn, högst 10 grader, lägst 6 grader, 85 procent risk för nederbörd/);
        assert.match(await weather(page).textContent(), /Göteborg.*Uppdaterat 07:42.*Väder: Open-Meteo/s);
        assert.equal(state.forecastCalls[0].get('start_date'), '2026-10-12');
        assert.equal(state.forecastCalls[0].get('end_date'), '2026-10-18');
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

    await check('A new supplement gets Morgon, Kväll or Hela dagen and Kost groups by it', async () => {
      const { context, page } = await open(browser, { viewport: { width: 402, height: 874 } });
      await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
      await page.getByRole('button', { name: /^Kost/ }).first().click();
      await page.getByRole('button', { name: 'Ny kostvana' }).click();
      const dialog = page.getByRole('dialog');
      const group = dialog.getByRole('group', { name: 'När' });
      assert.equal(await group.getByRole('button', { name: 'Morgon' }).getAttribute('aria-pressed'), 'true', 'New habits default to Morgon.');
      await dialog.getByLabel('Titel', { exact: true }).fill('Melatonin');
      await dialog.getByLabel('Mängd', { exact: true }).fill('1');
      await group.getByRole('button', { name: 'Kväll' }).click();
      assert.equal(await group.getByRole('button', { name: 'Kväll' }).getAttribute('aria-pressed'), 'true');
      await dialog.getByRole('button', { name: 'Spara', exact: true }).click();
      assert.equal((await cache(page)).nutritionHabits.find(h => h.title === 'Melatonin').time, 'evening');
      const groups = await page.locator('.nutrition-group').evaluateAll(nodes => nodes.map(node => [node.dataset.time, [...node.querySelectorAll('[data-habit-id] strong')].map(n => n.textContent)]));
      assert.deepEqual(groups, [['morning', ['D-vitamin', 'Omega-3']], ['evening', ['Magnesium', 'Zink', 'Melatonin']], ['all-day', ['Vatten', 'Protein']]]);
      // Edit keeps the choice and can change it.
      await page.getByRole('button', { name: 'Redigera kostvana Protein' }).click();
      assert.equal(await dialog.getByRole('group', { name: 'När' }).getByRole('button', { name: 'Hela dagen' }).getAttribute('aria-pressed'), 'true', 'Habits saved before the choice are Hela dagen.');
      await dialog.getByRole('group', { name: 'När' }).getByRole('button', { name: 'Morgon' }).click();
      await dialog.getByRole('button', { name: 'Spara', exact: true }).click();
      assert.equal((await cache(page)).nutritionHabits.find(h => h.title === 'Protein').time, 'morning');
      await page.screenshot({ path: path.join(out, 'kost-grouped.png'), fullPage: true, animations: 'disabled' });
      await context.close();
    });

    await check('Dagens kost shows morning before 14:00, evening after, and the toggle switches by hand', async () => {
      for (const [where, opts, list, toggle] of [
        ['phone Home', { viewport: { width: 402, height: 874 } }, '.home-habits [data-home-habit-id]', '.home-time-toggle'],
        ['iPad home screen', {}, '.hs-habit', '.hs-time-toggle'],
      ]) {
        const { context, page } = await open(browser, opts);
        const ids = () => page.locator(list).evaluateAll(nodes => nodes.map(node => node.dataset.homeHabitId ?? node.dataset.habitId));
        await page.locator(toggle).waitFor();
        assert.equal(await page.locator(`${toggle} [data-time="morning"]`).getAttribute('aria-pressed'), 'true', `${where}: morning at 07:42`);
        assert.match(await page.locator(`${toggle} [data-time="morning"]`).textContent(), /Morgon1\/4/);
        assert.match(await page.locator(`${toggle} [data-time="evening"]`).textContent(), /Kväll0\/4/);
        assert.deepEqual(await ids(), ['dv', 'om', 'wa', 'old'], `${where}: morning + all-day`);
        await page.locator(`${toggle} [data-time="evening"]`).click();
        assert.deepEqual(await ids(), ['mg', 'zn', 'wa', 'old'], `${where}: evening + all-day`);
        // Tick Vatten in the evening view: it counts for both parts.
        await page.locator(list).nth(2).click();
        assert.match(await page.locator(`${toggle} [data-time="morning"]`).textContent(), /2\/4/);
        // The clock moves past 14:00: back to following the clock (evening).
        await page.locator(`${toggle} [data-time="morning"]`).click();
        await page.clock.runFor(6.5 * 3600_000);
        await page.waitForFunction(t => document.querySelector(`${t} [data-time="evening"]`)?.getAttribute('aria-pressed') === 'true', toggle);
        await context.close();
      }
    });

    await check('Without any morning/evening habit there is no toggle', async () => {
      const plain = structuredClone(fixture);
      plain.workspace.nutritionHabits = plain.workspace.nutritionHabits.map(({ time, ...rest }) => rest);
      const context = await browser.newContext({ viewport: { width: 402, height: 874 }, serviceWorkers: 'block' });
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value: plain });
      const page = await context.newPage();
      await page.goto(base);
      await page.getByTestId('home-nutrition').waitFor();
      assert.equal(await page.locator('.home-time-toggle').count(), 0);
      assert.equal(await page.locator('.home-habits [data-home-habit-id]').count(), 6);
      await context.close();
    });

    await check('Phone Home breathes: one-line swipeable stats, two reasons per task, one suggestion at a time', async () => {
      const { context, page, errors } = await open(browser, { viewport: { width: 402, height: 874 } });
      const briefing = page.getByTestId('daily-briefing');
      await briefing.waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No sideways page scroll.');
      const tops = await briefing.locator('.briefing-stat').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
      assert.equal(new Set(tops).size, 1, 'All stats on one line.');
      assert.ok(await briefing.locator('.briefing-stats').evaluate(node => node.scrollWidth > node.clientWidth), 'The row scrolls sideways.');
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
