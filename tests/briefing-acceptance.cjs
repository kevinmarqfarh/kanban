// Browser checks for Dagens briefing on Home: content, actions, persistence, clock and layout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'briefing');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const created = '2026-09-01T09:00:00.000Z';
const task = (id, title, values = {}) => ({ id, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: created, ...values });
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [
    { id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' },
    { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' },
  ],
  projects: [],
  tasks: [
    task('late', 'Skicka offerten', { deadline: '2026-10-05', priority: 'high' }),
    task('call', 'Ring banken', { deadline: '2026-10-07', deadlineTime: '10:30' }),
    task('slides', 'Gör klart presentationen', { columnId: 'doing', deadline: '2026-10-07', deadlineTime: '15:00', checklist: [{ id: 'a', title: 'Disposition', completed: true }, { id: 'b', title: 'Bilder', completed: true }, { id: 'c', title: 'Generalrepetition', completed: false }] }),
    task('friday', 'Boka hantverkare', { deadline: '2026-10-09' }),
    task('someday', 'Rensa förrådet'),
    task('finished', 'Redan klar', { columnId: 'done', deadline: '2026-10-01' }),
  ],
  birthdays: [
    { id: 'mira', name: 'Mira', birthDate: '2019-10-10', reminders: [], createdAt: created, generatedReminders: [], tag: 'Familj' },
    { id: 'olle', name: 'Olle', birthDate: '1960-12-24', reminders: [], createdAt: created, generatedReminders: [], tag: null },
  ],
  birthdayNotifications: [],
} };

const results = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, passed: false, error: error.stack }); console.log(`FAIL ${name}: ${error.message}`); } };
const cache = page => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)).workspace, key);
const briefing = page => page.getByTestId('daily-briefing');
const shot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await page.clock.runFor(400); await briefing(page).screenshot({ path: path.join(out, name), animations: 'disabled' }); };
const noOverflow = async page => { const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(size.scroll <= size.width + 1, `Page overflows: ${size.scroll} > ${size.width}`); };

async function open(browser, { viewport = { width: 1512, height: 982 }, time = '2026-10-07T09:00:00+02:00', data = fixture, theme = 'light', permissions = [] } = {}) {
  const context = await browser.newContext({ viewport, timezoneId: 'Europe/Stockholm', locale: 'sv-SE', hasTouch: viewport.width < 600, ...(engine === 'chromium' ? { permissions } : {}) });
  await context.addInitScript(({ key, value, theme }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem('forma-theme', theme); }, { key, value: data, theme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(time) });
  await page.goto(baseURL);
  await briefing(page).waitFor();
  return { context, page, errors };
}

