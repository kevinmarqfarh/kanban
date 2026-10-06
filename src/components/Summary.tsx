import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, FileText, Upload, X } from 'lucide-react'
import type { DailyDebrief } from '../lib/types'

function formatDate(value: string, short = false) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('sv-SE', short
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'long', year: 'numeric' })
}

const isNew = (debrief: DailyDebrief) => !debrief.readAt && !debrief.dismissedAt

export function DebriefNotice({ debrief, onRead, onDismiss }: {
  debrief: DailyDebrief;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  return <section className="debrief-notice" aria-label="Ny debriefing" data-debrief-id={debrief.id}>
    <span className="debrief-notice-icon" aria-hidden="true"><FileText size={20} strokeWidth={1.5} /></span>
    <div className="debrief-notice-copy"><p className="debrief-notice-meta"><span>Ny debriefing</span><span aria-hidden="true">·</span><time dateTime={debrief.date}>{formatDate(debrief.date, true)}</time></p><h2>{debrief.title}</h2><p className="debrief-notice-summary">{debrief.summary}</p></div>
    <div className="debrief-notice-actions"><button className="button secondary" type="button" onClick={() => onRead(debrief.id)}>Läs<ArrowRight size={15} /></button><button className="icon-button" type="button" aria-label="Dölj debriefing" onClick={() => onDismiss(debrief.id)}><X size={17} /></button></div>
  </section>
}

export function Summary({ debriefs, initialId, onRead, onDismiss, onImport, error, onRetry, localOnly, onReaderChange }: {
  debriefs: DailyDebrief[];
  initialId?: string;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onImport: (value: unknown) => Promise<string | null>;
  error: string | null;
  onRetry: () => void;
  localOnly: boolean;
  onReaderChange?: (reading: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importButtonRef = useRef<HTMLButtonElement>(null)
  const readerHeadingRef = useRef<HTMLHeadingElement>(null)
  const readButtonsRef = useRef(new Map<string, HTMLButtonElement>())
  const returnIdRef = useRef<string | null>(initialId ?? null)
  const restoreFocusRef = useRef(false)
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead
  const ordered = [...debriefs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const latest = ordered[0]
  const history = ordered.slice(1)
  const selected = ordered.find(debrief => debrief.id === selectedId)
  const readerChangeRef = useRef(onReaderChange)
  readerChangeRef.current = onReaderChange
  useEffect(() => { readerChangeRef.current?.(!!selected) }, [selected?.id])

  useEffect(() => {
    if (!initialId) return
    setSelectedId(initialId)
    returnIdRef.current = initialId
    onReadRef.current(initialId)
  }, [initialId])

  useEffect(() => {
    if (selected) {
      readerHeadingRef.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'instant' })
    } else if (!selectedId && restoreFocusRef.current) {
      const button = returnIdRef.current ? readButtonsRef.current.get(returnIdRef.current) : undefined
      const focusTarget = button ?? importButtonRef.current
      focusTarget?.focus({ preventScroll: true })
      restoreFocusRef.current = false
    }
  }, [selectedId, selected?.id])

  function read(debrief: DailyDebrief) {
    returnIdRef.current = debrief.id
    setSelectedId(debrief.id)
    onRead(debrief.id)
  }

  function returnToOverview() {
    restoreFocusRef.current = true
    setSelectedId(null)
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file || importing) return
    setImportError('')
    setImportStatus('')
    if (file.size > 2 * 1024 * 1024) {
      setImportError('Filen är för stor. Välj en JSON-fil som är högst 2 MB.')
      input.value = ''
      return
    }
    setImporting(true)
    try {
      let value: unknown
      try { value = JSON.parse(await file.text()) } catch {
        setImportError('Filen kunde inte läsas. Välj en giltig JSON-fil.')
        return
      }
      const problem = await onImport(value)
      if (problem !== null) {
        setImportError(problem || 'Debriefingen kunde inte läsas in. Försök igen.')
        return
      }
      setImportStatus(Array.isArray(value) && value.length > 1 ? `${value.length} debriefingar är inlästa.` : 'Debriefingen är inläst.')
      setSelectedId(null)
    } catch {
      setImportError('Debriefingen kunde inte läsas in just nu. Försök igen.')
    } finally {
      setImporting(false)
      input.value = ''
    }
  }

  return <div className="summary-page">
    {error && <div className="debrief-error" role="alert"><p>{error}</p><button className="button secondary" type="button" onClick={onRetry}>Försök igen</button></div>}
    {selected ? <article className="debrief-reader" data-testid="debrief-reader" data-debrief-id={selected.id}>
      <div className="debrief-reader-tools"><button className="button ghost" type="button" onClick={returnToOverview}><ArrowLeft size={16} />Till översikten</button>{isNew(selected) && <button className="button ghost" type="button" onClick={() => onDismiss(selected.id)}>Dölj notis<X size={15} /></button>}</div>
      <header className="debrief-reader-heading"><time dateTime={selected.date}>{formatDate(selected.date)}</time><h2 ref={readerHeadingRef} tabIndex={-1}>{selected.title}</h2><p>{selected.summary}</p></header>
      <div className="debrief-reader-body">{selected.body}</div>
    </article> : <div className="summary-overview" data-testid="summary-overview">
      {latest ? <article className="summary-latest" data-testid="latest-debrief" data-debrief-id={latest.id}>
        <div className="summary-latest-meta"><div><span className="debrief-section-label">Senaste debriefing</span><time dateTime={latest.date}>{formatDate(latest.date)}</time></div><div className="summary-latest-state">{isNew(latest) && <><span className="debrief-new-badge">Nytt</span><button className="icon-button" type="button" aria-label="Dölj debriefing" onClick={() => onDismiss(latest.id)}><X size={17} /></button></>}</div></div>
        <h2>{latest.title}</h2><p className="summary-latest-description">{latest.summary}</p>
        <div className="summary-latest-action"><button ref={node => { if (node) readButtonsRef.current.set(latest.id, node); else readButtonsRef.current.delete(latest.id) }} className="button primary" type="button" onClick={() => read(latest)}>{latest.readAt ? 'Läs igen' : 'Läs debriefing'}<ArrowRight size={16} /></button></div>
      </article> : <section className="summary-latest summary-empty" data-testid="latest-debrief">
        <span className="summary-empty-icon" aria-hidden="true"><FileText size={25} strokeWidth={1.3} /></span><h2>Ingen debriefing ännu.</h2><p>Din första sammanfattning visas här.</p>
      </section>}
      <section className="summary-history" aria-labelledby="summary-history-title"><div className="summary-history-heading"><h2 id="summary-history-title">Tidigare dagar</h2>{history.length > 0 && <span>{history.length}</span>}</div>
        {history.length > 0 ? <div className="summary-history-list">{history.map(debrief => <button ref={node => { if (node) readButtonsRef.current.set(debrief.id, node); else readButtonsRef.current.delete(debrief.id) }} className="summary-history-row" data-debrief-id={debrief.id} data-debrief-date={debrief.date} type="button" aria-label={`Läs debriefing: ${debrief.title}`} key={debrief.id} onClick={() => read(debrief)}><span className="summary-history-row-copy"><span className="summary-history-row-meta"><time dateTime={debrief.date}>{formatDate(debrief.date)}</time>{isNew(debrief) && <span className="debrief-unread-marker">Oläst</span>}</span><strong>{debrief.title}</strong><span className="summary-history-excerpt">{debrief.summary}</span></span><ArrowRight size={16} /></button>)}</div> : <p className="summary-history-empty">Inga tidigare debriefingar.</p>}
        <div className="summary-import"><button ref={importButtonRef} className="button ghost" type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}><Upload size={16} />{importing ? 'Läser in…' : 'Läs in debriefing'}</button><input ref={fileInputRef} type="file" accept=".json,application/json" aria-label="Läs in debriefing" hidden disabled={importing} onChange={importFile} />
          {importError && <p className="debrief-import-error" role="alert">{importError}</p>}{importStatus && <p className="debrief-import-success" role="status"><Check size={14} />{importStatus}</p>}
        </div>
      </section>
    </div>}
    {localOnly && <p className="summary-local-help">Automationerna ansluts när molnsynk är klar.</p>}
  </div>
}
