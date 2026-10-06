// Independent end-to-end acceptance checks. Run against a local dev server.
// PLAYWRIGHT_MODULE can point to a bundled Playwright installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const baseURL = process.env.APP_URL || 'http://127.0.0.1:5173';
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const out = path.join(__dirname, 'artifacts', engine);
const results = [];
const errors = [];
fs.mkdirSync(out, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = async (name, fn) => {
  try { await fn(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
};
const cache = page => page.evaluate(() => JSON.parse(localStorage.getItem('forma:workspace:v1:guest')).workspace);
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
const dialog = page => page.getByRole('dialog');
const capture = async (page, filename, fullPage = true) => {
  await page.evaluate(() => document.fonts.ready);
  await pause(250); // Allow the native dialog and browser compositor to settle.
  await page.screenshot({ path: path.join(out, filename), fullPage, animations: 'disabled' });
};
const assertNoOverflow = async page => {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, `Unintended page overflow: ${size.scroll} > ${size.width}`);
};
const title = 'QA – planera nästa helg';

(async () => {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await desktop.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await nav(page, 'Planner');
  await page.locator('[data-task-id="task-light"]').waitFor();
  await capture(page, 'desktop-light.png');

  await check('Desktop layout and footer navigation', async () => {
    await assertNoOverflow(page);
    for (const label of ['Home', 'Planner', 'Projects', 'Others']) assert.equal(await page.locator('.bottom-nav').getByRole('button', { name: label, exact: true }).count(), 1);
  });

  await check('Create a task with every requested field', async () => {
    await page.locator('[data-column-id="todo"]').getByRole('button', { name: 'Lägg till uppgift', exact: true }).click();
    await dialog(page).getByLabel('Titel', { exact: true }).fill(title);
    await dialog(page).getByLabel('Beskrivning', { exact: true }).fill('En privat uppgift som ska bevaras vid återladdning.');
    await dialog(page).getByLabel('Etiketter').fill('Privat, Test, Privat');
    await dialog(page).getByLabel('Deadline', { exact: true }).fill('2026-10-18');
    await dialog(page).getByLabel('Ny deluppgift', { exact: true }).fill('Jämför alternativ');
    await dialog(page).getByRole('button', { name: 'Lägg till deluppgift', exact: true }).click();
    await dialog(page).getByLabel('Jämför alternativ', { exact: true }).check();
    await dialog(page).getByLabel('Ny deluppgift', { exact: true }).fill('Boka det bästa alternativet');
    await dialog(page).getByLabel('Ny kommentar', { exact: true }).fill('Kom ihåg att stämma av budgeten.');
    await dialog(page).getByRole('button', { name: 'Skapa uppgift', exact: true }).click();
    await page.getByRole('button', { name: `Öppna ${title}`, exact: true }).waitFor();
    const task = (await cache(page)).tasks.find(task => task.title === title);
    assert.ok(task);
    assert.equal(task.description, 'En privat uppgift som ska bevaras vid återladdning.');
    assert.deepEqual(task.labels, ['Privat', 'Test']);
    assert.equal(task.deadline, '2026-10-18');
    assert.equal(task.columnId, 'todo');
    assert.equal(task.checklist.length, 2);
    assert.equal(task.checklist[0].completed, true);
    assert.equal(task.comments[0].text, 'Kom ihåg att stämma av budgeten.');
  });

  await check('Task reload, editing and accessible status move', async () => {
    await page.reload();
    await nav(page, 'Planner');
    await page.getByRole('button', { name: `Öppna ${title}`, exact: true }).click();
    assert.equal(await dialog(page).getByLabel('Titel', { exact: true }).inputValue(), title);
    assert.equal(await dialog(page).getByLabel('Deadline', { exact: true }).inputValue(), '2026-10-18');
    assert.equal(await dialog(page).getByLabel('Jämför alternativ', { exact: true }).isChecked(), true);
    await dialog(page).getByText('Kom ihåg att stämma av budgeten.', { exact: true }).waitFor();
    await dialog(page).getByLabel(/^Status/).selectOption('doing');
    await dialog(page).getByRole('button', { name: 'Spara ändringar', exact: true }).click();
    await page.locator('[data-column-id="doing"]').getByRole('button', { name: `Öppna ${title}`, exact: true }).waitFor();
    await page.reload();
    await nav(page, 'Planner');
    await page.locator('[data-column-id="doing"]').getByRole('button', { name: `Öppna ${title}`, exact: true }).waitFor();
  });

  await check('Dialog Escape closes and returns focus', async () => {
    const trigger = page.getByRole('button', { name: `Öppna ${title}`, exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await dialog(page).waitFor();
    assert.equal(await dialog(page).evaluate(element => element.contains(document.activeElement)), true, 'Focus must enter the modal');
    await page.keyboard.press('Escape');
    await dialog(page).waitFor({ state: 'hidden' });
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  });

  await check('Pointer drag between columns changes persisted status', async () => {
    const handle = page.getByRole('button', { name: 'Dra Hitta en lampa till läshörnan', exact: true });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await page.locator('[data-column-id="doing"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
    await pause(100);
    await page.mouse.move(to.x + to.width / 2, to.y + 100, { steps: 15 });
    await page.mouse.up();
    await pause(200);
    assert.equal((await cache(page)).tasks.find(task => task.id === 'task-light').columnId, 'doing');
  });

  await check('Keyboard drag between columns changes status', async () => {
    const handle = page.getByRole('button', { name: 'Dra Välj nästa bok', exact: true });
    await handle.scrollIntoViewIfNeeded();
    await handle.focus();
    await page.keyboard.press('Space');
    await page.locator('.drag-overlay').filter({ hasText: 'Välj nästa bok' }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    await page.getByRole('status').filter({ hasText: 'Över Att göra.' }).waitFor();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('status').filter({ hasText: 'Över Pågår.' }).waitFor();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('forma:workspace:v1:guest')).workspace.tasks.find(task => task.id === 'task-read').columnId === 'doing');
    assert.equal((await cache(page)).tasks.find(task => task.id === 'task-read').columnId, 'doing');
  });

  await check('Add and rename a column', async () => {
    await page.getByRole('button', { name: 'Ny kolumn', exact: true }).click();
    await dialog(page).getByRole('textbox').fill('Väntar');
    await dialog(page).getByRole('button', { name: /Skapa|Lägg till|Spara/ }).click();
    await page.getByRole('button', { name: 'Redigera kolumn Väntar', exact: true }).click();
    await dialog(page).getByRole('textbox').fill('Pausad');
    await dialog(page).getByRole('button', { name: /Spara/ }).click();
    assert.ok((await cache(page)).columns.some(column => column.title === 'Pausad'));
    await assertNoOverflow(page);
  });

  await check('Project creation includes main task and subtasks', async () => {
    await nav(page, 'Projects');
    await page.locator('.new-project-card').click();
    await dialog(page).getByLabel('Projektnamn', { exact: true }).fill('QA – ett eget projekt');
    await dialog(page).getByLabel('Beskrivning', { exact: true }).fill('Ett projekt med en tydlig uppgiftshierarki.');
    await dialog(page).getByLabel('Huvuduppgift', { exact: true }).fill('Planera projektets första steg');
    await dialog(page).getByLabel('Deluppgifter').fill('Skriv ner målet\nVälj en deadline');
    await dialog(page).getByRole('button', { name: 'Skapa projekt', exact: true }).click();
    await dialog(page).getByText('Planera projektets första steg', { exact: true }).waitFor();
    await dialog(page).getByLabel('Skriv ner målet', { exact: true }).check();
    await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).click();
    await page.reload();
    await nav(page, 'Projects');
    await page.getByRole('button', { name: 'Öppna projekt QA – ett eget projekt', exact: true }).click();
    assert.equal(await dialog(page).getByLabel('Skriv ner målet', { exact: true }).isChecked(), true);
    await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).click();
  });

  await check('Projects have independent tasks, status and deletion', async () => {
    const before = structuredClone((await cache(page)).tasks);
    await page.getByRole('button', { name: 'Öppna projekt QA – ett eget projekt', exact: true }).click();
    await dialog(page).getByRole('button', { name: /Planera projektets första steg/ }).click();
    await dialog(page).getByLabel('Titel', { exact: true }).fill('Projektets eget steg');
    await dialog(page).getByLabel(/^Status/).selectOption('done');
    await dialog(page).getByRole('button', { name: 'Spara uppgift', exact: true }).click();
    assert.deepEqual((await cache(page)).tasks, before);
    assert.equal((await cache(page)).projects.find(project => project.title === 'QA – ett eget projekt').tasks[0].completed, true);
    await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).click();
    await nav(page, 'Planner');
    assert.equal(await page.getByRole('button', { name: 'Öppna Projektets eget steg', exact: true }).count(), 0);
    await nav(page, 'Projects');
    await page.getByRole('button', { name: 'Öppna projekt QA – ett eget projekt', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Ta bort projekt', exact: true }).click();
    await dialog(page).locator('.delete-confirm').getByRole('button', { name: 'Ta bort projekt', exact: true }).click();
    assert.deepEqual((await cache(page)).tasks, before);
    await nav(page, 'Planner');
  });

  await check('Delete task requires deliberate confirmation', async () => {
    await nav(page, 'Planner');
    await page.getByRole('button', { name: `Öppna ${title}`, exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Ta bort uppgift', exact: true }).click();
    assert.ok((await cache(page)).tasks.some(task => task.title === title));
    await dialog(page).getByRole('button', { name: 'Behåll', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Ta bort uppgift', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Ta bort', exact: true }).click();
    assert.ok(!(await cache(page)).tasks.some(task => task.title === title));
  });

  await check('Empty task is rejected and Enter creates a titled task', async () => {
    await page.getByRole('button', { name: 'Ny uppgift', exact: true }).click();
    await dialog(page).getByLabel('Titel', { exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await dialog(page).count(), 1);
    assert.ok((await cache(page)).tasks.every(task => task.title.trim()));
    await dialog(page).getByLabel('Titel', { exact: true }).fill('QA – skapad med Enter');
    await page.keyboard.press('Enter');
    await dialog(page).waitFor({ state: 'hidden' });
    assert.ok((await cache(page)).tasks.some(task => task.title === 'QA – skapad med Enter'));
  });

  await check('Task creation works when HTTP browser has no randomUUID', async () => {
    await page.evaluate(() => {
      window.__qaRandomUUID = Crypto.prototype.randomUUID;
      Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true, writable: true });
    });
    await page.getByRole('button', { name: 'Ny uppgift', exact: true }).click();
    await dialog(page).getByLabel('Titel', { exact: true }).fill('QA – skapad på lokal HTTP');
    await dialog(page).getByRole('button', { name: 'Skapa uppgift', exact: true }).click();
    const task = (await cache(page)).tasks.find(task => task.title === 'QA – skapad på lokal HTTP');
    assert.ok(task);
    assert.match(task.id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    await page.evaluate(() => { Crypto.prototype.randomUUID = window.__qaRandomUUID; });
  });

  await check('Search works without project controls on the board or cards', async () => {
    assert.equal(await page.getByLabel('Filtrera projekt', { exact: true }).count(), 0);
    assert.equal(await page.locator('.task-project').count(), 0);
    await page.getByLabel('Sök uppgifter', { exact: true }).fill('läshörnan');
    assert.equal(await page.locator('.task-card:not(.drag-overlay)').count(), 1);
    await page.getByRole('button', { name: /Rensa filter/ }).click();
    assert.equal(await page.locator('[data-task-id]').count(), (await cache(page)).tasks.length);
    await page.locator('[data-task-id="task-light"] .task-open').click();
    assert.equal(await dialog(page).getByLabel('Projekt', { exact: true }).count(), 0);
    await dialog(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
  });

  await check('Profile describes local saving and exports the independent workspace', async () => {
    await nav(page, 'Profile');
    await page.locator('.profile-storage').getByText('Sparas lokalt', { exact: true }).waitFor();
    const cloudConfigured = await page.locator('.auth-form').count() > 0;
    await page.getByText(cloudConfigured ? 'Logga in för att synka mellan dina enheter.' : 'Innehållet sparas i den här webbläsaren.', { exact: true }).waitFor();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportera säkerhetskopia', exact: true }).click();
    const file = await download;
    assert.match(file.suggestedFilename(), /^forma-\d{4}-\d{2}-\d{2}\.json$/);
    await file.saveAs(path.join(out, 'backup.json'));
    const { debriefs, ...savedWorkspace } = JSON.parse(fs.readFileSync(path.join(out, 'backup.json'), 'utf8'));
    assert.deepEqual(savedWorkspace, await cache(page));
    assert.deepEqual(debriefs, []);
  });

  await check('Storage quota failure is visible without a false saved claim', async () => {
    await nav(page, 'Planner');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__qaRestoreStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('forma:workspace:')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.getByRole('button', { name: 'Öppna Hitta en lampa till läshörnan', exact: true }).click();
    await dialog(page).getByLabel('Titel', { exact: true }).fill('QA – osparad ändring');
    await dialog(page).getByRole('button', { name: 'Spara ändringar', exact: true }).click();
    await page.locator('.sync-banner').getByText(/inte.*spar/i).waitFor();
    assert.equal((await cache(page)).tasks.find(task => task.id === 'task-light').title, 'Hitta en lampa till läshörnan');
    assert.doesNotMatch((await page.locator('.toast').allTextContents()).join(' '), /sparad|sparat|sparade/i);
    await page.evaluate(() => window.__qaRestoreStorage());
    if (await dialog(page).count()) await dialog(page).getByRole('button', { name: 'Stäng', exact: true }).click();
    await page.getByRole('button', { name: 'Försök igen', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('forma:workspace:v1:guest')).workspace.tasks.find(task => task.id === 'task-light').title === 'QA – osparad ändring');
    await page.reload();
    await nav(page, 'Planner');
    await page.getByRole('button', { name: 'Öppna QA – osparad ändring', exact: true }).waitFor();
  });

  const mobile = await browser.newContext({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(10000);
  phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(baseURL);
  await nav(phone, 'Planner');
  await phone.locator('[data-task-id="task-light"]').waitFor();
  await capture(phone, 'mobile-light.png');

  if (engine === 'chromium') await check('Native mobile touch drag autoscrolls and changes status', async () => {
    const handle = phone.getByRole('button', { name: 'Dra Hitta en lampa till läshörnan', exact: true });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const cdp = await mobile.newCDPSession(phone);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2, radiusX: 5, radiusY: 5, force: 1, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await pause(230);
    assert.equal(await phone.locator('.is-dragging').count(), 1);
    for (let step = 1; step <= 12; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, x: start.x + (431 - start.x) * step / 12 }] });
      await pause(40);
    }
    await pause(500);
    await phone.screenshot({ path: path.join(out, 'mobile-touch-drag.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(150);
    const task = (await cache(phone)).tasks.find(task => task.id === 'task-light');
    assert.notEqual(task.columnId, 'todo');
    assert.ok((await cache(phone)).columns.some(column => column.id === task.columnId), 'Touch drag must persist a valid destination column.');
    await phone.locator(`[data-column-id="${task.columnId}"] [data-task-id="task-light"]`).waitFor();
    await cdp.detach();
  });

  await check('iPhone layout, column tabs and task editing', async () => {
    await assertNoOverflow(phone);
    const searchSize = await phone.getByLabel('Sök uppgifter', { exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.ok(searchSize >= 16, 'Mobile search input should avoid Safari autozoom');
    assert.equal(await phone.getByLabel('Filtrera projekt', { exact: true }).count(), 0);
    assert.equal(await phone.locator('.mobile-column-tabs').isVisible(), true);
    await phone.locator('.mobile-column-tabs').getByRole('button', { name: /Pågår/ }).tap();
    await pause(400);
    const board = await phone.locator('.board').evaluate(element => element.scrollLeft);
    assert.ok(board > 100, 'Status tab should navigate to a different column');
    await phone.getByRole('button', { name: 'Öppna Gör plats på skrivbordet', exact: true }).tap();
    await dialog(phone).waitFor();
    await pause(250);
    const selectHeights = await dialog(phone).locator('select').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(selectHeights.every(height => height >= 44), `Modal select heights: ${selectHeights.join(', ')}`);
    const titleStyle = await dialog(phone).getByLabel('Titel', { exact: true }).evaluate(element => ({ size: parseFloat(getComputedStyle(element).fontSize), width: element.getBoundingClientRect().width }));
    assert.ok(titleStyle.size >= 16, 'Mobile input text should avoid Safari autozoom');
    assert.ok(titleStyle.width > 200);
    await capture(phone, 'mobile-task-editor.png', false);
    await dialog(phone).getByRole('button', { name: 'Stäng', exact: true }).tap();
    await nav(phone, 'Projects');
    await assertNoOverflow(phone);
    await capture(phone, 'mobile-projects.png');
    await nav(phone, 'Profile');
    await assertNoOverflow(phone);
    await capture(phone, 'mobile-profile.png');
  });

  await check('Dark theme persists after reload and system follows appearance', async () => {
    await nav(phone, 'Profile');
    await phone.getByRole('button', { name: 'Mörkt', exact: true }).tap();
    assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await phone.reload();
    await nav(phone, 'Planner');
    assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await capture(phone, 'mobile-dark.png');
    await nav(phone, 'Profile');
    await phone.getByRole('button', { name: 'System', exact: true }).tap();
    await phone.emulateMedia({ colorScheme: 'dark' });
    await pause(100);
    assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await phone.emulateMedia({ colorScheme: 'light' });
    await pause(100);
    assert.equal(await phone.evaluate(() => document.documentElement.dataset.theme), 'light');
  });

  await check('No uncaught browser exceptions', async () => assert.deepEqual(errors, []));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ baseURL, results, errors }, null, 2));
  await browser.close();
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
