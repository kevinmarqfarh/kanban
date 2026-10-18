// Quiet improvements, end to end: the iPad goes dark after sunset, the weather is one sentence in the briefing,
// quick add reads a date at the end of the text, supplements follow the time of day, and deleting offers Ångra.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { routeWeather } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'improvements');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const created = '2026-09-01T09:00:00.000Z';
const habit = (id, title, time) => ({ id, title, amount: '1', unit: 'st', createdAt: created, ...(time ? { time } : {}) });
const task = (id, title, v = {}) => ({ id, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: created, ...v });
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
  projects: [], tasks: [task('a', 'Handla', { deadline: '2026-10-16' })],
  nutritionHabits: [habit('dv', 'D-vitamin', 'morning'), habit('mg', 'Magnesium', 'evening'), habit('wa', 'Vatten'), habit('om', 'Omega-3', 'morning')], nutritionCompletions: [],
  birthdays: [], birthdayNotifications: [],
} };
const IPAD = { width: 1024, height: 768 };
const PHONE = { width: 402, height: 874 };

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.stack}`); } };
const cache = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).workspace, key);

async function open(browser, { viewport = IPAD, touch = true, time = '2026-10-14T07:42:00+02:00', theme, colorScheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, colorScheme, deviceScaleFactor: 2, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
  await routeWeather(context, {}, time);
  await context.addInitScript(({ key, value, theme }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    if (theme) localStorage.setItem('forma-theme', theme); else localStorage.removeItem('forma-theme');
  }, { key, value: fixture, theme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(time) });
  await page.goto(base);
  await page.locator('.loading-notice').waitFor({ state: 'detached' });
  return { context, page, errors };
}
const theme = page => page.evaluate(() => document.documentElement.dataset.theme);

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    await check('The docked iPad set to System follows the sun: light by day, dark after sunset (18:12), light again at sunrise', async () => {
      const { context, page, errors } = await open(browser, { time: '2026-10-14T17:58:00+02:00' });
      await page.getByTestId('home-screen').waitFor();
      assert.equal(await theme(page), 'light');
      await page.clock.runFor(20 * 60_000); // 18:18, after sunset in Göteborg
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#191919');
      await page.screenshot({ path: path.join(out, 'ipad-evening-dark.png'), animations: 'disabled' });
      // Settings explain it, only where it applies.
      await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
      await page.getByRole('dialog').getByText('På hemskärmen följer System solen: mörkt från solnedgång till soluppgång.').waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).last().click();
      await page.clock.runFor(14 * 60 * 60_000); // 08:18 next morning
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('A chosen theme always wins, and a phone keeps following its own system setting', async () => {
      const fixed = await open(browser, { time: '2026-10-14T21:00:00+02:00', theme: 'light' });
      await fixed.page.getByTestId('home-screen').waitFor();
      assert.equal(await theme(fixed.page), 'light', 'Ljust stays light at night.');
      await fixed.context.close();
      const phone = await open(browser, { viewport: PHONE, time: '2026-10-14T21:00:00+02:00', colorScheme: 'light' });
      await phone.page.getByTestId('daily-briefing').waitFor();
      assert.equal(await theme(phone.page), 'light', 'Not the home screen: System means the phone’s own setting.');
      await phone.context.close();
    });

    await check('The weather is one sentence in the briefing — on the iPad and on the phone, today and from 18:00 tomorrow', async () => {
      const ipad = await open(browser);
      await ipad.page.locator('[data-testid="home-screen-weather"][data-status="ready"]').waitFor();
      assert.equal(await ipad.page.locator('.hs-summary .briefing-weather').textContent(), ' Uppehåll resten av dagen, som varmast 15°.');
      await ipad.context.close();
      const evening = await open(browser, { viewport: PHONE, time: '2026-10-14T19:00:00+02:00' });
      await evening.page.locator('[data-testid="home-weather"][data-status="ready"]').waitFor();
      assert.equal(await evening.page.locator('.briefing-summary .briefing-weather').textContent(), ' I morgon: regn 06–19, ta med paraply.');
      await evening.page.screenshot({ path: path.join(out, 'phone-briefing-weather.png'), animations: 'disabled' });
      await evening.context.close();
    });

    await check('Quick add reads a date at the end: the chip shows it and the task gets that deadline', async () => {
      const { context, page, errors } = await open(browser);
      const field = page.getByLabel('Ny uppgift', { exact: true });
      await field.fill('Ring tandläkaren fre 14');
      const chip = page.locator('.hs-today-toggle.is-parsed');
      assert.equal(await chip.textContent(), 'Fre 14:00');
      assert.equal(await chip.getAttribute('aria-label'), 'Deadline Fre 16 okt 14:00');
      assert.equal(await page.getByRole('button', { name: 'Idag', exact: true }).count(), 0, 'The date replaces the Idag toggle while it applies.');
      await page.screenshot({ path: path.join(out, 'ipad-quick-add-date.png'), animations: 'disabled' });
      await page.getByRole('button', { name: 'Lägg till i Planner' }).click();
      await page.getByText('”Ring tandläkaren” ligger i Planner med deadline fre 16 okt 14:00.').waitFor();
      const added = (await cache(page)).tasks.find(entry => entry.title === 'Ring tandläkaren');
      assert.deepEqual([added.deadline, added.deadlineTime], ['2026-10-16', '14:00']);
      // Without a date the Idag toggle works as before; ordinary numbers are left alone.
      await field.fill('Läs kapitel 14');
      assert.equal(await page.getByRole('button', { name: 'Idag', exact: true }).count(), 1);
      await page.getByRole('button', { name: 'Lägg till i Planner' }).click();
      const plain = (await cache(page)).tasks.find(entry => entry.title === 'Läs kapitel 14');
      assert.deepEqual([plain.deadline, plain.deadlineTime], ['2026-10-14', null]);
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Supplements follow the time of day: evening ones first in the evening, same content and ticks', async () => {
      const morning = await open(browser, { viewport: PHONE, time: '2026-10-14T07:42:00+02:00' });
      const order = page => page.locator('.home-habits [data-home-habit-id]').evaluateAll(nodes => nodes.map(node => node.dataset.homeHabitId));
      assert.deepEqual(await order(morning.page), ['dv', 'om', 'wa', 'mg']);
      await morning.context.close();
      const evening = await open(browser, { viewport: PHONE, time: '2026-10-14T20:30:00+02:00' });
      assert.deepEqual(await order(evening.page), ['mg', 'wa', 'dv', 'om']);
      await evening.page.locator('[data-home-habit-id="mg"] input').check();
      assert.equal((await cache(evening.page)).nutritionCompletions[0].habitId, 'mg');
      assert.deepEqual((await cache(evening.page)).nutritionHabits.map(entry => entry.id), ['dv', 'mg', 'wa', 'om'], 'The saved order is untouched.');
      await evening.context.close();
    });

    await check('Deleting a task offers Ångra, which restores it exactly; the toast then leaves by itself', async () => {
      const { context, page, errors } = await open(browser, { viewport: { width: 1280, height: 900 }, touch: false });
      await page.locator('.bottom-nav').getByRole('button', { name: 'Planner', exact: true }).click();
      await page.getByRole('button', { name: 'Öppna Handla', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Ta bort uppgift', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.deepEqual((await cache(page)).tasks, []);
      const toast = page.getByTestId('undo-toast');
      await toast.waitFor();
      await page.screenshot({ path: path.join(out, 'undo-toast.png'), animations: 'disabled' });
      await toast.getByRole('button', { name: 'Ångra', exact: true }).click();
      assert.deepEqual((await cache(page)).tasks, fixture.workspace.tasks);
      await page.getByRole('button', { name: 'Öppna Handla', exact: true }).waitFor();
      // The toast leaves by itself after a few seconds.
      await page.getByRole('button', { name: 'Öppna Handla', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Ta bort uppgift', exact: true }).click();
      await toast.waitFor();
      await page.clock.runFor(8_000);
      await toast.waitFor({ state: 'detached' });
      assert.deepEqual(errors, []);
      await context.close();
    });
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} improvement scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
