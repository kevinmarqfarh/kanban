// Crash handling: what is recorded, and the guard that stops reload loops on an unattended iPad.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/crashReport.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
const crash = {}
globalThis.__FORMA_VERSION__ = 'abc1234'
new Function('exports', 'require', outputText)(crash, name => { throw new Error(`Unexpected dependency: ${name}`) })
const { describe, crashRecord, claimAutoReload, AUTO_RELOAD_LIMIT, AUTO_RELOAD_WINDOW_MS, AUTO_RELOAD_KEY, APP_VERSION } = crash

assert.equal(APP_VERSION, 'abc1234', 'The build version is part of every record.')
const error = new TypeError('x is not a function')
assert.equal(describe(error).message, 'TypeError: x is not a function')
assert.match(describe(error).stack, /TypeError/)
assert.equal(describe('plain text').message, 'plain text')
assert.equal(describe({ code: 42 }).message, '{"code":42}')
assert.equal(describe(undefined).message, 'undefined')
assert.equal(describe(new Error('x'.repeat(2000))).message.length, 500, 'Long messages are clipped.')

const record = crashRecord(error, 'render', '    at Home\n    at App', new Date('2026-10-15T12:51:00Z'))
assert.equal(record.source, 'render')
assert.equal(record.at, '2026-10-15T12:51:00.000Z')
assert.equal(record.version, 'abc1234')
assert.match(record.stack, /--- component stack ---\n {4}at Home/)

// Reload guard: three automatic reloads per 15 minutes, then the message stays.
const store = new Map()
const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
const t0 = Date.parse('2026-10-15T12:00:00Z')
for (let i = 0; i < AUTO_RELOAD_LIMIT; i++) assert.equal(claimAutoReload(t0 + i * 60_000, storage), true, `reload ${i + 1}`)
assert.equal(claimAutoReload(t0 + 5 * 60_000, storage), false, 'A crash loop stops reloading.')
assert.equal(claimAutoReload(t0 + AUTO_RELOAD_WINDOW_MS + 60_000, storage), true, 'After the window it may try again.')
store.set(AUTO_RELOAD_KEY, 'not json')
assert.equal(claimAutoReload(t0, storage), true, 'Broken bookkeeping never blocks recovery.')
assert.equal(claimAutoReload(t0, { getItem: () => null, setItem: () => { throw new Error('blocked') } }), false, 'Without storage it never reloads blindly in a loop.')

console.log('Crash handling passed: error descriptions and clipping, build version and component stack, reload guard against loops.')
