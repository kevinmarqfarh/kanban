import { useState, type FormEvent } from 'react'
import { Sun, Moon, Monitor, Cloud, HardDrive, LogOut, Download, Smartphone, ArrowRight, Check, ChevronDown, Tablet } from 'lucide-react'
import type { useHomeScreen } from '../hooks/useHomeScreen'
import { useWorkspace } from '../hooks/useWorkspace'
import { supabaseConfigured } from '../lib/supabase'

export type ThemePreference = 'light' | 'dark' | 'system'
export function Profile({ data, theme, onTheme, onExport, syncText, homeScreen }: {
  data: ReturnType<typeof useWorkspace>; theme: ThemePreference; onTheme: (theme: ThemePreference) => void; onExport: () => void; syncText: string;
  homeScreen?: ReturnType<typeof useHomeScreen>;
}) {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const birthdays = data.workspace.birthdays ?? []
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(null)
    const result = await (authMode === 'signin' ? data.signIn(email, password) : data.signUp(email, password))
    setBusy(false)
    if (result.error || result.message) setMessage({ text: result.error ?? result.message!, error: !!result.error })
    if (!result.error) setPassword('')
  }
  async function signOut() {
    setBusy(true)
    const result = await data.signOut()
    setBusy(false)
    if (result.error) setMessage({ text: result.error, error: true })
  }
  return <div className="profile-layout profile-revised">
    <section className="profile-card profile-account">
      <div className="profile-section-heading">{data.user ? <Cloud size={18} /> : <HardDrive size={18} />}<h2>Lagring</h2></div>
      <p className="sync-indicator profile-sync" data-status={data.syncStatus}>{data.user ? <Cloud size={13} /> : <HardDrive size={13} />}<span>{syncText}</span></p><div className="profile-storage"><strong>{data.user ? 'Molnsynk' : 'Sparas lokalt'}</strong>{data.user && <span>{data.user.email}</span>}<p>{data.user ? 'Innehållet synkas mellan dina enheter.' : supabaseConfigured ? 'Logga in för att synka mellan dina enheter.' : 'Innehållet sparas i den här webbläsaren.'}</p></div>
      {data.user ? <>
        {!data.workspace.tasks.length && !data.workspace.projects.length && !birthdays.length && !data.workspace.workouts?.length && !data.workspace.nutritionHabits?.length && !data.workspace.nutritionCompletions?.length && !data.workspace.recipes?.length && !data.workspace.notes?.length && !data.workspace.birthdayNotifications?.length && <button className="button secondary" onClick={() => { const result = data.importLocalWorkspace(); setMessage({ text: result.error ?? result.message!, error: !!result.error }) }}>Kopiera lokal tavla<ArrowRight size={16} /></button>}
        <button className="button secondary" disabled={busy || data.loading || data.syncStatus === 'syncing'} onClick={signOut}><LogOut size={16} />Logga ut</button>
      </> : supabaseConfigured && <>
        <div className="segmented-control auth-tabs"><button className={authMode === 'signin' ? 'active' : ''} onClick={() => { setAuthMode('signin'); setMessage(null) }}>Logga in</button><button className={authMode === 'signup' ? 'active' : ''} onClick={() => { setAuthMode('signup'); setMessage(null) }}>Skapa konto</button></div>
        <form className="auth-form" onSubmit={submit}><label className="field">E-post<input className="input" type="email" autoComplete="email" required placeholder="du@exempel.se" value={email} onChange={event => setEmail(event.target.value)} /></label><label className="field">Lösenord<input className="input" type="password" minLength={authMode === 'signup' ? 8 : 1} required autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} placeholder={authMode === 'signup' ? 'Minst 8 tecken' : 'Lösenord'} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="button primary" disabled={busy} type="submit">{busy ? 'Vänta…' : authMode === 'signin' ? 'Logga in' : 'Skapa konto'}<ArrowRight size={16} /></button></form>
      </>}
      {message && <div className={`form-message ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}>{!message.error && <Check size={17} />}<p>{message.text}</p></div>}
    </section>

    <section className="profile-card"><div className="profile-section-heading"><Sun size={18} /><h2>Tema</h2></div><div className="theme-picker" aria-label="Välj tema">{([{ id: 'light', label: 'Ljust', Icon: Sun }, { id: 'dark', label: 'Mörkt', Icon: Moon }, { id: 'system', label: 'System', Icon: Monitor }] as const).map(({ id, label, Icon }) => <button key={id} className={`theme-option ${theme === id ? 'active' : ''}`} aria-pressed={theme === id} onClick={() => onTheme(id)}><Icon size={19} strokeWidth={1.5} /><span>{label}</span></button>)}</div></section>
    {homeScreen && <section className="profile-card profile-homescreen" aria-labelledby="homescreen-title"><div className="profile-section-heading"><Tablet size={18} /><h2 id="homescreen-title">Hemskärm</h2></div>
      <p className="profile-description">Home visar dagen på en enda skärm: klockan, Gör först, kost och tillskott att bocka av, kommande dagar och en snabbuppgift. Appen går tillbaka till Home efter tre minuter utan beröring och hämtar ändringar från dina andra enheter varje minut. Valet gäller bara den här enheten.</p>
      <div className="segmented-control homescreen-options" role="group" aria-label="Hemskärm">{([{ id: 'auto', label: homeScreen.tablet ? 'Auto (på)' : 'Auto (av)' }, { id: 'on', label: 'På' }, { id: 'off', label: 'Av' }] as const).map(option => <button key={option.id} type="button" className={homeScreen.mode === option.id ? 'active' : ''} aria-pressed={homeScreen.mode === option.id} onClick={() => homeScreen.setMode(option.id)}>{option.label}</button>)}</div>
      <details className="profile-tips"><summary>Tips för en dockad iPad<ChevronDown size={15} /></summary><ul>
        <li>Lägg till Forma på hemskärmen (Dela → Lägg till på hemskärmen) så öppnas appen i helskärm utan Safaris verktygsfält.</li>
        <li>Inställningar → Skärm och ljusstyrka → Autolås → Aldrig, så att skärmen är tänd när den står i laddaren.</li>
        <li>Vill du låsa iPaden till Forma: Inställningar → Hjälpmedel → Guidad åtkomst, och starta den med tre tryck på hemknappen.</li>
      </ul></details>
    </section>}
    <section className="profile-card"><div className="profile-section-heading"><Download size={18} /><h2>Säkerhetskopia</h2></div><p className="profile-description">Ladda ned en kopia av allt ditt innehåll.</p><button className="button secondary" aria-label="Exportera säkerhetskopia" onClick={onExport}><Download size={16} />Ladda ned</button></section>
    <details className="profile-install"><summary><Smartphone size={17} /><span>Lägg till på hemskärmen</span><ChevronDown size={15} /></summary><p>Öppna appen i Safari på din iPhone. Tryck på Dela och välj Lägg till på hemskärmen.</p></details>
  </div>
}
