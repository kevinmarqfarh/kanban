import { useId, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Inbox, Info, Plus, TriangleAlert, X } from 'lucide-react'
import type { Task, TaskSchedule, Workspace } from '../lib/types'
import { priorityLabel } from '../lib/helpers'
import { addLocalDays, isoWeek, parseLocalDate } from '../lib/others'
import { weekStart } from '../lib/schedule'
import { bookedTimeLabel, buildWeekPlan } from '../lib/weekPlanner'
import '../week-planner.css'

interface WeekPlannerProps {
  workspace: Workspace
  tasks: Task[]
  today: string
  onPlan: (schedule: TaskSchedule, task?: Task) => void
  onOpen: (id: string) => void
  onToggleTask?: (task: Task) => string | null
}
const shortDate = (date: string) => parseLocalDate(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })

function PlanningCard({ task, fallbackDate, conflict, onPlan, onOpen, onToggleTask }: {
  task: Task; fallbackDate: string; conflict?: boolean
  onPlan: WeekPlannerProps['onPlan']; onOpen: WeekPlannerProps['onOpen']; onToggleTask: WeekPlannerProps['onToggleTask']
}) {
  const [error, setError] = useState<string | null>(null)
  const schedule = task.schedule
  const priority = priorityLabel(task.priority)
  return <article className={`wp-task${conflict ? ' wp-task-conflict' : ''}`} data-task-id={task.id} data-color={schedule?.color} data-priority={task.priority ?? undefined}>
    <div className="wp-task-top"><span className="wp-task-time">{schedule?.startTime ? <>{schedule.startTime}–{schedule.endTime}</> : schedule?.scope === 'week' ? 'Välj en dag' : schedule ? 'Utan tid' : 'Inte planerad'}</span>
      {onToggleTask && <button type="button" className="wp-complete" aria-label={`Markera ${task.title} som klar`} title="Markera som klar" onClick={() => setError(onToggleTask(task))}><Check size={14} aria-hidden="true" /></button>}
    </div>
    <button className="wp-task-title" type="button" aria-label={`Öppna ${task.title}`} onClick={() => onOpen(task.id)}>{task.title}</button>
    <div className="wp-task-meta">
      {schedule?.label && <span>{schedule.label}</span>}
      {priority && <span className="wp-priority" data-priority={task.priority}>{priority} prioritet</span>}
      {task.deadline && <span className="wp-task-deadline">Deadline {shortDate(task.deadline)}{task.deadlineTime ? ` · ${task.deadlineTime}` : ''}</span>}
      {task.checklist.length > 0 && <span>{task.checklist.filter(item => item.completed).length}/{task.checklist.length} deluppgifter</span>}
    </div>
    {conflict && <span className="wp-task-warning"><TriangleAlert size={13} aria-hidden="true" />Tidskrock</span>}
    <button className="wp-task-plan" type="button" aria-label={`Planera ${task.title}`} onClick={() => onPlan(schedule ? { ...schedule } : { date: fallbackDate }, task)}><CalendarDays size={13} aria-hidden="true" />{schedule ? 'Ändra tid / dag' : 'Planera'}</button>
    {error && <p className="wp-action-error" role="alert">{error}</p>}
  </article>
}

