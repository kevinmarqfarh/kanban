// Independent Summary/debrief acceptance checks. Use the same environment
// variables as acceptance.cjs and birthday-acceptance.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseURL = process.env.APP_URL || 'http://127.0.0.1:5173';
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const out = path.join(__dirname, 'artifacts', engine, 'debriefs');
const results = [];
const errors = [];
const workspaceKey = 'forma:workspace:v1:guest';
const feedKey = 'forma:debriefs:v1:guest';
const fixedDate = '2026-10-05T12:00:00+02:00';
fs.mkdirSync(out, { recursive: true });

const workspaceFixture = {
  version: 1, revision: null, dirty: false,
  workspace: {
    columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'green' }],
    projects: [{ id: 'private-project', title: 'Mitt privata projekt', description: 'Ska förbli precis som det är', icon: 'home', color: 'sage', deadline: '2026-11-10', createdAt: '2026-10-01T09:00:00.000Z' }],
    tasks: [{ id: 'private-task', title: 'Min privata uppgift', description: 'En uppgift som ska bevaras', columnId: 'todo', labels: ['Privat', 'Test'], checklist: [{ id: 'subtask', title: 'Ett litet steg', completed: true }], deadline: '2026-10-18', comments: [{ id: 'private-comment', text: 'Kommentarer ska också finnas kvar', createdAt: '2026-10-02T12:30:00.000Z' }], projectId: 'private-project', createdAt: '2026-10-01T09:00:00.000Z' }],
    birthdays: [{ id: 'private-birthday', name: 'Min vän', birthDate: '1989-05-17', reminders: [], generatedReminders: [], createdAt: '2026-10-01T09:00:00.000Z' }],
  },
};
// Debrief actions must preserve the already-separated copies of legacy project work.
const expectedWorkspace = {
  ...workspaceFixture.workspace,
  tasks: workspaceFixture.workspace.tasks.map(task => ({ ...task, projectId: null })),
  // The app adds the Finalized column and an explicit (empty) birthday tag when it loads an older workspace.
  columns: [...workspaceFixture.workspace.columns, ...(workspaceFixture.workspace.columns.some(column => column.id === 'finalized') ? [] : [{ id: 'finalized', title: 'Finalized', color: 'green' }])],
  ...(workspaceFixture.workspace.birthdays ? { birthdays: workspaceFixture.workspace.birthdays.map(birthday => ({ ...birthday, tag: birthday.tag ?? null })) } : {}),
  projects: workspaceFixture.workspace.projects.map(project => ({ ...project, tasks: workspaceFixture.workspace.tasks.filter(task => task.projectId === project.id).map(({ columnId, projectId, ...task }) => ({ ...task, completed: columnId === 'done' })) })),
};
const latest = {
  date: '2026-10-05', title: 'En tydlig start på dagen',
  summary: 'Tre små steg för ett lugnare tempo.',
  body: 'Börja med den viktigaste uppgiften.\n\nGe projektet ett litet nästa steg och lämna plats för en paus.\n\nDagens fokus: gör en sak i taget.',
};
const yesterday = {
  date: '2026-10-04', title: 'Gårdagens nästa steg', summary: 'Det som är kvar får en ny plats.',
  body: 'En äldre debriefing som ska kunna läsas igen i historiken.',
};
const historic = {
  date: '2025-01-02', title: 'En gammal debriefing att behålla', summary: 'Historiken hör till mitt eget utrymme.',
  body: 'Den här gamla debriefingen ska finnas kvar över återladdningar och årsskiften.',
};
const check = async (name, fn) => {
  try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const workspace = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, workspaceKey);
