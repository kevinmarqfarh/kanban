// All auth and database requests are intercepted; this test never uses a real account.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4189';
const ref = 'rucwlpzrumxejvhwazat';
const owner = 'd07425da-b5bd-4f6a-8024-900bab808e40';
const guestKey = 'forma:workspace:v1:guest';
const empty = { columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }, { id: 'finalized', title: 'Finalized', color: 'green' }], tasks: [], projects: [] };
const task = { id: 'frontend-security-private-task', title: 'Synthetic private task', description: 'Synthetic account-only content', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: '2026-10-01T09:00:00Z' };

(async () => {
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(({ ref, owner, guestKey, empty }) => {
      if (!location.protocol.startsWith('http')) return;
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const jwt = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: owner, exp: expiry, role: 'authenticated' })) + '.synthetic';
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: expiry, expires_in: 3600, user: { id: owner, email: 'synthetic@example.invalid' } }));
      localStorage.setItem(guestKey, JSON.stringify({ version: 1, workspace: empty, revision: null, dirty: false }));
    }, { ref, owner, guestKey, empty });
    let remote = { data: { ...empty, tasks: [task] }, revision: 1 };
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      if (url.hostname !== `${ref}.supabase.co`) return route.abort();
      if (url.pathname.includes('/kanban_workspaces')) {
        if (route.request().method() === 'PATCH') {
          remote = { data: route.request().postDataJSON().data, revision: remote.revision + 1 };
          return route.fulfill({ json: { revision: remote.revision } });
        }
        return route.fulfill({ json: remote });
      }
      if (url.pathname.includes('/auth/v1/logout')) return route.fulfill({ json: {} });
      return route.fulfill({ json: [] });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(base);
    await page.locator('[data-sync-status="synced"]').waitFor();
    await page.locator('.bottom-nav').getByRole('button', { name: 'Planner', exact: true }).click();
    await page.getByRole('button', { name: `Öppna ${task.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort uppgift', exact: true }).click();
    await page.locator('[data-testid="undo-toast"]').waitFor();
    await page.locator('[data-sync-status="synced"]').waitFor();
    assert.equal(remote.data.tasks.length, 0, 'the account deletion must be acknowledged before signing out');
    await page.getByRole('button', { name: 'Öppna inställningar', exact: true }).click();
    await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('.app-shell')?.getAttribute('aria-busy') === 'false');
    const undo = page.locator('[data-testid="undo-toast"]').getByRole('button', { name: 'Ångra', exact: true });
    const undoSurvived = await undo.count() > 0;
    if (undoSurvived) await undo.click();
    const leaked = await page.evaluate(({ guestKey, id }) => JSON.parse(localStorage.getItem(guestKey)).workspace.tasks.some(entry => entry.id === id), { guestKey, id: task.id });
    console.log(JSON.stringify({ engine: engine.name(), undoSurvivedSignOut: undoSurvived, privateTaskCopiedToGuest: leaked }));
    assert.equal(leaked, false, 'Signing out must invalidate account undo snapshots; private data was restored into the guest workspace.');
    assert.equal(undoSurvived, false, 'The previous account undo action must not remain available after sign-out.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
