// Sign-in must work on older iPads (iPadOS/Safari 15.4–15.x) that lack AbortSignal.timeout and AbortSignal.any.
// Before the fix, every Supabase call threw "AbortSignal.timeout is not a function" before any request was sent,
// and the app mislabelled that as "Molnet svarar inte just nu".
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE === 'chromium' ? 'chromium' : 'webkit';
const base = process.env.APP_URL || 'http://127.0.0.1:4173';
const ref = 'rucwlpzrumxejvhwazat';
const owner = 'c57e8db1-84da-4c59-b8ab-49a642136105';
const email = 'legacy-ipad@example.invalid';

async function signIn(browser, { legacy, auth }) {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, timezoneId: 'Europe/Stockholm', serviceWorkers: 'block' });
  if (legacy) await context.addInitScript(() => { delete AbortSignal.timeout; delete AbortSignal.any; });
  const calls = [];
  await context.route(`https://${ref}.supabase.co/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    calls.push(`${request.method()} ${url.pathname}`);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const cors = { 'access-control-allow-origin': '*' };
    if (url.pathname === '/auth/v1/token') return auth(route, cors);
    if (url.pathname.includes('kanban_workspaces')) return route.fulfill({ headers: cors, json: request.method() === 'GET' ? [] : { revision: 1 } });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ headers: cors, json: session().user });
    if (url.pathname.includes('daily_debriefs')) return route.fulfill({ headers: cors, json: [] });
    return route.fulfill({ headers: cors, json: {} });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('requestfailed', () => {});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-post', { exact: true }).fill(email);
  await dialog.getByLabel('Lösenord', { exact: true }).fill('correct horse battery staple');
  await dialog.locator('form').getByRole('button', { name: /^Logga in/ }).click();
  return { context, page, dialog, calls, errors };
}

const session = () => {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: owner, exp: expiry, role: 'authenticated', aud: 'authenticated', email })).toString('base64url') + '.sig';
  return { access_token: jwt, refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user: { id: owner, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } };
};

(async () => {
  const browser = await playwright[engine].launch({ headless: true });
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push(true); console.log(`PASS ${name}`); } catch (error) { results.push(false); console.log(`FAIL ${name}: ${error.message}`); } };
  try {
    await check('Older Safari without AbortSignal.timeout reaches Supabase and signs in', async () => {
      const run = await signIn(browser, { legacy: true, auth: (route, headers) => route.fulfill({ headers, json: session() }) });
      await run.page.waitForFunction(() => Object.keys(localStorage).some(key => key.endsWith('-auth-token')), null, { timeout: 15000 });
      assert.ok(run.calls.some(call => call === 'POST /auth/v1/token'), `The sign-in request must leave the device. Calls: ${run.calls.join(', ') || 'none'}`);
      assert.equal(await run.dialog.getByText('Molnet svarar inte just nu', { exact: false }).count(), 0);
      assert.deepEqual(run.errors, []);
      await run.context.close();
    });

    await check('Wrong password on older Safari says so instead of blaming the cloud', async () => {
      const run = await signIn(browser, { legacy: true, auth: (route, headers) => route.fulfill({ status: 400, headers, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }) });
      await run.dialog.getByText('E-postadressen eller lösenordet stämmer inte.').waitFor({ timeout: 15000 });
      await run.context.close();
    });

    await check('A request that never answers times out with an honest message (no AbortSignal.timeout)', async () => {
      const run = await signIn(browser, { legacy: true, auth: () => new Promise(() => {}) });
      await run.dialog.getByText(/svarade inte i tid/).waitFor({ timeout: 25000 });
      await run.context.close();
    });

  } finally {
    await browser.close();
  }
  const failed = results.filter(ok => !ok).length;
  console.log(`${engine}: ${results.length - failed} of ${results.length} legacy-Safari login scenarios passed.`);
  if (failed) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
