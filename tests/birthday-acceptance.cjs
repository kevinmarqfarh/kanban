// Independent browser checks for Home birthday reminders and legacy-card preservation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4173';
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const out = path.join(__dirname, 'artifacts', engine, 'birthdays-2026-10-06');
const results = [], errors = [];
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const fixedDate = '2026-10-04T12:00:00+02:00';
const options = ['7 dagar före', '14 dagar före', '30 dagar före'];
const legacy = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }],
  projects: [{ id: 'legacy-project', title: 'Mitt befintliga projekt', description: 'Ska bevaras', icon: 'home', color: 'sage', deadline: null, createdAt: '2026-10-01T09:00:00.000Z' }],
  tasks: [
    { id: 'legacy-task', title: 'Min befintliga uppgift', description: 'Ska bevaras', columnId: 'todo', labels: ['Privat'], checklist: [], deadline: null, comments: [], projectId: 'legacy-project', createdAt: '2026-10-01T09:00:00.000Z' },
    { id: 'birthday:old-person:2026-11-04:month', title: 'Tidigare födelsedagskort', description: 'Skapat med den tidigare påminnelsemodellen.', columnId: 'todo', labels: ['Födelsedag'], checklist: [], deadline: '2026-11-04', comments: [], projectId: null, createdAt: '2026-10-01T09:00:00.000Z' },
  ],
} };
const check = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); } };
const cache = page => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)).workspace, key);
const notifications = async page => (await cache(page)).birthdayNotifications ?? [];
const unchangedTasks = async page => assert.deepEqual((await cache(page)).tasks, legacy.workspace.tasks.map(task => ({ ...task, projectId: null })), 'Birthday reminders must preserve all existing cards and create no new cards');
const expectNotifications = async (page, count) => {
  await page.waitForFunction(({ key, count }) => (JSON.parse(localStorage.getItem(key)).workspace.birthdayNotifications ?? []).length === count, { key, count });
  assert.equal((await notifications(page)).length, count);
  await unchangedTasks(page);
};
const nav = (page, name) => page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click();
const dialog = page => page.getByRole('dialog');
const openBirthdays = async page => {
  await nav(page, 'Others');
  await page.getByRole('button', { name: /^Födelsedagar(?:\s|$)/ }).click();
  await dialog(page).waitFor();
  await dialog(page).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
};
const closeBirthdays = page => dialog(page).getByRole('button', { name: 'Stäng', exact: true }).first().click();
const fillBirthday = async (page, name, birthDate, reminders = []) => {
  await dialog(page).getByLabel('Namn', { exact: true }).fill(name);
  await dialog(page).getByLabel(/^Födelsedatum/).fill(birthDate);
  await dialog(page).getByLabel(/^Skapa påminnelser/).setChecked(reminders.length > 0);
  if (reminders.length) for (const label of options) await dialog(page).getByLabel(label, { exact: true }).setChecked(reminders.includes(label));
};
const saveBirthday = async page => { await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click(); await dialog(page).locator('.birthday-list').waitFor(); };
const row = (page, name) => dialog(page).locator('[data-birthday-id]').filter({ has: page.getByRole('heading', { name, exact: true }) });
const notice = (page, id) => page.locator(`[data-birthday-notification-id="${id}"]`);
const noOverflow = async page => { const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(size.scroll <= size.width + 1, `Page overflows: ${size.scroll} > ${size.width}`); };
const screenshot = async (page, filename) => { await page.evaluate(() => document.fonts.ready); await page.clock.runFor(250); await page.screenshot({ path: path.join(out, filename), fullPage: false, animations: 'disabled' }); };

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm' });
  await desktop.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key, value: legacy });
  const page = await desktop.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-04T11:59:00+02:00') });
  await page.goto(baseURL); await nav(page, 'Planner'); await page.getByRole('button', { name: 'Öppna Min befintliga uppgift', exact: true }).waitFor();
  await page.clock.pauseAt(new Date(fixedDate));

  await check('Legacy workspace and historical birthday cards load without losing content', async () => {
    const workspace = await cache(page); await unchangedTasks(page);
    assert.deepEqual(workspace.projects, legacy.workspace.projects.map(project => ({ ...project, tasks: legacy.workspace.tasks.filter(task => task.projectId === project.id).map(({ columnId, projectId, ...task }) => ({ ...task, completed: columnId === (legacy.workspace.columns.find(column => column.id === 'done')?.id ?? legacy.workspace.columns.at(-1)?.id) })) }))); assert.deepEqual(workspace.columns, [...legacy.workspace.columns, { id: 'finalized', title: 'Finalized', color: 'green' }]);
    assert.deepEqual(workspace.birthdays ?? [], []);
    assert.deepEqual(await page.evaluate(key => Object.keys(localStorage).filter(item => item.startsWith(`${key}:recovery:`)), key), []);
  });
  await check('Name, full birth date and a nonfuture birth year are required', async () => {
    await openBirthdays(page); await dialog(page).getByRole('button', { name: 'Lägg till födelsedag', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click();
    assert.equal((await cache(page)).birthdays?.length ?? 0, 0);
    assert.equal(await dialog(page).getByLabel('Namn', { exact: true }).evaluate(input => input.validity.valueMissing), true);
    await fillBirthday(page, 'Framtida datum', '2027-01-01'); await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click();
    assert.equal((await cache(page)).birthdays?.length ?? 0, 0);
    assert.equal(await dialog(page).getByLabel(/^Födelsedatum/).evaluate(input => input.validity.rangeOverflow), true);
    await dialog(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    assert.equal(await dialog(page).evaluate(element => element.contains(document.activeElement)), true);
  });
  await check('Three independent reminder choices save and Home shows the upcoming birthday without a premature month reminder', async () => {
    await dialog(page).getByRole('button', { name: 'Lägg till födelsedag', exact: true }).click();
    await fillBirthday(page, '  Anna  ', '1995-11-04', options); await saveBirthday(page);
    const birthday = (await cache(page)).birthdays.find(person => person.name === 'Anna');
    assert.ok(birthday); assert.equal(birthday.birthDate, '1995-11-04'); assert.deepEqual(birthday.reminders, ['week', 'two-weeks', 'month']);
    await row(page, 'Anna').getByText(/fyller 31 år/).waitFor(); assert.equal(await row(page, 'Anna').locator('time').getAttribute('datetime'), '2026-11-04');
    assert.equal(await row(page, 'Anna').locator('.birthday-reminder-chip').count(), 3);
    await expectNotifications(page, 0); await screenshot(page, 'desktop-birthday-list.png'); await closeBirthdays(page); await nav(page, 'Home');
    const upcoming = page.getByTestId('upcoming-birthdays').locator(`[data-birthday-id="${birthday.id}"]`); await upcoming.waitFor();
    await upcoming.getByText('Anna', { exact: true }).waitFor(); assert.match(await upcoming.textContent(), /31/);
    assert.equal(await upcoming.locator('time').getAttribute('datetime'), '2026-11-04');
  });
  await check('Exactly 30 days before the birthday creates a Home notification, never a Kanban card', async () => {
    await page.clock.pauseAt(new Date('2026-10-05T12:00:00+02:00')); await expectNotifications(page, 1);
    const [entry] = await notifications(page); assert.equal(entry.name, 'Anna'); assert.equal(entry.age, 31); assert.equal(entry.date, '2026-11-04'); assert.equal(entry.reminder, 'month');
    assert.equal(entry.id, `birthday-notification:${entry.birthdayId}:2026-11-04:month`);
    await nav(page, 'Home'); await notice(page, entry.id).waitFor(); assert.match(await notice(page, entry.id).textContent(), /Anna.*31/s);
    await screenshot(page, 'desktop-home-reminder.png');
  });
  await check('Reminder settings and notifications survive reload without duplicates', async () => {
    await page.reload(); await expectNotifications(page, 1); await openBirthdays(page);
    await dialog(page).getByRole('button', { name: 'Redigera födelsedag för Anna', exact: true }).click();
    assert.equal(await dialog(page).getByLabel('Namn', { exact: true }).inputValue(), 'Anna'); assert.equal(await dialog(page).getByLabel(/^Födelsedatum/).inputValue(), '1995-11-04');
    assert.equal(await dialog(page).getByLabel(/^Skapa påminnelser/).isChecked(), true);
    for (const label of options) assert.equal(await dialog(page).getByLabel(label, { exact: true }).isChecked(), true);
    await dialog(page).getByRole('button', { name: 'Avbryt', exact: true }).click(); await closeBirthdays(page);
  });
  await check('Active app creates the 14-day and 7-day notifications once on the correct dates', async () => {
    await page.clock.pauseAt(new Date('2026-10-21T12:00:00+02:00')); await expectNotifications(page, 2); assert.equal((await notifications(page))[1].reminder, 'two-weeks');
    await page.clock.pauseAt(new Date('2026-10-28T12:00:00+01:00')); await expectNotifications(page, 3); assert.equal((await notifications(page))[2].reminder, 'week');
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); }); await page.clock.runFor(1000);
    await expectNotifications(page, 3); await page.reload(); await expectNotifications(page, 3);
  });
  await check('Reading and dismissing birthday notifications are independent, persistent and deduplicated', async () => {
    await nav(page, 'Home'); const entries = await notifications(page);
    const month = entries.find(entry => entry.reminder === 'month'); const fortnight = entries.find(entry => entry.reminder === 'two-weeks');
    await notice(page, month.id).getByRole('button', { name: /Läs|Markera.*läst/ }).click();
    await notice(page, fortnight.id).getByRole('button', { name: /Dölj/ }).click();
    const saved = await notifications(page); assert.ok(saved.find(entry => entry.id === month.id).readAt); assert.equal(saved.find(entry => entry.id === month.id).dismissedAt, null);
    assert.ok(saved.find(entry => entry.id === fortnight.id).dismissedAt); assert.equal(saved.find(entry => entry.id === fortnight.id).readAt, null);
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.clock.runFor(61000); await page.reload(); await expectNotifications(page, 3);
    assert.deepEqual(await notifications(page), saved); assert.equal(await notice(page, month.id).count(), 0); assert.equal(await notice(page, fortnight.id).count(), 0);
  });
  await check('Editing and disabling reminders removes pending notices and preserves old cards and read history', async () => {
    await openBirthdays(page); await dialog(page).getByRole('button', { name: 'Redigera födelsedag för Anna', exact: true }).click();
    await fillBirthday(page, 'Anna Andersson', '1995-11-05'); await saveBirthday(page);
    const birthday = (await cache(page)).birthdays[0]; assert.equal(birthday.name, 'Anna Andersson'); assert.equal(birthday.birthDate, '1995-11-05'); assert.deepEqual(birthday.reminders, []);
    await row(page, 'Anna Andersson').getByText('Utan påminnelser', { exact: true }).waitFor(); await closeBirthdays(page);
    assert.ok((await notifications(page)).every(entry => entry.readAt || entry.dismissedAt)); const retained = await notifications(page);
    await page.clock.pauseAt(new Date('2027-11-05T12:00:00+01:00')); await page.reload(); await unchangedTasks(page); assert.deepEqual(await notifications(page), retained);
  });
  await check('Birthday deletion requires confirmation and retains historical Kanban content', async () => {
    await openBirthdays(page); await dialog(page).getByRole('button', { name: 'Ta bort födelsedag för Anna Andersson', exact: true }).click();
    assert.equal((await cache(page)).birthdays.length, 1); await row(page, 'Anna Andersson').getByRole('button', { name: 'Behåll', exact: true }).click();
    assert.equal((await cache(page)).birthdays.length, 1); await dialog(page).getByRole('button', { name: 'Ta bort födelsedag för Anna Andersson', exact: true }).click();
    await row(page, 'Anna Andersson').getByRole('button', { name: 'Ta bort', exact: true }).click(); assert.deepEqual((await cache(page)).birthdays, []); await unchangedTasks(page); await closeBirthdays(page);
    await page.reload(); await unchangedTasks(page); assert.deepEqual((await cache(page)).birthdays, []);
  });
  await check('Late return catches up once and old Kanban-ledger IDs do not suppress new Home notifications', async () => {
    const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm' });
    try {
      const value = structuredClone(legacy); value.workspace.birthdays = [{ id: 'old-person', name: 'Lina', birthDate: '1990-11-04', reminders: ['month', 'two-weeks', 'week'], generatedReminders: ['birthday:old-person:2026-11-04:month'], createdAt: '2026-10-01T09:00:00.000Z' }];
      await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key, value });
      const late = await context.newPage(); late.on('pageerror', error => errors.push(error.message)); await late.clock.setFixedTime(new Date('2026-10-28T12:00:00+01:00')); await late.goto(baseURL);
      await expectNotifications(late, 1); const [entry] = await notifications(late); assert.equal(entry.reminder, 'week'); assert.equal(entry.age, 36);
      assert.equal((await cache(late)).birthdays[0].generatedReminders.filter(id => id.startsWith('birthday-notification:')).length, 3);
      await late.reload(); await expectNotifications(late, 1);
    } finally { await context.close(); }
  });
  await check('A legacy birthday-day choice remains valid without reintroducing new Kanban reminders', async () => {
    const context = await browser.newContext({ timezoneId: 'Europe/Stockholm' });
    try {
      const value = structuredClone(legacy); value.workspace.birthdays = [{ id: 'legacy-day', name: 'Maja', birthDate: '2000-11-04', reminders: ['day'], generatedReminders: [], createdAt: '2026-10-01T09:00:00.000Z' }];
      await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key, value });
      const old = await context.newPage(); old.on('pageerror', error => errors.push(error.message)); await old.clock.setFixedTime(new Date('2026-11-04T12:00:00+01:00')); await old.goto(baseURL);
      await expectNotifications(old, 1); assert.equal((await notifications(old))[0].reminder, 'day'); assert.equal((await notifications(old))[0].age, 26);
    } finally { await context.close(); }
  });
  const mobile = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, timezoneId: 'Europe/Stockholm' });
  const phone = await mobile.newPage(); phone.setDefaultTimeout(10000); phone.on('pageerror', error => errors.push(error.message));
  await phone.clock.install({ time: new Date('2026-10-04T11:59:00+02:00') }); await phone.goto(baseURL); await phone.getByTestId('summary-overview').waitFor(); await phone.clock.pauseAt(new Date(fixedDate));
  await check('Mobile birthday form uses touch-friendly date and reminder controls and saves without reminders', async () => {
    await openBirthdays(phone); await dialog(phone).getByRole('button', { name: 'Lägg till födelsedag', exact: true }).tap(); await fillBirthday(phone, 'Erik', '2000-10-11');
    assert.equal(await dialog(phone).getByLabel(/^Skapa påminnelser/).isChecked(), false);
    assert.ok((await dialog(phone).locator('.input').evaluateAll(elements => elements.map(input => parseFloat(getComputedStyle(input).fontSize)))).every(size => size >= 16));
    assert.ok(await dialog(phone).getByLabel(/^Födelsedatum/).evaluate(input => input.getBoundingClientRect().height >= 44));
    await dialog(phone).getByLabel(/^Skapa påminnelser/).check(); assert.ok((await dialog(phone).locator('.birthday-reminder-option').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))).every(height => height >= 44));
    await noOverflow(phone); await screenshot(phone, 'mobile-birthday-form.png'); await dialog(phone).getByLabel(/^Skapa påminnelser/).uncheck(); await saveBirthday(phone);
    await row(phone, 'Erik').getByText(/fyller 26 år/).waitFor(); assert.deepEqual((await cache(phone)).birthdays[0].reminders, []); assert.equal((await notifications(phone)).length, 0);
    await screenshot(phone, 'mobile-birthday-list.png'); await closeBirthdays(phone); await phone.reload(); await openBirthdays(phone); await row(phone, 'Erik').waitFor();
  });
  await check('Birthday dialog fits dark mode and Escape restores focus to Others', async () => {
    await closeBirthdays(phone); await phone.getByRole('button', { name: 'Öppna inställningar', exact: true }).tap(); await dialog(phone).getByRole('button', { name: 'Mörkt', exact: true }).tap(); await dialog(phone).getByRole('button', { name: 'Stäng', exact: true }).first().tap();
    const trigger = phone.getByRole('button', { name: /^Födelsedagar(?:\s|$)/ }); await trigger.focus(); await phone.keyboard.press('Enter'); await dialog(phone).waitFor();
    await dialog(phone).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished))); await noOverflow(phone); await screenshot(phone, 'mobile-birthday-dark.png');
    await phone.keyboard.press('Escape'); await dialog(phone).waitFor({ state: 'hidden' }); assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  });
  await check('No uncaught browser exceptions during new birthday flows', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baseURL, fixedDate, results, errors }, null, 2)); await browser.close(); process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
