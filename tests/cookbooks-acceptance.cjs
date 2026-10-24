const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const out = process.env.ARTIFACT_DIR || path.join(__dirname, 'artifacts', engine, 'cookbooks');
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await playwright[engine].launch();
 try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'sv-SE' });
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 const dialog = page.getByRole('dialog');
 async function shelf() {
  await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
  await page.getByRole('button', { name: /^Recept/ }).click();
  await page.getByRole('heading', { name: 'Mina kokböcker', exact: true }).waitFor();
 }
 async function create(title) {
  await page.getByRole('button', { name: 'Ny kokbok', exact: true }).click();
  await dialog.getByLabel('Namn', { exact: true }).fill(title);
 }
 async function saveBook() { await dialog.getByRole('button', { name: 'Spara kokbok', exact: true }).click(); await dialog.waitFor({ state: 'detached' }); }
 await page.goto(base); await shelf();
 await page.getByRole('button', { name: 'Redigera kokbok Chile', exact: true }).click();
 const cover = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 500; const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 400, 500); g.addColorStop(0, '#814c2a'); g.addColorStop(1, '#dda669'); ctx.fillStyle = g; ctx.fillRect(0,0,400,500); ctx.fillStyle = '#fff2d6'; ctx.font = '50px Georgia'; ctx.fillText('Chile',120,250); return c.toDataURL('image/png').split(',')[1]; });
 await dialog.getByLabel('Välj omslagsbild', { exact: true }).setInputFiles({ name: 'chile.png', mimeType: 'image/png', buffer: Buffer.from(cover, 'base64') });
 await dialog.getByAltText('Kokbokens omslag').waitFor(); await saveBook();
 assert.equal(await page.locator('.cookbook-card img').count(), 1);
 await page.getByRole('button', { name: 'Öppna kokbok Chile', exact: true }).click();
 await page.getByRole('button', { name: 'Välj från befintliga recept', exact: true }).click();
 for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.uncheck();
 await dialog.getByLabel('Sök bland alla recept', { exact: true }).fill('Porotos');
 await dialog.getByRole('checkbox').first().check();
 await dialog.getByRole('button', { name: 'Spara urval', exact: true }).click();
 await page.locator('.recipe-list-row').waitFor();
 assert.equal(await page.locator('.recipe-list-row').count(), 1);
 await page.getByRole('button', { name: 'Nytt recept', exact: true }).click();
 await dialog.getByLabel('Titel', { exact: true }).fill('Min morgongröt');
 await dialog.getByLabel('Ingredienser', { exact: true }).fill('1 dl havregryn\n2 dl vatten');
 await dialog.getByLabel('Gör så här', { exact: true }).fill('Koka samman.');
 await dialog.getByRole('button', { name: 'Spara recept', exact: true }).click();
 await dialog.waitFor({ state: 'detached' });
 assert.equal(await page.locator('.recipe-list-row').count(), 2);
 await page.reload(); await shelf();
 assert.equal(await page.locator('.cookbook-card img').count(), 1, 'Cover survives reload');
 await create('Snacks'); await saveBook();
 await create('Morgon'); await saveBook();
 await page.getByRole('button', { name: 'Öppna kokbok Morgon', exact: true }).click();
 await page.getByRole('button', { name: 'Välj från befintliga recept', exact: true }).click();
 await dialog.getByLabel('Sök bland alla recept', { exact: true }).fill('Min morgongröt');
 await dialog.getByRole('checkbox').check();
 await dialog.getByRole('button', { name: 'Spara urval', exact: true }).click();
 await page.getByRole('button', { name: 'Alla kokböcker', exact: true }).click();
 await page.screenshot({ path: path.join(out, 'phone-shelf.png'), fullPage: true });
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
 await page.getByRole('button', { name: 'Öppna kokbok Chile', exact: true }).click();
 await page.screenshot({ path: path.join(out, 'phone-book.png'), fullPage: true });
 await page.getByRole('button', { name: 'Välj från befintliga recept', exact: true }).click();
 await dialog.getByLabel('Sök bland alla recept', { exact: true }).fill('Min morgongröt');
 await dialog.getByRole('checkbox').uncheck();
 await dialog.getByRole('button', { name: 'Spara urval', exact: true }).click();
 assert.equal(await page.locator('.recipe-list-row').count(), 1);
 await page.getByRole('button', { name: 'Redigera kokbok Chile', exact: true }).click();
 await dialog.getByLabel('Namn', { exact: true }).fill('Chilenska smaker'); await saveBook();
 await page.getByRole('heading', { name: 'Chilenska smaker', exact: true }).waitFor();
 await page.getByRole('button', { name: 'Redigera kokbok Chilenska smaker', exact: true }).click();
 await dialog.getByRole('button', { name: 'Ta bort kokbok', exact: true }).click();
 await page.getByRole('heading', { name: 'Mina kokböcker', exact: true }).waitFor();
 await page.getByRole('button', { name: 'Öppna kokbok Morgon', exact: true }).click();
 assert.equal(await page.locator('.recipe-list-row').count(), 1, 'Removing a book or membership preserves recipes in other books');
 await page.getByRole('button', { name: 'Alla kokböcker', exact: true }).click();
 await page.getByRole('button', { name: /^Alla recept/ }).click();
 assert.equal(await page.locator('.recipe-list-row').count(), 101);
 await page.getByRole('button', { name: 'Alla kokböcker', exact: true }).click();
 await page.setViewportSize({ width: 1280, height: 900 });
 await page.screenshot({ path: path.join(out, 'desktop-shelf.png'), fullPage: true });
 assert.deepEqual(errors, []);
 console.log(`PASS ${engine}: cover upload/reload, books, existing and new recipes, multiple membership, rename, removal and preserved library; mobile/desktop without errors`);
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
