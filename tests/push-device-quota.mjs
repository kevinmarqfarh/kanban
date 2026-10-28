// Run: node tests/push-device-quota.mjs
// Uses only a disposable PostgreSQL 17 Docker container, with no network or
// published ports. Never reads project credentials or connects to Supabase.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

if (spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 10_000 }).status !== 0) {
  console.log('SKIP push device quota runtime test: Docker is unavailable; PostgreSQL concurrency was not verified.')
  process.exit(0)
}

const container = `forma-device-quota-${process.pid}-${Date.now()}`
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const psqlArgs = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
function query(sql, expectedCode = 0) {
  const result = spawnSync('docker', psqlArgs, { input: sql, encoding: 'utf8', timeout: 15_000 })
  assert.equal(result.status, expectedCode, result.stderr || String(result.error))
  return result
}
function background(sql) {
  const child = spawn('docker', psqlArgs, { stdio: ['pipe', 'pipe', 'pipe'] })
  const done = new Promise((resolve, reject) => {
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', reject)
    child.on('close', status => resolve({ status, stdout, stderr }))
  })
  child.stdin.end(sql)
  return done
}
async function waitForHolder() {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (query("select exists(select 1 from pg_stat_activity where application_name = 'forma-quota-holder' and wait_event = 'PgSleep');").stdout.trim() === 't') return
    await delay(20)
  }
  throw new Error('The concurrent transaction did not acquire its lock in time')
}
const asUser = (owner, sql) => `set role authenticated; set request.jwt.claim.sub = '${owner}'; ${sql}`
const insert = (owner, endpoint) => `insert into public.forma_push_subscriptions(user_id,endpoint,p256dh,auth_key) values ('${owner}','https://push.example.invalid/${endpoint}','fixture-public','fixture-auth');`
const fill = (owner, count) => `insert into public.forma_push_subscriptions(user_id,endpoint,p256dh,auth_key) select '${owner}', 'https://push.example.invalid/${owner}/' || n, 'fixture-public', 'fixture-auth' from generate_series(1,${count}) n;`
const count = owner => Number(query(`select count(*) from public.forma_push_subscriptions where user_id='${owner}';`).stdout.trim())

try {
  const started = spawnSync('docker', ['run', '--rm', '-d', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17'], { encoding: 'utf8', timeout: 120_000 })
  assert.equal(started.status, 0, started.stderr || String(started.error))
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8', timeout: 2000 }).status === 0) { ready = true; break }
    await delay(100)
  }
  assert.ok(ready, 'Disposable PostgreSQL did not become ready')
  const base = await readFile(new URL('../supabase/migrations/20261028190000_forma_web_push.sql', import.meta.url), 'utf8')
  const quota = await readFile(new URL('../supabase/migrations/20261028193001_forma_push_device_quota.sql', import.meta.url), 'utf8')
  query(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as
      $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    insert into auth.users values ('${a}'),('${b}');
    ${base}
    ${quota}
  `)

  query(asUser(a, fill(a, 10)))
  assert.equal(count(a), 10)
  assert.match(query(asUser(a, insert(a, 'eleventh')), 3).stderr, /23514.*at most 10/)
  query(asUser(b, insert(b, 'other-owner')))
  assert.equal(count(b), 1, 'Another account has its own quota')
  query(asUser(a, `insert into public.forma_push_subscriptions(user_id,endpoint,p256dh,auth_key)
    values ('${a}','https://push.example.invalid/${a}/1','fixture-public','fixture-auth')
    on conflict(endpoint) do update set enabled=false, user_id=excluded.user_id;`))
  assert.equal(count(a), 10, 'An existing endpoint can be upserted at quota')
  query(asUser(a, "update public.forma_push_subscriptions set tasks=false;"))
  query(asUser(a, `delete from public.forma_push_subscriptions where endpoint='https://push.example.invalid/${a}/10'; ${insert(a, 'replacement')}`))
  assert.equal(count(a), 10, 'Deleting a device releases capacity')
  assert.match(query(`set role service_role; ${insert(a, 'service-eleventh')}`, 3).stderr, /23514.*at most 10/)
  assert.match(query(`set role service_role; update public.forma_push_subscriptions set user_id='${a}' where user_id='${b}';`, 3).stderr, /23514.*at most 10/)
  assert.match(query(`begin isolation level repeatable read; ${asUser(b, insert(b, 'fixed-snapshot'))}`, 3).stderr, /25000.*READ COMMITTED/)

  // Even when a victim's advisory lock is occupied, a forged owner must fail
  // immediately with permission denied, rather than timing out on that lock.
  const victimLock = background(`set application_name='forma-quota-holder'; begin;
    select pg_advisory_xact_lock(hashtextextended('forma_push_device_quota:${b}',0));
    select pg_sleep(3); commit;`)
  await waitForHolder()
  assert.match(query(asUser(a, `set statement_timeout='200ms'; ${insert(b, 'forged-owner')}`), 3).stderr, /42501.*owner must match/)
  assert.equal((await victimLock).status, 0)

  // Two simultaneous new endpoints compete for the tenth slot. The second
  // INSERT starts before the first commits, so its outer statement snapshot is
  // deliberately stale; the trigger must refresh its count after the wait.
  query(`delete from public.forma_push_subscriptions; ${fill(a, 9)}`)
  const holder = background(`set application_name='forma-quota-holder'; begin; ${asUser(a, insert(a, 'concurrent-first'))} select pg_sleep(3); commit;`)
  await waitForHolder()
  const waiter = await background(asUser(a, insert(a, 'concurrent-second')))
  assert.equal((await holder).status, 0)
  assert.equal(waiter.status, 3, waiter.stderr)
  assert.match(waiter.stderr, /23514.*at most 10/)
  assert.equal(count(a), 10, 'Concurrent inserts cannot exceed the quota')

  query('delete from public.forma_push_subscriptions;')
  assert.match(query(asUser(a, fill(a, 11)), 3).stderr, /23514.*at most 10/)
  assert.equal(count(a), 0, 'An oversized batch rolls back atomically')
  assert.equal(query("select prosecdef from pg_proc where oid='public.enforce_forma_push_device_quota()'::regprocedure;").stdout.trim(), 'f')
  console.log('PASS isolated PostgreSQL device quota: boundaries, RLS owner guard before lock, upsert, deletion, privileged transfers, isolation guard, batches and concurrent inserts.')
} finally {
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', timeout: 15_000 })
}
