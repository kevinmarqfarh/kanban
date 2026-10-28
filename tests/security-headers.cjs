// Serve the production artifact with the exact headers committed for Vercel.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const headerRule = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'))).headers[0];
// This test server models this Vercel catch-all only; do not silently test a different matcher.
assert.equal(headerRule.source, '/(.*)', 'Headers must cover the app shell and assets, not only API routes.');
const headers = Object.fromEntries(headerRule.headers.map(h => [h.key, h.value]));
const directives = new Map(headers['Content-Security-Policy'].split(';').map(part => {
  const [name, ...sources] = part.trim().split(/\s+/); return [name, sources];
}));
assert.deepEqual(directives.get('script-src'), ["'self'"], 'Do not allow eval, inline scripts or third-party script origins.');
assert.deepEqual(directives.get('script-src-attr'), ["'none'"]);
assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/security-probe.js') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/javascript' });
    // Run from an actual same-origin script, not DevTools evaluation (which may bypass eval CSP).
    return res.end("try { (0, eval)('window.evalRan = true'); } catch (_) {} var script = document.createElement('script'); script.src = 'https://example.invalid/security-probe.js'; document.head.appendChild(script); window.securityProbeDone = true;");
  }
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, headers); return res.end(); }
  res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await engine.launch({ headless: true });
      try {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        await context.addInitScript(() => {
          window.securityViolations = [];
          document.addEventListener('securitypolicyviolation', e => window.securityViolations.push(e.effectiveDirective));
        });
        // Never access a real account or weather service during this security regression.
        let externalScriptRequests = 0;
        await context.route('https://**/*', route => {
          if (route.request().url() === 'https://example.invalid/security-probe.js') {
            externalScriptRequests++;
            return route.fulfill({ contentType: 'text/javascript', body: 'window.externalScriptRan = true;' });
          }
          return route.abort();
        });
        const page = await context.newPage();
        await page.clock.install();
        const response = await page.goto(base);
        assert.equal(response.headers()['x-content-type-options'], 'nosniff');
        assert.equal(response.headers()['x-frame-options'], 'DENY');
        await page.locator('.bottom-nav').waitFor();
        assert.equal(await page.evaluate(() => window.__formaBooted), true, 'Production scripts boot under CSP.');
        assert.deepEqual(await page.evaluate(() => window.securityViolations), [], 'Normal startup must not violate the policy.');
        await page.evaluate(() => {
          const script = document.createElement('script'); script.textContent = 'window.inlineScriptRan = true'; document.body.appendChild(script);
          const button = document.createElement('button'); button.setAttribute('onclick', 'window.inlineHandlerRan = true'); document.body.appendChild(button); button.click();
        });
        await page.waitForFunction(() => window.securityViolations.length >= 2);
        assert.equal(await page.evaluate(() => !!window.inlineScriptRan || !!window.inlineHandlerRan), false);
        await page.evaluate(() => { const script = document.createElement('script'); script.src = '/security-probe.js'; document.head.appendChild(script); });
        await page.waitForFunction(() => window.securityProbeDone);
        await page.waitForFunction(() => window.securityViolations.filter(value => value.startsWith('script-src')).length >= 4);
        assert.equal(await page.evaluate(() => !!window.evalRan || !!window.externalScriptRan), false);
        assert.equal(externalScriptRequests, 0, 'Disallowed script origins must be blocked before any request.');
        await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/'; document.body.appendChild(frame); });
        await page.waitForFunction(() => window.securityViolations.includes('frame-ancestors'), null, { timeout: 1000 }).catch(async () => {
          // Ancestor violations are often reported only in the blocked frame, not its parent.
          await page.waitForTimeout(100);
          assert.equal(await page.locator('iframe').evaluate(frame => {
            try { return !!frame.contentDocument?.querySelector('.bottom-nav'); } catch { return false; }
          }), false, 'Embedding must not expose the app UI.');
        });
        // Failure recovery still works when the app module cannot load.
        const broken = await context.newPage();
        await broken.route(/\/assets\/index-.*\.js$/, route => route.abort());
        await broken.clock.install();
        await broken.goto(base);
        await broken.clock.runFor(15_500);
        await broken.getByTestId('boot-failed').waitFor();
        // Verify the real event listener reloads without an inline onclick attribute.
        const reloaded = broken.waitForEvent('load');
        await broken.getByRole('button', { name: 'Ladda om', exact: true }).click();
        await reloaded;
        console.log(`PASS ${name}: production boot, HTTP headers, blocked inline/eval/external scripts, clickjacking and CSP-compatible crash recovery.`);
        await context.close();
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
