import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Script, createContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { events } from '../supabase/functions/forma-push/reminders.ts'
import { pushEndpoint, readBody } from '../supabase/functions/forma-push/security.ts'

const endpoint = 'https://fcm.googleapis.com/fcm/send/test-device'
const device = { id: 'device-1', user_id: 'owner-1', endpoint, p256dh: 'B'.repeat(87), auth_key: 'A'.repeat(22), enabled: true, tasks: true, schedule: false, birthdays: false, lead_minutes: 0, quiet_start: null, quiet_end: null, time_zone: 'UTC' }
const encoder = new TextEncoder()
const testNow = Date.parse('2026-10-28T08:59:59.000Z')
const request = (body, headers = {}) => new Request('https://example.invalid/forma-push', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
const userRequest = (body, headers = {}) => request(body, { Authorization: 'Bearer user-session', ...headers })

// Run the production entrypoint with fake network boundaries. No credentials,
// database connection, or push provider is used by this suite.
const source = ts.transpileModule(readFileSync(new URL('../supabase/functions/forma-push/index.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const securitySource = ts.transpileModule(readFileSync(new URL('../supabase/functions/forma-push/security.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function runtime(options = {}) {
  let clock = testNow
  const state = { queries: [], sends: [], logs: [], authCalls: [], deliveries: options.deliveries ?? new Map(), generated: 0, advanceTime: ms => { clock += ms } }
  const config = { cron_token: 'mock-cron-credential', vapid_public: 'mock-public', vapid_private: 'mock-private', ...options.config }
  const devices = options.devices ?? [{ ...device }]
  const now = new Date(testNow).toISOString().slice(0, 16)
  const workspace = { columns: [], tasks: [{ id: 'task-1', title: 'Test', deadline: now.slice(0, 10), deadlineTime: now.slice(11) }], birthdays: [] }
  const db = {
    auth: { getUser: async token => {
      state.authCalls.push(token)
      return token === 'user-session' ? { data: { user: { id: 'owner-1' } } } : { data: { user: null }, error: { message: 'Invalid session' } }
    } },
    from(table) {
      const query = { table, filters: [], lessThan: [], operation: 'select' }
      let result
      const builder = {
        select(columns) { query.columns = columns; return this },
        eq(key, value) { query.filters.push([key, value]); return this },
        lt(key, value) { query.lessThan.push([key, value]); return this },
        is(key, value) { query.filters.push([key, value]); return this },
        limit(count) { query.limit = count; return this },
        insert(value) { query.operation = 'insert'; query.value = value; return this },
        update(value) { query.operation = 'update'; query.value = value; return this },
        delete() { query.operation = 'delete'; return this },
        single() { query.single = true; return this },
        maybeSingle() { query.single = true; return this },
        then(resolve, reject) {
          result ??= Promise.resolve().then(() => {
            state.queries.push(query)
            if (options.dbError) throw new Error('mock sensitive database error')
            if (table === 'forma_push_config') {
              if (query.operation === 'update') Object.assign(config, query.value)
              return { data: { ...config }, error: null }
            }
            if (table === 'forma_push_subscriptions') {
              if (options.returnUnsafeRow) return { data: options.returnUnsafeRow, error: null }
              const rows = devices.filter(row => query.filters.every(([key, value]) => row[key] === value))
              return { data: query.single ? rows[0] ?? null : rows.slice(0, query.limit ?? rows.length), error: null }
            }
            if (table === 'kanban_workspaces') return { data: { data: workspace }, error: null }
            if (table === 'forma_push_deliveries') {
              if (options.claimError) return { error: { code: 'XX000', message: 'mock sensitive claim error' } }
              if (options.renewalError && query.operation === 'update') return { error: { code: 'XX000', message: 'mock sensitive renewal error' } }
              if (query.operation === 'insert') {
                const key = `${query.value.subscription_id}:${query.value.event_key}`
                if (state.deliveries.has(key)) return { error: { code: '23505' } }
                state.deliveries.set(key, { claimed_at: new Date(clock).toISOString(), ...query.value })
              }
              if (query.operation === 'update') {
                const row = [...state.deliveries.values()].find(row => query.filters.every(([key, value]) => row[key] === value) && query.lessThan.every(([key, value]) => row[key] < value))
                if (row) Object.assign(row, query.value)
                return { data: row ?? null, error: null }
              }
              if (query.operation === 'delete') {
                const filters = Object.fromEntries(query.filters)
                state.deliveries.delete(`${filters.subscription_id}:${filters.event_key}`)
              }
              return { data: null, error: null }
            }
            throw new Error('Unexpected mock table')
          })
          return result.then(resolve, reject)
        },
      }
      return builder
    },
  }
  const webpush = {
    generateVAPIDKeys() { state.generated++; return { publicKey: 'mock-generated-public', privateKey: 'mock-generated-private' } },
    setVapidDetails() {},
    async sendNotification(subscription, payload, sendOptions) {
      state.sends.push({ subscription, payload: JSON.parse(payload), options: sendOptions })
      if (options.pushError) throw Object.assign(new Error('mock sensitive provider error'), { statusCode: options.pushError })
    },
  }
  const securityExports = {}
  const context = createContext({
    exports: securityExports, URL, Request, Response, TextDecoder,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [clock])) }
      static now() { return clock }
    },
    console: { error: (...args) => state.logs.push(args.join(' ')) },
    require(name) {
      if (name === '@supabase/supabase-js') return { createClient: () => db }
      if (name === 'web-push') return { default: webpush }
      if (name === './reminders.ts') return { events }
      if (name === './security.ts') return securityExports
      throw new Error('Unexpected mock import')
    },
    Deno: { env: { get: name => name === 'SUPABASE_URL' ? 'https://example.invalid' : 'mock-service-credential' }, serve: handler => { state.handler = handler } },
  })
  new Script(securitySource, { filename: 'forma-push/security.ts' }).runInContext(context)
  context.exports = {}
  new Script(source, { filename: 'forma-push/index.ts' }).runInContext(context)
  return state
}

