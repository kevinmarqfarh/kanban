const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')
const ts = require('typescript')
const exportsSeed = {}
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/seed.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exportsSeed)
const ref = 'rucwlpzrumxejvhwazat'
const owner = 'c57e8db1-84da-4c59-b8ab-49a642136105'
const key = `forma:workspace:v1:${owner}`
let remote = { data: exportsSeed.createEmptyWorkspace(), revision: 1 }
let offline = false
const base = process.env.APP_URL || 'http://127.0.0.1:4180'
;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) })
  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await context.addInitScript(({ ref, owner, key, workspace }) => {
      if (localStorage.getItem(key)) return
      const expiry = Math.floor(Date.now() / 1000) + 3600
      const jwt = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: owner, exp: expiry, role: 'authenticated' })) + '.test'
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: jwt, refresh_token: 'test-refresh', token_type: 'bearer', expires_at: expiry, expires_in: 3600, user: { id: owner, email: 'offline-test@example.invalid' } }))
      localStorage.setItem(key, JSON.stringify({ version: 1, workspace, revision: 1, dirty: false }))
    }, { ref, owner, key, workspace: remote.data })
    await context.route(`https://${ref}.supabase.co/**`, async route => {
      if (offline) return route.abort('internetdisconnected')
      const request = route.request(), url = new URL(request.url())
      if (url.pathname.includes('kanban_workspaces')) {
        if (request.method() === 'PATCH') {
          assert.equal(url.searchParams.get('revision'), `eq.${remote.revision}`)
          remote = { data: request.postDataJSON().data, revision: remote.revision + 1 }
          return route.fulfill({ json: { revision: remote.revision } })
        }
        return route.fulfill({ json: remote })
      }
      if (url.pathname.includes('daily_debriefs')) return route.fulfill({ json: [] })
      throw new Error('Unexpected Supabase endpoint: ' + url.pathname)
    })
    await page.goto(base)
    await page.locator('[data-sync-status="synced"]').waitFor()
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
    })
    offline = true
    await context.setOffline(true)
    await page.locator('[data-sync-status="offline"]').waitFor()
    await page.getByRole('button', { name: 'Planner', exact: true }).click()
    await page.locator('[data-column-id="todo"]').getByRole('button', { name: 'Lägg till uppgift', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Titel', { exact: true }).fill('Sparad utan internet')
    await page.getByRole('dialog').getByRole('button', { name: 'Skapa uppgift', exact: true }).click()
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).dirty, key), true)
    assert.equal(remote.data.tasks.length, 0)
    await page.reload()
    await page.locator('[data-sync-status="offline"]').waitFor()
    await page.getByRole('button', { name: 'Planner', exact: true }).click()
    await page.getByRole('button', { name: 'Öppna Sparad utan internet', exact: true }).waitFor()
    offline = false
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.locator('[data-sync-status="synced"]').waitFor()
    assert.equal(remote.data.tasks[0].title, 'Sparad utan internet')
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).dirty, key), false)
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys()
      const urls = []
      for (const name of keys) for (const request of await (await caches.open(name)).keys()) urls.push(request.url)
      return urls
    })
    assert.ok(cached.length > 3)
    assert.ok(cached.every(url => url.startsWith(base)), 'The app cache must never include Supabase auth or data responses.')
    assert.deepEqual(errors, [])
    console.log('PASS: production offline shell, cached account, offline task creation, offline page reload, automatic reconnection upload, and app-only cache.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
