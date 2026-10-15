import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { claimAutoReload, crashRecord, reportCrash, type CrashRecord } from '../lib/crashReport'

export const AUTO_RELOAD_SECONDS = 20
// React may mount the crash screen more than once for one failure; decide on a reload once per page load.
let decided: boolean | null = null
const autoReloadAllowed = () => (decided ??= claimAutoReload())

/** What you see instead of a blank screen: what happened, a reload button, and an automatic reload. */
export function CrashScreen({ record, reload = () => window.location.reload() }: { record: CrashRecord; reload?: () => void }) {
  const [autoReload] = useState(autoReloadAllowed)
  const [left, setLeft] = useState(AUTO_RELOAD_SECONDS)
  useEffect(() => {
    if (!autoReload) return
    const timer = window.setInterval(() => setLeft(value => value - 1), 1000)
    return () => window.clearInterval(timer)
  }, [autoReload])
  useEffect(() => { if (autoReload && left <= 0) reload() }, [autoReload, left, reload])
  return <main className="crash-screen" role="alert" data-testid="crash-screen">
    <div className="crash-card">
      <p className="crash-brand">forma.</p>
      <h1>Något gick fel</h1>
      <p>Forma stötte på ett fel och kunde inte visa sidan. Inget du sparat har försvunnit.</p>
      <button className="button primary" type="button" onClick={reload}><RotateCw size={16} />Ladda om</button>
      <p className="crash-auto">{autoReload ? `Laddar om automatiskt om ${Math.max(0, left)} s.` : 'Felet har kommit flera gånger. Tryck på Ladda om när du vill försöka igen.'}</p>
      <details>
        <summary>Teknisk information</summary>
        <pre>{`${record.message}\nVersion ${record.version} · ${new Date(record.at).toLocaleString('sv-SE')}\n${record.userAgent}`}</pre>
      </details>
    </div>
  </main>
}

/** Catches errors while rendering so one broken part never blanks the whole app. */
export class CrashBoundary extends Component<{ children: ReactNode }, { record: CrashRecord | null }> {
  state: { record: CrashRecord | null } = { record: null }
  static getDerivedStateFromError(error: unknown) { return { record: crashRecord(error, 'render') } }
  componentDidCatch(error: unknown, info: ErrorInfo) { reportCrash(crashRecord(error, 'render', info.componentStack ?? '')) }
  render() { return this.state.record ? <CrashScreen record={this.state.record} /> : this.props.children }
}
