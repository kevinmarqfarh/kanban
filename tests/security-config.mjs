import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/publicKey.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const keys = {}
new Function('exports', outputText)(keys)
const jwt = role => `${btoa('{}')}.${btoa(JSON.stringify({ role }))}.synthetic-signature`
for (const value of [undefined, '', 'sb_publishable_test', jwt('anon')]) keys.assertPublicBuildKey(value)
for (const value of ['sb_secret_test', jwt('service_role'), jwt('authenticated'), 'malformed']) {
  assert.equal(keys.isPublicKey(value), false)
  assert.throws(() => keys.assertPublicBuildKey(value), /Build stopped/)
}
// Exercise the real build hook, rather than only its helper. Never use a real credential.
const target = path.join(mkdtempSync(path.join(tmpdir(), 'forma-secret-build-')), 'dist')
const secret = 'sb_secret_synthetic_build_guard_test'
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', target], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
  env: { ...process.env, VITE_SUPABASE_PUBLISHABLE_KEY: secret },
})
assert.notEqual(result.status, 0)
assert.match(result.stdout + result.stderr, /Build stopped before exposing a server secret/)
assert.equal((result.stdout + result.stderr).includes(secret), false, 'The key must never appear in diagnostics.')
assert.equal(existsSync(target), false, 'A rejected key must not produce browser assets.')
console.log('Security config passed: public key types, secret rejection before build, no credential in logs or output.')
