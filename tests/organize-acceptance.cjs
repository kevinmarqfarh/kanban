// Browser checks for the 6 October revision: birthday tags, drag-and-drop and countdowns, the Notes focus editor,
// nutrition day colours, the mobile training form with Nivå and recent exercises, and recipe label filters.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4173';
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const out = path.join(__dirname, 'artifacts', engine, 'organize-2026-10-06');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const today = '2026-10-06';
const stamp = '2026-10-01T09:00:00.000Z';
const results = [], errors = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); } catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const person = (id, name, birthDate, tag, reminders = []) => ({ id, name, birthDate, reminders, createdAt: stamp, generatedReminders: [], ...(tag === undefined ? {} : { tag }) });
const row = (id, title, values = {}) => ({ id, title, amount: '', amountUnit: 'sets', load: '', loadUnit: 'kg', bpm: '', ...values });
const core = {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
  tasks: [{ id: 'task-one', title: 'Min uppgift', description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: stamp }],
  projects: [], birthdayNotifications: [], birthdays: [], workouts: [], nutritionHabits: [], nutritionCompletions: [], recipes: [], notes: [],
};
const tagged = [
  person('anna', 'Anna Andersson', '1990-10-20', 'Vänner'), person('mamma', 'Mamma', '1962-12-03', 'Familj'),
  person('erik', 'Erik Lindqvist', '1988-10-07', null), person('sara', 'Sara', '2019-03-14', 'Familj'),
];
const history = [
  { id: 'w-old', date: '2026-09-20', title: 'Ben', rows: [row('o1', 'Knäböj', { amount: '3', load: '50' }), row('o2', 'Marklyft', { amount: '3', load: '80' })], createdAt: '2026-09-20T10:00:00.000Z' },
  { id: 'w-new', date: '2026-10-05', title: 'Kondition', rows: [row('n1', 'Cykel', { amount: '20', amountUnit: 'min', load: '8', loadUnit: 'level', bpm: '135' }), row('n2', 'Knäböj', { amount: '4', load: '60' })], createdAt: '2026-10-05T10:00:00.000Z' },
];

