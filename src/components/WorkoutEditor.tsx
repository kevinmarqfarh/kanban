import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check, Copy, Dumbbell, History, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Workout, WorkoutRow } from '../lib/types'
import { newId } from '../lib/helpers'
import { isValidBirthDate, localDateString } from '../lib/birthdays'
import { exerciseSuggestions, exerciseSummary, findExercise, recentExercises, workoutLoadUnits, workoutRawText, type ExerciseHistory } from '../lib/others'
import { Modal } from './Modal'
import { SwipeRow } from './SwipeRow'

function newRow(): WorkoutRow {
  return { id: newId(), title: '', amount: '', amountUnit: 'sets', load: '', loadUnit: 'kg', bpm: '' }
}

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })

/** Exercise name with a list of recently trained exercises. Free text is always allowed. */
function ExerciseNameField({ id, index, value, history, onChange, onPick, onNext }: {
  id: string; index: number; value: string; history: ExerciseHistory[];
  onChange: (value: string) => void; onPick: (entry: ExerciseHistory) => void; onNext: () => void;
}) {
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const suggestions = exerciseSuggestions(history, value)
  const visible = open && suggestions.length > 0
  useEffect(() => { if (visible) listRef.current?.scrollIntoView({ block: 'nearest' }) }, [visible])
  function pick(entry: ExerciseHistory) { onPick(entry); setOpen(false); setActive(-1) }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActive(current => Math.min(current + 1, suggestions.length - 1)) }
    else if (event.key === 'ArrowUp' && visible) { event.preventDefault(); setActive(current => Math.max(current - 1, -1)) }
    else if (event.key === 'Enter') {
      event.preventDefault()
      if (visible && active >= 0) pick(suggestions[active])
      else { setOpen(false); onNext() }
    } else if (event.key === 'Escape' && visible) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1) }
  }
  return <div className="exercise-field">
    <input id={id} className="input" required maxLength={160} aria-label={`Övning ${index}`} placeholder="Övning, t.ex. Knäböj" autoComplete="off" autoCapitalize="sentences" enterKeyHint="next"
      role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? listId : undefined}
      aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
      value={value} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1) }}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1) }} onKeyDown={keyDown} />
    {visible && <div className="exercise-suggestions" ref={listRef}>
      <p aria-hidden="true">{value.trim() ? 'Förslag' : 'Senast använda'}</p>
      <ul id={listId} role="listbox" aria-label={value.trim() ? 'Förslag på övningar' : 'Senast använda övningar'}>
        {suggestions.map((entry, position) => <li key={entry.title} id={`${listId}-${position}`} role="option" aria-selected={position === active} className={position === active ? 'active' : ''}
          onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(position)} onClick={() => pick(entry)}>
          <strong>{entry.title}</strong><span>{shortDate(entry.date)}{exerciseSummary(entry.row) ? ` · ${exerciseSummary(entry.row)}` : ''}</span>
        </li>)}
      </ul>
    </div>}
  </div>
}

