import { useState, type FormEvent } from 'react'
import { Check, Copy, Dumbbell, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Workout, WorkoutRow } from '../lib/types'
import { newId } from '../lib/helpers'
import { isValidBirthDate, localDateString } from '../lib/birthdays'
import { workoutRawText } from '../lib/others'
import { Modal } from './Modal'

function newRow(): WorkoutRow {
  return { id: newId(), title: '', amount: '', amountUnit: 'sets', load: '', loadUnit: 'kg', bpm: '' }
}

export function WorkoutEditor({ workout, onSave, onDelete, onClose }: {
  workout?: Workout;
  onSave: (edited: Workout, original?: Workout) => string | null;
  onDelete: (id: string) => string | null;
  onClose: () => void;
}) {
  const [original] = useState(() => workout ? structuredClone(workout) : undefined)
  const [draft, setDraft] = useState<Workout>(() => workout ? structuredClone(workout) : {
    id: newId(), date: localDateString(new Date()), title: '', rows: [newRow()], createdAt: new Date().toISOString(),
  })
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  function updateRow(id: string, values: Partial<WorkoutRow>) {
    setDraft(current => ({ ...current, rows: current.rows.map(row => row.id === id ? { ...row, ...values } : row) }))
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (!isValidBirthDate(draft.date)) { setError('Ange ett giltigt datum.'); return }
    if (draft.rows.some(row => !row.title.trim())) { setError('Ange ett namn för varje övning.'); return }
    const next = { ...draft, title: draft.title?.trim() ?? '', rows: draft.rows.map(row => ({ ...row, title: row.title.trim(), amount: row.amount.trim(), load: row.load.trim(), bpm: row.bpm.trim() })) }
    setDraft(next)
    const failure = onSave(next, original)
    if (failure) setError(failure)
    else onClose()
  }
  return <Modal title={workout ? 'Redigera pass' : 'Nytt pass'} onClose={onClose} error={error} footer={<>
    {workout && <button className="icon-button danger" type="button" aria-label="Ta bort pass" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button>}
    <button className="button secondary" type="button" onClick={onClose}>Avbryt</button><button className="button primary" form="workout-form" type="submit"><Check size={16} />Spara pass</button>
  </>}>
    <form id="workout-form" className="workout-form" onSubmit={save}>
      <div className="field-row"><label className="field">Datum<input className="input" type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><label className="field">Titel <span className="field-help">Valfri</span><input className="input" maxLength={160} value={draft.title ?? ''} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label></div>
      <div className="workout-rows">{draft.rows.map((row, index) => <fieldset className="workout-row" key={row.id} data-workout-row={row.id}><legend>Övning {index + 1}</legend><div className="workout-row-top"><label className="field">Övning<input className="input" required maxLength={160} aria-label={`Övning ${index + 1}`} value={row.title} onChange={event => updateRow(row.id, { title: event.target.value })} /></label><button className="icon-button" type="button" aria-label={`Ta bort övning ${index + 1}`} onClick={() => setDraft({ ...draft, rows: draft.rows.filter(item => item.id !== row.id) })}><Trash2 size={16} /></button></div>
        <div className="workout-measures"><div className="field"><label htmlFor={`amount-${row.id}`}>Mängd</label><div className="workout-value-pair"><input id={`amount-${row.id}`} className="input" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" aria-label={`Mängd övning ${index + 1}`} value={row.amount} onChange={event => updateRow(row.id, { amount: event.target.value })} /><select className="select" aria-label={`Mängdenhet övning ${index + 1}`} value={row.amountUnit} onChange={event => updateRow(row.id, { amountUnit: event.target.value as WorkoutRow['amountUnit'] })}><option value="sets">Set</option><option value="min">Min</option></select></div></div>
          <div className="field"><label htmlFor={`load-${row.id}`}>{row.loadUnit === 'time' ? 'Tid (min)' : 'Vikt (kg)'}</label><div className="workout-value-pair"><input id={`load-${row.id}`} className="input" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" aria-label={`Belastning övning ${index + 1}`} value={row.load} onChange={event => updateRow(row.id, { load: event.target.value })} /><select className="select" aria-label={`Belastningsenhet övning ${index + 1}`} value={row.loadUnit} onChange={event => updateRow(row.id, { loadUnit: event.target.value as WorkoutRow['loadUnit'] })}><option value="time">Min</option><option value="kg">Kg</option></select></div></div>
          <label className="field workout-bpm">BPM<input className="input" type="text" inputMode="numeric" pattern="[0-9]+" aria-label={`BPM övning ${index + 1}`} value={row.bpm} onChange={event => updateRow(row.id, { bpm: event.target.value })} /></label>
        </div>
      </fieldset>)}</div>
      <button className="button secondary others-add-row" type="button" onClick={() => setDraft({ ...draft, rows: [...draft.rows, newRow()] })}><Plus size={16} />Lägg till övning</button>
      {confirmDelete && <div className="form-message delete-confirm"><p>Ta bort passet?</p><button className="button secondary" type="button" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" type="button" onClick={() => { const failure = onDelete(draft.id); if (failure) setError(failure); else onClose() }}>Ta bort</button></div>}
    </form>
  </Modal>
}

export function Workouts({ workouts, onSave, onDelete, initialId }: {
  workouts: Workout[];
  initialId?: string;
  onSave: (edited: Workout, original?: Workout) => string | null;
  onDelete: (id: string) => string | null;
}) {
  const [editing, setEditing] = useState<Workout | null | undefined>(() => initialId ? workouts.find(workout => workout.id === initialId) : undefined)
  const [rawText, setRawText] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [copying, setCopying] = useState(false)
  const ordered = [...workouts].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  async function copy(workout: Workout) {
    if (copying) return
    const text = workoutRawText(workout)
    setCopying(true)
    setCopyStatus(''); setRawText(null)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setCopyStatus('Passet är kopierat.')
    } catch { setRawText(text) }
    finally { setCopying(false) }
  }
  return <div className="others-content">
    <div className="others-list-toolbar"><span>{workouts.length} pass</span><button className="button primary" type="button" onClick={() => setEditing(null)}><Plus size={16} />Nytt pass</button></div>
    <div className="others-record-list">{ordered.map(workout => <article className="others-record-row" key={workout.id} data-workout-id={workout.id}><button className="others-record-open" type="button" aria-label={`Redigera pass ${workout.title || workout.date}`} onClick={() => setEditing(workout)}><span className="others-record-icon"><Dumbbell size={19} strokeWidth={1.5} /></span><span className="others-record-copy"><strong>{workout.title || 'Träningspass'}</strong><span><time dateTime={workout.date}>{new Date(`${workout.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</time> · {workout.rows.length} övningar</span></span><Pencil size={15} /></button><button className="icon-button" type="button" disabled={copying} aria-label={`Kopiera råtext för ${workout.title || 'träningspass'}`} onClick={() => { void copy(workout) }}><Copy size={17} /></button></article>)}</div>
    {ordered.length === 0 && <p className="others-empty">Inga träningspass ännu.</p>}
    {copyStatus && <p className="others-status" role="status"><Check size={14} />{copyStatus}</p>}
    {rawText !== null && <div className="others-copy-fallback"><div className="others-copy-heading"><p>Kopiera texten manuellt.</p><button className="icon-button" type="button" aria-label="Dölj kopiering" onClick={() => setRawText(null)}><X size={17} /></button></div><textarea className="textarea" rows={6} readOnly autoFocus aria-label="Råtext för träningspass" value={rawText} onFocus={event => event.currentTarget.select()} /></div>}
    {editing !== undefined && <WorkoutEditor key={editing?.id ?? 'new-workout'} workout={editing ?? undefined} onSave={onSave} onDelete={onDelete} onClose={() => setEditing(undefined)} />}
  </div>
}
