const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.join(__dirname, 'artifacts', 'project-icons');
const cache = page => page.evaluate(() => JSON.parse(localStorage.getItem('forma:workspace:v1:guest')).workspace);

async function run(browser, viewport, label) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5180');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.locator('.new-project-card').click();

  const picker = page.getByRole('group', { name: /Projektikon/ });
  await assert.doesNotReject(picker.waitFor());
  for (const group of ['Allmänt', 'Hem och familj', 'Hälsa och mat', 'Resor och fritid', 'Arbete och lärande', 'Kreativt'])
    assert.equal(await picker.getByRole('group', { name: group, exact: true }).count(), 1, `${label}: group ${group} is shown.`);
  const buttons = picker.getByRole('button', { name: /^Ikon / });
  assert.ok(await buttons.count() >= 40, `${label}: all icons are offered.`);
  assert.equal(await picker.getByRole('button', { name: 'Ikon Mapp', exact: true }).getAttribute('aria-pressed'), 'true', `${label}: folder is the default.`);

  // Every picker button meets the 44 px touch target.
  for (const box of await buttons.evaluateAll(nodes => nodes.map(node => ({ width: node.offsetWidth, height: node.offsetHeight }))))
    assert.ok(box.width >= 44 && box.height >= 44, `${label}: icon buttons are at least 44px (${box.width}x${box.height}).`);

  const rocket = picker.getByRole('button', { name: 'Ikon Lansering', exact: true });
  await rocket.scrollIntoViewIfNeeded();
  await rocket.click();
  assert.equal(await rocket.getAttribute('aria-pressed'), 'true');
  assert.equal(await picker.getByRole('button', { name: 'Ikon Mapp', exact: true }).getAttribute('aria-pressed'), 'false');
  assert.match(await page.locator('.icon-picker-current').textContent(), /Lansering/);
  await page.screenshot({ path: path.join(out, `${label}-picker.png`), animations: 'disabled' });

  const title = `Ikonprojekt ${label}`;
  await page.getByLabel('Projektnamn', { exact: true }).fill(title);
  await page.getByLabel('Huvuduppgift', { exact: true }).fill('Första steget');
  await page.getByRole('button', { name: 'Skapa projekt', exact: true }).click();
  const saved = (await cache(page)).projects.find(project => project.title === title);
  assert.equal(saved.icon, 'rocket', `${label}: chosen icon is persisted.`);
  assert.equal(await page.locator('.project-detail-intro .project-icon svg.lucide-rocket').count(), 1, `${label}: detail view renders the chosen icon.`);

  await page.reload();
  assert.equal((await cache(page)).projects.find(project => project.title === title).icon, 'rocket', `${label}: icon survives reload.`);
  assert.deepEqual(errors, []);
  await page.close();
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  try {
    await run(browser, { width: 1512, height: 982 }, 'desktop');
    await run(browser, { width: 390, height: 844 }, 'mobile');
    console.log('Project icon acceptance passed: grouped picker, 44px targets, selection state, persistence and reload on desktop and mobile.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