export function WeekPlanner({ workspace, tasks, today, onPlan, onOpen, onToggleTask }: WeekPlannerProps) {
  const [anchor, setAnchor] = useState(() => weekStart(today))
  const [queueOpen, setQueueOpen] = useState(() => window.matchMedia('(min-width: 1680px)').matches)
  const headingId = useId(), queueId = useId()
  const plan = buildWeekPlan(workspace, tasks, anchor)
  const fallbackDate = today >= plan.monday && today <= plan.days[6].date ? today : plan.monday
  const shown = plan.days.reduce((sum, day) => sum + day.tasks.length, 0) + plan.weekTasks.length
  const queueCount = plan.weekTaskCount + plan.unscheduledTaskCount
  const card = (task: Task, conflict = false) => <PlanningCard key={task.id} task={task} fallbackDate={fallbackDate} conflict={conflict} onPlan={onPlan} onOpen={onOpen} onToggleTask={onToggleTask} />
  return <section className="week-planner" aria-label="Veckoplanering">
    <header className="wp-header">
      <div className="wp-period"><h2 id={headingId}>Vecka {isoWeek(plan.monday)}</h2><span>{shortDate(plan.monday)}–{shortDate(plan.days[6].date)} {parseLocalDate(plan.days[6].date).getFullYear()}</span></div>
      <div className="wp-navigation" role="group" aria-label="Välj planeringsvecka">
        <button className="icon-button" type="button" aria-label="Föregående vecka" onClick={() => setAnchor(addLocalDays(plan.monday, -7))}><ChevronLeft size={18} /></button>
        <button className="button secondary small" type="button" onClick={() => setAnchor(weekStart(today))}>Idag</button>
        <button className="icon-button" type="button" aria-label="Nästa vecka" onClick={() => setAnchor(addLocalDays(plan.monday, 7))}><ChevronRight size={18} /></button>
      </div>
      <button className="button secondary wp-queue-toggle" type="button" aria-expanded={queueOpen} aria-controls={queueId} onClick={() => setQueueOpen(value => !value)}><Inbox size={16} />Planeringskö<span>{queueCount}</span></button>
      <button className="button primary" type="button" onClick={() => onPlan({ date: fallbackDate })}><Plus size={16} aria-hidden="true" />Planera uppgift</button>
    </header>
    <div className="wp-stats" aria-label="Hela veckans aktiva planering" data-booked-minutes={plan.stats.bookedMinutes} data-overlap-pairs={plan.stats.overlapPairs}>
      <span><strong>{plan.stats.taskCount}</strong> uppgifter</span><span><Clock3 size={14} /><strong>{bookedTimeLabel(plan.stats.bookedMinutes)}</strong> bokad tid</span>
      <span className={plan.stats.overlapPairs ? 'wp-stat-warning' : undefined}><TriangleAlert size={14} /><strong>{plan.stats.overlapPairs}</strong> överlappande par</span>
      <span className="wp-filter-note">{shown} av {plan.stats.taskCount} visas</span>
      <details className="wp-explanation"><summary aria-label="Om planeringssiffrorna"><Info size={16} /></summary><p>Bokad tid summerar tidsblock för alla aktiva uppgifter i veckan, även de som döljs av filter. Överlapp räknas som par. Planering ändrar inte uppgiftens deadline.</p></details>
    </div>
    <div className={`wp-layout${queueOpen ? ' is-queue-open' : ''}`}>
      <aside className="wp-queue" id={queueId} aria-label="Uppgifter att fördela" hidden={!queueOpen}>
        <div className="wp-queue-heading"><h3>Att fördela</h3><button className="icon-button" type="button" aria-label="Stäng planeringskö" onClick={() => setQueueOpen(false)}><X size={16} /></button></div>
        <section className="wp-queue-section" aria-label="Den här veckan · utan dag"><div className="wp-section-heading"><h3>Den här veckan · utan dag</h3><span>{plan.weekTasks.length} av {plan.weekTaskCount}</span></div>
          <div className="wp-queue-list">{plan.weekTasks.map(task => card(task))}{!plan.weekTasks.length && <p className="wp-empty">{plan.weekTaskCount ? 'Inget matchar filtret.' : 'Lägg det du vill hinna med här. Välj dag när du är redo.'}</p>}</div>
          <button className="wp-queue-add" type="button" aria-label="Planera för veckan utan bestämd dag" onClick={() => onPlan({ date: plan.monday, scope: 'week' })}><Plus size={14} />Lägg till för veckan</button>
        </section>
        <section className="wp-queue-section" aria-label="Inte planerade"><div className="wp-section-heading"><h3>Inte planerade</h3><span>{plan.unscheduledTasks.length} av {plan.unscheduledTaskCount}</span></div>
          <div className="wp-queue-list">{plan.unscheduledTasks.map(task => card(task))}{!plan.unscheduledTasks.length && <p className="wp-empty">{plan.unscheduledTaskCount ? 'Inget matchar filtret.' : 'Alla aktiva uppgifter är planerade.'}</p>}</div>
        </section>
      </aside>
      <div className="wp-days-scroll" role="region" aria-labelledby={headingId} tabIndex={0}>
        <div className="wp-days">{plan.days.map(day => <section className={`wp-day${day.date === today ? ' wp-day-today' : ''}`} key={day.date} data-plan-date={day.date} aria-label={parseLocalDate(day.date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}>
          <header className="wp-day-heading"><div><span>{parseLocalDate(day.date).toLocaleDateString('sv-SE', { weekday: 'short' })}</span><strong>{parseLocalDate(day.date).getDate()}</strong></div><button className="icon-button" type="button" aria-label={`Planera ${day.date}`} onClick={() => onPlan({ date: day.date })}><Plus size={16} /></button></header>
          <div className="wp-day-stats" data-booked-minutes={day.stats.bookedMinutes} data-overlap-pairs={day.stats.overlapPairs}><span>{day.stats.taskCount} uppg. · {bookedTimeLabel(day.stats.bookedMinutes)}</span>{day.stats.overlapPairs > 0 && <span className="wp-day-conflicts">{day.stats.overlapPairs} överlapp</span>}</div>
          <div className="wp-day-tasks">{day.tasks.map(task => card(task, day.stats.conflictTaskIds.has(task.id)))}</div>
          {!day.tasks.length && <p className="wp-empty">{day.stats.taskCount ? 'Dolda av filter' : 'Inget planerat ännu'}</p>}
          <button className="wp-day-add" type="button" onClick={() => onPlan({ date: day.date })}><Plus size={14} aria-hidden="true" />Planera</button>
        </section>)}</div>
      </div>
    </div>
  </section>
}