export function WorkoutEditor({ workout, history = [], onSave, onDelete, onClose }: {
  workout?: Workout;
  history?: Workout[];
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
  const [focusRow, setFocusRow] = useState<string | null>(null)
  const [recent] = useState(() => recentExercises(history, workout?.id))
  useEffect(() => {
    if (!focusRow) return
    document.getElementById(`exercise-${focusRow}`)?.focus()
    setFocusRow(null)
  }, [focusRow])
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
  function addRow() {
    const row = newRow()
    setDraft(current => ({ ...current, rows: [...current.rows, row] }))
    setFocusRow(row.id)
  }
  return <Modal phoneFullscreen title={workout ? 'Redigera pass' : 'Nytt pass'} onClose={onClose} error={error} footer={<>
    {workout && <button className="icon-button danger" type="button" aria-label="Ta bort pass" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button>}
    <button className="button secondary" type="button" onClick={onClose}>Avbryt</button><button className="button primary" form="workout-form" type="submit"><Check size={16} />Spara pass</button>
  </>}>
    <form id="workout-form" className="workout-form" onSubmit={save}>
      <div className="workout-meta"><label className="field">Datum<input className="input workout-date" type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><label className="field">Titel<input className="input" maxLength={160} placeholder="Valfri, t.ex. Benpass" value={draft.title ?? ''} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label></div>
      <ol className="workout-rows">{draft.rows.map((row, index) => {
        const last = findExercise(recent, row.title)
        const load = workoutLoadUnits.find(unit => unit.value === row.loadUnit) ?? workoutLoadUnits[0]
        return <li key={row.id}><fieldset className="workout-row" data-workout-row={row.id}><legend className="sr-only">Övning {index + 1}</legend>
          <div className="workout-row-top"><span className="workout-row-number" aria-hidden="true">{index + 1}</span>
            <ExerciseNameField id={`exercise-${row.id}`} index={index + 1} value={row.title} history={recent} onChange={title => updateRow(row.id, { title })}
              onPick={entry => { updateRow(row.id, { title: entry.title, ...(row.amount ? {} : { amountUnit: entry.row.amountUnit }), ...(row.load ? {} : { loadUnit: entry.row.loadUnit }) }); requestAnimationFrame(() => document.getElementById(`amount-${row.id}`)?.focus()) }}
              onNext={() => document.getElementById(`amount-${row.id}`)?.focus()} />
            <button className="icon-button workout-row-delete" type="button" aria-label={`Ta bort övning ${index + 1}`} onClick={() => setDraft({ ...draft, rows: draft.rows.filter(item => item.id !== row.id) })}><Trash2 size={16} /></button></div>
          {last && exerciseSummary(last.row) && <p className="workout-last"><History size={12} aria-hidden="true" />Senast {shortDate(last.date)}: {exerciseSummary(last.row)}</p>}
          <div className="workout-measures">
            <div className="workout-measure"><select className="workout-measure-unit" aria-label={`Mängdenhet övning ${index + 1}`} value={row.amountUnit} onChange={event => updateRow(row.id, { amountUnit: event.target.value as WorkoutRow['amountUnit'] })}><option value="sets">Set</option><option value="min">Min</option></select><label className="workout-value-pair"><input id={`amount-${row.id}`} type="text" inputMode="decimal" enterKeyHint="next" pattern="[0-9]+([.,][0-9]+)?" placeholder="0" aria-label={`Mängd övning ${index + 1}`} value={row.amount} onChange={event => updateRow(row.id, { amount: event.target.value })} /><span className="workout-unit" aria-hidden="true">{row.amountUnit === 'sets' ? 'set' : 'min'}</span></label></div>
            <div className="workout-measure"><select className="workout-measure-unit" aria-label={`Belastningsenhet övning ${index + 1}`} value={row.loadUnit} onChange={event => updateRow(row.id, { loadUnit: event.target.value as WorkoutRow['loadUnit'] })}>{workoutLoadUnits.map(unit => <option key={unit.value} value={unit.value}>{unit.heading}</option>)}</select><label className="workout-value-pair"><input id={`load-${row.id}`} type="text" inputMode="decimal" enterKeyHint="next" pattern="[0-9]+([.,][0-9]+)?" placeholder="0" aria-label={`Belastning övning ${index + 1}`} value={row.load} onChange={event => updateRow(row.id, { load: event.target.value })} /><span className="workout-unit" aria-hidden="true">{load.suffix}</span></label></div>
            <div className="workout-measure workout-bpm"><span className="workout-measure-label" aria-hidden="true">Puls</span><label className="workout-value-pair"><input id={`bpm-${row.id}`} type="text" inputMode="numeric" enterKeyHint="done" pattern="[0-9]+" placeholder="0" aria-label={`BPM övning ${index + 1}`} value={row.bpm} onChange={event => updateRow(row.id, { bpm: event.target.value })} /><span className="workout-unit" aria-hidden="true">bpm</span></label></div>
          </div>
        </fieldset></li>
      })}</ol>
      {draft.rows.length === 0 && <p className="others-help">Inga övningar. Lägg till minst en för att logga passet.</p>}
      <button className="button secondary others-add-row" type="button" onClick={addRow}><Plus size={16} />Lägg till övning</button>
      {confirmDelete && <div className="form-message delete-confirm"><p>Ta bort passet?</p><button className="button secondary" type="button" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" type="button" onClick={() => { const failure = onDelete(draft.id); if (failure) setError(failure); else onClose() }}>Ta bort</button></div>}
    </form>
  </Modal>
}

export function Workouts({ workouts, onSave, onDelete, onRestore, initialId }: {
  workouts: Workout[];
  initialId?: string;
  onSave: (edited: Workout, original?: Workout) => string | null;
  onDelete: (id: string) => string | null;
  onRestore: (workout: Workout) => string | null;
}) {
  const [swiped, setSwiped] = useState<string | null>(null)
  const [removed, setRemoved] = useState<Workout | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  useEffect(() => { if (!removed) return; const timer = setTimeout(() => setRemoved(null), 6000); return () => clearTimeout(timer) }, [removed])
  function removeWorkout(workout: Workout) {
    const failure = onDelete(workout.id)
    setSwiped(null); setListError(failure)
    if (!failure) setRemoved(workout)
  }
  function undoRemove() {
    if (!removed) return
    const failure = onRestore(removed)
    setListError(failure)
    if (!failure) setRemoved(null)
  }
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
    {removed && <div className="notes-undo" role="status"><span>Passet är borttaget.</span><button className="button ghost small" type="button" onClick={undoRemove}>Ångra</button></div>}
    {listError && <p className="others-error" role="alert">{listError}</p>}
    <div className="others-record-list">{ordered.map(workout => <SwipeRow key={workout.id} className="workout-swipe" open={swiped === workout.id} onOpenChange={open => setSwiped(open ? workout.id : current => current === workout.id ? null : current)} onDelete={() => removeWorkout(workout)} deleteLabel={`Ta bort pass ${workout.title || workout.date}`}><article className="others-record-row" data-workout-id={workout.id}><button className="others-record-open" type="button" aria-label={`Redigera pass ${workout.title || workout.date}`} onClick={() => setEditing(workout)}><span className="others-record-icon"><Dumbbell size={19} strokeWidth={1.5} /></span><span className="others-record-copy"><strong>{workout.title || 'Träningspass'}</strong><span><time dateTime={workout.date}>{new Date(`${workout.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}</time> · {workout.rows.length} övningar</span></span><Pencil size={15} /></button><button className="icon-button" type="button" disabled={copying} aria-label={`Kopiera råtext för ${workout.title || 'träningspass'}`} onClick={() => { void copy(workout) }}><Copy size={17} /></button></article></SwipeRow>)}</div>
    {ordered.length === 0 && <p className="others-empty">Inga träningspass ännu.</p>}
    {copyStatus && <p className="others-status" role="status"><Check size={14} />{copyStatus}</p>}
    {rawText !== null && <div className="others-copy-fallback"><div className="others-copy-heading"><p>Kopiera texten manuellt.</p><button className="icon-button" type="button" aria-label="Dölj kopiering" onClick={() => setRawText(null)}><X size={17} /></button></div><textarea className="textarea" rows={6} readOnly autoFocus aria-label="Råtext för träningspass" value={rawText} onFocus={event => event.currentTarget.select()} /></div>}
    {editing !== undefined && <WorkoutEditor key={editing?.id ?? 'new-workout'} workout={editing ?? undefined} history={workouts} onSave={onSave} onDelete={onDelete} onClose={() => setEditing(undefined)} />}
  </div>
}
