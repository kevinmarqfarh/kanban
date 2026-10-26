// PC planning and the boundaries between mouse, tablet and phone layouts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { routeWeather } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'desktop');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const today = '2026-10-26';
const now = `${today}T09:00:00+01:00`;
const createdAt = '2026-10-01T12:00:00.000Z';
const task = (id, title, fields = {}) => ({ id, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt, ...fields });
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }], projects: [],
  tasks: [
    task('free', 'Skriv arbetsplan', { deadline: '2026-11-06', deadlineTime: '11:00', priority: 'high', description: 'Bevara den här beskrivningen', labels: ['Jobb'], checklist: [{ id: 'check', title: 'Läs underlag', completed: false }], comments: [{ id: 'comment', text: 'Ursprunglig kommentar', createdAt }] }),
    task('morning', 'Morgonmöte', { schedule: { date: today, startTime: '09:00', endTime: '10:00' }, priority: 'high' }),
    task('overlap', 'Kundmöte', { schedule: { date: today, startTime: '09:30', endTime: '10:30' }, priority: 'low' }),
    task('adjacent', 'Skriv protokoll', { schedule: { date: today, startTime: '10:30', endTime: '11:30' } }),
    task('week', 'Planera mat', { schedule: { date: today, scope: 'week' } }),
    task('sunday', 'Söndagspromenad', { schedule: { date: '2026-11-01' } }),
    task('midnight', 'Avsluta månaden', { schedule: { date: '2026-10-31', startTime: '23:00', endTime: '24:00' } }),
    task('future', 'Nästa söndag', { schedule: { date: '2026-11-08', startTime: '12:00', endTime: '13:00' } }),
    task('past', 'Förra veckan', { schedule: { date: '2026-10-25' } }),
    task('done', 'Redan klar', { columnId: 'done', schedule: { date: today, startTime: '08:00', endTime: '18:00' } }),
    task('archived', 'Undanlagd', { columnId: 'finalized' }),
  ], birthdays: [], birthdayNotifications: [], nutritionHabits: [], nutritionCompletions: [],
} };
const results = [];
const contexts = new Set();
const cache = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).workspace, key);
const nav = (page, name) => page.locator('.bottom-nav').getByRole('button', { name, exact: true });
const week = page => page.locator('.week-planner');
const dialog = page => page.getByRole('dialog', { name: 'Planera uppgift', exact: true });
const save = page => dialog(page).getByRole('button', { name: 'Spara planering', exact: true });
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The document has no horizontal overflow.');
async function open(browser, { viewport = { width: 1440, height: 900 }, touch = false, theme = 'light', mode, empty = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
  contexts.add(context);
  await routeWeather(context, {}, now);
  await context.addInitScript(({ key, fixture, theme, mode, empty }) => {
    if (!localStorage.getItem(key)) {
      if (empty) fixture.workspace.tasks = [];
      localStorage.setItem(key, JSON.stringify(fixture));
    }
    localStorage.setItem('forma-theme', theme);
    if (mode) localStorage.setItem('forma-homescreen', mode);
  }, { key, fixture, theme, mode, empty });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(now) });
  await page.goto(base);
  await page.locator('.loading-notice').waitFor({ state: 'detached' });
  return { context, page, errors };
}
async function planner(page) { await nav(page, 'Planner').click(); }
async function planning(page, expandQueues = true) {
  await planner(page);
  await page.getByRole('button', { name: 'Veckoplanering', exact: true }).click();
  await week(page).waitFor();
  if (expandQueues) {
    const toggle = week(page).getByRole('button', { name: /^Planeringskö/ });
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  }
}
async function timed(page, date, start = '13:00', end = '14:00') {
  const form = dialog(page);
  await form.getByLabel(/^Planering/).selectOption('day');
  await form.getByLabel('Datum', { exact: true }).fill(date);
  await form.getByLabel('Ange tid', { exact: true }).check();
  await form.getByLabel('Från', { exact: true }).fill(start);
  await form.getByLabel('Till', { exact: false }).fill(end);
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, name), animations: 'disabled', fullPage: true });
}
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: String(error.stack) }); console.log(`FAIL ${name}: ${error.stack}`); }
  finally { for (const context of contexts) await context.close(); contexts.clear(); }
}
async function otherTabUpdate(context, update) {
  const other = await context.newPage();
  await other.goto(base);
  await other.locator('.loading-notice').waitFor({ state: 'detached' });
  await other.evaluate(({ key, source }) => {
    const value = JSON.parse(localStorage.getItem(key));
    const mutate = new Function('workspace', source);
    mutate(value.workspace);
    localStorage.setItem(key, JSON.stringify(value));
  }, { key, source: update });
  await other.close();
}
(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    await check('PC: persistent navigation, seven local dates and honest workload under search and priority filters', async () => {
      const { page, errors } = await open(browser);
      await page.locator('.app-shell.is-desktop').waitFor();
      await planning(page, false);
      assert.ok(await week(page).locator('.wp-days').evaluate(node => node.getBoundingClientRect().top < innerHeight - 100), 'The default folded queues leave the calendar visible in the initial PC viewport.');
      assert.deepEqual(await week(page).locator('[data-plan-date]').evaluateAll(nodes => nodes.map(node => node.dataset.planDate)), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
      const monday = week(page).locator('[data-plan-date="2026-10-26"]');
      assert.equal(await monday.locator('[data-booked-minutes]').getAttribute('data-booked-minutes'), '180');
      assert.equal(await monday.locator('[data-overlap-pairs]').getAttribute('data-overlap-pairs'), '1');
      assert.match(await monday.textContent(), /överlapp/i);
      assert.equal(await week(page).getByRole('button', { name: 'Öppna Redan klar', exact: true }).count(), 0);
      assert.equal(await week(page).getByRole('button', { name: 'Öppna Förra veckan', exact: true }).count(), 0);
      assert.equal(await week(page).getByRole('button', { name: 'Öppna Nästa söndag', exact: true }).count(), 0);
      const rail = await page.locator('.bottom-nav').boundingBox();
      assert.ok(rail.x < 230 && rail.height > rail.width, 'PC navigation is a vertical left rail.');
      await shot(page, 'desktop-1440-unfiltered.png');
      await page.getByRole('searchbox', { name: 'Sök uppgifter', exact: true }).fill('Morgonmöte');
      assert.equal(await week(page).getByRole('button', { name: 'Öppna Kundmöte', exact: true }).count(), 0);
      assert.equal(await monday.locator('[data-booked-minutes]').getAttribute('data-booked-minutes'), '180');
      assert.equal(await monday.locator('[data-overlap-pairs]').getAttribute('data-overlap-pairs'), '1');
      await page.getByRole('searchbox', { name: 'Sök uppgifter', exact: true }).fill('');
      await page.getByRole('button', { name: 'Hög prioritet', exact: true }).click();
      assert.equal(await monday.locator('[data-booked-minutes]').getAttribute('data-booked-minutes'), '180');
      await noOverflow(page);
      assert.deepEqual(errors, []);
      await shot(page, 'desktop-filtered.png');
    });

    await check('Existing unscheduled task can be planned, rescheduled and unplanned without changing its deadline or content', async () => {
      const { page } = await open(browser);
      await planning(page);
      const before = (await cache(page)).tasks.find(t => t.id === 'free');
      await week(page).getByRole('button', { name: 'Planera Skriv arbetsplan', exact: true }).click();
      await timed(page, '2026-10-27', '13:00', '14:30');
      await save(page).click();
      await dialog(page).waitFor({ state: 'detached' });
      let saved = (await cache(page)).tasks.find(t => t.id === 'free');
      assert.deepEqual(saved, { ...before, schedule: { date: '2026-10-27', scope: 'day', startTime: '13:00', endTime: '14:30' } });
      await week(page).getByRole('button', { name: 'Planera Skriv arbetsplan', exact: true }).click();
      assert.equal(await dialog(page).getByLabel('Datum', { exact: true }).inputValue(), '2026-10-27');
      assert.equal(await dialog(page).getByLabel('Från', { exact: true }).inputValue(), '13:00');
      await dialog(page).getByLabel('Datum', { exact: true }).fill('2026-10-28');
      await save(page).click();
      await dialog(page).waitFor({ state: 'detached' });
      await page.reload(); await planning(page);
      saved = (await cache(page)).tasks.find(t => t.id === 'free');
      assert.equal(saved.schedule.date, '2026-10-28');
      assert.equal(saved.deadline, before.deadline);
      await week(page).getByRole('button', { name: 'Planera Skriv arbetsplan', exact: true }).click();
      await dialog(page).getByRole('button', { name: 'Ta bort planering', exact: true }).click();
      await dialog(page).waitFor({ state: 'detached' });
      saved = (await cache(page)).tasks.find(t => t.id === 'free');
      assert.equal(saved.schedule, null);
      assert.equal(saved.deadline, before.deadline);
      assert.equal(saved.comments[0].text, before.comments[0].text);
    });

    await check('Create a new day task, reject reversed times, normalize week-only dates and browse Sunday across month boundaries', async () => {
      const { page } = await open(browser);
      await planning(page);
      await week(page).getByRole('button', { name: 'Planera 2026-10-28', exact: true }).click();
      await dialog(page).getByLabel('Titel', { exact: true }).fill('Fördjupad planering');
      await timed(page, '2026-10-28', '15:00', '14:00');
      await save(page).click();
      assert.equal((await cache(page)).tasks.some(t => t.title === 'Fördjupad planering'), false);
      assert.equal(await dialog(page).count(), 1);
      await dialog(page).getByLabel('Till', { exact: false }).fill('16:00');
      await save(page).click();
      await dialog(page).waitFor({ state: 'detached' });
      assert.equal((await cache(page)).tasks.find(t => t.title === 'Fördjupad planering').schedule.startTime, '15:00');
      await week(page).getByRole('button', { name: 'Planera Skriv arbetsplan', exact: true }).click();
      await dialog(page).getByLabel('Datum', { exact: true }).fill('');
      await dialog(page).getByLabel(/^Planering/).selectOption('week');
      assert.equal(await dialog(page).count(), 1, 'An empty date followed by week scope does not crash the form.');
      await dialog(page).getByLabel('Veckans måndag', { exact: true }).fill('2026-11-01');
      await save(page).click();
      await dialog(page).waitFor({ state: 'detached' });
      assert.deepEqual((await cache(page)).tasks.find(t => t.id === 'free').schedule, { date: today, scope: 'week' });
      assert.equal(await week(page).getByRole('button', { name: 'Öppna Avsluta månaden', exact: true }).count(), 1);
      assert.match(await week(page).textContent(), /24:00/);
      await week(page).getByRole('button', { name: 'Nästa vecka', exact: true }).click();
      await week(page).getByRole('button', { name: 'Öppna Nästa söndag', exact: true }).waitFor();
      await week(page).getByRole('button', { name: 'Idag', exact: true }).click();
      await week(page).getByRole('button', { name: 'Öppna Söndagspromenad', exact: true }).waitFor();
    });

    await check('Dirty scheduling survives PC-to-compact resize and Escape offers to keep editing', async () => {
      const { page } = await open(browser);
      await planning(page);
      await week(page).getByRole('button', { name: 'Planera 2026-10-28', exact: true }).click();
      await dialog(page).getByLabel('Titel', { exact: true }).fill('Behåll min plan');
      await page.setViewportSize({ width: 900, height: 800 });
      assert.equal(await dialog(page).getByLabel('Titel', { exact: true }).inputValue(), 'Behåll min plan');
      await page.keyboard.press('Escape');
      await dialog(page).getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
      assert.equal(await dialog(page).getByLabel('Titel', { exact: true }).inputValue(), 'Behåll min plan');
      await save(page).focus(); await page.keyboard.press('Enter');
      await dialog(page).waitFor({ state: 'detached' });
      assert.equal((await cache(page)).tasks.find(t => t.title === 'Behåll min plan').schedule.date, '2026-10-28');
      await noOverflow(page);
    });

    await check('Another tab can edit task content while scheduling; a removed or completed task cannot be scheduled', async () => {
      const { context, page } = await open(browser);
      await planning(page);
      await week(page).getByRole('button', { name: 'Planera Skriv arbetsplan', exact: true }).click();
      await timed(page, '2026-10-28');
      await otherTabUpdate(context, "workspace.tasks.find(t => t.id === 'free').description = 'Nyaste texten från andra fliken';");
      await save(page).click();
      await dialog(page).waitFor({ state: 'detached' });
      assert.equal((await cache(page)).tasks.find(t => t.id === 'free').description, 'Nyaste texten från andra fliken');
      await week(page).getByRole('button', { name: 'Planera Skriv arbetsplan', exact: true }).click();
      await dialog(page).getByLabel('Datum', { exact: true }).fill('2026-10-29');
      await otherTabUpdate(context, "workspace.tasks.find(t => t.id === 'free').columnId = 'done';");
      await save(page).click();
      assert.equal(await dialog(page).count(), 1);
      assert.equal((await cache(page)).tasks.find(t => t.id === 'free').schedule.date, '2026-10-28');
      await page.keyboard.press('Escape');
      const discard = dialog(page).getByRole('button', { name: 'Kasta ändringar', exact: true });
      if (await discard.count()) await discard.click();
      await week(page).getByRole('button', { name: 'Planera Morgonmöte', exact: true }).click();
      await otherTabUpdate(context, "workspace.tasks = workspace.tasks.filter(t => t.id !== 'morning');");
      await save(page).click();
      assert.equal(await dialog(page).count(), 1);
      assert.equal((await cache(page)).tasks.some(t => t.id === 'morning'), false);
    });

    await check('PC widths and themes keep navigable views, an empty planning state and no page overflow', async () => {
      for (const [width, theme] of [[1100, 'light'], [1280, 'dark'], [1920, 'bento']]) {
        const { page, errors } = await open(browser, { viewport: { width, height: 900 }, theme, empty: width === 1100 });
        await page.locator('.app-shell.is-desktop').waitFor();
        await planning(page, false);
        assert.equal(await week(page).locator('[data-plan-date]').count(), 7);
        await noOverflow(page);
        await shot(page, `${width}-${theme}.png`);
        await page.getByRole('button', { name: 'Tavla', exact: true }).click();
        await page.locator('.board').waitFor();
        await nav(page, 'Projects').click(); await noOverflow(page);
        await nav(page, 'Others').click(); await noOverflow(page);
        assert.deepEqual(errors, []);
      }
    });

    await check('Coarse wide tablets, tablet portrait and phone landscape remain distinct from PC; explicit docked Home wins', async () => {
      for (const viewport of [{ width: 1366, height: 1024 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
        const { page, errors } = await open(browser, { viewport, touch: true, theme: 'bento' });
        assert.equal(await page.locator('.app-shell.is-desktop').count(), 0);
        assert.equal(await page.getByTestId('home-screen').count(), viewport.height >= 600 ? 1 : 0);
        await planner(page);
        assert.equal(await page.getByRole('button', { name: 'Veckoplanering', exact: true }).count(), 0);
        const bar = await page.locator('.bottom-nav').boundingBox();
        assert.ok(bar.width > bar.height && bar.y > viewport.height / 2, 'Touch navigation stays at the bottom.');
        await nav(page, 'Schema').click(); await page.locator('.day-schedule').waitFor(); await noOverflow(page);
        assert.deepEqual(errors, []);
      }
      const narrow = await open(browser, { viewport: { width: 1099, height: 800 } });
      assert.equal(await narrow.page.locator('.app-shell.is-desktop').count(), 0);
      const kiosk = await open(browser, { mode: 'on' });
      await kiosk.page.getByTestId('home-screen').waitFor();
      assert.equal(await kiosk.page.locator('.app-shell.is-desktop').count(), 0);
    });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(`${results.filter(r => r.passed).length}/${results.length} PC acceptance scenarios passed (${engine}).`);
  process.exitCode = results.every(r => r.passed) ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
