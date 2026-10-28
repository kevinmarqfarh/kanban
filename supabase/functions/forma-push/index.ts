import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { events, type Device, type Workspace } from './reminders.ts'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forma-cron', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
const textError = (error: unknown) => error instanceof Error ? error.message : String(error)
async function keys() {
  const { data, error } = await db.from('forma_push_config').select('*').eq('id', true).single()
  if (error || !data) throw new Error('Notisnycklar saknas i databasen.')
  if (data.vapid_public && data.vapid_private) return data
  const pair = webpush.generateVAPIDKeys()
  const { data: saved, error: failed } = await db.from('forma_push_config').update({ vapid_public: pair.publicKey, vapid_private: pair.privateKey }).eq('id', true).is('vapid_public', null).select('*').maybeSingle()
  if (failed) throw failed
  if (saved) return saved
  const refreshed = await db.from('forma_push_config').select('*').eq('id', true).single()
  if (refreshed.error || !refreshed.data) throw refreshed.error ?? new Error('Notisnycklar saknas.')
  return refreshed.data
}
async function send(device: Device, payload: { title: string; body: string; url: string; tag?: string }, config: { vapid_public: string; vapid_private: string }) {
  webpush.setVapidDetails('https://forma.app', config.vapid_public, config.vapid_private)
  await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth_key } }, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' })
}
async function dispatch(config: { vapid_public: string; vapid_private: string }) {
  const { data: devices, error } = await db.from('forma_push_subscriptions').select('*').eq('enabled', true).limit(500)
  if (error) throw error
  let delivered = 0, failures = 0
  const workspaces = new Map<string, Workspace>()
  for (const device of (devices ?? []) as Device[]) {
    try {
      let workspace = workspaces.get(device.user_id)
      if (!workspace) {
        const result = await db.from('kanban_workspaces').select('data').eq('user_id', device.user_id).maybeSingle()
        if (result.error || !result.data) continue
        workspace = result.data.data as Workspace; workspaces.set(device.user_id, workspace)
      }
      for (const event of events(workspace, device, new Date())) {
        const claim = await db.from('forma_push_deliveries').insert({ subscription_id: device.id, event_key: event.key })
        if (claim.error?.code === '23505') continue
        if (claim.error) throw claim.error
        try {
          await send(device, { ...event, tag: event.key }, config)
          await db.from('forma_push_deliveries').update({ delivered_at: new Date().toISOString() }).eq('subscription_id', device.id).eq('event_key', event.key)
          delivered++
        } catch (failure) {
          if ((failure as { statusCode?: number }).statusCode === 404 || (failure as { statusCode?: number }).statusCode === 410) await db.from('forma_push_subscriptions').delete().eq('id', device.id)
          else await db.from('forma_push_deliveries').delete().eq('subscription_id', device.id).eq('event_key', event.key)
          failures++; console.error('Push delivery failed', textError(failure))
        }
      }
    } catch (failure) { failures++; console.error('Push processing failed', textError(failure)) }
  }
  return { delivered, failures }
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return json({ ok: true })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await request.json().catch(() => ({}))
    const config = await keys()
    if (body.action === 'public-key') return json({ publicKey: config.vapid_public })
    if (body.action === 'dispatch') {
      if (!request.headers.get('x-forma-cron') || request.headers.get('x-forma-cron') !== config.cron_token) return json({ error: 'Unauthorized' }, 401)
      return json(await dispatch(config))
    }
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Unauthorized' }, 401)
    const user = await db.auth.getUser(token)
    if (user.error || !user.data.user) return json({ error: 'Unauthorized' }, 401)
    if (body.action === 'test') {
      const { data: device, error } = await db.from('forma_push_subscriptions').select('*').eq('user_id', user.data.user.id).eq('endpoint', String(body.endpoint ?? '')).maybeSingle()
      if (error || !device) return json({ error: 'Enheten är inte registrerad.' }, 404)
      await send(device as Device, { title: 'Forma', body: 'Testnotisen fungerar.', url: '/?view=home', tag: 'forma-test' }, config)
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (failure) { console.error('Push function error', textError(failure)); return json({ error: 'Notistjänsten kunde inte slutföra begäran.' }, 500) }
})
