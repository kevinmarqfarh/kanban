import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/cloud.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
const cloud = {}
new Function('exports', outputText)(cloud)
const { fetchWithTimeout, cloudErrorKind, cloudErrorMessage, isRetryableNetworkError, TIMEOUT_MESSAGE } = cloud

// Simulate iPadOS 15: the helper must not touch AbortSignal.timeout or AbortSignal.any.
const savedTimeout = AbortSignal.timeout, savedAny = AbortSignal.any
delete AbortSignal.timeout; delete AbortSignal.any

const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
// Like real fetch: rejects at once for an aborted signal, otherwise hangs until aborted.
const hanging = (input, init) => new Promise((resolve, reject) => init.signal.aborted ? reject(abortError()) : init.signal.addEventListener('abort', () => reject(abortError())))

// Resolves normally and passes the signal through.
let seen
const ok = await fetchWithTimeout('https://example.invalid', { method: 'POST' }, 1000, async (input, init) => { seen = init; return new Response('ok') })
assert.equal(await ok.text(), 'ok')
assert.equal(seen.method, 'POST')
assert.ok(seen.signal instanceof AbortSignal)

// Times out with a message that maps to "timeout", not "unsupported" or "unreachable".
await assert.rejects(fetchWithTimeout('https://example.invalid', {}, 20, hanging), error => error.message === TIMEOUT_MESSAGE)
assert.equal(cloudErrorKind(TIMEOUT_MESSAGE), 'timeout')

// A caller's abort still wins and stays an AbortError (supabase-js relies on this).
const outer = new AbortController()
const pending = fetchWithTimeout('https://example.invalid', { signal: outer.signal }, 5000, hanging)
outer.abort()
await assert.rejects(pending, error => error.name === 'AbortError')
// Already-aborted signal aborts immediately.
const aborted = new AbortController(); aborted.abort()
await assert.rejects(fetchWithTimeout('https://example.invalid', { signal: aborted.signal }, 5000, hanging), error => error.name === 'AbortError')
// Network failures pass through unchanged.
await assert.rejects(fetchWithTimeout('https://example.invalid', {}, 5000, async () => { throw new TypeError('Load failed') }), /Load failed/)

AbortSignal.timeout = savedTimeout; AbortSignal.any = savedAny

// Error classification: the exact iPad bug must be "unsupported", never "cloud not answering".
assert.equal(cloudErrorKind('AbortSignal.timeout is not a function. (In \'AbortSignal.timeout(15e3)\', \'AbortSignal.timeout\' is undefined)'), 'unsupported')
assert.equal(cloudErrorKind('Load failed'), 'unreachable', 'Safari network error')
assert.equal(cloudErrorKind('Failed to fetch'), 'unreachable', 'Chrome network error')
assert.equal(cloudErrorKind('NetworkError when attempting to fetch resource.'), 'unreachable', 'Firefox network error')
assert.equal(cloudErrorKind('The operation timed out.'), 'timeout')
assert.equal(cloudErrorKind('Invalid login credentials'), 'credentials')
assert.equal(cloudErrorKind('Email not confirmed'), 'unconfirmed')
assert.equal(cloudErrorKind('For security purposes, you can only request this after 30 seconds.'), 'rate-limit')
assert.equal(cloudErrorKind('relation "public.kanban_workspaces" does not exist'), 'setup')
assert.equal(cloudErrorKind('anything', false), 'offline')
assert.equal(cloudErrorKind('Something odd'), 'other')
assert.equal(cloudErrorMessage(new Error('Invalid login credentials')), 'E-postadressen eller lösenordet stämmer inte.')
assert.match(cloudErrorMessage(new Error('AbortSignal.timeout is not a function')), /Webbläsaren saknar en funktion/)
assert.match(cloudErrorMessage(new TypeError('Load failed')), /^Kunde inte nå molnet/)
assert.equal(cloudErrorMessage(new Error('Something odd')), 'Something odd')
assert.equal(cloudErrorMessage(null), 'Något gick fel. Dina ändringar finns kvar på enheten.')
assert.equal(isRetryableNetworkError(new TypeError('Load failed')), true)
assert.equal(isRetryableNetworkError(new Error(TIMEOUT_MESSAGE)), true)
assert.equal(isRetryableNetworkError(new Error('x'), false), true)
assert.equal(isRetryableNetworkError(new Error('Invalid login credentials')), false)
assert.equal(isRetryableNetworkError(new Error('AbortSignal.timeout is not a function')), false)

console.log('Cloud helpers passed: timeout without AbortSignal.timeout/any (iPadOS 15), caller abort, pass-through errors, and honest error classification for Safari, Chrome and Firefox.')
