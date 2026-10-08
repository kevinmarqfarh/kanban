import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Bell, Cake, CalendarRange, Check, CloudOff, Cloud, HardDrive, Pill, Plus, Sparkles, X } from 'lucide-react'
import type { SyncStatus, Workspace } from '../lib/types'
import { buildDailyBriefing } from '../lib/briefing'
import { unreadBirthdayNotifications } from '../lib/birthdays'
import { daysBetween, isoWeek, isNutritionComplete, nutritionDayStatus, parseLocalDate, weekDates } from '../lib/others'
import { useNow } from '../hooks/useNow'

const weekdays = ['M', 'T', 'O', 'T', 'F', 'L', 'S']
const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Hemskärm: everything for the day on one screen for a docked tablet.
 * Read at a glance from across the kitchen, act with one tap, never scroll the page.
 */
export function HomeScreen({ workspace, today, syncStatus, signedIn, unreadDebriefs, onOpenTask, onOpenPlanner, onOpenBirthdays, onOpenNutrition, onOpenDebriefs, onToggleHabit, onQuickAdd, onReadNotification, onDismissNotification }: {
  workspace: Workspace
  today: string
  syncStatus: SyncStatus
  signedIn: boolean
  unreadDebriefs: number
  onOpenTask: (taskId: string) => void
  onOpenPlanner: () => void
  onOpenBirthdays: () => void
  onOpenNutrition: () => void
  onOpenDebriefs: () => void
  onToggleHabit: (habitId: string, date: string) => string | null
  onQuickAdd: (title: string, dueToday: boolean) => string | null
  onReadNotification: (id: string) => string | null
  onDismissNotification: (id: string) => string | null
}) {
  const now = useNow()
  const briefing = useMemo(() => buildDailyBriefing(workspace, today, now), [workspace, today, now])
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [dueToday, setDueToday] = useState(true)
  const [added, setAdded] = useState<string | null>(null)
  const habits = workspace.nutritionHabits ?? []
  const done = habits.filter(habit => isNutritionComplete(workspace, habit.id, today)).length
  const notifications = unreadBirthdayNotifications(workspace)
  const nextTip = briefing.tips[0]
  const weekday = parseLocalDate(today).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
  const date = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const run = (action: () => string | null) => setError(action())

  function submit(event: FormEvent) {
    event.preventDefault()
    const clean = title.trim()
    if (!clean) return
    const problem = onQuickAdd(clean, dueToday)
    setError(problem)
    if (!problem) { setAdded(`”${clean}” ligger i Planner${dueToday ? ' med deadline idag' : ''}.`); setTitle('') }
  }

  const sync = !signedIn ? { Icon: HardDrive, text: 'Sparas på enheten' }
    : syncStatus === 'synced' ? { Icon: Cloud, text: `Synkad ${pad(now.getHours())}:${pad(now.getMinutes())}` }
    : syncStatus === 'syncing' ? { Icon: Cloud, text: 'Synkar…' }
    : syncStatus === 'offline' ? { Icon: CloudOff, text: 'Offline · sparas lokalt' }
    : { Icon: CloudOff, text: 'Synken behöver hjälp' }

  return <div className="homescreen" data-testid="home-screen" data-tone={briefing.tone}>
    {error && <p className="form-message error homescreen-error" role="alert">{error}<button className="icon-button" type="button" aria-label="Stäng meddelande" onClick={() => setError(null)}><X size={16} /></button></p>}

    <section className="hs-card hs-today" aria-labelledby="hs-headline">
      <div className="hs-now">
        <div className="hs-clock-row">
          <time className="hs-clock" dateTime={now.toISOString()} aria-label={`Klockan ${pad(now.getHours())}:${pad(now.getMinutes())}`}>{pad(now.getHours())}:{pad(now.getMinutes())}</time>
          <span className="hs-sync" data-status={signedIn ? syncStatus : 'local'}><sync.Icon size={13} aria-hidden="true" />{sync.text}</span>
        </div>
        <p className="hs-date"><span>{date}</span><span>Vecka {isoWeek(today)}</span></p>
        <h2 id="hs-headline" className="hs-headline">{briefing.headline}</h2>
        <p className="hs-summary">{briefing.summary}</p>
        <dl className="hs-stats">
          {[
            { key: 'overdue', label: 'Försenat', value: briefing.stats.overdue, alert: briefing.stats.overdue > 0 },
            { key: 'today', label: 'Idag', value: briefing.stats.dueToday, alert: false },
            { key: 'doing', label: 'Pågår', value: briefing.stats.inProgress, alert: false },
            { key: 'birthdays', label: 'Fyller år', value: briefing.stats.birthdaysWeek, alert: false },
          ].map(item => <div key={item.key} className={`hs-stat${item.alert ? ' is-alert' : ''}${item.value ? '' : ' is-zero'}`} data-stat={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
        </dl>
      </div>
      <div className="hs-focus-area">
        <h3 className="hs-title">Gör först</h3>
        {briefing.focus.length ? <ol className="hs-focus">{briefing.focus.map((item, index) => <li key={item.task.id}>
          <button type="button" className="hs-focus-row" data-task-id={item.task.id} onClick={() => onOpenTask(item.task.id)} aria-label={`Öppna ${item.task.title}${item.reasons.length ? `: ${item.reasons.join(', ')}` : ''}`}>
            <span className="hs-rank" aria-hidden="true">{index + 1}</span>
            <span className="hs-focus-copy"><strong>{item.task.title}</strong>{item.reasons[0] && <small className={/^Försenad/.test(item.reasons[0]) ? 'is-late' : /^Deadline idag/.test(item.reasons[0]) ? 'is-today' : ''}>{item.reasons.slice(0, 2).join(' · ')}</small>}</span>
          </button>
        </li>)}</ol> : <button type="button" className="button secondary hs-empty-action" onClick={onOpenPlanner}>Inget öppet i Planner<ArrowRight size={15} /></button>}
        {unreadDebriefs > 0 && <button type="button" className="button ghost hs-debrief-link" onClick={onOpenDebriefs}><Bell size={15} />{unreadDebriefs === 1 ? 'Ny daglig sammanfattning' : `${unreadDebriefs} nya sammanfattningar`}<ArrowRight size={14} /></button>}
      </div>
      {nextTip && <div className="hs-tip" data-tip={nextTip.kind}><Sparkles size={15} aria-hidden="true" /><p><strong>{nextTip.title}.</strong> {nextTip.detail}</p></div>}
    </section>

    <section className="hs-card hs-food" aria-labelledby="hs-food-title" data-testid="home-screen-nutrition">
      <div className="hs-card-heading">
        <h3 id="hs-food-title" className="hs-title"><Pill size={17} aria-hidden="true" />Kost och tillskott</h3>
        {habits.length > 0 && <span className={`hs-count${done === habits.length ? ' is-complete' : ''}`} aria-label={`${done} av ${habits.length} klara idag`}>{done}/{habits.length}</span>}
      </div>
      {habits.length > 0 ? <>
        <div className="hs-habits" role="group" aria-label="Bocka av för idag">{habits.map(habit => {
          const complete = isNutritionComplete(workspace, habit.id, today)
          return <button key={habit.id} type="button" className={`hs-habit${complete ? ' is-complete' : ''}`} aria-pressed={complete} data-habit-id={habit.id} onClick={() => run(() => onToggleHabit(habit.id, today))}>
            <span className="hs-check" aria-hidden="true">{complete && <Check size={20} strokeWidth={2.4} />}</span>
            <span className="hs-habit-copy"><strong>{habit.title}</strong><small>{habit.amount} {habit.unit}</small></span>
          </button>
        })}</div>
        <div className="hs-week" aria-label={`Kost vecka ${isoWeek(today)}`}>{weekDates(today).map((day, index) => {
          const status = nutritionDayStatus(workspace, day, today)
          return <span key={day} className={`hs-week-day${day === today ? ' is-today' : ''}${status ? ` status-${status}` : ''}`} data-date={day} title={day}><small>{weekdays[index]}</small>{Number(day.slice(-2))}</span>
        })}</div>
      </> : <div className="hs-empty"><p>Lägg till kosttillskott och vanor så kan du bocka av dem här varje dag.</p><button type="button" className="button secondary" onClick={onOpenNutrition}>Lägg till vana<ArrowRight size={15} /></button></div>}
    </section>

    <section className="hs-card hs-upcoming" aria-labelledby="hs-upcoming-title" data-testid="home-screen-upcoming">
      <div className="hs-card-heading"><h3 id="hs-upcoming-title" className="hs-title"><CalendarRange size={17} aria-hidden="true" />Kommande 7 dagar</h3></div>
      <div className="hs-scroll">
        {notifications.length > 0 && <ul className="hs-notices" aria-label="Födelsedagspåminnelser">{notifications.map(note => {
          const days = daysBetween(today, note.date)
          return <li key={note.id} className="hs-notice" data-birthday-notification-id={note.id}>
            <Cake size={16} aria-hidden="true" />
            <span><strong>{note.name} fyller {note.age}</strong><small>{days === 0 ? 'Idag' : days === 1 ? 'I morgon' : `Om ${days} dagar`}</small></span>
            <button className="icon-button" type="button" aria-label={`Markera påminnelse för ${note.name} som läst`} onClick={() => run(() => onReadNotification(note.id))}><Check size={17} /></button>
            <button className="icon-button" type="button" aria-label={`Dölj påminnelse för ${note.name}`} onClick={() => run(() => onDismissNotification(note.id))}><X size={17} /></button>
          </li>
        })}</ul>}
        {briefing.agenda.length > 0 ? <ol className="hs-agenda">{briefing.agenda.map(day => <li key={day.date} data-date={day.date} className={day.date === today ? 'is-today' : ''}>
          <time dateTime={day.date}>{day.label}</time>
          <ul>
            {day.birthdays.map(entry => <li key={entry.birthday.id}><button type="button" className="hs-agenda-item is-birthday" onClick={onOpenBirthdays}><Cake size={14} aria-hidden="true" />{entry.birthday.name} fyller {entry.age}</button></li>)}
            {day.tasks.map(task => <li key={task.id}><button type="button" className={`hs-agenda-item${task.priority === 'high' ? ' is-high' : ''}`} onClick={() => onOpenTask(task.id)}>{task.deadlineTime && <span className="hs-time">{task.deadlineTime}</span>}{task.title}</button></li>)}
          </ul>
        </li>)}</ol> : <p className="hs-quiet">Inga deadlines eller födelsedagar den närmaste veckan.</p>}
      </div>
      <form className="hs-quick" onSubmit={submit} aria-label="Snabb uppgift till Planner">
        <label className="sr-only" htmlFor="hs-quick-title">Ny uppgift</label>
        <input id="hs-quick-title" className="input" value={title} maxLength={140} placeholder="Ny uppgift…" enterKeyHint="done" autoComplete="off" onChange={event => { setTitle(event.target.value); setAdded(null) }} />
        <button type="button" className={`hs-today-toggle${dueToday ? ' active' : ''}`} aria-pressed={dueToday} onClick={() => setDueToday(value => !value)}>Idag</button>
        <button type="submit" className={`button primary hs-add${title.trim() ? '' : ' is-empty'}`} aria-label="Lägg till i Planner"><Plus size={18} /></button>
      </form>
      {added && <p className="hs-added" role="status"><Check size={13} />{added}</p>}
    </section>
  </div>
}
