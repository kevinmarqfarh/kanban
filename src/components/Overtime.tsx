import { useState, type FormEvent } from 'react'
import { Check, Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import type { OvertimeEntry } from '../lib/types'
import { newId } from '../lib/helpers'
import { isValidBirthDate } from '../lib/birthdays'
import { formatOvertime, overtimeBalance, overtimeMinutes } from '../lib/overtime'
import { useLocalDay } from '../hooks/useLocalDay'
import { Modal } from './Modal'

type Save = (entry: OvertimeEntry, original?: OvertimeEntry) => string | null

function OvertimeEditor({ entry, today, onSave, onDelete, onClose }: {
  entry?: OvertimeEntry; today: string; onSave: Save; onDelete: (id: string) => string | null; onClose: () => void;
}) {
  const [original] = useState(() => entry ? structuredClone(entry) : undefined)
  const [draft, setDraft] = useState<OvertimeEntry>(() => entry ? structuredClone(entry) : {
    id: newId(), date: today, startTime: '', endTime: '', comment: '', taken: false, createdAt: new Date().toISOString(),
  })
  const [error, setError] = useState<string | null>(null)
  const duration = overtimeMinutes(draft.startTime, draft.endTime)
  function save(event: FormEvent) {
    event.preventDefault()
    if (!isValidBirthDate(draft.date)) { setError('Ange ett giltigt datum.'); return }
    if (!duration) { setError('Ange ett tidsintervall med olika start- och sluttid.'); return }
    const failure = onSave({ ...draft, comment: draft.comment.trim() }, original)
    if (failure) setError(failure)
    else onClose()
  }
  const dirty = original ? JSON.stringify(draft) !== JSON.stringify(original) : !!(draft.startTime || draft.endTime || draft.comment || draft.taken || draft.date !== today)
  return <Modal title={entry ? 'Redigera övertid' : 'Registrera övertid'} onClose={onClose} dirty={dirty} error={error} footer={requestClose => <>
    {entry && <button className="icon-button danger" type="button" aria-label="Ta bort övertid" onClick={() => { const failure = onDelete(entry.id); if (failure) setError(failure); else onClose() }}><Trash2 size={18} /></button>}
    <button className="button secondary" type="button" onClick={requestClose}>Avbryt</button><button className="button primary" type="submit" form="overtime-form"><Check size={16} />Spara</button>
  </>}>
    <form id="overtime-form" onSubmit={save}>
      <label className="field">Datum<input className="input" type="date" min="0001-01-01" max="9999-12-31" required autoFocus value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <div className="field-row"><label className="field">Från<input className="input" type="time" required value={draft.startTime} onChange={event => setDraft({ ...draft, startTime: event.target.value })} /></label><label className="field">Till<input className="input" type="time" required value={draft.endTime} onChange={event => setDraft({ ...draft, endTime: event.target.value })} /></label></div>
      <p className="others-help" aria-live="polite">{duration ? `${formatOvertime(duration)}${draft.endTime < draft.startTime ? ' · Slutar nästa dag' : ''}` : 'Välj start- och sluttid.'} Tidigare sluttid räknas som nästa dag.</p>
      <label className="field">Kommentar<textarea className="textarea" rows={3} maxLength={4000} placeholder="T.ex. jour – felsökning av driftstörning" value={draft.comment} onChange={event => setDraft({ ...draft, comment: event.target.value })} /></label>
      <label className="overtime-taken"><input type="checkbox" checked={draft.taken} onChange={event => setDraft({ ...draft, taken: event.target.checked })} />Tiden är uttagen</label>
    </form>
  </Modal>
}

export function Overtime({ entries, onSave, onDelete }: { entries: OvertimeEntry[]; onSave: Save; onDelete: (id: string) => string | null }) {
  const today = useLocalDay()
  const [editing, setEditing] = useState<OvertimeEntry | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const total = entries.reduce((sum, entry) => sum + overtimeMinutes(entry.startTime, entry.endTime), 0)
  const balance = overtimeBalance(entries)
  const ordered = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime) || b.createdAt.localeCompare(a.createdAt))
  return <div className="others-content">
    <section className="overtime-summary" aria-label="Övertidssaldo">
      <div><span className="eyebrow"><Clock size={15} />Tillgängligt saldo</span><strong className="overtime-balance" aria-live="polite">{formatOvertime(balance)}</strong><p className="others-help">Intjänat {formatOvertime(total)} · Uttaget {formatOvertime(total - balance)}</p></div>
      <button className="button primary overtime-add" type="button" aria-label="Registrera övertid" onClick={() => setEditing(null)}><Plus size={22} /></button>
    </section>
    <p className="others-help">Registrera arbetad övertid under jour eller on-call. Bocka i Uttagen när du har tagit ut hela postens tid. Saldot räknas minut för minut.</p>
    {error && <p className="others-error" role="alert">{error}</p>}
    <div className="others-list-toolbar"><span>{entries.length} {entries.length === 1 ? 'registrering' : 'registreringar'}</span></div>
    {ordered.length === 0 && <p className="others-empty">Ingen övertid registrerad ännu. Tryck på + för att lägga till ditt första pass.</p>}
    <div className="overtime-list">{ordered.map(entry => <article key={entry.id} className={`overtime-row ${entry.taken ? 'is-taken' : ''}`}>
      <div className="overtime-details"><time dateTime={entry.date}>{new Date(`${entry.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</time><strong>{entry.startTime}–{entry.endTime}{entry.endTime < entry.startTime && <small> (+1 dag)</small>}<span> · {formatOvertime(overtimeMinutes(entry.startTime, entry.endTime))}</span></strong>{entry.comment && <p>{entry.comment}</p>}</div>
      <div className="overtime-actions"><label className="overtime-taken"><input type="checkbox" checked={entry.taken} aria-label={`Uttagen ${entry.date} ${entry.startTime}–${entry.endTime}`} onChange={event => setError(onSave({ ...entry, taken: event.target.checked }, entry))} />Uttagen</label><button className="icon-button" type="button" aria-label={`Redigera övertid ${entry.date} ${entry.startTime}`} onClick={() => setEditing(entry)}><Pencil size={16} /></button></div>
    </article>)}</div>
    {editing !== undefined && <OvertimeEditor key={editing?.id ?? 'new'} entry={editing ?? undefined} today={today} onSave={onSave} onDelete={onDelete} onClose={() => setEditing(undefined)} />}
  </div>
}