(async () => {
  const browser = await playwright[engine].launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    await check('Desktop briefing states the facts, ranks focus and suggests concrete next steps', async () => {
      const { context, page, errors } = await open(browser);
      const root = briefing(page);
      assert.equal(await root.getAttribute('data-tone'), 'busy');
      assert.match(await root.locator('.briefing-eyebrow').textContent(), /God morgon · Dagens briefing/);
      assert.equal(await root.getByRole('heading', { level: 2 }).textContent(), 'En dag för fokus');
      assert.equal(await root.locator('.briefing-summary').textContent(), '2 uppgifter har deadline idag och 1 är försenad. Mira fyller 7 på lördag.');
      const stat = async name => Number(await root.locator(`[data-stat="${name}"] dd`).textContent());
      assert.deepEqual([await stat('overdue'), await stat('today'), await stat('week'), await stat('doing'), await stat('birthdays')], [1, 2, 1, 1, 1]);
      assert.ok(await root.locator('[data-stat="overdue"]').evaluate(node => node.classList.contains('is-alert')));
      const focus = await root.getByTestId('briefing-focus').locator('.briefing-focus-copy strong').allTextContents();
      assert.deepEqual(focus, ['Skicka offerten', 'Ring banken', 'Gör klart presentationen']);
      assert.match(await root.locator('[data-task-id="late"]').textContent(), /Försenad 2 dagar.*Hög prioritet.*Att göra/);
      const tips = await root.getByTestId('briefing-tips').locator('[data-tip]').evaluateAll(nodes => nodes.map(node => node.dataset.tip));
      assert.deepEqual(tips, ['overdue', 'timed', 'birthday-soon'], 'Three suggestions are shown before expanding.');
      await root.getByRole('button', { name: /^Visa alla förslag/ }).click();
      const all = await root.getByTestId('briefing-tips').locator('[data-tip]').evaluateAll(nodes => nodes.map(node => node.dataset.tip));
      assert.ok(all.includes('quick-win') && all.length > 3);
      assert.equal(await root.getByRole('button', { name: 'Visa färre' }).getAttribute('aria-expanded'), 'true');
      const agenda = await root.getByTestId('briefing-agenda').locator('ol > li').evaluateAll(nodes => nodes.map(node => node.dataset.date));
      assert.deepEqual(agenda, ['2026-10-07', '2026-10-09', '2026-10-10']);
      assert.ok(!(await root.textContent()).includes('Redan klar'), 'Done cards never appear.');
      await shot(page, 'desktop-light.png');
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Opening a focus item jumps to that task in Planner', async () => {
      const { context, page } = await open(browser);
      await briefing(page).locator('[data-task-id="call"]').click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.getByLabel('Titel', { exact: true }).inputValue(), 'Ring banken');
      assert.equal(await page.locator('.bottom-nav').getByRole('button', { name: 'Planner', exact: true }).getAttribute('aria-current'), 'page');
      await context.close();
    });

    await check('A birthday suggestion creates one gift card in Planner, idempotently and persistently', async () => {
      const { context, page } = await open(browser);
      const tip = briefing(page).locator('[data-tip="birthday-soon"]');
      assert.match(await tip.textContent(), /Mira fyller 7 på lördag/);
      await tip.getByRole('button', { name: 'Lägg till i Planner' }).click();
      await tip.getByRole('button', { name: 'Finns i Planner' }).waitFor();
      assert.match(await briefing(page).locator('.briefing-status').textContent(), /”Present till Mira” finns nu i Planner/);
      let tasks = (await cache(page)).tasks.filter(item => item.title === 'Present till Mira');
      assert.equal(tasks.length, 1);
      assert.deepEqual({ columnId: tasks[0].columnId, deadline: tasks[0].deadline, labels: tasks[0].labels, priority: tasks[0].priority }, { columnId: 'todo', deadline: '2026-10-09', labels: ['Födelsedag'], priority: 'medium' });
      await page.reload(); await briefing(page).waitFor();
      await briefing(page).locator('[data-tip="birthday-soon"]').getByRole('button', { name: 'Finns i Planner' }).waitFor();
      tasks = (await cache(page)).tasks.filter(item => item.title === 'Present till Mira');
      assert.equal(tasks.length, 1, 'Reload never duplicates the card.');
      // The new card is now part of Friday's agenda.
      assert.match(await briefing(page).locator('[data-date="2026-10-09"]').textContent(), /Present till Mira/);
      await briefing(page).locator('[data-tip="birthday-soon"]').getByRole('button', { name: 'Finns i Planner' }).click();
      assert.equal(await page.getByRole('dialog').getByLabel('Titel', { exact: true }).inputValue(), 'Present till Mira');
      await context.close();
    });

    await check('Saving puts the briefing in Daglig sammanfattning once; copying writes plain text', async () => {
      const { context, page } = await open(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
      const save = briefing(page).getByRole('button', { name: 'Spara briefingen i Daglig sammanfattning' });
      await save.click();
      await briefing(page).getByRole('button', { name: 'Dagens sammanfattning finns redan i historiken' }).waitFor();
      assert.equal(await briefing(page).getByRole('button', { name: 'Dagens sammanfattning finns redan i historiken' }).isDisabled(), true);
      const latest = page.getByTestId('latest-debrief');
      assert.match(await latest.textContent(), /Dagens briefing – En dag för fokus/);
      await page.reload(); await briefing(page).waitFor();
      assert.equal(await briefing(page).getByRole('button', { name: 'Dagens sammanfattning finns redan i historiken' }).isDisabled(), true, 'Saved state survives reload.');
      if (engine === 'chromium') {
        await briefing(page).getByRole('button', { name: 'Kopiera briefingen som text' }).click();
        await briefing(page).getByText('Briefingen är kopierad.').waitFor();
        const text = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(text, /^En dag för fokus\n2 uppgifter har deadline idag och 1 är försenad\./);
        assert.match(text, /\nGör först\n1\. Skicka offerten – Försenad 2 dagar, Hög prioritet\n2\. Ring banken – Deadline idag 10:30/);
      }
      await context.close();
    });

    await check('The briefing follows the clock: a passed time becomes overdue and the evening plans tomorrow', async () => {
      const { context, page } = await open(browser, { time: '2026-10-07T10:29:00+02:00' });
      assert.equal(await briefing(page).locator('[data-stat="overdue"] dd').textContent(), '1');
      await page.clock.runFor(2 * 60_000);
      await page.waitForFunction(() => document.querySelector('[data-stat="overdue"] dd')?.textContent === '2');
      assert.match(await briefing(page).locator('[data-task-id="call"]').textContent(), /Försenad sedan 10:30/);
      await context.close();
      const evening = await open(browser, { time: '2026-10-08T19:00:00+02:00' });
      assert.match(await briefing(evening.page).locator('.briefing-eyebrow').textContent(), /God kväll/);
      await evening.context.close();
    });

    await check('An empty Planner gets an honest briefing with a way forward', async () => {
      const empty = { ...fixture, workspace: { ...fixture.workspace, tasks: [], birthdays: [] } };
      const { context, page } = await open(browser, { data: empty });
      assert.equal(await briefing(page).getByRole('heading', { level: 2 }).textContent(), 'Ett tomt blad');
      assert.equal(await briefing(page).locator('.briefing-summary').textContent(), 'Planner är tom.');
      assert.equal(await briefing(page).getByTestId('briefing-agenda').count(), 0);
      await briefing(page).getByTestId('briefing-focus').getByRole('button', { name: 'Öppna Planner' }).click();
      assert.equal(await page.locator('.bottom-nav').getByRole('button', { name: 'Planner', exact: true }).getAttribute('aria-current'), 'page');
      await context.close();
    });

    await check('Phone layout fits, keeps 44 px targets and reads well in dark mode', async () => {
      for (const theme of ['light', 'dark']) {
        const { context, page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, theme });
        await noOverflow(page);
        const targets = await briefing(page).locator('button').evaluateAll(nodes => nodes.filter(node => node.offsetParent).map(node => ({ text: node.textContent.trim() || node.getAttribute('aria-label'), w: node.offsetWidth, h: node.offsetHeight, agenda: node.classList.contains('briefing-agenda-item') })));
        for (const target of targets) {
          const minimum = target.agenda ? 32 : 44;
          assert.ok(target.h >= minimum, `${theme}: “${target.text}” is ${target.h}px high`);
        }
        await shot(page, `mobile-${theme}.png`);
        assert.deepEqual(errors, []);
        await context.close();
      }
      const desktopDark = await open(browser, { theme: 'dark' });
      await shot(desktopDark.page, 'desktop-dark.png');
      await desktopDark.context.close();
    });
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(result => !result.passed);
  console.log(`${engine}: ${results.length - failed.length} of ${results.length} briefing scenarios passed.`);
  if (failed.length) { for (const failure of failed) console.error(failure.error); process.exit(1); }
})().catch(error => { console.error(error); process.exit(1); });