test('endpoint policy accepts supported providers and rejects SSRF/parser bypasses', () => {
  for (const url of [endpoint, 'https://fcm.googleapis.com/wp/test', 'https://updates.push.services.mozilla.com/wpush/v2/test', 'https://web.push.apple.com/Q/test', 'https://wns2-par02p.notify.windows.com/w/?token=test', 'https://FCM.GOOGLEAPIS.COM:443/fcm/send/test']) assert.ok(pushEndpoint(url), url)
  for (const url of [
    'http://fcm.googleapis.com/fcm/send/test', 'https://127.0.0.1/test', 'https://2130706433/test', 'https://0x7f000001/test', 'https://[::1]/test', 'https://169.254.169.254/latest/meta-data', 'https://localhost/test',
    'https://attacker.invalid/test', 'https://fcm.googleapis.com.attacker.invalid/test', 'https://notpush.apple.com/test', 'https://push.apple.com.attacker.invalid/test', 'https://notify.windows.com.attacker.invalid/test',
    'https://fcm.googleapis.com:444/test', 'https://fcm.googleapis.com./test', 'https://user:pass@fcm.googleapis.com/test', 'https://fcm.googleapis.com@127.0.0.1/test', 'https://fcm.googleapis.com\\@127.0.0.1/test',
    'https://fcm.googleapis.com/test#fragment', 'https://fcm.googleapis.com\n/test', 'https://fcm.googleapis.com\u0000/test', 'https://fcm.googleapis.com%2eattacker.invalid/test', `${endpoint}${'x'.repeat(2048)}`, null, 123, {},
  ]) assert.equal(pushEndpoint(url), null, String(url))
})

