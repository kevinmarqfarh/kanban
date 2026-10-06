import { useState } from 'react'
import { ArrowRight, Bell, Cake, Check, Utensils, X } from 'lucide-react'
import type { Workspace } from '../lib/types'
import type { useDebriefs } from '../hooks/useDebriefs'
import { currentAge, nextBirthday, unreadBirthdayNotifications } from '../lib/birthdays'
import { daysBetween, isoWeek, isNutritionComplete, parseLocalDate, weekDates } from '../lib/others'
import { Summary } from './Summary'

const weekdays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
function dateText(date: string, today: string) {
  return parseLocalDate(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) })
}

export function Home({ workspace, today, reports, initialId, localOnly, onBirthdays, onNutrition, onToggleHabit, onReadNotification, onDismissNotification }: {
  workspace: Workspace; today: string; reports: ReturnType<typeof useDebriefs>; initialId?: string; localOnly: boolean;
  onBirthdays: () => void; onNutrition: () => void;
  onToggleHabit: (habitId: string, date: string) => string | null;
  onReadNotification: (id: string) => string | null; onDismissNotification: (id: string) => string | null;
}) {
  const [reading, setReading] = useState(!!initialId)
  const [error, setError] = useState<string | null>(null)
  const notifications = unreadBirthdayNotifications(workspace)
  const habits = workspace.nutritionHabits ?? []
  const finished = habits.filter(habit => isNutritionComplete(workspace, habit.id, today)).length
  const upcoming = (workspace.birthdays ?? []).map(person => ({ person, ...nextBirthday(person.birthDate, parseLocalDate(today)) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.person.name.localeCompare(b.person.name, 'sv'))
  function run(action: () => string | null) { setError(action()) }
  return <div className="home-page" data-testid="home-overview">
    {error && <p className="form-message error" role="alert">{error}</p>}
    {!reading && <>
      <div className="home-date"><time dateTime={today}>{parseLocalDate(today).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</time><span>Vecka {isoWeek(today)}</span></div>
      {notifications.length > 0 && <section className="home-notifications" aria-label="Födelsedagspåminnelser" data-testid="birthday-notifications">
        {notifications.map(note => {
          const days = daysBetween(today, note.date)
          return <article className="home-notification" key={note.id} data-birthday-notification-id={note.id}>
            <span className="home-notification-icon"><Bell size={18} /></span><div className="home-notification-copy"><p>Födelsedag · {days === 0 ? 'Idag' : days === 1 ? '1 dag kvar' : `${days} dagar kvar`}</p><strong>{note.name} fyller {note.age} år</strong><time dateTime={note.date}>{dateText(note.date, today)}</time></div>
            <div className="home-notification-actions"><button className="icon-button" aria-label={`Markera påminnelse för ${note.name} som läst`} onClick={() => run(() => onReadNotification(note.id))}><Check size={18} /></button><button className="icon-button" aria-label={`Dölj påminnelse för ${note.name}`} onClick={() => run(() => onDismissNotification(note.id))}><X size={18} /></button></div>
          </article>
        })}
      </section>}
      <div className="home-grid">
        <section className="home-panel" aria-labelledby="home-nutrition-title" data-testid="home-nutrition">
          <div className="home-panel-heading"><h2 id="home-nutrition-title"><Utensils size={18} />Dagens kost</h2><button className="icon-button" aria-label="Öppna kost" onClick={onNutrition}><ArrowRight size={18} /></button></div>
          {habits.length > 0 ? <>
            <div className="home-week" aria-label={`Kostöversikt vecka ${isoWeek(today)}`}>{weekDates(today).map((date, index) => {
              const count = habits.filter(habit => isNutritionComplete(workspace, habit.id, date)).length
              return <div className={`home-week-day ${date === today ? 'today' : ''}`} key={date} data-date={date} aria-label={`${weekdays[index]} ${date}: ${count} av ${habits.length} klara`}><span>{weekdays[index]}</span><strong>{Number(date.slice(-2))}</strong><span className="home-week-progress"><i style={{ width: `${count / habits.length * 100}%` }} /></span></div>
            })}</div>
            <div className="home-habits">{habits.map(habit => {
              const completed = isNutritionComplete(workspace, habit.id, today)
              return <label className={`home-habit ${completed ? 'is-complete' : ''}`} key={habit.id} data-home-habit-id={habit.id} data-completed={completed}><input type="checkbox" aria-label={`Klar idag: ${habit.title}`} checked={completed} onChange={() => run(() => onToggleHabit(habit.id, today))} /><span className="home-habit-copy"><strong>{habit.title}</strong><small>{habit.amount} {habit.unit}</small></span></label>
            })}</div><p className="home-panel-footnote">{finished}/{habits.length} klara idag</p>
          </> : <div className="home-empty"><p>Inga kostvanor ännu.</p><button className="button secondary" onClick={onNutrition}>Lägg till vana<ArrowRight size={15} /></button></div>}
        </section>
        <section className="home-panel" aria-labelledby="home-birthdays-title" data-testid="upcoming-birthdays">
          <div className="home-panel-heading"><h2 id="home-birthdays-title"><Cake size={18} />Kommande födelsedagar</h2><button className="icon-button" aria-label="Öppna födelsedagar" onClick={onBirthdays}><ArrowRight size={18} /></button></div>
          {upcoming.length > 0 ? <div className="home-birthday-list">{upcoming.slice(0, 5).map(({ person, date, age }) => <button className="home-birthday-row" key={person.id} data-birthday-id={person.id} onClick={onBirthdays}><span><strong>{person.name}</strong><small>{currentAge(person.birthDate, parseLocalDate(today))} år · fyller {age}</small></span><time dateTime={date}>{dateText(date, today)}</time></button>)}{upcoming.length > 5 && <button className="button ghost" onClick={onBirthdays}>Visa alla {upcoming.length}<ArrowRight size={15} /></button>}</div> : <div className="home-empty"><p>Inga födelsedagar ännu.</p><button className="button secondary" onClick={onBirthdays}>Lägg till födelsedag<ArrowRight size={15} /></button></div>}
        </section>
      </div>
    </>}
    <section className="home-debriefs" aria-label="Dagliga sammanfattningar">
      {!reading && <h2 className="home-section-title">Daglig sammanfattning</h2>}
      <Summary debriefs={reports.debriefs} initialId={initialId} onRead={reports.markRead} onDismiss={reports.dismiss} onImport={reports.importDebrief} error={reports.error} onRetry={reports.retry} localOnly={localOnly} onReaderChange={setReading} />
    </section>
  </div>
}
