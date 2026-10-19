import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Clock, Check, ChevronLeft, ChevronRight, Moon, Pencil, Plus, Sun, Trash2 } from 'lucide-react'
import type { NutritionHabit, NutritionUnit, Workspace } from '../lib/types'
import { newId } from '../lib/helpers'
import { isValidBirthDate } from '../lib/birthdays'
import { addLocalDays, isNutritionComplete, isoWeek, nutritionDayStatus, parseLocalDate, weekDates } from '../lib/others'
import { useLocalDay } from '../hooks/useLocalDay'
import { Modal } from './Modal'
import { NUTRITION_TIME_OPTIONS } from '../lib/nutritionTime'
import { NutritionTimePill } from './NutritionTimePill'

const units: NutritionUnit[] = ['st', 'ml', 'l', 'g', 'portion']

function HabitEditor({ habit, onSave, onDelete, onClose }: {
  habit?: NutritionHabit;
  onSave: (edited: NutritionHabit, original?: NutritionHabit) => string | null;
  onDelete: (id: string) => string | null;
  onClose: () => void;
}) {
  const [original] = useState(() => habit ? structuredClone(habit) : undefined)
  const [draft, setDraft] = useState<NutritionHabit>(() => habit ? structuredClone(habit) : {
    id: newId(), title: '', amount: '', unit: 'st', createdAt: new Date().toISOString(), time: 'morning',
  })
  const [error, setError] = useState<string | null>(null)
  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) { setError('Ange ett namn.'); return }
    const next = { ...draft, title: draft.title.trim(), amount: draft.amount.trim() }
    setDraft(next)
    const failure = onSave(next, original)
    if (failure) setError(failure)
    else onClose()
  }
  return <Modal title={habit ? 'Redigera kostvana' : 'Ny kostvana'} onClose={onClose} error={error} footer={<>
    {habit && <button className="icon-button danger" type="button" aria-label="Ta bort kostvana" onClick={() => { const failure = onDelete(draft.id); if (failure) setError(failure); else onClose() }}><Trash2 size={18} /></button>}
    <button className="button secondary" type="button" onClick={onClose}>Avbryt</button><button className="button primary" type="submit" form="habit-form"><Check size={16} />Spara</button>
  </>}>
    <p className="others-help">En daglig vana som du bockar av när du är klar. Mängden är ditt mål för dagen, inte en registrering av varje måltid.</p><form id="habit-form" onSubmit={save}><label className="field">Titel<input className="input" required autoFocus placeholder="T.ex. Vatten eller Grönsaker" maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><div className="field-row"><label className="field">Mängd<input className="input" type="text" required placeholder="T.ex. 2" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></label><label className="field">Enhet<select className="select" value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value as NutritionUnit })}>{units.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label></div>
      <div className="field" role="group" aria-labelledby="habit-time-label"><span id="habit-time-label" className="field-label">När</span>
        <div className="segmented-control habit-time-options">{NUTRITION_TIME_OPTIONS.map(option => {
          const Icon = option.value === 'morning' ? Sun : option.value === 'evening' ? Moon : Clock
          const active = draft.time === option.value
          return <button key={option.label} type="button" className={active ? 'active' : ''} aria-pressed={active} onClick={() => setDraft({ ...draft, time: option.value })}><Icon size={15} aria-hidden="true" />{option.label}</button>
        })}</div>
      </div>
    </form>
  </Modal>
}