const feed = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), feedKey);
const nav = async (page, label) => {
  const settings = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Inställningar', exact: true }) });
  if (label === 'Profile') {
    if (!await settings.count()) await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
    await settings.waitFor();
  } else {
    if (await settings.count()) await settings.getByRole('button', { name: 'Stäng', exact: true }).first().click();
    await page.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).click();
  }
};
const noOverflow = async page => {
  const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(sizes.scroll <= sizes.width + 1, `Unintended page overflow: ${sizes.scroll} > ${sizes.width}`);
};
const screenshot = async (page, filename) => {
  await page.evaluate(() => document.fonts.ready);
  await pause(250);
  await page.screenshot({ path: path.join(out, filename), fullPage: false, animations: 'disabled' });
};
const expectEntries = async (page, count) => {
  await page.waitForFunction(({ key, expected }) => {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value?.entries.length === expected;
  }, { key: feedKey, expected: count });
  assert.equal((await feed(page)).entries.length, count);
};
const importJson = async (page, value, name = 'debriefing.json') => {
  await page.getByLabel('Läs in debriefing', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="file"][aria-label="Läs in debriefing"]');
    return input && !input.disabled && input.value === '';
  });
};
const overview = page => page.getByTestId('summary-overview');
const reader = page => page.getByTestId('debrief-reader');
const hero = page => page.getByTestId('latest-debrief');
const historyRow = (page, date) => page.locator(`.summary-history-row[data-debrief-id="${date}"]`);
const summaryBadge = page => page.locator('.bottom-nav').getByRole('button', { name: 'Home', exact: true }).locator('.nav-unread');
const stateFor = async (page, date) => (await feed(page)).entries.find(entry => entry.date === date);
const backToOverview = async page => {
  await reader(page).getByRole('button', { name: 'Till översikten', exact: true }).click();
  await overview(page).waitFor();
};

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm' });
  await desktop.addInitScript(({ key, fixture }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture));
  }, { key: workspaceKey, fixture: workspaceFixture });
  const page = await desktop.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(fixedDate));
  await page.goto(baseURL);

  await overview(page).waitFor();

  await check('Home retains an honest empty debrief feed and exposes four exact footer destinations', async () => {
    assert.equal(await page.locator('.bottom-nav button').count(), 4);
    for (const label of ['Home', 'Planner', 'Projects', 'Others']) assert.equal(await page.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).count(), 1);
    assert.equal(await page.locator('.bottom-nav').getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current'), 'page');
    await hero(page).getByText('Din första sammanfattning visas här.', { exact: true }).waitFor();
    assert.equal(await hero(page).getAttribute('data-debrief-id'), null);
    assert.equal(await summaryBadge(page).count(), 0);
    assert.equal(await page.locator('.debrief-bell-dot').count(), 0);
    assert.deepEqual((await feed(page)).entries, []);
    await nav(page, 'Planner');
    assert.equal(await page.locator('.debrief-notice').count(), 0);
    await page.getByRole('button', { name: 'Öppna Min privata uppgift', exact: true }).waitFor();
    await nav(page, 'Projects');
    await page.getByRole('button', { name: 'Öppna projekt Mitt privata projekt', exact: true }).waitFor();
    await nav(page, 'Others');
    await page.getByRole('button', { name: /^Födelsedagar(?:\s|$)/ }).waitFor();
    await page.getByRole('button', { name: 'Öppna notiser', exact: true }).click();
    await overview(page).waitFor();
    await noOverflow(page);
  });

  await check('Single and array imports create latest hero, history and unread indicators', async () => {
    await importJson(page, latest);
    await expectEntries(page, 1);
    assert.equal(await hero(page).getAttribute('data-debrief-id'), latest.date);
    assert.equal(await summaryBadge(page).textContent(), '1');
    assert.equal((await stateFor(page, latest.date)).readAt, null);
    assert.equal((await stateFor(page, latest.date)).dismissedAt, null);
    await importJson(page, [historic, yesterday]);
    await expectEntries(page, 3);
    assert.equal(await hero(page).getAttribute('data-debrief-id'), latest.date);
    assert.deepEqual(await page.locator('.summary-history-row').evaluateAll(rows => rows.map(row => row.dataset.debriefDate)), [yesterday.date, historic.date]);
    assert.equal(await summaryBadge(page).textContent(), '3');
    assert.equal(await page.locator('.debrief-bell-dot').count(), 1);
    await screenshot(page, 'desktop-summary-overview.png');
    await nav(page, 'Planner');
    assert.equal(await page.locator('.debrief-notice').getAttribute('data-debrief-id'), latest.date);
  });

  await check('Dismissing a kanban notice preserves unread history and reveals the next report', async () => {
    await page.locator('.debrief-notice').getByRole('button', { name: 'Dölj debriefing', exact: true }).click();
    const hidden = await stateFor(page, latest.date);
    assert.equal(hidden.readAt, null, 'Dismissing must not silently mark the report read');
    assert.ok(hidden.dismissedAt);
    assert.equal(await page.locator('.debrief-notice').getAttribute('data-debrief-id'), yesterday.date);
    assert.equal(await summaryBadge(page).textContent(), '2');
    await page.reload();
    await overview(page).waitFor();
    assert.equal((await stateFor(page, latest.date)).dismissedAt, hidden.dismissedAt);
    assert.equal((await stateFor(page, latest.date)).readAt, null);
    await expectEntries(page, 3);
    await nav(page, 'Planner');
    assert.equal(await page.locator('.debrief-notice').getAttribute('data-debrief-id'), yesterday.date);
    await nav(page, 'Home');
  });

  await check('Inline reading preserves hidden state and returns focus to its original read button', async () => {
    const hiddenAt = (await stateFor(page, latest.date)).dismissedAt;
    await hero(page).getByRole('button', { name: 'Läs debriefing', exact: true }).click();
    await reader(page).waitFor();
    assert.equal(await reader(page).getAttribute('data-debrief-id'), latest.date);
    assert.equal(await reader(page).locator('.debrief-reader-body').textContent(), latest.body);
    const heading = reader(page).getByRole('heading', { name: latest.title, exact: true });
    assert.equal(await heading.evaluate(element => element === document.activeElement), true);
    const read = await stateFor(page, latest.date);
    assert.ok(read.readAt);
    assert.equal(read.dismissedAt, hiddenAt);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Summary reading should be inline');
    await screenshot(page, 'desktop-summary-reader.png');
    await backToOverview(page);
    const trigger = hero(page).getByRole('button', { name: 'Läs igen', exact: true });
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00+02:00'));
    await trigger.click();
    assert.equal((await stateFor(page, latest.date)).readAt, read.readAt, 'Rereading must preserve the original read timestamp');
    await backToOverview(page);
  });

  await check('The header bell opens the latest unread report and old reports remain readable', async () => {
    await nav(page, 'Planner');
    await page.getByRole('button', { name: 'Öppna notiser', exact: true }).click();
    await reader(page).waitFor();
    assert.equal(await reader(page).getAttribute('data-debrief-id'), yesterday.date);
    assert.ok((await stateFor(page, yesterday.date)).readAt);
    await backToOverview(page);
    await nav(page, 'Planner');
    assert.equal(await page.locator('.debrief-notice').getAttribute('data-debrief-id'), historic.date);
    await page.locator('.debrief-notice').getByRole('button', { name: 'Läs', exact: true }).click();
    await reader(page).waitFor();
    assert.equal(await reader(page).getAttribute('data-debrief-id'), historic.date);
    assert.equal(await reader(page).locator('.debrief-reader-body').textContent(), historic.body);
    assert.ok((await stateFor(page, historic.date)).readAt);
    await backToOverview(page);
    await page.reload();
    await overview(page).waitFor();
    await expectEntries(page, 3);
    await historyRow(page, historic.date).waitFor();
    assert.equal(await summaryBadge(page).count(), 0);
    assert.equal(await page.locator('.debrief-bell-dot').count(), 0);
    await nav(page, 'Planner');
    assert.equal(await page.locator('.debrief-notice').count(), 0);
    await nav(page, 'Home');
  });

  await check('Identical reimports preserve read, dismissed and created timestamps', async () => {
    const before = await stateFor(page, latest.date);
    await importJson(page, latest);
    assert.deepEqual(await stateFor(page, latest.date), before, 'An omitted new import timestamp must not reset state');
    await importJson(page, { ...latest, createdAt: '2026-10-06T17:00:00.000Z', readAt: null, dismissedAt: null, user_id: 'ignored-client-owner' });
    assert.deepEqual(await stateFor(page, latest.date), before, 'Equal content with a different creation timestamp must not reset state');
    await expectEntries(page, 3);
  });

  await check('Invalid and duplicate arrays fail atomically without changing the feed', async () => {
    const before = await feed(page);
    const rejected = [
      '{',
      { ...latest, date: '2026-02-30' },
      [{ ...latest, date: '2026-10-07' }, { ...latest, date: '2026-10-08', body: '' }],
      [{ ...latest, date: '2026-10-07' }, { ...latest, date: '2026-10-07', body: 'Annat innehåll' }],
      [],
      Array.from({ length: 101 }, () => latest),
    ];
    for (const payload of rejected) {
      await importJson(page, payload);
      await page.locator('.debrief-import-error').waitFor();
      assert.deepEqual(await feed(page), before);
      assert.equal(await page.locator('.debrief-import-success').count(), 0);
    }
  });

  await check('Imported HTML remains literal text rather than executable report markup', async () => {
    const body = '<h1>En vanlig textrad</h1>\n<img src="x" onerror="window.__debriefHtmlExecuted=true">\n<script>window.__debriefHtmlExecuted=true</script>\n\n' + 'En längre text utan mellanslag: ' + 'x'.repeat(250);
    await importJson(page, { date: '2026-10-06', title: 'Text som ska läsas lugnt', summary: 'Markup får vara vanlig text.', body });
    await expectEntries(page, 4);
    await hero(page).getByRole('button', { name: 'Läs debriefing', exact: true }).click();
    await reader(page).waitFor();
    assert.equal(await reader(page).locator('.debrief-reader-body').textContent(), body);
    assert.equal(await reader(page).locator('.debrief-reader-body').locator('h1,img,script').count(), 0);
    assert.equal(await page.evaluate(() => !!window.__debriefHtmlExecuted), false);
    await noOverflow(page);
    await backToOverview(page);
  });

  await check('A revised day replaces only its content and becomes unread again', async () => {
    const revised = { ...latest, body: `${latest.body}\n\nEtt uppdaterat nästa steg.` };
    await importJson(page, revised);
    await expectEntries(page, 4);
    const entry = await stateFor(page, latest.date);
    assert.equal(entry.body, revised.body);
    assert.equal(entry.readAt, null);
    assert.equal(entry.dismissedAt, null);
    assert.equal(await summaryBadge(page).textContent(), '1');
    await historyRow(page, latest.date).getByText('Oläst', { exact: true }).waitFor();
    await historyRow(page, latest.date).click();
    assert.equal(await reader(page).locator('.debrief-reader-body').textContent(), revised.body);
    await backToOverview(page);
  });

  await check('Backup includes complete debrief history while every original workspace field stays identical', async () => {
    assert.deepEqual(await workspace(page), expectedWorkspace);
    assert.equal(Object.hasOwn(await workspace(page), 'debriefs'), false);
    await nav(page, 'Profile');
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportera säkerhetskopia', exact: true }).click();
    const download = await downloadEvent;
    await download.saveAs(path.join(out, 'backup.json'));
    const { debriefs, ...savedWorkspace } = JSON.parse(fs.readFileSync(path.join(out, 'backup.json'), 'utf8'));
    assert.deepEqual(savedWorkspace, expectedWorkspace);
    assert.deepEqual(debriefs, (await feed(page)).entries);
    assert.ok(debriefs.some(entry => entry.date === historic.date));
    await nav(page, 'Home');
  });

  await check('A debrief storage failure stays visible and Retry persists its in-memory report', async () => {
    await page.evaluate(storageKey => {
      const original = Storage.prototype.setItem;
      window.__restoreDebriefStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (key, value) {
        if (key === storageKey) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }, feedKey);
    await importJson(page, { ...latest, date: '2026-10-07', title: 'En osparad debriefing' });
    assert.equal(await hero(page).getAttribute('data-debrief-id'), '2026-10-07');
    await page.locator('.debrief-error').getByText(/kunde inte sparas på enheten/).waitFor();
    assert.equal((await feed(page)).entries.length, 4);
    assert.equal(await page.locator('.debrief-import-success').count(), 0);
    assert.deepEqual(await workspace(page), expectedWorkspace);
    await page.evaluate(() => window.__restoreDebriefStorage());
    await page.locator('.debrief-error').getByRole('button', { name: 'Försök igen', exact: true }).click();
    await expectEntries(page, 5);
    await page.reload();
    await overview(page).waitFor();
    assert.equal(await hero(page).getAttribute('data-debrief-id'), '2026-10-07');
    await expectEntries(page, 5);
  });

  const mobile = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, timezoneId: 'Europe/Stockholm' });
  await mobile.addInitScript(({ workspaceKey, feedKey, fixture, entries }) => {
    if (!localStorage.getItem(workspaceKey)) localStorage.setItem(workspaceKey, JSON.stringify(fixture));
    if (!localStorage.getItem(feedKey)) localStorage.setItem(feedKey, JSON.stringify({ version: 1, entries, pending: {} }));
  }, { workspaceKey, feedKey, fixture: workspaceFixture, entries: [yesterday, latest].map(value => ({ ...value, id: value.date, createdAt: '2026-10-05T10:00:00.000Z', readAt: null, dismissedAt: null })) });
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(10000);
  phone.on('pageerror', error => errors.push(error.message));
  await phone.clock.setFixedTime(new Date(fixedDate));
  await phone.goto(baseURL);
  await overview(phone).waitFor();

  await check('iPhone Home, inline reader and four footer destinations are touch-friendly', async () => {
    await noOverflow(phone);
    assert.equal(await hero(phone).getAttribute('data-debrief-id'), latest.date, 'Latest must win even when cached entries are unsorted');
    const controls = phone.locator('.bottom-nav button, .debrief-bell, .summary-latest-action button, .summary-latest-state button, .summary-import button, .summary-history-row');
    const heights = await controls.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(heights.every(height => height >= 44), `Mobile control heights: ${heights.join(', ')}`);
    await screenshot(phone, 'mobile-summary-overview.png');
    await hero(phone).getByRole('button', { name: 'Läs debriefing', exact: true }).tap();
    await reader(phone).waitFor();
    const readerHeights = await reader(phone).locator('button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(readerHeights.every(height => height >= 44), `Mobile reader controls: ${readerHeights.join(', ')}`);
    assert.equal(await reader(phone).getByRole('heading', { name: latest.title, exact: true }).evaluate(element => element === document.activeElement), true);
    await noOverflow(phone);
    await screenshot(phone, 'mobile-summary-reader.png');
    await reader(phone).getByRole('button', { name: 'Till översikten', exact: true }).tap();
    assert.equal(await hero(phone).getByRole('button', { name: 'Läs igen', exact: true }).evaluate(element => element === document.activeElement), true);
    for (const label of ['Planner', 'Projects', 'Others', 'Home']) {
      await phone.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).tap();
      await noOverflow(phone);
    }
  });

  await check('Mobile dismiss, reload, dark mode and history reading preserve report states', async () => {
    await nav(phone, 'Planner');
    const notice = phone.locator('.debrief-notice');
    assert.equal(await notice.getAttribute('data-debrief-id'), yesterday.date);
    const heights = await notice.locator('button').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(heights.every(height => height >= 44), `Mobile notice controls: ${heights.join(', ')}`);
    await screenshot(phone, 'mobile-kanban-notice.png');
    await notice.getByRole('button', { name: 'Dölj debriefing', exact: true }).tap();
    assert.equal((await stateFor(phone, yesterday.date)).readAt, null);
    assert.ok((await stateFor(phone, yesterday.date)).dismissedAt);
    await phone.reload();
    await overview(phone).waitFor();
    await phone.getByRole('button', { name: 'Byt till mörkt tema', exact: true }).tap();
    assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await screenshot(phone, 'mobile-summary-dark.png');
    await historyRow(phone, yesterday.date).tap();
    assert.equal(await reader(phone).getAttribute('data-debrief-id'), yesterday.date);
    assert.ok((await stateFor(phone, yesterday.date)).readAt);
    assert.ok((await stateFor(phone, yesterday.date)).dismissedAt);
    await screenshot(phone, 'mobile-summary-reader-dark.png');
    await noOverflow(phone);
    assert.deepEqual(await workspace(phone), expectedWorkspace);
  });

  await check('No uncaught browser exceptions during debrief flows', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baseURL, fixedDate, results, errors }, null, 2));
  await browser.close();
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
