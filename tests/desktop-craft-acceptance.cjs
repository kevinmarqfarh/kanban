// Product acceptance: prove that the PC work surface is visible, readable and operable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { routeWeather } = require('./helpers/weather-mock.cjs');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'desktop-craft');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest', date = '2026-10-26', createdAt = '2026-10-01T09:00:00.000Z';
const task = (id, title, extra = {}) => ({ id, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt, ...extra });
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'doing', title: 'Pågår', color: 'blue' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
  tasks: [task('morning', 'Morgonmöte', { schedule: { date, startTime: '09:00', endTime: '10:00' }, priority: 'high' }), task('customer', 'Kundmöte', { schedule: { date, startTime: '09:30', endTime: '10:30' } }), task('free', 'Skriv arbetsplan', { deadline: '2026-11-06', priority: 'high' }), task('week', 'Läs underlag', { schedule: { date, scope: 'week' } })],
  projects: [{ id: 'project', title: 'Arbetsrummet', description: 'Planera en lugn arbetsplats', icon: 'home', color: 'gray', deadline: null, createdAt, tasks: [] }],
  notes: [{ id: 'note', title: 'Veckans fokus', content: '<p>Skriv planen och skapa tid för arbete.</p>', font: 'system', createdAt, updatedAt: createdAt }], birthdays: [], birthdayNotifications: [], nutritionHabits: [], nutritionCompletions: []
} };
let browser;
const results = [], measurements = [], contexts = new Set();
async function open({ width = 1440, height = 900, theme = 'light', touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, locale: 'sv-SE', timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
  contexts.add(context);
  await routeWeather(context, {}, date+'T09:00:00+01:00');
  await context.addInitScript(({ key, fixture, theme }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(fixture)); localStorage.setItem('forma-theme', theme); }, { key, fixture, theme });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(date+'T09:00:00+01:00') });
  await page.goto(base); await page.locator('.loading-notice').waitFor({ state: 'detached' });
  return { page, context, errors };
}
const nav = (page, name) => page.locator('.bottom-nav').getByRole('button', { name, exact: true });
const dialog = page => page.getByRole('dialog');
async function planning(page) { await nav(page, 'Planner').click(); await page.getByRole('button', { name: 'Veckoplanering', exact: true }).click(); }
const cached = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, key);
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
async function check(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log('PASS '+name); }
  catch (error) { results.push({ name, passed: false, error: String(error.stack) }); console.log('FAIL '+name+': '+error.stack); }
  finally { for (const context of contexts) await context.close(); contexts.clear(); }
}
(async () => {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
  try {
    await check('The actual planning surface starts within 360px, readable cards and one primary action at PC widths', async () => {
      for (const [width,height] of [[1100,800],[1280,800],[1440,900],[1920,1080]]) {
        const { page, errors } = await open({ width,height }); await planning(page);
        const geometry = await page.locator('.wp-days').boundingBox();
        assert.ok(geometry.y <= 360, `At ${width} calendar starts ${geometry.y}px down`);
        const card = await page.locator('.wp-days .wp-task').first().boundingBox();
        assert.ok(card.y+card.height <= height, 'A full actionable task is visible without vertical scrolling');
        assert.ok(await page.locator('.wp-task-title').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 14);
        assert.ok(await page.locator('.wp-task-meta').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 12);
        assert.equal(await page.locator('.main-content .button.primary:visible').count(), 1);
        await noOverflow(page);
        await page.getByRole('button', { name: /^Planeringskö/ }).click();
        const opened = await page.locator('.wp-days').boundingBox();
        assert.ok(Math.abs(opened.y-geometry.y) <= 8, 'Opening the queue keeps the work at the same vertical position');
        await noOverflow(page); assert.deepEqual(errors, []);
      }
    });
    await check('Complete directly from the week and undo without losing the schedule', async () => {
      const { page } = await open(); await planning(page);
      const before = (await cached(page)).tasks.find(t => t.id === 'morning');
      await page.getByRole('button', { name: 'Markera Morgonmöte som klar', exact: true }).click();
      assert.equal((await cached(page)).tasks.find(t => t.id === 'morning').columnId, 'done');
      await page.locator('.toast-undo').getByRole('button', { name: 'Ångra', exact: true }).click();
      assert.deepEqual((await cached(page)).tasks.find(t => t.id === 'morning'), before);
      await page.getByRole('button', { name: 'Markera Morgonmöte som klar', exact: true }).waitFor();
    });
    await check('Planning dialog focuses the useful field and previews duration and actual conflicts before saving', async () => {
      const { page } = await open(); await planning(page);
      await page.getByRole('button', { name: 'Planera Morgonmöte', exact: true }).click();
      assert.equal(await dialog(page).getByLabel('Datum', { exact: true }).evaluate(el => el === document.activeElement), true);
      assert.match(await dialog(page).locator('.schedule-editor-preview').textContent(), /1 h/);
      assert.match(await dialog(page).locator('.schedule-editor-conflicts').textContent(), /Kundmöte/);
      await dialog(page).getByLabel('Från', { exact: true }).fill('08:30');
      await dialog(page).getByLabel(/^Till/).fill('09:30');
      assert.equal(await dialog(page).locator('.schedule-editor-conflicts').count(), 0, 'Adjacent appointments do not conflict');
      await dialog(page).getByLabel('Från', { exact: true }).fill('09:00');
      await dialog(page).getByLabel(/^Till/).fill('10:00');
      await dialog(page).getByRole('button', { name: 'Spara planering', exact: true }).click();
      await dialog(page).waitFor({ state: 'detached' });
      assert.equal((await cached(page)).tasks.find(t => t.id === 'morning').schedule.startTime, '09:00', 'An intentional overlap may be saved');
      await page.getByRole('button', { name: 'Planera 2026-10-27', exact: true }).click();
      assert.equal(await dialog(page).getByLabel('Titel', { exact: true }).evaluate(el => el === document.activeElement), true);
    });
    await check('PC keyboard shortcuts work, keep typing safe and restore focus on dialog close', async () => {
      const { page } = await open(); await planning(page);
      await page.locator('h1').click(); await page.keyboard.press('/');
      const search = page.getByRole('searchbox', { name: 'Sök uppgifter', exact: true });
      assert.equal(await search.evaluate(el => el === document.activeElement), true);
      await search.fill('n'); assert.equal(await dialog(page).count(), 0);
      await search.fill(''); await search.blur(); await page.keyboard.press('n');
      await page.getByRole('dialog', { name: 'Ny uppgift', exact: true }).waitFor();
      await page.keyboard.press('Escape'); await dialog(page).waitFor({ state: 'detached' });
      assert.equal(await page.locator('.bottom-nav .desktop-nav-footer').count(), 0);
      const settings = page.getByRole('button', { name: 'Öppna inställningar', exact: true });
      await settings.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog', { name: 'Inställningar', exact: true }).waitFor();
      assert.equal(await dialog(page).locator('.profile-sync').isVisible(), true);
      await dialog(page).locator('.profile-shortcuts > summary').focus(); await page.keyboard.press('Enter');
      assert.equal(await dialog(page).locator('.shortcut-list').isVisible(), true);
      await page.keyboard.press('n'); assert.equal(await dialog(page).count(), 1, 'Shortcuts are inactive inside settings');
      await page.keyboard.press('Escape'); await dialog(page).waitFor({ state: 'detached' });
      assert.equal(await settings.evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('?'); await page.getByRole('dialog', { name: 'Kortkommandon', exact: true }).waitFor();
      await page.keyboard.press('n'); assert.equal(await dialog(page).count(), 1, 'Shortcuts are inactive inside a dialog');
      await page.keyboard.press('Escape'); await dialog(page).waitFor({ state: 'detached' });
      assert.equal(await settings.evaluate(el => el === document.activeElement), true);
    });
    await check('PC Home surfaces focus before context, projects have useful search, notes retain their list', async () => {
      const { page, errors } = await open();
      const focus = await page.getByTestId('briefing-focus').boundingBox();
      assert.ok(focus.y < 600, `Daily focus starts ${focus.y}px down`);
      await page.getByRole('button', { name: 'Edit Home', exact: true }).click();
      await page.getByLabel('Bredd för Gör först', { exact: true }).selectOption('6');
      await page.getByRole('button', { name: 'Spara layout', exact: true }).click();
      await page.reload(); await page.getByTestId('home-overview').waitFor();
      assert.equal(await page.locator('[data-module="focus"]').evaluate(el => el.style.getPropertyValue('--module-columns')), '6');
      await nav(page, 'Projects').click();
      const search = await page.getByLabel('Sök projekt', { exact: true }).boundingBox(); assert.ok(search.width >= 280);
      await nav(page, 'Others').click(); await page.getByRole('button', { name: /^Anteckningar(?:\s|$)/ }).click();
      await page.getByRole('button', { name: 'Öppna anteckning Veckans fokus', exact: true }).click();
      assert.equal(await page.locator('.note-editor.is-focus').count(), 0);
      assert.equal(await page.locator('.notes-sidebar').isVisible(), true);
      await page.getByRole('textbox', { name: 'Anteckningens text', exact: true }).fill('En ny plan med n och / i löpande text.');
      assert.equal(await dialog(page).count(), 0);
      assert.match((await cached(page)).notes[0].content, /ny plan/);
      await page.getByRole('button', { name: 'Öppna fokusläge', exact: true }).click();
      await page.locator('.note-editor.is-focus').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.note-editor.is-focus').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.notes-sidebar').isVisible(), true);
      assert.match((await cached(page)).notes[0].content, /ny plan/);
      await noOverflow(page); assert.deepEqual(errors, []);
    });
    await check('Touch phones and tablets keep the full-screen note flow and preserve text on return', async () => {
      for (const [width,height] of [[390,844],[1024,768]]) {
        const { page, errors } = await open({ width,height,touch:true });
        await nav(page, 'Others').click(); await page.getByRole('button', { name: /^Anteckningar(?:\s|$)/ }).click();
        await page.getByRole('button', { name: 'Öppna anteckning Veckans fokus', exact: true }).click();
        await page.locator('.note-editor.is-focus').waitFor();
        await page.getByRole('textbox', { name: 'Anteckningens text', exact: true }).fill('Sparat på touchskärmen.');
        await page.locator('.note-editor').getByRole('button', { name: 'Anteckningar', exact: true }).click();
        await page.locator('.note-editor').waitFor({ state: 'detached' });
        assert.match((await cached(page)).notes[0].content, /touchskärmen/);
        await noOverflow(page); assert.deepEqual(errors, []);
      }
    });
    await check('Light, dark and Bento planning text meet measured surface contrast; all actions remain visible', async () => {
      for (const theme of ['light','dark','bento','bento-aurora','bento-space-gray']) {
        const { page, errors } = await open({ theme }); await planning(page);
        const contrast = await page.evaluate(() => {
          const rgba = value => { const m = value.match(/^rgba?\(([^)]+)\)$/); if (!m) throw new Error('Unsupported measured color '+value); const n = m[1].split(',').map(Number); return [n[0],n[1],n[2],n[3] ?? 1]; };
          const over = (fg,bg) => [0,1,2].map(i => fg[i]*fg[3]+bg[i]*(1-fg[3])).concat(1);
          const luminance = color => color.slice(0,3).map(c => c/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
          return ['.wp-days .wp-task-title','.wp-days .wp-task-time','.wp-days .wp-task-meta','.wp-day-stats','.wp-task-warning'].map(selector => {
            const element = document.querySelector(selector), layers=[];
            for(let current=element;current;current=current.parentElement) layers.push(rgba(getComputedStyle(current).backgroundColor));
            let bg=[255,255,255,1]; for(const layer of layers.reverse()) bg=over(layer,bg);
            const text=over(rgba(getComputedStyle(element).color),bg), a=luminance(text), b=luminance(bg);
            return { selector, ratio: (Math.max(a,b)+.05)/(Math.min(a,b)+.05) };
          });
        });
        for(const value of contrast) assert.ok(value.ratio >= 4.5, `${theme} ${value.selector}: ${value.ratio.toFixed(2)}:1`);
        measurements.push({ theme, contrast });
        const target = await page.locator('.wp-days .wp-complete').first().boundingBox(); assert.ok(target.width>=24 && target.height>=24);
        await noOverflow(page); assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(out,theme+'.png'), animations: 'disabled' });
      }
    });
  } finally {
    await browser.close(); fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)); fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(measurements,null,2));
  }
  console.log(`${results.filter(r=>r.passed).length}/${results.length} desktop craft scenarios passed (${engine}).`);
  process.exitCode = results.every(r=>r.passed) ? 0 : 1;
})().catch(error => { console.error(error); process.exitCode=1; });
