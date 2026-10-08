// Hemskärm on a docked iPad mini 4 (A1538): 1024×768 landscape and 768×1024 portrait.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'homescreen');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const created = '2026-09-01T09:00:00.000Z';
const task = (id, title, v = {}) => ({ id, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: created, ...v });
const habit = (id, title, amount, unit) => ({ id, title, amount, unit, createdAt: created });
const done = (habitId, date) => ({ id: `nutrition:${habitId}:${date}`, habitId, date, completed: true });
const workspace = {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
  projects: [],
  tasks: [
    task('late', 'Betala förskoleavgiften', { deadline: '2026-10-06', priority: 'high' }),
    task('call', 'Ring vårdcentralen', { deadline: '2026-10-08', deadlineTime: '10:30' }),
    task('pack', 'Packa gympapåsar', { columnId: 'doing', deadline: '2026-10-08', deadlineTime: '19:00' }),
    task('shop', 'Handla till helgen', { deadline: '2026-10-10' }),
    task('car', 'Boka vinterdäcksbyte', { deadline: '2026-10-13' }),
  ],
  nutritionHabits: [habit('d', 'D-vitamin', '1', 'st'), habit('o', 'Omega-3', '2', 'st'), habit('m', 'Magnesium', '1', 'st'), habit('j', 'Järn', '1', 'st'), habit('w', 'Vatten', '2', 'l'), habit('p', 'Protein', '1', 'portion')],
  nutritionCompletions: [done('d', '2026-10-08'), done('o', '2026-10-08')],
  birthdays: [{ id: 'mira', name: 'Mira', birthDate: '2019-10-11', reminders: ['week'], createdAt: created, generatedReminders: [], tag: 'Familj' }],
  birthdayNotifications: [{ id: 'birthday-notification:mira:2026-10-11:week', birthdayId: 'mira', date: '2026-10-11', reminder: 'week', name: 'Mira', age: 7, createdAt: '2026-10-04T08:00:00.000Z', readAt: null, dismissedAt: null }],
};
const fixture = { version: 1, revision: null, dirty: false, workspace };
const LANDSCAPE = { width: 1024, height: 768 }, PORTRAIT = { width: 768, height: 1024 };

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.stack}`); } };
const cache = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).workspace, key);
const screen = page => page.getByTestId('home-screen');
const nav = (page, name) => page.locator('.bottom-nav').getByRole('button', { name, exact: true });

async function open(browser, { viewport = LANDSCAPE, touch = true, mode = null, theme = 'light', time = '2026-10-08T07:42:00+02:00', setup } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch && engine === 'chromium' ? false : undefined, deviceScaleFactor: 2, timezoneId: 'Europe/Stockholm', locale: 'sv-SE', serviceWorkers: 'block' });
  await context.addInitScript(({ key, value, theme, mode }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('forma-theme', theme);
    if (mode && !sessionStorage.getItem('mode-set')) { localStorage.setItem('forma-homescreen', mode); sessionStorage.setItem('mode-set', '1'); }
  }, { key, value: fixture, theme, mode });
  if (setup) await setup(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(time) });
  await page.goto(base);
  return { context, page, errors };
}

const fitsScreen = page => page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: innerHeight, width: document.documentElement.scrollWidth, innerWidth }));
const inViewport = locator => locator.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5; }));
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.clock.runFor(300); await page.screenshot({ path: path.join(out, name), animations: 'disabled' }); };

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const [label, viewport] of [['landscape', LANDSCAPE], ['portrait', PORTRAIT]]) {
      await check(`${label}: the whole day fits on one screen with no page scroll`, async () => {
        const { context, page, errors } = await open(browser, { viewport });
        await screen(page).waitFor();
        const size = await fitsScreen(page);
        assert.ok(size.scroll <= size.inner + 1, `Page scrolls: ${size.scroll} > ${size.inner}`);
        assert.ok(size.width <= size.innerWidth + 1, `Page overflows sideways: ${size.width}`);
        assert.equal(await page.locator('.page-heading').count(), 0, 'The big Home heading gives its room to the dashboard.');
        assert.equal(await screen(page).locator('.hs-clock').textContent(), '07:42');
        assert.match(await screen(page).locator('.hs-date').textContent(), /Torsdag 8 oktober.*Vecka 41/);
        assert.equal(await screen(page).locator('#hs-headline').textContent(), 'En dag för fokus');
        // Everything you act on is fully visible without scrolling.
        for (const [name, locator] of [['habits', screen(page).locator('.hs-habit')], ['focus', screen(page).locator('.hs-focus-row')], ['quick add', screen(page).locator('.hs-quick')], ['notice', screen(page).locator('.hs-notice')], ['nav', page.locator('.bottom-nav')]]) {
          const visible = await inViewport(locator);
          assert.ok(visible.length > 0 && visible.every(Boolean), `${label}: ${name} must be fully visible (${visible})`);
        }
        assert.equal(await screen(page).locator('.hs-habit').count(), 6);
        const targets = await screen(page).locator('button, input').evaluateAll(nodes => nodes.filter(node => node.offsetParent).map(node => ({ name: node.getAttribute('aria-label') || node.textContent.trim(), h: node.offsetHeight, agenda: node.classList.contains('hs-agenda-item') })));
        for (const target of targets) assert.ok(target.h >= (target.agenda ? 40 : 44), `${label}: “${target.name}” is ${target.h}px high`);
        await shot(page, `${label}.png`);
        assert.deepEqual(errors, []);
        await context.close();
      });
    }

    await check('Ticking off a supplement is one tap, persists, and updates the count and week', async () => {
      const { context, page } = await open(browser);
      const magnesium = screen(page).locator('[data-habit-id="m"]');
      assert.equal(await magnesium.getAttribute('aria-pressed'), 'false');
      await magnesium.click();
      assert.equal(await magnesium.getAttribute('aria-pressed'), 'true');
      assert.equal(await screen(page).locator('.hs-count').textContent(), '3/6');
      assert.ok((await cache(page)).nutritionCompletions.some(entry => entry.habitId === 'm' && entry.date === '2026-10-08' && entry.completed));
      await page.reload(); await screen(page).waitFor();
      assert.equal(await screen(page).locator('[data-habit-id="m"]').getAttribute('aria-pressed'), 'true');
      for (const id of ['j', 'w', 'p']) await screen(page).locator(`[data-habit-id="${id}"]`).click();
      assert.equal(await screen(page).locator('.hs-count').textContent(), '6/6');
      assert.ok(await screen(page).locator('.hs-count').evaluate(node => node.classList.contains('is-complete')));
      assert.match(await screen(page).locator('.hs-week-day[data-date="2026-10-08"]').getAttribute('class'), /status-complete/);
      await screen(page).locator('[data-habit-id="p"]').click();
      assert.equal(await screen(page).locator('.hs-count').textContent(), '5/6', 'A second tap undoes it.');
      await context.close();
    });

    await check('Quick add puts a task in Planner, due today by default or without a date', async () => {
      const { context, page } = await open(browser);
      const input = screen(page).getByLabel('Ny uppgift', { exact: true });
      await input.fill('Köp mjölk');
      await input.press('Enter');
      await page.waitForFunction(() => document.querySelector('.hs-added')?.textContent.includes('ligger i Planner'));
      assert.equal(await screen(page).locator('.hs-added').textContent(), '”Köp mjölk” ligger i Planner med deadline idag.');
      assert.equal(await input.inputValue(), '');
      let saved = (await cache(page)).tasks.find(item => item.title === 'Köp mjölk');
      assert.deepEqual({ columnId: saved.columnId, deadline: saved.deadline }, { columnId: 'todo', deadline: '2026-10-08' });
      assert.match(await screen(page).locator('.hs-agenda > li[data-date="2026-10-08"]').textContent(), /Köp mjölk/, 'It shows up under today at once.');
      await screen(page).getByRole('button', { name: 'Idag', exact: true }).click();
      assert.equal(await screen(page).getByRole('button', { name: 'Idag', exact: true }).getAttribute('aria-pressed'), 'false');
      await input.fill('Laga cykeln');
      await screen(page).getByRole('button', { name: 'Lägg till i Planner' }).click();
      saved = (await cache(page)).tasks.find(item => item.title === 'Laga cykeln');
      assert.equal(saved.deadline, null);
      const count = (await cache(page)).tasks.length;
      await screen(page).getByRole('button', { name: 'Lägg till i Planner' }).click();
      assert.equal((await cache(page)).tasks.length, count, 'An empty field adds nothing.');
      await context.close();
    });

    await check('Tapping a focus item opens it in Planner; the footer brings you back', async () => {
      const { context, page } = await open(browser);
      await screen(page).locator('[data-task-id="call"]').click();
      assert.equal(await page.getByRole('dialog').getByLabel('Titel', { exact: true }).inputValue(), 'Ring vårdcentralen');
      await page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).first().click();
      assert.equal(await nav(page, 'Planner').getAttribute('aria-current'), 'page');
      assert.ok(await page.locator('.page-heading').count() === 1, 'Other pages keep their heading.');
      await nav(page, 'Home').click();
      await screen(page).waitFor();
      await context.close();
    });

    await check('Birthday reminder can be acknowledged from the screen', async () => {
      const { context, page } = await open(browser);
      await screen(page).getByRole('button', { name: 'Markera påminnelse för Mira som läst' }).click();
      assert.equal(await screen(page).locator('.hs-notice').count(), 0);
      assert.ok((await cache(page)).birthdayNotifications[0].readAt);
      await context.close();
    });

    await check('After three untouched minutes the screen returns to Home, but never closes an open form', async () => {
      const { context, page } = await open(browser);
      await nav(page, 'Planner').click();
      await page.clock.runFor(2 * 60_000);
      assert.equal(await nav(page, 'Planner').getAttribute('aria-current'), 'page');
      await page.clock.runFor(70_000);
      await screen(page).waitFor();
      assert.equal(await nav(page, 'Home').getAttribute('aria-current'), 'page');
      // An open task editor must survive any idle time.
      await screen(page).locator('[data-task-id="late"]').click();
      await page.getByRole('dialog').getByLabel('Titel', { exact: true }).fill('Betala förskoleavgiften i dag');
      await page.clock.runFor(10 * 60_000);
      assert.equal(await page.getByRole('dialog').getByLabel('Titel', { exact: true }).inputValue(), 'Betala förskoleavgiften i dag');
      await context.close();
    });

    await check('Settings: Auto follows the device, Av and På stick per device', async () => {
      const desktop = await open(browser, { viewport: { width: 1512, height: 982 }, touch: false });
      assert.equal(await screen(desktop.page).count(), 0, 'A laptop keeps the regular Home.');
      await desktop.page.getByTestId('daily-briefing').waitFor();
      await desktop.page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
      const group = desktop.page.getByRole('group', { name: 'Hemskärm' });
      assert.equal(await group.getByRole('button', { name: 'Auto (av)' }).getAttribute('aria-pressed'), 'true');
      await group.getByRole('button', { name: 'På', exact: true }).click();
      await desktop.page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).last().click();
      await screen(desktop.page).waitFor();
      await desktop.page.reload(); await screen(desktop.page).waitFor();
      await desktop.context.close();

      const ipad = await open(browser, { mode: 'off' });
      await ipad.page.getByTestId('daily-briefing').waitFor();
      assert.equal(await screen(ipad.page).count(), 0, 'Av turns it off on the iPad too.');
      await ipad.page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
      await ipad.page.getByRole('group', { name: 'Hemskärm' }).getByRole('button', { name: 'Auto (på)' }).click();
      await ipad.page.getByRole('dialog').getByRole('button', { name: 'Stäng', exact: true }).last().click();
      await screen(ipad.page).waitFor();
      await ipad.context.close();
    });

    await check('A signed-in docked screen pulls changes from other devices every minute', async () => {
      const ref = 'rucwlpzrumxejvhwazat', owner = 'c57e8db1-84da-4c59-b8ab-49a642136105';
      let remote = { data: structuredClone(workspace), revision: 1 };
      let reads = 0;
      const { context, page } = await open(browser, { setup: async context => {
        await context.addInitScript(({ ref, owner, workspace }) => {
          const ownerKey = `forma:workspace:v1:${owner}`;
          if (localStorage.getItem(ownerKey)) return;
          const expiry = Math.floor(Date.now() / 1000) + 24 * 3600;
          const jwt = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: owner, exp: expiry, role: 'authenticated' })) + '.test';
          localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_at: expiry, expires_in: 86400, user: { id: owner, email: 'kitchen@example.invalid' } }));
          localStorage.setItem(ownerKey, JSON.stringify({ version: 1, workspace, revision: 1, dirty: false }));
        }, { ref, owner, workspace });
        await context.route(`https://${ref}.supabase.co/**`, route => {
          const request = route.request(), url = new URL(request.url());
          const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
          if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
          if (url.pathname.includes('kanban_workspaces')) {
            if (request.method() === 'GET') { reads++; return route.fulfill({ headers: cors, json: remote }); }
            // Like PostgREST: the conditional update only matches the expected revision.
            if (url.searchParams.get('revision') !== `eq.${remote.revision}`) return route.fulfill({ headers: cors, json: [] });
            remote = { data: request.postDataJSON().data, revision: remote.revision + 1 };
            return route.fulfill({ headers: cors, json: [{ revision: remote.revision }] });
          }
          if (url.pathname.includes('daily_debriefs')) return route.fulfill({ headers: cors, json: [] });
          return route.fulfill({ headers: cors, json: {} });
        });
      } });
      await screen(page).waitFor();
      await page.locator('[data-sync-status="synced"]').waitFor({ state: 'attached' });
      // Let the iPad finish its own first save before the phone changes anything.
      await page.waitForFunction(owner => JSON.parse(localStorage.getItem(`forma:workspace:v1:${owner}`)).dirty === false, owner);
      await page.locator('[data-sync-status="synced"]').waitFor({ state: 'attached' });
      const before = reads;
      // The phone ticks off Magnesium.
      remote = { data: { ...remote.data, nutritionCompletions: [...remote.data.nutritionCompletions, done('m', '2026-10-08')] }, revision: remote.revision + 1 };
      await page.clock.runFor(61_000);
      await page.waitForFunction(() => document.querySelector('[data-habit-id="m"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 10_000 });
      assert.ok(reads > before, 'A pull happened without any interaction.');
      assert.match(await screen(page).locator('.hs-sync').textContent(), /Synkad/);
      assert.ok(remote.data.nutritionCompletions.some(entry => entry.habitId === 'm'), 'The phone’s tick is never overwritten by the iPad.');
      await context.close();
    });

    await check('Dark mode and an old-Safari rendering (no color-mix, no blur) stay legible', async () => {
      const dark = await open(browser, { theme: 'dark' });
      await screen(dark.page).waitFor();
      await shot(dark.page, 'landscape-dark.png');
      await dark.context.close();
      // Apply the compat rules unconditionally, the way Safari 15 would, and check nothing breaks.
      const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'compat.css'), 'utf8');
      const inner = css.slice(css.indexOf('{', css.indexOf('@supports not (color: color-mix')) + 1, css.indexOf('\n}\n', css.indexOf('@supports not (color: color-mix')));
      const old = await open(browser, { viewport: PORTRAIT });
      await screen(old.page).waitFor();
      await old.page.addStyleTag({ content: inner });
      const blur = await old.page.locator('.bottom-nav').evaluate(node => getComputedStyle(node).webkitBackdropFilter || getComputedStyle(node).backdropFilter);
      assert.ok(!blur || blur === 'none', `Blur is off: ${blur}`);
      const size = await fitsScreen(old.page);
      assert.ok(size.scroll <= size.inner + 1);
      await shot(old.page, 'portrait-old-safari.png');
      await old.context.close();
    });
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} home-screen scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