const cache = page => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)).workspace, key);
const dialog = page => page.getByRole('dialog');
const waitDialog = async page => { await dialog(page).waitFor(); await dialog(page).evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished))); };
const nav = (page, name) => page.locator('.bottom-nav').getByRole('button', { name, exact: true }).click();
const openOthers = async (page, name) => { await nav(page, 'Others'); await page.getByRole('button', { name: new RegExp(`^${name}(?:\\s|$)`) }).click(); };
const openBirthdays = async page => { await openOthers(page, 'Födelsedagar'); await waitDialog(page); };
const groupNames = page => page.locator('.birthday-group').evaluateAll(sections => sections.map(section => `${section.dataset.birthdayGroup || '-'}:${[...section.querySelectorAll('h4')].map(heading => heading.textContent).join(',')}`).join(' '));
const stored = async page => (await cache(page)).birthdays.map(entry => `${entry.id}:${entry.tag ?? '-'}`).join(' ');
const birthdayRow = (page, name) => dialog(page).locator('[data-birthday-id]').filter({ has: page.getByRole('heading', { name, exact: true }) });
const noOverflow = async page => { const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(size.scroll <= size.width + 1, `Page overflows: ${size.scroll} > ${size.width}`); };
const noDialogOverflow = async page => { const size = await dialog(page).locator('.modal-content').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth })); assert.ok(size.scroll <= size.client + 1, `Sheet overflows sideways: ${size.scroll} > ${size.client}`); };
const screenshot = async (page, name) => { await page.evaluate(() => document.fonts.ready); await pause(200); await page.screenshot({ path: path.join(out, name), animations: 'disabled' }); };
async function mouseDrag(page, fromName, target, position = 'top') {
  const handle = await page.getByRole('button', { name: `Flytta ${fromName}`, exact: true }).boundingBox();
  const box = typeof target === 'string' ? await birthdayRow(page, target).boundingBox() : target;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 8, { steps: 3 });
  const y = position === 'top' ? box.y + 10 : position === 'middle' ? box.y + box.height / 2 : box.y + box.height - 10;
  await page.mouse.move(box.x + 60, y, { steps: 14 }); await pause(120); await page.mouse.move(box.x + 60, y + 2, { steps: 2 }); await pause(120);
  await page.mouse.up(); await pause(250);
}

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  const fresh = async (extra = {}, options = {}) => {
    const workspace = { ...structuredClone(core), ...structuredClone(extra) };
    const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, timezoneId: 'Europe/Stockholm', locale: 'sv-SE', ...options });
    await context.addInitScript(({ key, workspace, now }) => {
      const NativeDate = Date; const millis = new NativeDate(now).getTime();
      class TestDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [millis])); } static now() { return millis; } }
      window.Date = TestDate;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, workspace, revision: null, dirty: false }));
    }, { key, workspace, now: `${today}T21:00:00+02:00` });
    return context;
  };
  const load = async context => { const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); await page.goto(baseURL); await page.getByTestId('home-overview').waitFor(); return page; };
  const withPage = async (extra, fn, options) => { const context = await fresh(extra, options); try { await fn(await load(context), context); } finally { await context.close(); } };
  const phone = { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

  /* ---------------- Birthdays ---------------- */
  await check('Legacy birthdays keep their date order once, get countdown tiles and stay where the person puts them', async () => {
    await withPage({ birthdays: [person('mamma', 'Mamma', '1962-12-03'), person('anna', 'Anna Andersson', '1990-10-20'), person('erik', 'Erik Lindqvist', '1988-10-07')] }, async page => {
      await openBirthdays(page);
      assert.equal(await groupNames(page), '-:Erik Lindqvist,Anna Andersson,Mamma', 'Previously visible date order is kept, without group headings when nothing is tagged.');
      assert.equal(await dialog(page).locator('.birthday-group-heading').count(), 0);
      assert.deepEqual(await dialog(page).locator('[data-birthday-id]').evaluateAll(rows => rows.map(row => row.dataset.countdown)), ['1', '14', '58']);
      assert.equal(await birthdayRow(page, 'Erik Lindqvist').getByRole('img', { name: 'Födelsedag i morgon' }).count(), 1);
      assert.equal(await birthdayRow(page, 'Anna Andersson').getByRole('img', { name: '14 dagar kvar till födelsedagen' }).count(), 1);
      await mouseDrag(page, 'Mamma', 'Erik Lindqvist', 'top');
      assert.equal(await groupNames(page), '-:Mamma,Erik Lindqvist,Anna Andersson');
      await page.reload(); await openBirthdays(page);
      assert.equal(await groupNames(page), '-:Mamma,Erik Lindqvist,Anna Andersson', 'A manual order is never re-sorted on load.');
      assert.equal(await stored(page), 'mamma:- erik:- anna:-');
    });
  });

  await check('The birthday form tags with presets or a typed tag; Enter and Escape in the tag box never submit or close', async () => {
    await withPage({ birthdays: [person('erik', 'Erik Lindqvist', '1988-10-07', null)] }, async page => {
      await openBirthdays(page);
      await dialog(page).getByRole('button', { name: 'Redigera födelsedag för Erik Lindqvist', exact: true }).click();
      const chips = dialog(page).locator('.tag-options > .tag-chip');
      assert.deepEqual(await chips.allTextContents(), ['Ingen', 'Familj', 'Vänner', 'Jobb', 'Lägg till tagg']);
      assert.equal(await dialog(page).getByRole('button', { name: 'Ingen', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.match(await dialog(page).locator('#birthday-date-help').textContent(), /i morgon$/);
      await dialog(page).getByRole('button', { name: 'Lägg till tagg', exact: true }).click();
      const box = dialog(page).getByRole('textbox', { name: 'Lägg till tagg', exact: true });
      await box.fill('Padel'); await box.press('Escape');
      assert.equal(await dialog(page).count(), 1, 'Escape cancels only the tag box.');
      assert.equal(await dialog(page).locator('#birthday-form').count(), 1);
      assert.equal(await dialog(page).getByRole('button', { name: 'Padel', exact: true }).count(), 0);
      await dialog(page).getByRole('button', { name: 'Lägg till tagg', exact: true }).click();
      await box.fill('  padel   vänner '); await box.press('Enter');
      assert.equal(await dialog(page).locator('#birthday-form').count(), 1, 'Enter adds the tag instead of submitting the form.');
      assert.equal(await dialog(page).getByRole('button', { name: 'padel vänner', exact: true }).getAttribute('aria-pressed'), 'true');
      await dialog(page).getByRole('button', { name: 'Lägg till tagg', exact: true }).click(); await box.fill('FAMILJ'); await box.press('Enter');
      assert.equal(await dialog(page).getByRole('button', { name: 'Familj', exact: true }).getAttribute('aria-pressed'), 'true', 'Typing a preset in any case selects the preset.');
      await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click(); await dialog(page).locator('.birthday-manager').waitFor();
      assert.equal(await stored(page), 'erik:Familj');
      assert.equal(await dialog(page).locator('.birthday-group-heading h3').allTextContents().then(names => names.join(',')), 'Familj');
      await dialog(page).getByRole('button', { name: 'Lägg till födelsedag', exact: true }).click();
      await dialog(page).getByLabel('Namn', { exact: true }).fill('Ola'); await dialog(page).getByLabel(/^Födelsedatum/).fill('1985-06-01');
      await dialog(page).getByRole('button', { name: 'Lägg till tagg', exact: true }).click(); await box.fill('Padel'); await box.press('Enter');
      await dialog(page).getByRole('button', { name: 'Spara födelsedag', exact: true }).click(); await dialog(page).locator('.birthday-manager').waitFor();
      assert.equal(await groupNames(page), 'Familj:Erik Lindqvist Padel:Ola');
      await dialog(page).getByRole('button', { name: 'Redigera födelsedag för Erik Lindqvist', exact: true }).click();
      assert.deepEqual(await chips.allTextContents(), ['Ingen', 'Familj', 'Vänner', 'Jobb', 'Padel', 'Lägg till tagg'], 'Own tags become reusable chips.');
    });
  });

  await check('Mouse drag moves people between tag groups, reorders inside a group and persists; releasing outside keeps the sheet open', async () => {
    await withPage({ birthdays: tagged }, async page => {
      await openBirthdays(page);
      assert.equal(await groupNames(page), 'Familj:Mamma,Sara Vänner:Anna Andersson -:Erik Lindqvist');
      await mouseDrag(page, 'Erik Lindqvist', 'Mamma', 'top');
      assert.equal(await groupNames(page), 'Familj:Erik Lindqvist,Mamma,Sara Vänner:Anna Andersson');
      assert.match(await page.locator('.toast').textContent(), /Erik Lindqvist är taggad som Familj/);
      await mouseDrag(page, 'Sara', 'Erik Lindqvist', 'top');
      assert.equal(await groupNames(page), 'Familj:Sara,Erik Lindqvist,Mamma Vänner:Anna Andersson');
      const handle = await page.getByRole('button', { name: 'Flytta Mamma', exact: true }).boundingBox();
      await page.mouse.move(handle.x + 10, handle.y + 20); await page.mouse.down(); await page.mouse.move(handle.x + 10, handle.y + 40, { steps: 4 });
      await page.mouse.move(4, 4, { steps: 10 }); await page.mouse.up(); await pause(250);
      assert.equal(await dialog(page).count(), 1, 'Releasing a drag on the backdrop must not close the sheet.');
      await page.reload(); await openBirthdays(page);
      assert.equal(await groupNames(page), 'Familj:Sara,Erik Lindqvist,Mamma Vänner:Anna Andersson');
      assert.equal(await stored(page), 'sara:Familj erik:Familj mamma:Familj anna:Vänner');
      await page.mouse.click(4, 4); await dialog(page).waitFor({ state: 'hidden' });
    });
  });

  await check('Empty preset groups appear as drop zones while dragging and a drop there applies the tag', async () => {
    await withPage({ birthdays: tagged }, async page => {
      await openBirthdays(page);
      const handle = await page.getByRole('button', { name: 'Flytta Anna Andersson', exact: true }).boundingBox();
      await page.mouse.move(handle.x + 15, handle.y + 22); await page.mouse.down(); await page.mouse.move(handle.x + 15, handle.y + 32, { steps: 3 }); await pause(150);
      const zone = dialog(page).locator('.birthday-group[data-birthday-group="Jobb"] .birthday-list');
      await zone.waitFor(); assert.match(await zone.textContent(), /Släpp här för taggen Jobb/);
      await zone.scrollIntoViewIfNeeded(); const box = await zone.boundingBox();
      await page.mouse.move(box.x + 50, box.y + box.height / 2, { steps: 16 }); await pause(150); await page.mouse.move(box.x + 52, box.y + box.height / 2 + 1); await pause(150);
      await page.mouse.up(); await pause(250);
      assert.equal(await stored(page), 'mamma:Familj sara:Familj erik:- anna:Jobb');
      assert.equal(await groupNames(page), 'Familj:Mamma,Sara Jobb:Anna Andersson -:Erik Lindqvist');
      assert.equal(await dialog(page).locator('.birthday-group.is-empty').count(), 0, 'Empty drop zones disappear after the drop.');
      assert.equal(await dialog(page).evaluate(element => element.style.height), '', 'The temporary sheet height lock is released.');
    });
  });

  await check('Keyboard drag: Space lifts, one arrow press crosses into the next group, Space drops, with Swedish announcements', async () => {
    await withPage({ birthdays: tagged }, async page => {
      await openBirthdays(page);
      await page.getByRole('button', { name: 'Flytta Anna Andersson', exact: true }).focus();
      await page.keyboard.press('Space'); await pause(150);
      await page.keyboard.press('ArrowUp'); await pause(250);
      assert.match(await page.locator('[aria-live]').allTextContents().then(texts => texts.join(' ')), /I gruppen Familj/);
      await page.keyboard.press('Space'); await pause(250);
      assert.match((await stored(page)), /anna:Familj/);
      assert.equal((await groupNames(page)).split(' ')[0].startsWith('Familj:'), true);
      assert.match(await page.locator('[aria-live]').allTextContents().then(texts => texts.join(' ')), /Födelsedagen är flyttad/);
      await page.getByRole('button', { name: 'Flytta Mamma', exact: true }).focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); await pause(200);
      assert.equal(await dialog(page).count(), 1, 'Escape cancels the drag without closing the sheet.');
    });
  });

  if (engine === 'chromium') await check('iPhone touch drag holds the row under the finger and reorders without the sheet jumping', async () => {
    await withPage({ birthdays: tagged }, async (page, context) => {
      await openBirthdays(page);
      const handle = page.getByRole('button', { name: 'Flytta Sara', exact: true });
      const before = await handle.boundingBox(); const target = await birthdayRow(page, 'Mamma').boundingBox();
      const cdp = await context.newCDPSession(page);
      const point = { x: before.x + before.width / 2, y: before.y + before.height / 2, radiusX: 5, radiusY: 5, force: 1, id: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }); await pause(260);
      assert.equal(await dialog(page).locator('.birthday-row.is-dragging').count(), 1, 'A short hold on the handle lifts the row.');
      const during = await handle.boundingBox();
      assert.ok(Math.abs(during.y - before.y) < 3, `The row stays under the finger when drop zones appear (moved ${during.y - before.y}px).`);
      for (let step = 1; step <= 14; step++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y + (target.y + 12 - point.y) * step / 14 }] }); await pause(25); }
      await pause(200); await screenshot(page, 'iphone-touch-drag.png');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(300);
      assert.equal(await groupNames(page), 'Familj:Sara,Mamma Vänner:Anna Andersson -:Erik Lindqvist');
      assert.equal(await stored(page), 'sara:Familj mamma:Familj anna:Vänner erik:-');
    }, phone);
  });

  await check('Sort by date reorders every group by the next birthday', async () => {
    await withPage({ birthdays: [person('sara', 'Sara', '2019-03-14', 'Familj'), person('mamma', 'Mamma', '1962-12-03', 'Familj'), person('pappa', 'Pappa', '1960-10-08', 'Familj'), person('erik', 'Erik Lindqvist', '1988-10-07', null)] }, async page => {
      await openBirthdays(page);
      await dialog(page).getByRole('button', { name: 'Sortera efter datum', exact: true }).click(); await pause(150);
      assert.equal(await groupNames(page), 'Familj:Pappa,Mamma,Sara -:Erik Lindqvist');
      assert.match(await page.locator('.toast').textContent(), /Sorterat efter nästa födelsedag/);
    });
  });

  await check('Home shows a countdown per person and filters upcoming birthdays by tag', async () => {
    await withPage({ birthdays: tagged }, async page => {
      const panel = page.getByTestId('upcoming-birthdays');
      assert.deepEqual(await panel.locator('.home-birthday-when strong').allTextContents(), ['I morgon', '14 dagar kvar', '58 dagar kvar', '159 dagar kvar']);
      assert.deepEqual(await panel.getByRole('group', { name: 'Filtrera födelsedagar' }).getByRole('button').allTextContents(), ['Alla', 'Familj2', 'Vänner1']);
      await panel.getByRole('button', { name: /^Familj/ }).click();
      assert.deepEqual(await panel.locator('.home-birthday-row > span:first-child strong').allTextContents(), ['Mamma', 'Sara']);
      assert.equal(await panel.getByRole('button', { name: /^Familj/ }).getAttribute('aria-pressed'), 'true');
      await panel.getByRole('button', { name: /^Familj/ }).click();
      assert.equal((await panel.locator('.home-birthday-row').count()), 4, 'Pressing the active filter again shows everyone.');
      assert.match(await panel.locator('[data-birthday-id="anna"] small').textContent(), /· Vänner$/);
    });
  });

  for (const width of [320, 375, 430]) await check(`Birthday overview and form fit a ${width}px phone without sideways scrolling`, async () => {
    await withPage({ birthdays: [...tagged, person('long', 'Maria-Josefina Carolina Gustafsson Lindqvist', '1975-01-31', 'Bokklubben på torsdagar', ['week', 'two-weeks', 'month'])] }, async page => {
      await openBirthdays(page); await noOverflow(page); await noDialogOverflow(page);
      const handles = await dialog(page).locator('.birthday-drag-handle').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
      assert.ok(handles.every(height => height >= 44), 'Drag handles are at least 44px tall.');
      await screenshot(page, `${width}-birthdays.png`);
      await dialog(page).getByRole('button', { name: 'Redigera födelsedag för Mamma', exact: true }).click(); await noDialogOverflow(page);
      const chipHeights = await dialog(page).locator('.tag-chip').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
      assert.ok(chipHeights.every(height => height >= 44), 'Tag chips are touch-sized.');
      await screenshot(page, `${width}-birthday-form.png`);
    }, { ...phone, viewport: { width, height: 800 } });
  });

  /* ---------------- Notes focus mode ---------------- */
  const note = { id: 'note-one', title: 'Idéer', content: '<div>Första raden.</div>', font: 'system', createdAt: stamp, updatedAt: stamp };
  await check('Notes fullscreen covers the window, fades the chrome while typing, keeps saving and closes with Escape', async () => {
    await withPage({ notes: [note] }, async page => {
      await openOthers(page, 'Notes'); await page.getByRole('button', { name: 'Öppna anteckning Idéer', exact: true }).click();
      await page.getByRole('button', { name: 'Skriv i helskärm', exact: true }).click();
      const editor = page.locator('.note-editor.is-focus'); await editor.waitFor(); await pause(250);
      const box = await editor.boundingBox(); const viewport = page.viewportSize();
      assert.ok(box.x <= 0 && box.y <= 0 && box.width >= viewport.width - 1 && box.height >= viewport.height - 1, 'The editor covers the whole window.');
      assert.equal(await page.locator('.bottom-nav').evaluate(element => getComputedStyle(element).visibility), 'hidden');
      if (engine === 'chromium') assert.equal(await page.evaluate(() => document.fullscreenElement === document.documentElement), true, 'The browser enters real fullscreen where allowed.');
      assert.equal(await page.locator('.note-word-count').textContent(), '2 ord');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Anteckningens text', 'The caret stays in the text.');
      await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(' Tredje tanken här.'); await pause(320);
      assert.equal(await page.locator('.note-toolbar').evaluate(element => getComputedStyle(element).opacity), '0', 'Chrome fades while typing.');
      assert.equal(await page.locator('.note-word-count').textContent(), '5 ord');
      await page.mouse.move(200, 200); await page.mouse.move(260, 260, { steps: 4 }); await pause(320);
      assert.equal(await page.locator('.note-toolbar').evaluate(element => getComputedStyle(element).opacity), '1', 'Moving the mouse brings the chrome back.');
      assert.match((await cache(page)).notes[0].content, /Tredje tanken här\./);
      await screenshot(page, 'notes-focus-desktop.png');
      await page.getByRole('button', { name: 'Lägg till länk', exact: true }).click(); await waitDialog(page);
      await page.keyboard.press('Escape'); await dialog(page).waitFor({ state: 'hidden' });
      assert.equal(await editor.count(), 1, 'Escape in the link picker closes only the picker.');
      await page.keyboard.press('Escape'); await editor.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.fullscreenElement), null, 'Leaving focus mode leaves browser fullscreen.');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('note-focus-open')), false);
      assert.equal(await page.locator('.bottom-nav').evaluate(element => getComputedStyle(element).visibility), 'visible');
      await page.getByRole('button', { name: 'Skriv i helskärm', exact: true }).waitFor();
    });
  });

  await check('Notes fullscreen on iPhone covers the app, keeps safe margins and exits with Avsluta', async () => {
    await withPage({ notes: [note] }, async page => {
      await openOthers(page, 'Notes'); await page.getByRole('button', { name: 'Öppna anteckning Idéer', exact: true }).click();
      await page.getByRole('button', { name: 'Skriv i helskärm', exact: true }).click();
      const editor = page.locator('.note-editor.is-focus'); await editor.waitFor(); await pause(250);
      await noOverflow(page);
      const box = await editor.boundingBox(); assert.ok(box.width >= 429 && box.height >= 931);
      assert.ok(await page.locator('.note-content').evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 16);
      await page.keyboard.type(' Från telefonen.'); await pause(200);
      await screenshot(page, 'notes-focus-iphone.png');
      await page.locator('.note-title-input').tap(); await pause(200);
      await page.getByRole('button', { name: 'Avsluta helskärm', exact: true }).tap(); await editor.waitFor({ state: 'detached' });
      assert.match((await cache(page)).notes[0].content, /Från telefonen\./);
    }, phone);
  });

  /* ---------------- Nutrition ---------------- */
  const habits = [{ id: 'vatten', title: 'Vatten', amount: '2', unit: 'l', createdAt: '2026-09-28T08:00:00.000Z' }, { id: 'vitamin', title: 'Vitaminer', amount: '1', unit: 'st', createdAt: '2026-09-28T08:00:00.000Z' }];
  const completion = (habitId, date) => ({ id: `nutrition:${habitId}:${date}`, habitId, date, completed: true });
  await check('Nutrition week days turn green when everything is done and orange when something is missing, in Kost and on Home', async () => {
    await withPage({ nutritionHabits: habits, nutritionCompletions: [completion('vatten', '2026-10-05'), completion('vitamin', '2026-10-05'), completion('vatten', '2026-10-06')] }, async page => {
      const homeStatus = () => page.getByTestId('home-nutrition').locator('.home-week-day').evaluateAll(days => days.map(day => `${day.dataset.date.slice(-2)}:${day.dataset.status}`).join(' '));
      assert.equal(await homeStatus(), '05:complete 06:incomplete 07:none 08:none 09:none 10:none 11:none');
      await openOthers(page, 'Kost');
      const status = () => page.locator('.nutrition-day').evaluateAll(days => days.map(day => `${day.dataset.date.slice(-2)}:${day.dataset.status}`).join(' '));
      assert.equal(await status(), '05:complete 06:incomplete 07:none 08:none 09:none 10:none 11:none');
      const colour = date => page.locator(`.nutrition-day[data-date="${date}"]`).evaluate(element => getComputedStyle(element).backgroundColor);
      assert.match(await colour('2026-10-05'), /rgba\(56, 133, 96/, 'Complete days are green.');
      assert.match(await colour('2026-10-06'), /rgb\(196, 109, 28\)/, 'The selected incomplete day is solid orange.');
      assert.match(await page.locator('.nutrition-day[data-date="2026-10-06"]').getAttribute('aria-label'), /något saknas$/);
      await page.getByLabel('Klarmarkera Vitaminer', { exact: true }).check(); await pause(150);
      assert.equal(await status(), '05:complete 06:complete 07:none 08:none 09:none 10:none 11:none', 'Finishing the last habit turns today green immediately.');
      await page.getByRole('button', { name: 'Föregående vecka', exact: true }).click();
      assert.equal(await status(), '28:incomplete 29:incomplete 30:incomplete 01:incomplete 02:incomplete 03:incomplete 04:incomplete', 'Past days without logging are orange once the habits existed.');
      await nav(page, 'Home');
      assert.equal(await homeStatus(), '05:complete 06:complete 07:none 08:none 09:none 10:none 11:none');
    });
  });

  /* ---------------- Training ---------------- */
  await check('New training session: recent exercises on click, filtering, keyboard pick, Nivå and next-field flow', async () => {
    await withPage({ workouts: history }, async page => {
      await openOthers(page, 'Träning'); await page.getByRole('button', { name: 'Nytt pass', exact: true }).click(); await waitDialog(page);
      const name = dialog(page).getByRole('combobox', { name: 'Övning 1', exact: true });
      await name.click();
      const list = dialog(page).getByRole('listbox', { name: 'Senast använda övningar' });
      await list.waitFor();
      assert.deepEqual(await list.getByRole('option').locator('strong').allTextContents(), ['Cykel', 'Knäböj', 'Marklyft'], 'Latest used first, each exercise once.');
      assert.match(await list.getByRole('option').first().textContent(), /5 okt\. · 20 min · nivå 8 · 135 BPM/);
      await name.press('Escape');
      assert.equal(await dialog(page).count(), 1, 'Escape closes the suggestions, not the sheet.');
      assert.equal(await list.count(), 0);
      await name.fill('kn');
      const filtered = dialog(page).getByRole('listbox', { name: 'Förslag på övningar' });
      assert.deepEqual(await filtered.getByRole('option').locator('strong').allTextContents(), ['Knäböj']);
      await name.press('ArrowDown'); await name.press('Enter');
      assert.equal(await name.inputValue(), 'Knäböj');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Mängd övning 1', null, { timeout: 2000 }).catch(() => { throw new Error('Picking moves on to the amount.') });
      assert.match(await dialog(page).locator('.workout-last').textContent(), /Senast 5 okt\.: 4 set · 60 kg/);
      await page.keyboard.type('4');
      await dialog(page).getByRole('button', { name: 'Lägg till övning', exact: true }).click();
      const second = dialog(page).getByRole('combobox', { name: 'Övning 2', exact: true });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Övning 2', 'A new exercise is focused.');
      await second.fill('Roddmaskin'); await second.press('Enter');
      assert.equal(await dialog(page).locator('#workout-form').count(), 1, 'Enter in the name moves on instead of saving.');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Mängd övning 2');
      await dialog(page).getByLabel('Belastningsenhet övning 2', { exact: true }).selectOption('level');
      assert.equal(await dialog(page).locator('label[for^="load-"]').nth(1).textContent(), 'Nivå');
      await dialog(page).getByLabel('Belastning övning 2', { exact: true }).fill('7');
      await dialog(page).getByLabel('Mängd övning 2', { exact: true }).fill('15'); await dialog(page).getByLabel('Mängdenhet övning 2', { exact: true }).selectOption('min');
      await dialog(page).getByRole('button', { name: 'Spara pass', exact: true }).click(); await dialog(page).waitFor({ state: 'hidden' });
      const saved = (await cache(page)).workouts.find(workout => !['w-old', 'w-new'].includes(workout.id));
      assert.deepEqual(saved.rows.map(({ id, ...values }) => values), [
        { title: 'Knäböj', amount: '4', amountUnit: 'sets', load: '', loadUnit: 'kg', bpm: '' },
        { title: 'Roddmaskin', amount: '15', amountUnit: 'min', load: '7', loadUnit: 'level', bpm: '' },
      ]);
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied = text; } } }));
      await page.getByRole('button', { name: 'Kopiera råtext för träningspass', exact: true }).first().click(); await pause(100);
      assert.match(await page.evaluate(() => window.__copied), /Roddmaskin · 15 min · nivå 7/);
    });
  });

  await check('Picking a recent exercise adopts its units, and editing an old session does not suggest itself as latest', async () => {
    await withPage({ workouts: history }, async page => {
      await openOthers(page, 'Träning'); await page.getByRole('button', { name: 'Nytt pass', exact: true }).click(); await waitDialog(page);
      await dialog(page).getByRole('combobox', { name: 'Övning 1', exact: true }).click();
      await dialog(page).getByRole('option', { name: /^Cykel/ }).click();
      assert.equal(await dialog(page).getByLabel('Mängdenhet övning 1', { exact: true }).inputValue(), 'min');
      assert.equal(await dialog(page).getByLabel('Belastningsenhet övning 1', { exact: true }).inputValue(), 'level');
      assert.equal(await dialog(page).getByLabel('Belastning övning 1', { exact: true }).inputValue(), '', 'Only units are adopted; values stay for the person to enter.');
      await page.keyboard.press('Escape'); await dialog(page).waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Redigera pass Kondition', exact: true }).click(); await waitDialog(page);
      await dialog(page).getByRole('combobox', { name: 'Övning 1', exact: true }).click();
      await dialog(page).getByRole('combobox', { name: 'Övning 1', exact: true }).fill('');
      assert.deepEqual(await dialog(page).getByRole('option').locator('strong').allTextContents(), ['Knäböj', 'Marklyft']);
      assert.match(await dialog(page).locator('.workout-last').first().textContent().catch(() => ''), /^$|20 sep/);
    });
  });

  for (const width of [320, 375, 430]) await check(`Training form fits a ${width}px phone with 16px inputs and 44px controls`, async () => {
    await withPage({ workouts: history }, async page => {
      await openOthers(page, 'Träning'); await page.getByRole('button', { name: 'Nytt pass', exact: true }).click(); await waitDialog(page);
      await dialog(page).getByRole('button', { name: 'Lägg till övning', exact: true }).click();
      await noOverflow(page); await noDialogOverflow(page);
      const sizes = await dialog(page).locator('input:not([type="checkbox"])').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
      assert.ok(sizes.every(size => size >= 16), `Inputs keep 16px text so iOS does not zoom (${sizes.join(',')}).`);
      const controls = await dialog(page).locator('.workout-value-pair, .workout-row-delete, .exercise-field input').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
      assert.ok(controls.every(height => height >= 44), `Touch targets are at least 44px (${controls.join(',')}).`);
      const pairs = await dialog(page).locator('.workout-value-pair').evaluateAll(elements => elements.map(element => element.scrollWidth <= element.clientWidth + 1));
      assert.ok(pairs.every(Boolean), 'Value and unit fit inside each field.');
      const columns = await dialog(page).locator('.workout-measures').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, 2, 'Phones use two measure columns.');
      await dialog(page).getByRole('combobox', { name: 'Övning 2', exact: true }).click(); await noDialogOverflow(page);
      await screenshot(page, `${width}-training-form.png`);
    }, { ...phone, viewport: { width, height: 820 } });
  });

  await check('Training form uses three measure columns on a laptop', async () => {
    await withPage({}, async page => {
      await openOthers(page, 'Träning'); await page.getByRole('button', { name: 'Nytt pass', exact: true }).click(); await waitDialog(page);
      assert.equal(await dialog(page).locator('.workout-measures').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 3);
      await screenshot(page, 'laptop-training-form.png');
    });
  });

  /* ---------------- Recipes ---------------- */
  const recipes = [
    { id: 'oats', title: 'Overnight oats', url: '', steps: 'Blanda.', labels: ['frukost', 'Snabbt'], createdAt: '2026-10-01T09:00:00.000Z' },
    { id: 'lasagne', title: 'Lasagne', url: '', steps: 'Laga.', labels: ['middag'], createdAt: '2026-10-02T09:00:00.000Z' },
    { id: 'wok', title: 'Wok', url: '', steps: 'Woka.', labels: ['middag', 'snabbt'], createdAt: '2026-10-03T09:00:00.000Z' },
  ];
  await check('Recipe labels are added inline next to Middag; Enter adds, duplicates merge and Escape only cancels', async () => {
    await withPage({ recipes }, async page => {
      await openOthers(page, 'Recept'); await page.getByRole('button', { name: 'Nytt recept', exact: true }).click(); await waitDialog(page);
      assert.equal(await dialog(page).getByLabel(/^Egna etiketter/).count(), 0, 'There is no separate own-labels field.');
      assert.deepEqual(await dialog(page).locator('.tag-options > *').allTextContents(), ['Frukost', 'Snacks', 'Middag', 'Snabbt', 'Lägg till etikett']);
      const sameRow = await dialog(page).locator('.tag-options').evaluate(element => [...element.children].map(child => child.parentElement === element).every(Boolean));
      assert.ok(sameRow, 'The add box sits in the same chip row as Middag.');
      await dialog(page).getByLabel('Titel', { exact: true }).fill('Pad thai');
      await dialog(page).getByRole('button', { name: 'Middag', exact: true }).click();
      await dialog(page).getByRole('button', { name: 'Lägg till etikett', exact: true }).click();
      const box = dialog(page).getByRole('textbox', { name: 'Lägg till etikett', exact: true });
      await box.fill('Asiatiskt'); await box.press('Enter');
      assert.equal(await dialog(page).count(), 1); assert.equal(await dialog(page).locator('#recipe-form').count(), 1, 'Enter adds the label instead of saving.');
      await dialog(page).getByRole('button', { name: 'Lägg till etikett', exact: true }).click(); await box.fill('SNABBT'); await box.press('Enter');
      assert.equal(await dialog(page).getByRole('button', { name: 'Snabbt', exact: true }).getAttribute('aria-pressed'), 'true', 'A typed existing label selects it instead of duplicating it.');
      await dialog(page).getByRole('button', { name: 'Lägg till etikett', exact: true }).click(); await box.fill('Ångra mig'); await box.press('Escape');
      assert.equal(await dialog(page).count(), 1, 'Escape cancels the label box only.');
      assert.equal(await dialog(page).getByRole('button', { name: 'Ångra mig', exact: true }).count(), 0);
      await dialog(page).getByRole('button', { name: 'Spara recept', exact: true }).click(); await dialog(page).waitFor({ state: 'hidden' });
      const saved = (await cache(page)).recipes.find(entry => entry.title === 'Pad thai');
      assert.deepEqual(saved.labels, ['middag', 'Asiatiskt', 'Snabbt']);
    });
  });

  await check('Recipes filter by label with counts; pressing the active filter shows all again', async () => {
    await withPage({ recipes }, async page => {
      await openOthers(page, 'Recept');
      const filters = page.getByRole('group', { name: 'Filtrera recept efter etikett' });
      assert.deepEqual(await filters.getByRole('button').allTextContents(), ['Alla3', 'Frukost1', 'Middag2', 'Snabbt2']);
      await filters.getByRole('button', { name: /^Middag/ }).click();
      assert.deepEqual(await page.locator('[data-recipe-id]').evaluateAll(rows => rows.map(row => row.dataset.recipeId)), ['wok', 'lasagne']);
      assert.match(await page.locator('.others-list-toolbar > span').textContent(), /2 av 3 recept/);
      await filters.getByRole('button', { name: /^Snabbt/ }).click();
      assert.deepEqual(await page.locator('[data-recipe-id]').evaluateAll(rows => rows.map(row => row.dataset.recipeId)), ['wok', 'oats'], 'Label matching ignores case.');
      await filters.getByRole('button', { name: /^Snabbt/ }).click();
      assert.equal(await page.locator('[data-recipe-id]').count(), 3);
    });
    await withPage({ recipes }, async page => {
      await openOthers(page, 'Recept'); await noOverflow(page); await screenshot(page, 'iphone-recipes-filter.png');
    }, phone);
  });

  await check('No uncaught browser exceptions occur in the revised flows', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baseURL, engine, today, results, errors }, null, 2));
  await browser.close();
  console.log(`${results.filter(result => result.passed).length}/${results.length} passed`);
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
