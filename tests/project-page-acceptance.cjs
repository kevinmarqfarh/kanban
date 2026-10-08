// Tapping a project opens it fully as its own page (not a quick-look dialog).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = path.join(__dirname, 'artifacts', engine, 'project-page');
fs.mkdirSync(out, { recursive: true });
const key = 'forma:workspace:v1:guest';
const created = '2026-10-01T09:00:00.000Z';
const fixture = { version: 1, revision: null, dirty: false, workspace: {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'green' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
  tasks: [],
  projects: [
    { id: 'kitchen', title: 'Nytt kök', description: 'Planera och beställa allt till köket.', icon: 'hammer', color: 'gray', deadline: '2026-11-30', createdAt: created, tasks: [
      { id: 'measure', title: 'Mät upp rummet', description: '', labels: [], checklist: [{ id: 'm1', title: 'Väggar', completed: true }, { id: 'm2', title: 'Fönster', completed: false }], deadline: null, comments: [], createdAt: created, completed: false },
      { id: 'order', title: 'Beställ luckor', description: '', labels: [], checklist: [], deadline: null, comments: [], createdAt: created, completed: true },
    ] },
    { id: 'trip', title: 'Resa till Chile', description: '', icon: 'plane', color: 'gray', deadline: null, createdAt: created, tasks: [] },
  ],
} };

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.stack}`); } };
const cache = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).workspace, key);
const projectPage = page => page.getByTestId('project-page');
const card = (page, title) => page.getByRole('button', { name: `Öppna projekt ${title}`, exact: true });
const nav = (page, name) => page.locator('.bottom-nav').getByRole('button', { name, exact: true });

async function open(browser, viewport = { width: 1512, height: 982 }, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, serviceWorkers: 'block', timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
  await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem('forma-homescreen', 'off'); }, { key, value: fixture });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await nav(page, 'Projects').click();
  return { context, page, errors };
}

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    await check('A tap opens the whole project as a page, focused on its title', async () => {
      const { context, page, errors } = await open(browser);
      await card(page, 'Nytt kök').click();
      await projectPage(page).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0, 'No quick-look dialog.');
      assert.equal(await page.locator('.page-heading').count(), 0, 'The project title replaces the Projects heading.');
      assert.equal(await page.locator('.project-card').count(), 0, 'The list gives way to the project.');
      const heading = projectPage(page).getByRole('heading', { level: 1 });
      assert.equal(await heading.textContent(), 'Nytt kök');
      assert.equal(await heading.evaluate(node => node === document.activeElement), true, 'Focus moves to the project title.');
      assert.match(await projectPage(page).textContent(), /Planera och beställa allt till köket\./);
      assert.match(await projectPage(page).locator('.project-overview').textContent(), /2 huvuduppgifter · 1\/2 deluppgifter klara.*Deadline.*1\/2 klara.*50%/s);
      for (const name of ['Mät upp rummet', 'Beställ luckor']) await projectPage(page).getByRole('button', { name: `Redigera huvuduppgift ${name}`, exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.scrollY), 0);
      await page.screenshot({ path: path.join(out, 'desktop.png'), animations: 'disabled' });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check('Back via the button, the browser and the Projects tab all return to the list', async () => {
      const { context, page } = await open(browser);
      await card(page, 'Nytt kök').click();
      await projectPage(page).getByRole('button', { name: 'Alla projekt', exact: true }).click();
      await page.locator('.project-card').first().waitFor();
      assert.equal(await card(page, 'Nytt kök').evaluate(node => node === document.activeElement), true, 'Focus returns to the card you opened.');
      await card(page, 'Resa till Chile').click();
      await projectPage(page).waitFor();
      await page.goBack();
      await page.locator('.project-card').first().waitFor();
      assert.equal(await projectPage(page).count(), 0, 'Browser Back closes the project.');
      await page.goForward();
      await projectPage(page).getByRole('heading', { level: 1, name: 'Resa till Chile' }).waitFor();
      await nav(page, 'Projects').click();
      await page.locator('.project-card').first().waitFor();
      assert.equal(await projectPage(page).count(), 0, 'The Projects tab goes to the list.');
      await context.close();
    });

    await check('Task editing opens on top and returns to the project page', async () => {
      const { context, page } = await open(browser);
      await card(page, 'Nytt kök').click();
      await projectPage(page).getByRole('checkbox', { name: 'Fönster', exact: true }).check();
      assert.equal((await cache(page)).projects[0].tasks[0].checklist[1].completed, true);
      await projectPage(page).getByRole('button', { name: 'Redigera huvuduppgift Mät upp rummet', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Titel', { exact: true }).fill('Mät upp hela rummet');
      await page.getByRole('dialog').getByRole('button', { name: 'Spara uppgift', exact: true }).click();
      await projectPage(page).getByRole('button', { name: 'Redigera huvuduppgift Mät upp hela rummet', exact: true }).waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      await projectPage(page).getByRole('button', { name: 'Ny huvuduppgift', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Avbryt', exact: true }).click();
      await projectPage(page).waitFor();
      await context.close();
    });

    await check('Editing the project saves and stays on its page; deleting returns to the list', async () => {
      const { context, page } = await open(browser);
      await card(page, 'Nytt kök').click();
      await projectPage(page).getByRole('button', { name: 'Redigera projekt', exact: true }).click();
      await page.getByRole('dialog').getByLabel('Projektnamn', { exact: true }).fill('Nytt kök 2027');
      await page.getByRole('dialog').getByRole('button', { name: 'Spara projekt', exact: true }).click();
      await projectPage(page).getByRole('heading', { level: 1, name: 'Nytt kök 2027' }).waitFor();
      await projectPage(page).getByRole('button', { name: 'Ta bort projekt', exact: true }).click();
      await projectPage(page).locator('.delete-confirm').getByRole('button', { name: 'Behåll', exact: true }).click();
      await projectPage(page).getByRole('button', { name: 'Ta bort projekt', exact: true }).click();
      await projectPage(page).locator('.delete-confirm').getByRole('button', { name: 'Ta bort projekt', exact: true }).click();
      await page.locator('.project-card').first().waitFor();
      assert.equal((await cache(page)).projects.some(project => project.id === 'kitchen'), false);
      await context.close();
    });

    await check('A project deleted in another tab closes its page instead of leaving it blank', async () => {
      const { context, page } = await open(browser);
      await card(page, 'Resa till Chile').click();
      await projectPage(page).waitFor();
      const other = await context.newPage();
      await other.goto(base);
      await other.evaluate(key => { const stored = JSON.parse(localStorage.getItem(key)); stored.workspace.projects = stored.workspace.projects.filter(project => project.id !== 'trip'); localStorage.setItem(key, JSON.stringify(stored)); }, key);
      await page.locator('.project-card').first().waitFor();
      assert.equal(await projectPage(page).count(), 0);
      await context.close();
    });

    await check('Phone and iPad: the page fits, actions keep names and 44 px targets', async () => {
      for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['ipad', { width: 768, height: 1024 }]]) {
        const { context, page, errors } = await open(browser, viewport, true);
        await card(page, 'Nytt kök').click();
        await projectPage(page).waitFor();
        assert.equal(await page.getByRole('dialog').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no sideways scroll`);
        for (const name of ['Alla projekt', 'Ta bort projekt', 'Redigera projekt', 'Ny huvuduppgift']) {
          const button = projectPage(page).getByRole('button', { name, exact: true });
          const box = await button.evaluate(node => ({ w: node.offsetWidth, h: node.offsetHeight }));
          assert.ok(box.h >= 44 && box.w >= 44, `${label}: ${name} is ${box.w}×${box.h}`);
        }
        await page.screenshot({ path: path.join(out, `${label}.png`), animations: 'disabled' });
        assert.deepEqual(errors, []);
        await context.close();
      }
    });
  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} project-page scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
