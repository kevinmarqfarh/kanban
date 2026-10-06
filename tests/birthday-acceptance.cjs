// Independent birthday acceptance checks. Run against the local app.
// APP_URL, BROWSER_ENGINE and PLAYWRIGHT_MODULE match acceptance.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseURL = process.env.APP_URL || 'http://127.0.0.1:5173';
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const out = path.join(__dirname, 'artifacts', engine, 'birthdays');
const results = [];
const errors = [];
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const fixedDate = '2026-10-04T12:00:00+02:00';
const legacy = {
  version: 1, revision: null, dirty: false,
  workspace: {
    columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }],
    projects: [{ id: 'legacy-project', title: 'Mitt befintliga projekt', description: 'Ska bevaras', icon: 'home', color: 'sage', deadline: null, createdAt: '2026-10-01T09:00:00.000Z' }],
    tasks: [{ id: 'legacy-task', title: 'Min befintliga uppgift', description: 'Ska bevaras', columnId: 'todo', labels: ['Privat'], checklist: [], deadline: null, comments: [], projectId: 'legacy-project', createdAt: '2026-10-01T09:00:00.000Z' }],
  },
};
const check = async (name, fn) => {
  try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
};
const cache = page => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)).workspace, key);
const birthdayTasks = async (page, name) => (await cache(page)).tasks.filter(task => task.id.startsWith('birthday:') && (!name || task.title.includes(name)));
const expectTaskCount = async (page, count, name) => {
  await page.waitForFunction(({ storageKey, expected, person }) => {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return value.workspace.tasks.filter(task => task.id.startsWith('birthday:') && (!person || task.title.includes(person))).length === expected;
  }, { storageKey: key, expected: count, person: name });
  assert.equal((await birthdayTasks(page, name)).length, count);
};
const dialog = page => page.getByRole('dialog');
const nav = (page, label) => page.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).click();
const openBirthdays = async page => {
  await nav(page, 'Profile');
  await page.getByRole('button', { name: 'Visa födelsedagar', exact: true }).click();
  await dialog(page).waitFor();
  // Playwright's fake JS clock does not advance the native CSS animation clock.
  // Await the actual sheet animation before measuring its transformed targets.
  await dialog(page).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
};
const fillBirthday = async (page, name, birthDate, reminders = []) => {
  await dialog(page).getByLabel('Namn', { exact: true }).fill(name);
  await dialog(page).getByLabel(/^Födelsedatum/).fill(birthDate);
  const toggle = dialog(page).getByLabel(/^Skapa påminnelser/);
  await toggle.setChecked(reminders.length > 0);
  if (reminders.length) {
    for (const label of ['1 månad före', '2 veckor före', '1 vecka före', 'På födelsedagen']) {
      await dialog(page).getByLabel(label, { exact: true }).setChecked(reminders.includes(label));
    }
  }
};
const saveBirthday = async page => {
  await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click();
  await dialog(page).locator('.birthday-list').waitFor();
};
const row = (page, name) => dialog(page).locator('[data-birthday-id]').filter({ has: page.getByRole('heading', { name, exact: true }) });
const screenshot = async (page, filename) => {
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(250);
  // Native bottom-sheet dialogs must be captured in the viewport. A full-page
  // capture can reposition them against the document height in WebKit.
  await page.screenshot({ path: path.join(out, filename), fullPage: false, animations: 'disabled' });
};
const noOverflow = async page => {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, `Unintended page overflow: ${size.scroll} > ${size.width}`);
};

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm' });
  await desktop.addInitScript(({ storageKey, value }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value));
  }, { storageKey: key, value: legacy });
  const page = await desktop.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-04T11:59:00+02:00') });
  await page.goto(baseURL);
  await nav(page, 'Kanban');
  await page.getByRole('button', { name: 'Öppna Min befintliga uppgift', exact: true }).waitFor();
  await page.clock.pauseAt(new Date(fixedDate));

  await check('Legacy workspace loads without losing existing tasks or projects', async () => {
    const workspace = await cache(page);
    assert.deepEqual(workspace.tasks, legacy.workspace.tasks);
    assert.deepEqual(workspace.projects, legacy.workspace.projects);
    assert.deepEqual(workspace.columns, legacy.workspace.columns);
    assert.deepEqual(workspace.birthdays ?? [], []);
    const recoveries = await page.evaluate(storageKey => Object.keys(localStorage).filter(value => value.startsWith(`${storageKey}:recovery:`)), key);
    assert.deepEqual(recoveries, [], 'An old valid workspace should migrate, not be marked corrupt');
  });

  await check('Required name and birth year are validated before creating a birthday', async () => {
    await openBirthdays(page);
    await dialog(page).getByRole('button', { name: 'Lägg till födelsedag', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click();
    assert.equal((await cache(page)).birthdays?.length ?? 0, 0);
    assert.equal(await dialog(page).getByLabel('Namn', { exact: true }).evaluate(input => input.validity.valueMissing), true);
    await fillBirthday(page, 'Framtida datum', '2027-01-01');
    await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click();
    assert.equal((await cache(page)).birthdays?.length ?? 0, 0);
    assert.equal(await dialog(page).getByLabel(/^Födelsedatum/).evaluate(input => input.validity.rangeOverflow), true);
    await dialog(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    assert.equal(await dialog(page).evaluate(element => element.contains(document.activeElement)), true, 'Cancel returns to a focused control in the birthday list');
  });

  await check('Create a birthday with all four independent reminder options', async () => {
    await dialog(page).getByRole('button', { name: 'Lägg till födelsedag', exact: true }).click();
    await fillBirthday(page, '  Anna  ', '1995-11-04', ['1 månad före', '2 veckor före', '1 vecka före', 'På födelsedagen']);
    await saveBirthday(page);
    assert.equal(await dialog(page).evaluate(element => element.contains(document.activeElement)), true, 'Save keeps focus in the birthday dialog');
    const birthday = (await cache(page)).birthdays.find(person => person.name === 'Anna');
    assert.ok(birthday);
    assert.equal(birthday.birthDate, '1995-11-04');
    assert.deepEqual(birthday.reminders, ['month', 'two-weeks', 'week', 'day']);
    await row(page, 'Anna').getByText(/fyller 31 år/).waitFor();
    assert.equal(await row(page, 'Anna').locator('time').getAttribute('datetime'), '2026-11-04');
    assert.equal(await row(page, 'Anna').locator('.birthday-reminder-chip').count(), 4);
    await expectTaskCount(page, 1, 'Anna');
    const [task] = await birthdayTasks(page, 'Anna');
    assert.equal(task.title, 'Anna fyller 31 år');
    assert.equal(task.deadline, '2026-11-04');
    assert.equal(task.columnId, 'todo');
    assert.deepEqual(task.labels, ['Födelsedag']);
    assert.match(task.description, /Födelsedag: 4 november 2026/);
    assert.match(task.description, /1 månad före födelsedagen/);
    await screenshot(page, 'desktop-birthday-list.png');
    await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).first().click();
  });

  await check('Birthday settings and reminder task survive reload without duplicates', async () => {
    await page.reload();
    await expectTaskCount(page, 1, 'Anna');
    await openBirthdays(page);
    await dialog(page).getByRole('button', { name: 'Redigera födelsedag för Anna', exact: true }).click();
    assert.equal(await dialog(page).getByLabel('Namn', { exact: true }).inputValue(), 'Anna');
    assert.equal(await dialog(page).getByLabel(/^Födelsedatum/).inputValue(), '1995-11-04');
    assert.equal(await dialog(page).getByLabel(/^Skapa påminnelser/).isChecked(), true);
    for (const label of ['1 månad före', '2 veckor före', '1 vecka före', 'På födelsedagen']) assert.equal(await dialog(page).getByLabel(label, { exact: true }).isChecked(), true);
    await dialog(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).first().click();
  });

  await check('Active app generates the two-week, one-week and birthday tasks on their dates', async () => {
    await page.clock.pauseAt(new Date('2026-10-21T12:00:00+02:00'));
    await expectTaskCount(page, 2, 'Anna');
    assert.match((await birthdayTasks(page, 'Anna'))[1].description, /2 veckor före födelsedagen/);
    await page.clock.pauseAt(new Date('2026-10-28T12:00:00+01:00'));
    await expectTaskCount(page, 3, 'Anna');
    assert.match((await birthdayTasks(page, 'Anna'))[2].description, /1 vecka före födelsedagen/);
    await page.clock.pauseAt(new Date('2026-11-04T12:00:00+01:00'));
    await expectTaskCount(page, 4, 'Anna');
    assert.match((await birthdayTasks(page, 'Anna'))[3].description, /På födelsedagen/);
    assert.ok((await birthdayTasks(page, 'Anna')).every(task => task.deadline === '2026-11-04' && task.title === 'Anna fyller 31 år'));
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(1000);
    await expectTaskCount(page, 4, 'Anna');
    await page.reload();
    await expectTaskCount(page, 4, 'Anna');
  });

  await check('A deleted generated task stays deleted after focus and reload', async () => {
    await nav(page, 'Kanban');
    const [task] = await birthdayTasks(page, 'Anna');
    await page.locator(`[data-task-id="${task.id}"]`).getByRole('button', { name: `Öppna ${task.title}`, exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Ta bort uppgift', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Ta bort', exact: true }).click();
    await expectTaskCount(page, 3, 'Anna');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(61000);
    await page.reload();
    await expectTaskCount(page, 3, 'Anna');
    assert.ok((await cache(page)).birthdays[0].generatedReminders.includes(task.id));
  });

  await check('Edit and turn reminders off while keeping previously created tasks', async () => {
    await openBirthdays(page);
    await dialog(page).getByRole('button', { name: 'Redigera födelsedag för Anna', exact: true }).click();
    await fillBirthday(page, 'Anna Andersson', '1995-11-05');
    await saveBirthday(page);
    const birthday = (await cache(page)).birthdays[0];
    assert.equal(birthday.name, 'Anna Andersson');
    assert.equal(birthday.birthDate, '1995-11-05');
    assert.deepEqual(birthday.reminders, []);
    await row(page, 'Anna Andersson').getByText('Utan påminnelser', { exact: true }).waitFor();
    await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).first().click();
    await page.clock.pauseAt(new Date('2027-11-05T12:00:00+01:00'));
    await expectTaskCount(page, 3);
    await page.reload();
    await expectTaskCount(page, 3);
  });

  await check('Birthday deletion requires confirmation and retains existing kanban tasks', async () => {
    await openBirthdays(page);
    await dialog(page).getByRole('button', { name: 'Ta bort födelsedag för Anna Andersson', exact: true }).click();
    assert.equal((await cache(page)).birthdays.length, 1);
    await row(page, 'Anna Andersson').getByRole('button', { name: 'Behåll', exact: true }).click();
    assert.equal((await cache(page)).birthdays.length, 1);
    await dialog(page).getByRole('button', { name: 'Ta bort födelsedag för Anna Andersson', exact: true }).click();
    await row(page, 'Anna Andersson').getByRole('button', { name: 'Ta bort', exact: true }).click();
    assert.deepEqual((await cache(page)).birthdays, []);
    await expectTaskCount(page, 3);
    await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).first().click();
    await page.clock.pauseAt(new Date('2028-11-05T12:00:00+01:00'));
    await page.reload();
    await expectTaskCount(page, 3);
  });

  await check('Late reopening catches up once and does not create a reminder burst', async () => {
    const late = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm' });
    const lateCache = structuredClone(legacy);
    lateCache.workspace.birthdays = [{ id: 'late-birthday', name: 'Lina', birthDate: '1990-11-04', reminders: ['month', 'two-weeks', 'week', 'day'], generatedReminders: [], createdAt: '2026-10-01T09:00:00.000Z' }];
    await late.addInitScript(({ storageKey, value }) => { if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(value)); }, { storageKey: key, value: lateCache });
    const latePage = await late.newPage();
    latePage.on('pageerror', error => errors.push(error.message));
    await latePage.clock.setFixedTime(new Date('2026-10-28T12:00:00+01:00'));
    await latePage.goto(baseURL);
    await expectTaskCount(latePage, 1, 'Lina');
    assert.match((await birthdayTasks(latePage, 'Lina'))[0].description, /1 vecka före födelsedagen/);
    assert.equal((await cache(latePage)).birthdays[0].generatedReminders.length, 3);
    await latePage.reload();
    await expectTaskCount(latePage, 1, 'Lina');
    await late.close();
  });

  const mobile = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, timezoneId: 'Europe/Stockholm' });
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(10000);
  phone.on('pageerror', error => errors.push(error.message));
  await phone.clock.install({ time: new Date('2026-10-04T11:59:00+02:00') });
  await phone.goto(baseURL);
  await nav(phone, 'Kanban');
  await phone.locator('[data-task-id="task-light"]').waitFor();
  await phone.clock.pauseAt(new Date(fixedDate));

  await check('iPhone birthday form uses touch-friendly controls and saves without reminders', async () => {
    await openBirthdays(phone);
    await dialog(phone).getByRole('button', { name: 'Lägg till födelsedag', exact: true }).tap();
    await fillBirthday(phone, 'Erik', '2000-10-11');
    assert.equal(await dialog(phone).getByLabel(/^Skapa påminnelser/).isChecked(), false);
    const inputSizes = await dialog(phone).locator('.input').evaluateAll(inputs => inputs.map(input => parseFloat(getComputedStyle(input).fontSize)));
    assert.ok(inputSizes.every(size => size >= 16), `Mobile input font sizes: ${inputSizes.join(', ')}`);
    const dateHeight = await dialog(phone).getByLabel(/^Födelsedatum/).evaluate(input => input.getBoundingClientRect().height);
    assert.ok(dateHeight >= 44, `Mobile birthday date input is only ${dateHeight}px tall`);
    const heights = await dialog(phone).locator('.modal-footer button, .birthday-reminder-toggle').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(heights.every(height => height >= 44), `Mobile control heights: ${heights.join(', ')}`);
    await dialog(phone).getByLabel(/^Skapa påminnelser/).check();
    const optionHeights = await dialog(phone).locator('.birthday-reminder-option').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(optionHeights.every(height => height >= 44), `Reminder option heights: ${optionHeights.join(', ')}`);
    await noOverflow(phone);
    await screenshot(phone, 'mobile-birthday-form.png');
    await dialog(phone).getByLabel(/^Skapa påminnelser/).uncheck();
    await saveBirthday(phone);
    await row(phone, 'Erik').getByText(/fyller 26 år/).waitFor();
    await expectTaskCount(phone, 0, 'Erik');
    assert.deepEqual((await cache(phone)).birthdays[0].reminders, []);
    await screenshot(phone, 'mobile-birthday-list.png');
    await dialog(phone).getByRole('button', { name: 'Stäng', exact: true }).first().tap();
    await phone.reload();
    await openBirthdays(phone);
    await row(phone, 'Erik').waitFor();
    await expectTaskCount(phone, 0, 'Erik');
  });

  await check('Birthday dialog fits dark mode and Escape restores focus', async () => {
    await dialog(phone).getByRole('button', { name: 'Stäng', exact: true }).first().tap();
    await phone.getByRole('button', { name: 'Mörkt', exact: true }).tap();
    const trigger = phone.getByRole('button', { name: 'Visa födelsedagar', exact: true });
    await trigger.focus();
    await phone.keyboard.press('Enter');
    await dialog(phone).waitFor();
    await dialog(phone).evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    await noOverflow(phone);
    await screenshot(phone, 'mobile-birthday-dark.png');
    await phone.keyboard.press('Escape');
    await dialog(phone).waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  });

  await check('No uncaught browser exceptions during birthday flows', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baseURL, fixedDate, results, errors }, null, 2));
  await browser.close();
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
