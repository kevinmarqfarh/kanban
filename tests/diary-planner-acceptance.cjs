const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const browserType = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const key = 'forma:workspace:v1:guest';
const workspace = {
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'done', title: 'Klart', color: 'green' }],
  tasks: [{ id: 'card-1', title: 'Prova checklistan', description: '', columnId: 'todo', labels: [], checklist: [{ id: 'item-1', title: 'Första steget', completed: false }], deadline: null, comments: [], projectId: null, createdAt: '2026-10-28T09:00:00.000Z' }],
  projects: [],
};
(async () => {
  const browser = await browserType.launch();
  try {
    const context = await browser.newContext({ viewport: { width: Number(process.env.VIEWPORT_WIDTH || 390), height: 844 }, locale: 'sv-SE' });
    await context.addInitScript(({ key, workspace }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, workspace, revision: null, dirty: false })); }, { key, workspace });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace, key);
    const nav = name => page.locator('.bottom-nav').getByRole('button', { name, exact: true });
    await page.goto(base); await page.getByTestId('home-overview').waitFor();
    await nav('Dagbok').click();
    await page.getByRole('button', { name: 'Skriv inlägg' }).click();
    await page.getByRole('button', { name: 'Bra', exact: true }).click();
    await page.getByRole('textbox', { name: 'Vad var bra idag?' }).fill('En lugn promenad');
    assert.equal((await saved()).diaryEntries.length, 1);
    assert.equal((await saved()).diaryEntries[0].mood, 'good');
    if (process.env.DIARY_SHOTS) await page.screenshot({ path: `/tmp/forma-diary-${process.env.VIEWPORT_WIDTH || 390}.png` });
    await page.getByRole('button', { name: 'Redigera mall' }).click();
    await page.getByRole('textbox', { name: 'Fråga 1' }).fill('Vad gav energi idag?');
    await page.getByRole('button', { name: 'Spara mall' }).click();
    assert.equal((await saved()).diaryEntries[0].answers[0].prompt, 'Vad var bra idag?');
    await page.getByRole('button', { name: 'Föregående dag' }).click();
    await page.getByRole('button', { name: 'Skriv inlägg' }).click();
    await page.getByRole('textbox', { name: 'Vad gav energi idag?' }).fill('Kaffe');
    assert.equal((await saved()).diaryEntries.length, 2);
    await nav('Planner').click();
    await page.getByRole('button', { name: 'Visa checklista' }).click();
    await page.getByRole('checkbox', { name: 'Första steget' }).check();
    if (process.env.DIARY_SHOTS) await page.screenshot({ path: `/tmp/forma-checklist-${process.env.VIEWPORT_WIDTH || 390}.png` });
    assert.equal((await saved()).tasks[0].checklist[0].completed, true);
    await page.reload(); await page.getByTestId('home-overview').waitFor();
    await nav('Planner').click(); await page.getByRole('button', { name: 'Visa checklista' }).click();
    assert.equal(await page.getByRole('checkbox', { name: 'Första steget' }).isChecked(), true);
    await nav('Dagbok').click();
    assert.equal(await page.getByRole('textbox', { name: 'Vad var bra idag?' }).inputValue(), 'En lugn promenad');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    console.log('PASS diary template snapshots, one entry per day, mood and board checklist');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
