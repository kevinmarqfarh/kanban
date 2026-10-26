const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const { routeWeather } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const key = 'forma:workspace:v1:guest', date = '2026-10-26';
const out = path.join(__dirname, 'artifacts', engine, 'schedule-desktop');
fs.mkdirSync(out, { recursive: true });
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }], projects: [],
  tasks: [{ id: 'existing', title: 'Befintligt möte', description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: '2026-10-01T09:00:00.000Z', schedule: { date, startTime: '09:00', endTime: '10:00' } }]
} };
const results = [], contexts = new Set();
let browser;
async function open(width = 1440, workspace = fixture.workspace) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
  contexts.add(context);
  await context.addInitScript(({ key, fixture }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture)); localStorage.setItem('forma-theme', 'light'); }, { key, fixture: { ...fixture, workspace } });
  await routeWeather(context, {}, date+'T08:00:00+01:00');
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(date+'T08:00:00+01:00') });
  await page.goto(base); await page.locator('.loading-notice').waitFor({ state: 'detached' });
  await page.locator('.bottom-nav').getByRole('button', { name: 'Schema', exact: true }).click();
  await page.locator('.schedule-grid').waitFor();
  return { page, errors };
}
const modal = page => page.getByRole('dialog', { name: 'Planera uppgift', exact: true });
const cache = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, key);
async function point(page, minute) {
  return page.locator('.schedule-grid').evaluate((el, minute) => { const r = el.getBoundingClientRect(); return { x: r.left+r.width*.6, y: r.top+minute/60*44 }; }, minute);
}
async function times(page, start, end) {
  await modal(page).waitFor();
  assert.equal(await modal(page).getByLabel('Från', { exact: true }).inputValue(), start);
  assert.equal(await modal(page).getByLabel('Till', { exact: true }).inputValue(), end);
}
async function close(page) { await modal(page).getByRole('button', { name: 'Avbryt', exact: true }).click(); await modal(page).waitFor({ state: 'detached' }); }
async function drag(page, startMinute, endMinute) {
  const from = await point(page,startMinute), to = await point(page,endMinute);
  await page.mouse.move(from.x,from.y); await page.mouse.down();
  // No hold or timer advance: mouse dragging must work immediately.
  await page.mouse.move(to.x,to.y,{ steps: 4 }); await page.mouse.up();
}
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log('PASS '+name); }
  catch (error) { results.push({ name, passed: false, error: String(error.stack) }); console.log('FAIL '+name+': '+error.stack); }
  finally { for (const context of contexts) await context.close(); contexts.clear(); }
}
(async () => {
  browser = await playwright[engine].launch({ headless: true });
  try {
    await check('A simple PC grid click creates a half-hour draft, focuses the title, and saves through reload', async () => {
      const { page, errors } = await open(1280);
      const p = await point(page, 8*60+10); await page.mouse.click(p.x,p.y);
      await times(page,'08:00','08:30');
      const title = modal(page).getByLabel('Titel', { exact: true }); assert.equal(await title.evaluate(el => el === document.activeElement), true);
      await title.fill('Plan från klick'); await modal(page).getByRole('button', { name: 'Spara', exact: true }).click();
      await modal(page).waitFor({ state: 'detached' });
      const saved = (await cache(page)).tasks.find(t => t.title === 'Plan från klick');
      assert.deepEqual(saved.schedule,{ date, startTime: '08:00', endTime: '08:30' }); assert.equal(saved.deadline,null);
      const weeklyColumn = (await cache(page)).columns.find(column => column.title === 'Denna veckan');
      assert.ok(weeklyColumn); assert.equal(saved.columnId,weeklyColumn.id);
      assert.equal((await cache(page)).columns.length,fixture.workspace.columns.length+1);
      await page.locator('.bottom-nav').getByRole('button', { name: 'Planner', exact: true }).click();
      await page.getByRole('region', { name: 'Denna veckan', exact: true }).getByRole('button', { name: 'Öppna Plan från klick', exact: true }).waitFor();
      await page.reload(); await page.locator('.loading-notice').waitFor({ state: 'detached' });
      assert.equal((await cache(page)).tasks.find(task => task.id === saved.id).columnId,weeklyColumn.id);
      await page.locator('.bottom-nav').getByRole('button', { name: 'Schema', exact: true }).click();
      await page.locator('.schedule-block').filter({ hasText: 'Plan från klick' }).waitFor(); assert.deepEqual(errors,[]);
    });
    await check('Immediate downward and upward mouse drags choose the duration without holding or adding an extra slot', async () => {
      const { page, errors } = await open();
      await drag(page,8*60,10*60+30); await times(page,'08:00','10:30'); await close(page);
      await drag(page,11*60,10*60); await times(page,'10:00','11:00');
      await page.screenshot({ path: path.join(out,'drag-duration.png'), animations: 'disabled' });
      await close(page); assert.equal((await cache(page)).tasks.length,1); assert.deepEqual(errors,[]);
      assert.deepEqual((await cache(page)).columns,fixture.workspace.columns);
    });
    await check('New plans reuse the named week column; planning an existing task preserves its column and details', async () => {
      for (const columnTitle of ['Denna veckan','Denna vecka']) {
        const weeklyColumn = { id: 'custom-week-column', title: columnTitle, color: 'sand' };
        const workspace = { ...fixture.workspace, columns: [weeklyColumn,...fixture.workspace.columns] };
        const { page, errors } = await open(1440,workspace);
        for (const title of ['Veckans första plan','Veckans andra plan']) {
          await page.getByRole('button', { name: '+ Planera', exact: true }).click();
          await modal(page).getByLabel('Titel', { exact: true }).fill(title);
          await modal(page).getByRole('button', { name: 'Spara', exact: true }).click();
          await modal(page).waitFor({ state: 'detached' });
          assert.equal((await cache(page)).tasks.find(task => task.title === title).columnId,weeklyColumn.id);
        }
        await page.getByRole('button', { name: '+ Planera', exact: true }).click();
        await modal(page).getByRole('combobox', { name: /^Befintlig uppgift/ }).selectOption('existing');
        await modal(page).getByLabel('Ange tid', { exact: true }).check();
        await modal(page).getByLabel('Från', { exact: true }).fill('10:00');
        await modal(page).getByLabel('Till', { exact: true }).fill('11:00');
        await modal(page).getByRole('button', { name: 'Spara', exact: true }).click();
        await modal(page).waitFor({ state: 'detached' });
        const saved = await cache(page);
        assert.deepEqual(saved.columns,workspace.columns);
        assert.deepEqual(saved.tasks.find(task => task.id === 'existing'),{ ...fixture.workspace.tasks[0],schedule:{ date,startTime:'10:00',endTime:'11:00' } });
        assert.deepEqual(errors,[]);
      }
    });
    await check('Day and week plans on small screens share the week column while retaining their dates and scope', async () => {
      const { page, errors } = await open(390);
      await page.getByRole('button', { name: '+ Planera', exact: true }).click();
      await modal(page).getByLabel('Titel', { exact: true }).fill('Plan för veckan');
      await modal(page).getByRole('combobox', { name: /^Planering/ }).selectOption('week');
      await modal(page).getByRole('button', { name: 'Spara', exact: true }).click();
      await modal(page).waitFor({ state: 'detached' });
      await page.getByRole('button', { name: '+ Planera', exact: true }).click();
      await modal(page).getByLabel('Titel', { exact: true }).fill('Plan för onsdag');
      await modal(page).getByLabel('Datum', { exact: true }).fill('2026-10-28');
      await modal(page).getByRole('button', { name: 'Spara', exact: true }).click();
      await modal(page).waitFor({ state: 'detached' });
      const saved = await cache(page), weekly = saved.tasks.find(task => task.title === 'Plan för veckan'), day = saved.tasks.find(task => task.title === 'Plan för onsdag');
      assert.equal(saved.columns.filter(column => column.title === 'Denna veckan').length,1);
      assert.equal(weekly.columnId,day.columnId);
      assert.equal(day.columnId,saved.columns.find(column => column.title === 'Denna veckan').id);
      assert.deepEqual(weekly.schedule,{ date,scope:'week' }); assert.deepEqual(day.schedule,{ date:'2026-10-28' });
      assert.deepEqual(errors,[]);
    });
    await check('Escape cancels the active mouse gesture and right-click never creates a task', async () => {
      const { page, errors } = await open(); const p = await point(page,8*60);
      await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(p.x,p.y+44);
      assert.equal(await page.locator('.schedule-selection').count(),1);
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert.equal(await page.locator('.schedule-selection').count(),0); assert.equal(await modal(page).count(),0);
      await page.mouse.click(p.x,p.y,{ button: 'right' }); assert.equal(await modal(page).count(),0);
      assert.equal((await cache(page)).tasks.length,1); assert.deepEqual(errors,[]);
    });
    await check('Existing blocks and keyboard hour buttons keep their actions, and the last half-hour ends at midnight', async () => {
      const { page, errors } = await open();
      await page.locator('.schedule-block').filter({ hasText: 'Befintligt möte' }).click();
      await page.getByRole('dialog', { name: 'Uppgift', exact: true }).waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Avbryt', exact: true }).click();
      const hour = page.getByRole('button', { name: 'Planera 08:00', exact: true }); await hour.focus(); await page.keyboard.press('Enter');
      await times(page,'08:00','09:00'); await close(page);
      await page.locator('.schedule-scroll').evaluate(el => el.scrollTop=el.scrollHeight-el.clientHeight);
      const p=await point(page,23*60+45); await page.mouse.click(p.x,p.y); await times(page,'23:30','24:00');
      await close(page); assert.equal((await cache(page)).tasks.length,1); assert.deepEqual(errors,[]);
    });
  } finally { await browser.close(); fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)); }
  console.log(`${results.filter(r=>r.passed).length}/${results.length} PC schedule scenarios passed (${engine}).`);
  process.exitCode=results.every(r=>r.passed)?0:1;
})().catch(error=>{console.error(error);process.exitCode=1;});
