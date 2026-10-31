const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const key = 'forma:workspace:v1:guest', date = '2026-10-31';
const task = (id, title, startTime, endTime, priority, color, label) => ({ id, title, description: 'Behåll beskrivningen', columnId: 'todo', labels: ['Ursprunglig'], checklist: [{ id: id+'-item', title: 'Deluppgift', completed: false }], deadline: '2026-11-01', deadlineTime: '16:00', comments: [], projectId: null, priority, createdAt: '2026-10-30T09:00:00.000Z', schedule: { date, startTime, endTime, color, label } });
const workspace = { columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'gray' }], tasks: [task('focus','Fokustid','09:00','10:00','high','blue','Arbete'), task('other','Ärenden','11:00','12:00','medium','rose','Privat'), task('later','Träning','14:00','15:00','low','sage','Träning'), task('odd','Kort aktivitet','16:10','16:25',null,'gray','')], projects: [] };
(async () => {
  const browser = await engine.launch();
  try {
    for (const [width, touch] of [[1280, false], [390, true]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
      await context.addInitScript(({ key, workspace }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, workspace, revision: null, dirty: false })); localStorage.setItem('forma-theme', 'bento-aurora'); }, { key, workspace });
      const page = await context.newPage(); page.setDefaultTimeout(8000); await page.clock.setFixedTime(new Date(date+'T09:00:00+01:00'));
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, key);
      const current = async () => (await saved()).tasks.find(task => task.id === 'focus');
      const card = () => page.locator('.schedule-block[data-task-id="focus"]');
      const grid = page.locator('.schedule-grid');
      const deltaY = delta => grid.evaluate((el, delta) => el.getBoundingClientRect().height * delta / (Number(el.dataset.endMinute) - Number(el.dataset.startMinute)), delta);
      const drag = async (selector, delta, beforeDrop) => {
        const box = await selector.boundingBox(), dy = await deltaY(delta);
        const x = box.x + box.width * .3, y = box.y + box.height * .3;
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + dy, { steps: 6 });
        if (beforeDrop) await beforeDrop();
        await page.mouse.up();
      };
      await page.goto(base); await page.locator('.app-shell[aria-busy="false"]').waitFor();
      await page.locator('.bottom-nav').getByRole('button', { name: 'Schema', exact: true }).click();
      const oddBefore = (await saved()).tasks.find(task => task.id === 'odd').schedule;
      await page.locator('[data-task-id="odd"]').getByRole('slider').click();
      assert.deepEqual((await saved()).tasks.find(task => task.id === 'odd').schedule, oddBefore, 'Clicking the resize handle must not round an existing time.');
      assert.equal(await card().getAttribute('data-color'), 'blue');
      const styles = await card().evaluate(el => ({ fill: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderLeftColor, width: getComputedStyle(el).borderLeftWidth }));
      assert.equal(styles.fill, 'rgb(220, 234, 251)'); assert.equal(styles.border, 'rgb(207, 78, 78)'); assert.equal(styles.width, '4px');
      assert.equal(await page.locator('[data-task-id="other"]').evaluate(el => getComputedStyle(el).borderLeftColor), 'rgb(216, 121, 34)');
      assert.equal(await page.locator('[data-task-id="later"]').evaluate(el => getComputedStyle(el).borderLeftColor), 'rgb(61, 152, 102)');
      await drag(card().locator('.schedule-block-open'), 90, async () => {
        assert.equal(await page.locator('.schedule-edit-feedback').textContent(), '10:30–11:30');
        assert.equal((await current()).schedule.startTime, '09:00', 'Preview must not persist before drop.');
      });
      assert.equal((await current()).schedule.startTime, '10:30'); assert.equal((await current()).schedule.endTime, '11:30');
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.ok((await card().boundingBox()).width < (await grid.boundingBox()).width * .6, 'Overlap gets its own column.');
      await drag(card().locator('.schedule-resize-handle'), 60);
      assert.equal((await current()).schedule.startTime, '10:30'); assert.equal((await current()).schedule.endTime, '12:30');
      const beforeCancel = (await current()).schedule;
      await drag(card().locator('.schedule-block-open'), -90, async () => { await page.keyboard.press('Escape'); });
      assert.deepEqual((await current()).schedule, beforeCancel);
      await card().locator('.schedule-block-open').press('Alt+ArrowUp');
      assert.equal((await current()).schedule.startTime, '10:00'); assert.equal((await current()).schedule.endTime, '12:00');
      await card().getByRole('slider', { name: 'Sluttid för Fokustid' }).press('ArrowDown');
      assert.equal((await current()).schedule.endTime, '12:30');
      await card().locator('.schedule-block-open').click();
      const dialog = page.getByRole('dialog', { name: 'Uppgift', exact: true }); await dialog.waitFor();
      await dialog.getByRole('textbox', { name: 'Etikett', exact: true }).fill('Projekt');
      await dialog.getByRole('group', { name: 'Kortfärg', exact: true }).getByRole('button', { name: 'Lila', exact: true }).click();
      await dialog.getByRole('group', { name: 'Prioritet', exact: true }).getByRole('button', { name: 'Medel', exact: true }).click();
      await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();
      assert.equal((await current()).schedule.color, 'violet'); assert.equal((await current()).schedule.label, 'Projekt'); assert.equal((await current()).priority, 'medium');
      assert.equal(await card().getAttribute('data-color'), 'violet');
      await drag(card().locator('.schedule-block-open'), 30);
      assert.equal((await current()).schedule.color, 'violet'); assert.equal((await current()).schedule.label, 'Projekt');
      const persisted = await current();
      const original = workspace.tasks[0];
      for (const field of ['description','columnId','labels','checklist','deadline','deadlineTime','comments','projectId','createdAt']) assert.deepEqual(persisted[field], original[field]);
      await page.reload(); await page.locator('.app-shell[aria-busy="false"]').waitFor();
      await page.locator('.bottom-nav').getByRole('button', { name: 'Schema', exact: true }).click();
      assert.deepEqual((await current()).schedule, persisted.schedule);
      if (touch && process.env.BROWSER_ENGINE !== 'webkit') {
        const cdp = await context.newCDPSession(page);
        const box = await card().locator('.schedule-block-open').boundingBox(), dy = await deltaY(60);
        const x = box.x + box.width * .25, y = box.y + box.height * .3;
        const sendTouch = (type, py) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: py }] });
        await sendTouch('touchStart', y); await page.waitForTimeout(400); await sendTouch('touchMove', y + dy); await sendTouch('touchEnd', y + dy);
        assert.equal((await current()).schedule.startTime, '11:30'); assert.equal((await current()).schedule.endTime, '14:00');
        const handle = await card().locator('.schedule-resize-handle').boundingBox();
        const hx = handle.x + handle.width / 2, hy = handle.y + handle.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hx, y: hy }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hx, y: hy + await deltaY(30) }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal((await current()).schedule.endTime, '14:30'); assert.equal(await page.getByRole('dialog').count(), 0);
      }
      await page.getByRole('button', { name: 'Planera 08:00', exact: true }).click();
      const create = page.getByRole('dialog', { name: 'Planera uppgift', exact: true });
      await create.getByRole('textbox', { name: 'Titel', exact: true }).fill('Nytt färgat event');
      await create.getByRole('textbox', { name: 'Etikett', exact: true }).fill('Familj');
      await create.getByRole('group', { name: 'Kortfärg', exact: true }).getByRole('button', { name: 'Rosa', exact: true }).click();
      await create.getByRole('button', { name: 'Spara', exact: true }).click();
      assert.equal((await saved()).tasks.find(t => t.title === 'Nytt färgat event').schedule.color, 'rose');
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1), false);
      assert.equal(await grid.evaluate(el => el.scrollHeight > el.clientHeight + 1), false);
      if (!touch) {
        const peer = await context.newPage(); await peer.goto(base); await page.bringToFront();
        const beforePeer = (await current()).schedule;
        await drag(card().locator('.schedule-block-open'), 30, async () => {
          await peer.evaluate(key => {
            const cache = JSON.parse(localStorage.getItem(key));
            cache.workspace.tasks = cache.workspace.tasks.map(task => task.id === 'focus' ? { ...task, schedule: { ...task.schedule, color: 'amber', label: 'Ändrat i annan flik' } } : task);
            localStorage.setItem(key, JSON.stringify(cache));
          }, key);
          await page.locator('.schedule-edit-feedback').waitFor({ state: 'detached' });
        });
        assert.deepEqual((await current()).schedule, { ...beforePeer, color: 'amber', label: 'Ändrat i annan flik' });
        await peer.close();
      }
      assert.deepEqual(errors, []);
      if (process.env.SCHEDULE_SHOTS) await page.screenshot({ path: `/tmp/forma-schedule-editing-${width}.png` });
      console.log(`PASS ${width}px: event move/resize, live preview, Escape, keyboard, label/color/priority, preserved fields, reload and one-page layout`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
