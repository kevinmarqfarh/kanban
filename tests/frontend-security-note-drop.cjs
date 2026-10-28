// Real mouse dragging exercises browser HTML insertion before React's persist handler.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4189';
const key = 'forma:workspace:v1:guest';
const pixel = 'https://example.invalid/frontend-security-drop-pixel';

(async () => {
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 950 }, serviceWorkers: 'block' });
    await context.addInitScript(key => {
      if (!location.protocol.startsWith('http') || window.top !== window) return;
      const stamp = '2026-10-01T09:00:00Z';
      localStorage.setItem(key, JSON.stringify({ version: 1, revision: null, dirty: false, workspace: {
        columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'finalized', title: 'Finalized', color: 'green' }],
        projects: [], tasks: [], notes: [{ id: 'security-note', title: 'Synthetic drop', content: '<p>Text</p>', font: 'system', createdAt: stamp, updatedAt: stamp }],
      } }));
    }, key);
    let pixelRequests = 0;
    await context.route('**/*', route => {
      if (route.request().url() === pixel) pixelRequests++;
      if (route.request().url() === `${base}/frontend-security-drag-source`) return route.fulfill({ contentType: 'text/html', body:
        `<div id="source" draggable="true" style="height:50px">Drag synthetic HTML</div><script>
        document.getElementById('source').addEventListener('dragstart', event => {
          event.dataTransfer.setData('text/html', '<img src="${pixel}" onerror="window.frontendSecurityDropAttack=true"><p>Synthetic dropped text</p>');
          event.dataTransfer.effectAllowed = 'copy';
        });</script>`,
      });
      return new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(base);
    await page.locator('.bottom-nav').getByRole('button', { name: 'Others', exact: true }).click();
    await page.getByRole('button', { name: /^Anteckningar(?:\s|$)/ }).click();
    await page.getByRole('button', { name: 'Öppna anteckning Synthetic drop', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Anteckningens text', exact: true });
    await editor.click();
    await page.evaluate(base => {
      const frame = document.createElement('iframe');
      frame.id = 'security-drag-source'; frame.src = `${base}/frontend-security-drag-source`;
      frame.style.cssText = 'position:fixed;left:0;top:0;width:220px;height:80px;z-index:99999';
      document.body.appendChild(frame);
      window.frontendSecurityBeforePersist = [];
      document.querySelector('.note-content').addEventListener('input', () => {
        window.frontendSecurityBeforePersist.push(document.querySelector('.note-content').innerHTML);
      }, { capture: true });
    }, base);
    const source = page.frameLocator('#security-drag-source').locator('#source');
    await source.waitFor();
    const start = await source.boundingBox();
    const bounds = await editor.boundingBox();
    await page.mouse.move(start.x + 20, start.y + 20);
    await page.mouse.down();
    await page.mouse.move(start.x + 35, start.y + 25, { steps: 5 });
    await page.mouse.move(bounds.x + 20, bounds.y + 20, { steps: 15 });
    await page.mouse.move(bounds.x + 25, bounds.y + 22, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const observed = await page.evaluate(() => ({ attack: !!window.frontendSecurityDropAttack, imageBeforePersist: window.frontendSecurityBeforePersist.some(html => html.includes('<img')), handlerBeforePersist: window.frontendSecurityBeforePersist.some(html => html.includes('onerror=')) }));
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).workspace.notes[0].content, key);
    assert.match(saved, /Synthetic dropped text/, 'the browser must actually insert and save the drop');
    assert.doesNotMatch(saved, /<img/, 'persisted content must not contain dropped images');
    console.log(JSON.stringify({ engine: engine.name(), externalImageRequests: pixelRequests, liveImageElements: await editor.locator('img').count(), savedImageElements: /<img/.test(saved), ...observed }));
    assert.equal(observed.attack, false, 'a dropped handler must never execute');
    assert.equal(observed.imageBeforePersist, false, 'disallowed images must not reach the live DOM before persist');
    assert.equal(observed.handlerBeforePersist, false, 'event handlers must not reach the live DOM before persist');
    assert.equal(pixelRequests, 0, 'HTML drops must be sanitized before insertion; a dropped image triggered an external request.');
    assert.equal(await editor.locator('img').count(), 0, 'disallowed dropped elements must not remain in the live editor');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
