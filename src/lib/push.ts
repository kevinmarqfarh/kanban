import { supabase } from './supabase'

export type PushSettings = { enabled: boolean; tasks: boolean; schedule: boolean; birthdays: boolean; lead_minutes: number; quiet_start: string | null; quiet_end: string | null }
export const defaultPushSettings: PushSettings = { enabled: true, tasks: true, schedule: true, birthdays: true, lead_minutes: 15, quiet_start: null, quiet_end: null }
export function pushAvailable() {
  return !!(supabase && import.meta.env.PROD && window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window)
}
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushAvailable()) return null
  // `ready` never settles when registration is blocked or failed. Reading an
  // existing subscription must not prevent the user from signing out.
  const worker = await navigator.serviceWorker.getRegistration()
  return worker ? worker.pushManager.getSubscription() : null
}
export async function removeCurrentPushSubscription(userId: string): Promise<string | null> {
  if (!supabase) return null
  try {
    const subscription = await currentPushSubscription()
    if (!subscription) return null
    const { error } = await supabase.from('forma_push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint)
    if (error) return 'Notiserna kunde inte stängas av på den här enheten. Försök igen innan du loggar ut.'
    await subscription.unsubscribe()
    return null
  } catch { return 'Notiserna kunde inte stängas av på den här enheten. Försök igen innan du loggar ut.' }
}
export function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
  return bytes
}