export function Nutrition({ workspace, onSave, onDelete, onToggle, initialHabitId }: {
  workspace: Workspace;
  initialHabitId?: string;
  onSave: (edited: NutritionHabit, original?: NutritionHabit) => string | null;
  onDelete: (id: string) => string | null;
  onToggle: (habitId: string, date: string) => string | null;
}) {
  const today = useLocalDay()
  const [selectedDate, setSelectedDate] = useState(today)
  const [editing, setEditing] = useState<NutritionHabit | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const previousTodayRef = useRef(today)
  useEffect(() => {
    const previous = previousTodayRef.current
    setSelectedDate(current => current === previous ? today : current)
    previousTodayRef.current = today
  }, [today])
  const days = weekDates(selectedDate)
  const week = isoWeek(selectedDate)
  const weekYear = parseLocalDate(days[3]).getFullYear()
  const habits = workspace.nutritionHabits ?? []
  const completed = habits.filter(habit => isNutritionComplete(workspace, habit.id, selectedDate)).length
  return <div className="others-content">
    <section className="nutrition-calendar" aria-label="Välj dag för kost"><div className="nutrition-week-heading"><strong>Vecka {week} · {weekYear}</strong><div className="nutrition-week-controls"><button className="icon-button" type="button" aria-label="Föregående vecka" onClick={() => setSelectedDate(addLocalDays(selectedDate, -7))}><ChevronLeft size={18} /></button><button className="button ghost" type="button" onClick={() => setSelectedDate(today)}>Idag</button><button className="icon-button" type="button" aria-label="Nästa vecka" onClick={() => setSelectedDate(addLocalDays(selectedDate, 7))}><ChevronRight size={18} /></button></div></div>
      <div className="nutrition-weekdays">{days.map(date => {
        const status = nutritionDayStatus(workspace, date, today)
        return <button className={`nutrition-day ${selectedDate === date ? 'active' : ''} ${today === date ? 'today' : ''} ${status ? `status-${status}` : ''}`} key={date} data-date={date} data-status={status ?? 'none'} type="button" aria-pressed={selectedDate === date} aria-label={`${parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${status === 'complete' ? ', allt klart' : status === 'incomplete' ? ', något saknas' : ''}`} onClick={() => setSelectedDate(date)}><span>{parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'short' })}</span><strong>{parseLocalDate(date).getDate()}</strong></button>
      })}</div>
      {habits.length > 0 && <p className="nutrition-legend"><span className="nutrition-legend-item complete">Allt klart</span><span className="nutrition-legend-item incomplete">Något saknas</span></p>}
      <div className="nutrition-date-row"><label className="field">Välj datum<input className="input" type="date" aria-label="Välj datum" min="0001-01-01" required value={selectedDate} onChange={event => { if (isValidBirthDate(event.target.value)) setSelectedDate(event.target.value) }} /></label><span>{completed}/{habits.length} klara</span></div>
    </section>
    <div className="others-list-toolbar"><time dateTime={selectedDate}>{parseLocalDate(selectedDate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}</time><button className="button primary" type="button" onClick={() => setEditing(null)}><Plus size={16} />Ny kostvana</button></div>
    {error && <p className="others-error" role="alert">{error}</p>}
    <div className="nutrition-habits">{habits.map(habit => {
      const done = isNutritionComplete(workspace, habit.id, selectedDate)
      return <article className={`nutrition-habit-row ${done ? 'completed' : ''}`} key={habit.id} data-habit-id={habit.id} data-date={selectedDate}><label><input type="checkbox" autoFocus={habit.id === initialHabitId} checked={done} aria-label={`Klarmarkera ${habit.title}`} onChange={() => setError(onToggle(habit.id, selectedDate))} /><span><strong>{habit.title}</strong><span className="habit-meta"><small>{habit.amount} {habit.unit}</small><NutritionTimePill time={habit.time} /></span></span></label><button className="icon-button" type="button" aria-label={`Redigera kostvana ${habit.title}`} onClick={() => setEditing(habit)}><Pencil size={16} /></button></article>
    })}</div>
    {habits.length === 0 && <p className="others-empty">Lägg till din första dagliga vana, till exempel vatten eller en portion grönsaker.</p>}
    {editing !== undefined && <HabitEditor key={editing?.id ?? 'new-habit'} habit={editing ?? undefined} onSave={onSave} onDelete={onDelete} onClose={() => setEditing(undefined)} />}
  </div>
}