test('request validation bounds bytes with absent or forged Content-Length', async () => {
  const app = runtime()
  for (const value of [null, [], 'string', {}, { action: {} }, { action: 'bad' }, { action: 'test', endpoint: {} }]) assert.equal((await app.handler(request(value))).status, 400)
  assert.equal((await app.handler(new Request('https://example.invalid', { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } }))).status, 400)
  assert.equal((await app.handler(request({ action: 'public-key' }, { 'Content-Type': 'text/plain' }))).status, 415)
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': '5000' }]) {
    assert.equal((await app.handler(request({ action: 'public-key', padding: 'x'.repeat(5000) }, headers))).status, 413)
  }
  assert.equal(app.queries.length, 0)
  assert.equal(app.sends.length, 0)
  let cancelled = false
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(encoder.encode('x'.repeat(2048))) }, cancel() { cancelled = true } })
  await assert.rejects(readBody(new Request('https://example.invalid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' })), error => error.status === 413)
  assert.equal(cancelled, true)
  // Multibyte UTF-8 is counted in bytes, not JavaScript characters.
  assert.equal((await app.handler(request({ action: 'public-key', padding: 'ö'.repeat(2100) }))).status, 413)
})

test('test sends require verified Bearer sessions and enforce ownership and enabled state', async () => {
  const app = runtime({ config: { vapid_public: null, vapid_private: null } })
  for (const Authorization of ['', 'Basic user-session', 'user-session', 'Bearer forged-session', 'Bearer mock-service-credential', 'Bearer user-session extra']) assert.equal((await app.handler(userRequest({ action: 'test', endpoint }, { Authorization }))).status, 401)
  assert.equal(app.queries.length, 0)
  assert.equal(app.generated, 0)
  for (const overrides of [{ user_id: 'other-owner' }, { enabled: false }]) {
    const other = runtime({ devices: [{ ...device, ...overrides }] })
    assert.equal((await other.handler(userRequest({ action: 'test', endpoint }))).status, 404)
    assert.equal(other.sends.length, 0)
    assert.equal(other.queries.some(query => query.table === 'forma_push_config'), false)
  }
})

test('cron needs its private credential; user/admin credentials never substitute', async () => {
  for (const headers of [{}, { Authorization: 'Bearer user-session' }, { Authorization: 'Bearer mock-service-credential' }, { apikey: 'mock-service-credential' }, { 'x-forma-cron': 'wrong' }, { 'x-forma-cron': 'x'.repeat(257) }]) {
    const app = runtime({ config: { vapid_public: null, vapid_private: null } })
    assert.equal((await app.handler(request({ action: 'dispatch' }, headers))).status, 401)
    assert.equal(app.queries.some(query => query.table !== 'forma_push_config' || query.operation !== 'select'), false)
    assert.equal(app.generated, 0)
    assert.equal(app.sends.length, 0)
  }
  const app = runtime()
  const response = await app.handler(request({ action: 'dispatch' }, { 'x-forma-cron': 'mock-cron-credential' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { delivered: 1, failures: 0 })
  assert.equal(app.sends.length, 1)
  assert.equal(app.authCalls.length, 0)
  const again = await app.handler(request({ action: 'dispatch' }, { 'x-forma-cron': 'mock-cron-credential' }))
  assert.deepEqual(await again.json(), { delivered: 0, failures: 0 })
  assert.equal(app.sends.length, 1)
})

test('stored subscriptions are revalidated for cron and test, including poisoned keys', async () => {
  for (const overrides of [{ endpoint: 'https://127.0.0.1/private' }, { endpoint: 'https://attacker.invalid/collect' }, { p256dh: 'x'.repeat(100_000) }, { auth_key: {} }]) {
    const unsafe = { ...device, ...overrides }
    const cron = runtime({ devices: [unsafe] })
    const result = await cron.handler(request({ action: 'dispatch' }, { 'x-forma-cron': 'mock-cron-credential' }))
    assert.deepEqual(await result.json(), { delivered: 0, failures: 1 })
    assert.equal(cron.sends.length, 0)
    assert.equal(cron.queries.some(query => query.table === 'forma_push_deliveries'), false)
    const browser = runtime({ returnUnsafeRow: unsafe })
    assert.equal((await browser.handler(userRequest({ action: 'test', endpoint }))).status, 400)
    assert.equal(browser.sends.length, 0)
  }
})

test('durable test cooldown is atomic across concurrent handlers and worker restarts', async () => {
  const deliveries = new Map()
  const first = runtime({ deliveries })
  const second = runtime({ deliveries })
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? first : second).handler(userRequest({ action: 'test', endpoint }))))
  assert.equal(responses.filter(response => response.status === 200).length, 1)
  assert.equal(responses.filter(response => response.status === 429).length, 11)
  assert.equal(first.sends.length + second.sends.length, 1)
  assert.ok(Number(responses.find(response => response.status === 429).headers.get('Retry-After')) > 0)
  assert.equal(first.sends.concat(second.sends)[0].options.timeout, 10_000)
  const restarted = runtime({ deliveries })
  assert.equal((await restarted.handler(userRequest({ action: 'test', endpoint }))).status, 429)
  assert.equal(restarted.sends.length, 0)
  // A minute boundary alone cannot reopen the slot.
  restarted.advanceTime(2000)
  assert.equal((await restarted.handler(userRequest({ action: 'test', endpoint }))).status, 429)
  // Once expired, competing conditional updates admit exactly one new sender.
  first.advanceTime(60_001)
  second.advanceTime(60_001)
  const renewed = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? first : second).handler(userRequest({ action: 'test', endpoint }))))
  assert.equal(renewed.filter(response => response.status === 200).length, 1)
  assert.equal(renewed.filter(response => response.status === 429).length, 11)
  assert.equal(first.sends.length + second.sends.length, 2)
  assert.equal(deliveries.size, 1)
  // Ownership and event predicates must not renew a different subscription's slot.
  const another = runtime({ deliveries, devices: [{ ...device, id: 'device-2' }] })
  assert.equal((await another.handler(userRequest({ action: 'test', endpoint }))).status, 200)
  assert.equal(deliveries.size, 2)
})

