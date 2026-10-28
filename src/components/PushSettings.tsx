import { useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { currentPushSubscription, decodeVapidKey, defaultPushSettings, pushAvailable, type PushSettings } from '../lib/push'

type Device = PushSettings & { id: string; endpoint: string }
export function PushSettingsPanel({ userId }: { userId: string | null }) {
  const [available, setAvailable] = useState(pushAvailable)
  const [permission, setPermission] = useState(() => 'Notification' in window ? Notification.permission : 'unsupported')
  const [publicKey, setPublicKey] = useState('')
  const [device, setDevice] = useState<Device | null>(null)
  const [preferences, setPreferences] = useState<PushSettings>(defaultPushSettings)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    setAvailable(pushAvailable()); setPermission('Notification' in window ? Notification.permission : 'unsupported')
    setDevice(null); setPreferences(defaultPushSettings)
    if (!userId || !supabase || !pushAvailable()) return
    void (async () => {
      try {
        const [key, subscription] = await Promise.all([supabase.functions.invoke('forma-push', { body: { action: 'public-key' } }), currentPushSubscription()])
        if (!active) return
        if (key.error || !key.data?.publicKey) { setMessage('Notistjänsten är inte redo ännu. Försök igen om en stund.'); return }
        setPublicKey(key.data.publicKey)
        if (!subscription) return
        const result = await supabase.from('forma_push_subscriptions').select('*').eq('user_id', userId).eq('endpoint', subscription.endpoint).maybeSingle()
        if (!active) return
        if (result.error) setMessage('Kunde inte läsa notisinställningarna.')
        else if (result.data) { setDevice(result.data as Device); setPreferences(result.data as PushSettings) }
      } catch { if (active) setMessage('Notistjänsten kunde inte kontaktas.') }
    })()
    return () => { active = false }
  }, [userId])
  async function activate() {
    if (!supabase || !userId || !publicKey || !pushAvailable()) return
    // iOS requires the permission prompt to be started by this button press.
    const asking = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission)
    setBusy(true); setMessage('')
    try {
      const answer = await asking; setPermission(answer)
      if (answer !== 'granted') { setMessage('Tillåt notiser i iPhones inställningar för Forma och försök igen.'); return }
      const worker = await navigator.serviceWorker.ready
      const subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) })
      const keys = subscription.toJSON().keys
      if (!keys?.p256dh || !keys.auth) throw new Error('Enhetsnycklar saknas.')
      const result = await supabase.from('forma_push_subscriptions').upsert({ user_id: userId, endpoint: subscription.endpoint, p256dh: keys.p256dh, auth_key: keys.auth, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Stockholm', ...preferences }, { onConflict: 'endpoint' }).select('*').single()
      if (result.error || !result.data) throw result.error ?? new Error('Registrering misslyckades.')
      setDevice(result.data as Device); setMessage('Notiser är aktiva på den här enheten.')
    } catch { setMessage('Kunde inte aktivera notiser. Kontrollera nätanslutning och försök igen.') }
    finally { setBusy(false) }
  }
  async function save(next: PushSettings) {
    if (!supabase || !device) return
    const before = preferences; setPreferences(next); setMessage('')
    const result = await supabase.from('forma_push_subscriptions').update(next).eq('id', device.id).select('*').single()
    if (result.error) { setPreferences(before); setMessage('Inställningen kunde inte sparas.') }
    else setDevice(result.data as Device)
  }
  async function deactivate() {
    if (!supabase || !userId || !device) return
    setBusy(true); setMessage('')
    try {
      const subscription = await currentPushSubscription()
      const result = await supabase.from('forma_push_subscriptions').delete().eq('user_id', userId).eq('id', device.id)
      if (result.error) throw result.error
      await subscription?.unsubscribe(); setDevice(null); setPreferences(defaultPushSettings); setMessage('Notiser har stängts av på den här enheten.')
    } catch { setMessage('Kunde inte stänga av notiser. Försök igen.') }
    finally { setBusy(false) }
  }
  async function test() {
    if (!supabase || !device) return
    setBusy(true); setMessage('')
    const result = await supabase.functions.invoke('forma-push', { body: { action: 'test', endpoint: device.endpoint } })
    setMessage(result.error || result.data?.error ? 'Testnotisen kunde inte skickas.' : 'Testnotis skickad till den här enheten.')
    setBusy(false)
  }
  return <section className="profile-card" aria-labelledby="push-settings-title">
    <div className="profile-section-heading"><Bell size={18} /><h2 id="push-settings-title">Notiser</h2></div>
    {!userId ? <p className="profile-description">Logga in för att aktivera notiser på dina enheter.</p> : !available ? <p className="profile-description">Öppna Forma från hemskärmen på iPhone eller iPad för att aktivera notiser. iOS 16.4 eller senare krävs.</p> : <>
      <p className="profile-description">Påminnelser visas av iOS även när Forma är stängd. Valen gäller den här enheten.</p>
      {!device ? <button className="button primary" type="button" disabled={busy || !publicKey || permission === 'denied'} onClick={activate}><Bell size={16} />Aktivera notiser</button> : <>
        <label className="push-setting"><input type="checkbox" checked={preferences.enabled} onChange={event => void save({ ...preferences, enabled: event.target.checked })} />Skicka notiser på den här enheten</label>
        <label className="push-setting"><input type="checkbox" checked={preferences.tasks} onChange={event => void save({ ...preferences, tasks: event.target.checked })} />Uppgifter med deadline</label>
        <label className="push-setting"><input type="checkbox" checked={preferences.schedule} onChange={event => void save({ ...preferences, schedule: event.target.checked })} />Aktiviteter i Schema</label>
        <label className="push-setting"><input type="checkbox" checked={preferences.birthdays} onChange={event => void save({ ...preferences, birthdays: event.target.checked })} />Födelsedagar</label>
        <label className="push-setting">Påminn mig före<select className="select" value={preferences.lead_minutes} onChange={event => void save({ ...preferences, lead_minutes: Number(event.target.value) })}>{[0, 5, 15, 60].map(value => <option value={value} key={value}>{value === 0 ? 'Vid start' : `${value} minuter`}</option>)}</select></label>
        <div className="push-quiet"><span>Tysta tider</span><input className="input" type="time" aria-label="Tyst från" value={preferences.quiet_start?.slice(0, 5) ?? ''} onChange={event => void save({ ...preferences, quiet_start: event.target.value || null })} /><span>till</span><input className="input" type="time" aria-label="Tyst till" value={preferences.quiet_end?.slice(0, 5) ?? ''} onChange={event => void save({ ...preferences, quiet_end: event.target.value || null })} /></div>
        <div className="home-layout-actions"><button className="button secondary" type="button" disabled={busy} onClick={test}><Send size={15} />Skicka testnotis</button><button className="button ghost" type="button" disabled={busy} onClick={deactivate}><BellOff size={15} />Stäng av på enheten</button></div>
      </>}
      {permission === 'denied' && <p className="profile-description">Notiser är blockerade i iOS. Ändra detta i Inställningar → Notiser → Forma.</p>}
    </>}
    {message && <p role="status" className="profile-description">{message}</p>}
  </section>
}
