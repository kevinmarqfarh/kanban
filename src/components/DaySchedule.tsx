import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Task, TaskSchedule, Workspace } from '../lib/types'
import { isTaskDone } from '../lib/helpers'
import { addLocalDays, parseLocalDate } from '../lib/others'
import { calendarFile, clock, minutes, validSchedule, weekStart, scheduleLayout } from '../lib/schedule'
import { Modal } from './Modal'
import '../schedule.css'

export interface ScheduleProps {
  workspace: Workspace
  today: string
  onSave: (title: string, schedule: TaskSchedule, taskId?: string) => string | null
  onOpen: (id: string) => void
}
export function DaySchedule({ workspace, today, onSave, onOpen }: ScheduleProps) {
  const [date, setDate] = useState(today)
  const open = true
  const [draft, setDraft] = useState<TaskSchedule | null>(null)
  const [title, setTitle] = useState('')
  const [taskId, setTaskId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<[number, number] | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: number; x: number; y: number; start: number; end: number; active: boolean; timer: ReturnType<typeof setTimeout> } | null>(null)
  const active = workspace.tasks.filter(task => !isTaskDone(task, workspace))
  const tasks = active.filter(task => task.schedule?.date === date && task.schedule.scope !== 'week')
  const timed = tasks.filter(task => task.schedule?.startTime).sort((a,b) => a.schedule!.startTime!.localeCompare(b.schedule!.startTime!))
  const layout = scheduleLayout(timed)
  const untimed = active.filter(task => task.schedule && (task.schedule.scope === 'week' ? task.schedule.date === weekStart(date) : task.schedule.date === date && !task.schedule.startTime))
  useEffect(() => { if (open && scroller.current) scroller.current.scrollTop = 8 * 44 }, [open, date])
  useEffect(() => { setDate(today) }, [today])
  useEffect(() => {
    const element = grid.current
    if (!element) return
    const holdDrag = (event: TouchEvent) => { if (gesture.current?.active) event.preventDefault() }
    element.addEventListener('touchmove', holdDrag, { passive: false })
    return () => element.removeEventListener('touchmove', holdDrag)
  }, [open])
  useEffect(() => () => { if (gesture.current) clearTimeout(gesture.current.timer) }, [])
  function create(schedule: TaskSchedule) { setDraft(schedule); setTitle(''); setTaskId(''); setError(null) }
  function cancel() { if (gesture.current) clearTimeout(gesture.current.timer); gesture.current = null; setSelection(null) }
  function point(y: number) { return Math.max(0, Math.min(1410, Math.floor((y - grid.current!.getBoundingClientRect().top) / 22) * 30)) }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const start = point(event.clientY)
    const id = event.pointerId
    const target = event.currentTarget
    const timer = setTimeout(() => {
      if (!gesture.current) return
      gesture.current.active = true
      try { target.setPointerCapture(id) } catch { cancel(); return }
      setSelection([start, start + 30])
    }, 350)
    gesture.current = { id, x: event.clientX, y: event.clientY, start, end: start, active: false, timer }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    if (!g.active) { if (Math.abs(event.clientY - g.y) > 7 || Math.abs(event.clientX - g.x) > 7) cancel(); return }
    event.preventDefault()
    g.end = point(event.clientY)
    setSelection([Math.min(g.start, g.end), Math.max(g.start, g.end) + 30])
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    if (g.active) create({ date, startTime: clock(Math.min(g.start, g.end)), endTime: clock(Math.max(g.start, g.end) + 30) })
    cancel()
  }
  function exportCalendar() {
    const url = URL.createObjectURL(new Blob([calendarFile(active)], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'forma-schema.ics'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="day-schedule" aria-label="Dagschema">
    <div className="schedule-heading"><time dateTime={date}>{parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</time><div><button className="button ghost small" onClick={() => create({ date })}>+ Planera</button></div></div>
    {open && <><div className="schedule-dates"><button className="icon-button" aria-label="Föregående vecka" onClick={() => setDate(addLocalDays(date, -7))}>‹</button>{Array.from({ length: 7 }, (_, i) => addLocalDays(weekStart(date), i)).map(day => <button key={day} className={day === date ? 'selected' : ''} aria-pressed={day === date} onClick={() => setDate(day)}><span>{parseLocalDate(day).toLocaleDateString('sv-SE', { weekday: 'short' })}</span><strong>{Number(day.slice(8))}</strong></button>)}<button className="icon-button" aria-label="Nästa vecka" onClick={() => setDate(addLocalDays(date, 7))}>›</button></div>
    <div className="schedule-tools"><button className="button ghost small" onClick={() => setDate(today)}>Idag</button><span>Håll och dra för att välja tid</span><button className="button ghost small" onClick={exportCalendar} disabled={!active.some(t => t.schedule?.startTime)}>Exportera kalender</button></div>
    <div className="schedule-scroll" ref={scroller} onScroll={() => { if (gesture.current && !gesture.current.active) cancel() }}>
      <div className={`schedule-grid${selection ? ' selecting' : ''}`} ref={grid} onPointerLeave={() => { if (!gesture.current?.active) cancel() }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onKeyDown={event => { if (event.key === 'Escape') cancel() }} onLostPointerCapture={cancel} onContextMenu={event => event.preventDefault()}>
        {Array.from({ length: 24 }, (_, hour) => <div className="schedule-hour" key={hour}><button aria-label={`Planera ${clock(hour * 60)}`} onClick={() => create({ date, startTime: clock(hour * 60), endTime: clock((hour + 1) * 60) })}>{clock(hour * 60)}</button></div>)}
        <div className="schedule-blocks">{timed.map(task => <button className="schedule-block" key={task.id} style={{ left: `${layout.get(task.id)!.left}%`, width: `calc(${layout.get(task.id)!.width}% - 3px)`, top: minutes(task.schedule!.startTime!) / 60 * 44, minHeight: Math.max(24, (minutes(task.schedule!.endTime!) - minutes(task.schedule!.startTime!)) / 60 * 44 - 2) }} onClick={() => onOpen(task.id)}><span>{task.schedule!.startTime}–{task.schedule!.endTime}</span><strong>{task.title}</strong></button>)}</div>
        {selection && <div className="schedule-selection" style={{ top: selection[0] / 60 * 44, height: (selection[1] - selection[0]) / 60 * 44 }}>{clock(selection[0])}–{clock(selection[1])}</div>}
      </div>
    </div>
    {untimed.length > 0 && <div className="schedule-untimed"><span>Utan tid</span>{untimed.map(task => <button key={task.id} onClick={() => onOpen(task.id)}>{task.schedule?.scope === 'week' ? 'Veckan · ' : ''}{task.title}</button>)}</div>}</>}
    {draft && <Modal title="Planera uppgift" error={error} onClose={() => setDraft(null)} footer={<><button className="button secondary" onClick={() => setDraft(null)}>Avbryt</button><button className="button primary" form="schedule-form" type="submit">Spara</button></>}><form id="schedule-form" onSubmit={event => { event.preventDefault(); if (!validSchedule(draft)) { setError('Ange en giltig dag och sluttid efter starttid.'); return } const name = taskId ? active.find(t => t.id === taskId)?.title : title.trim(); if (!name) { setError('Skriv en titel eller välj en uppgift.'); return } const failure = onSave(name, draft, taskId || undefined); setError(failure); if (!failure) setDraft(null) }}>
      <label className="field">Befintlig uppgift<select className="select" value={taskId} onChange={event => setTaskId(event.target.value)}><option value="">Skapa ny uppgift</option>{active.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      {!taskId && <label className="field">Titel<input className="input" autoFocus required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>}
      <label className="field">Planering<select className="select" value={draft.scope ?? 'day'} onChange={event => setDraft({ date: event.target.value === 'week' ? weekStart(draft.date) : date, scope: event.target.value as 'day' | 'week' })}><option value="day">Vald dag</option><option value="week">Veckan · utan bestämd dag</option></select></label>
      <label className="field">{draft.scope === 'week' ? 'Veckans måndag' : 'Datum'}<input className="input" type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: draft.scope === 'week' && event.target.value ? weekStart(event.target.value) : event.target.value })} /></label>
      {draft.scope !== 'week' && <><label className="field"><span><input type="checkbox" checked={!!draft.startTime} onChange={event => setDraft(event.target.checked ? { ...draft, startTime: '08:00', endTime: '09:00' } : { date: draft.date })} /> Ange tid</span></label>{draft.startTime && <div className="field-row"><label className="field">Från<input className="input" type="time" required value={draft.startTime} onChange={event => setDraft({ ...draft, startTime: event.target.value })} /></label><label className="field">Till<input className="input" type={draft.endTime === '24:00' ? 'text' : 'time'} required value={draft.endTime ?? ''} onChange={event => setDraft({ ...draft, endTime: event.target.value })} /></label></div>}</>}
    </form></Modal>}
  </section>
}

export function ScheduleSummary({ workspace, today, onOpen, onPlanner }: { workspace: Workspace; today: string; onOpen: (id: string) => void; onPlanner: () => void }) {
  const tasks = workspace.tasks.filter(task => task.schedule && !isTaskDone(task, workspace) && (task.schedule.scope === 'week' ? task.schedule.date === weekStart(today) : task.schedule.date >= today && task.schedule.date < addLocalDays(today, 7))).sort((a,b) => (a.schedule!.date === today && a.schedule!.scope !== 'week' ? 0 : 1) - (b.schedule!.date === today && b.schedule!.scope !== 'week' ? 0 : 1) || a.schedule!.date.localeCompare(b.schedule!.date) || (a.schedule!.startTime ?? '99').localeCompare(b.schedule!.startTime ?? '99'))
  return <section className="schedule-summary" aria-label="Din planering"><div className="schedule-heading"><strong>Din planering</strong><button className="button ghost small" onClick={onPlanner}>Planera dagen →</button></div>{tasks.length ? tasks.slice(0, 3).map(task => <button className="schedule-summary-task" key={task.id} onClick={() => onOpen(task.id)}><span>{task.schedule!.scope === 'week' ? 'Veckan' : task.schedule!.date === today ? 'Idag' : parseLocalDate(task.schedule!.date).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric' })} · {task.schedule!.startTime ? `${task.schedule!.startTime}–${task.schedule!.endTime}` : 'Utan tid'}</span><strong>{task.title}</strong></button>) : <p>Planera en uppgift för idag eller veckan.</p>}</section>
}