test('failed test sends consume cooldown; failed claims prevent sending; errors stay private', async () => {
  const app = runtime({ pushError: 503 })
  const response = await app.handler(userRequest({ action: 'test', endpoint }))
  assert.equal(response.status, 500)
  assert.equal((await app.handler(userRequest({ action: 'test', endpoint }))).status, 429)
  assert.equal(app.sends.length, 1)
  assert.doesNotMatch(await response.text(), /sensitive|mock-private|mock-cron/)
  assert.doesNotMatch(app.logs.join(' '), /sensitive|mock-private|mock-cron/)
  const unavailable = runtime({ claimError: true })
  assert.equal((await unavailable.handler(userRequest({ action: 'test', endpoint }))).status, 500)
  assert.equal(unavailable.sends.length, 0)
  const renewalFailure = runtime({ deliveries: app.deliveries, renewalError: true })
  renewalFailure.advanceTime(60_001)
  assert.equal((await renewalFailure.handler(userRequest({ action: 'test', endpoint }))).status, 500)
  assert.equal(renewalFailure.sends.length, 0)
  assert.doesNotMatch(renewalFailure.logs.join(' '), /sensitive/)
  app.advanceTime(60_001)
  assert.equal((await app.handler(userRequest({ action: 'test', endpoint }))).status, 500)
  assert.equal((await app.handler(userRequest({ action: 'test', endpoint }))).status, 429)
  assert.equal(app.sends.length, 2)
  assert.equal(app.deliveries.size, 1)
})

test('public key, CORS, and method handling expose no privileged data', async () => {
  const app = runtime()
  const publicKey = await app.handler(request({ action: 'public-key' }))
  assert.deepEqual(await publicKey.json(), { publicKey: 'mock-public' })
  assert.equal(publicKey.headers.get('Cache-Control'), 'no-store')
  const preflight = await app.handler(new Request('https://example.invalid', { method: 'OPTIONS', headers: { Origin: 'https://attacker.invalid', 'Access-Control-Request-Headers': 'x-forma-cron' } }))
  assert.doesNotMatch(preflight.headers.get('Access-Control-Allow-Headers'), /x-forma-cron/i)
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null)
  const calls = app.queries.length
  assert.equal((await app.handler(new Request('https://example.invalid'))).status, 405)
  assert.equal(app.queries.length, calls)
})
