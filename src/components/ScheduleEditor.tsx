import { useRef, useState } from 'react'
import { CalendarDays, Clock3, TriangleAlert } from 'lucide-react'
import type { TaskSchedule, Workspace } from '../lib/types'
import { isTaskDone } from '../lib/helpers'
import { validSchedule, weekStart } from '../lib/schedule'
import { isValidBirthDate } from '../lib/birthdays'
import { addLocalDays, isoWeek, parseLocalDate } from '../lib/others'
import { getPlanningFeedback } from '../lib/planningFeedback'
import { Modal } from './Modal'
import { ScheduleAppearanceFields } from './ScheduleAppearanceFields'
import '../schedule-editor.css'

export interface ScheduleDraft { schedule: TaskSchedule; taskId?: string }

function humanDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return isValidBirthDate(date) ? parseLocalDate(date).toLocaleDateString('sv-SE', options) : 'Välj ett datum'
}
function durationLabel(duration: number): string {
  const hours = Math.floor(duration / 60), remainder = duration % 60
  return hours ? `${hours} h${remainder ? ` ${remainder} min` : ''}` : `${remainder} min`
}

/** Lives outside the responsive page branch so resizing never discards a draft. */
export function ScheduleEditor({ initial, workspace, onSave, onClose }: {
  initial: ScheduleDraft
  workspace: Workspace
  onSave: (title: string, schedule: TaskSchedule | null, taskId?: string) => string | null
  onClose: () => void
}) {
  const [schedule, setSchedule] = useState<TaskSchedule>(() => structuredClone(initial.schedule))
  const [taskId, setTaskId] = useState(initial.taskId ?? '')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const active = workspace.tasks.filter(task => !isTaskDone(task, workspace))
  const task = active.find(item => item.id === taskId)
  const initialTitle = useRef(workspace.tasks.find(item => item.id === initial.taskId)?.title)
  const original = useRef(JSON.stringify({ schedule: initial.schedule, taskId: initial.taskId ?? '', title: '' }))
  const dirty = original.current !== JSON.stringify({ schedule, taskId, title })
  const missing = !!taskId && !task
  const feedback = getPlanningFeedback(workspace, schedule, taskId)
  const validDate = isValidBirthDate(schedule.date)
  const period = schedule.scope === 'week' && validDate
    ? `Vecka ${isoWeek(schedule.date)} · ${humanDate(schedule.date, { day: 'numeric', month: 'short' })}–${humanDate(addLocalDays(schedule.date, 6), { day: 'numeric', month: 'short' })}`
    : humanDate(schedule.date)
  const timeSummary = feedback.durationMinutes !== null
    ? `${schedule.startTime}–${schedule.endTime} · ${durationLabel(feedback.durationMinutes)}`
    : schedule.scope === 'week' ? 'Utan bestämd dag' : schedule.startTime ? 'Kontrollera tidsintervallet' : 'Utan bestämd tid'
  function save(value: TaskSchedule | null) {
    if (missing) { setError('Uppgiften har tagits bort eller är redan klar. Välj en annan uppgift.'); return }
    if (!validSchedule(value)) { setError('Ange en giltig dag och sluttid efter starttid.'); return }
    const name = task ? task.title : title.trim()
    if (!name) { setError('Skriv en titel eller välj en uppgift.'); return }
    const failure = onSave(name, value, taskId || undefined)
    setError(failure)
    if (!failure) onClose()
  }
  return <Modal title="Planera uppgift" initialFocusRef={taskId ? dateRef : titleRef} dirty={dirty} error={error} onClose={onClose} footer={requestClose => <>
    {task?.schedule && <button className="button secondary danger" type="button" onClick={() => save(null)}>Ta bort planering</button>}
    <button className="button secondary" type="button" onClick={requestClose}>Avbryt</button>
    <button className="button primary" type="submit" form="desktop-schedule-form">Spara planering</button>
  </>}>
    <form id="desktop-schedule-form" className="schedule-editor" onSubmit={event => { event.preventDefault(); save(schedule) }}>
      <div className="schedule-editor-context" aria-label="Din planering">
        <span className="schedule-editor-eyebrow">{taskId ? 'Plan för uppgiften' : 'Ny planering'}</span>
        <strong>{task?.title ?? (missing ? initialTitle.current ?? 'Uppgiften är inte längre aktiv' : title.trim() || 'Vad vill du planera?')}</strong>
        <div className="schedule-editor-preview" aria-live="polite"><span><CalendarDays size={14} aria-hidden="true" />{period}</span><span><Clock3 size={14} aria-hidden="true" />{timeSummary}</span></div>
        {task?.deadline && <p className="schedule-editor-deadline">Deadline {humanDate(task.deadline, { day: 'numeric', month: 'long' })}{task.deadlineTime ? ` kl. ${task.deadlineTime}` : ''} · ändras inte</p>}
      </div>
      <label className="field">Befintlig uppgift<select className="select" value={taskId} onChange={event => {
        const next = active.find(item => item.id === event.target.value)
        setTaskId(event.target.value); setError(null)
        if (next?.schedule) setSchedule(structuredClone(next.schedule))
      }}><option value="">Skapa ny uppgift</option>{missing && <option value={taskId}>Uppgiften är inte längre aktiv</option>}{active.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {missing && <p className="form-message" role="alert">Uppgiften har tagits bort eller är redan klar. Ditt utkast finns kvar.</p>}
      {!taskId && <label className="field">Titel<input ref={titleRef} className="input" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>}
      <div className="schedule-editor-scope-row">
        <label className="field">Planering<select className="select" value={schedule.scope ?? 'day'} onChange={event => setSchedule({ ...schedule, startTime: undefined, endTime: undefined, date: event.target.value === 'week' && isValidBirthDate(schedule.date) ? weekStart(schedule.date) : schedule.date, scope: event.target.value as 'day' | 'week' })}><option value="day">Bestämd dag</option><option value="week">Veckan · utan bestämd dag</option></select></label>
        <label className="field">{schedule.scope === 'week' ? 'Veckans måndag' : 'Datum'}<input ref={dateRef} className="input" type="date" required value={schedule.date} onChange={event => setSchedule({ ...schedule, date: event.target.value && schedule.scope === 'week' ? weekStart(event.target.value) : event.target.value })} /></label>
      </div>
      {schedule.scope !== 'week' && <div className="schedule-editor-time-group">
        <label className="schedule-editor-time-toggle"><input type="checkbox" checked={!!schedule.startTime} onChange={event => setSchedule(event.target.checked ? { ...schedule, startTime: '08:00', endTime: '09:00' } : { ...schedule, startTime: undefined, endTime: undefined, scope: 'day' })} /><span>Ange tid</span></label>
        {schedule.startTime && <div className="field-row"><label className="field">Från<input className="input" type="time" required value={schedule.startTime} onChange={event => setSchedule({ ...schedule, startTime: event.target.value })} /></label><label className="field">Till<input className="input" type="text" inputMode="text" required pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="09:00" value={schedule.endTime ?? ''} onChange={event => setSchedule({ ...schedule, endTime: event.target.value })} /><span className="field-help">HH:MM · 24:00 avslutar dagen.</span></label></div>}
      </div>}
      <ScheduleAppearanceFields schedule={schedule} onChange={setSchedule} />
      {feedback.conflicts.length > 0 && <div className="schedule-editor-conflicts" role="status" aria-live="polite"><TriangleAlert size={17} aria-hidden="true" /><div><strong>Överlappar {feedback.conflicts.length} {feedback.conflicts.length === 1 ? 'annan uppgift' : 'andra uppgifter'}</strong><ul>{feedback.conflicts.map(conflict => <li key={conflict.id}><span>{conflict.schedule!.startTime}–{conflict.schedule!.endTime}</span> {conflict.title}</li>)}</ul><p>Du kan spara ändå eller välja en annan tid.</p></div></div>}
      <p className="field-help schedule-editor-help">Planeringen anger när du vill arbeta med uppgiften. Dess deadline ändras inte.</p>
    </form>
  </Modal>
}
