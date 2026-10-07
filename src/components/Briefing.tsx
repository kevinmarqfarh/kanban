import { useEffect, useMemo, useState } from 'react'
import {
  AlarmClock, ArrowRight, Archive, CalendarRange, Check, ChevronDown, CircleAlert, Clock, Copy, Gift, Hourglass,
  Layers, Leaf, ListPlus, Moon, PartyPopper, Play, Cake, Sunrise, Zap, type LucideIcon,
} from 'lucide-react'
import type { DailyDebrief, Workspace } from '../lib/types'
import { briefingDebriefPayload, briefingToText, buildDailyBriefing, type BriefingTip, type GiftTaskDraft, type TipKind } from '../lib/briefing'

const tipIcons: Record<TipKind, LucideIcon> = {
  overload: Layers, overdue: CircleAlert, timed: Clock, wip: Hourglass, start: Play, 'quick-win': Zap,
  'birthday-today': PartyPopper, 'birthday-soon': Gift, 'birthday-plan': Cake, evening: Moon, stale: Archive, calm: Leaf, empty: ListPlus,
}
const PREVIEW_TIPS = 3

/** Re-render every minute so timed deadlines turn overdue and the greeting follows the clock. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export function Briefing({ workspace, today, debriefs, onOpenTask, onOpenPlanner, onOpenBirthdays, onCreateGiftTask, onSave }: {
  workspace: Workspace
  today: string
  debriefs: DailyDebrief[]
  onOpenTask: (taskId: string) => void
  onOpenPlanner: () => void
  onOpenBirthdays: () => void
  onCreateGiftTask: (draft: GiftTaskDraft) => string | null
  onSave: (payload: unknown) => Promise<string | null>
}) {
  const now = useMinute()
  const briefing = useMemo(() => buildDailyBriefing(workspace, today, now), [workspace, today, now])
  const [showAllTips, setShowAllTips] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const savedToday = debriefs.some(entry => entry.date === today)
  const taskIds = new Set(workspace.tasks.map(task => task.id))
  const tips = showAllTips ? briefing.tips : briefing.tips.slice(0, PREVIEW_TIPS)
  const { stats } = briefing

  useEffect(() => { if (status?.tone !== 'ok') return; const timer = window.setTimeout(() => setStatus(null), 4000); return () => window.clearTimeout(timer) }, [status])

  async function copy() {
    try {
      await navigator.clipboard.writeText(briefingToText(briefing))
      setStatus({ tone: 'ok', text: 'Briefingen är kopierad.' })
    } catch {
      setStatus({ tone: 'error', text: 'Kunde inte kopiera. Webbläsaren tillåter inte urklipp här.' })
    }
  }

  async function save() {
    if (saving || savedToday) return
    setSaving(true)
    try {
      const problem = await onSave(briefingDebriefPayload(briefing))
      setStatus(problem === null ? { tone: 'ok', text: 'Sparad under Daglig sammanfattning.' } : { tone: 'error', text: problem || 'Briefingen kunde inte sparas. Försök igen.' })
    } catch {
      setStatus({ tone: 'error', text: 'Briefingen kunde inte sparas. Försök igen.' })
    } finally {
      setSaving(false)
    }
  }

  function createGift(tip: BriefingTip) {
    if (!tip.gift) return
    const problem = onCreateGiftTask(tip.gift)
    setStatus(problem === null ? { tone: 'ok', text: `”${tip.gift.title}” finns nu i Planner.` } : { tone: 'error', text: problem })
  }

  const statItems = [
    { key: 'overdue', label: 'Försenat', value: stats.overdue, alert: stats.overdue > 0 },
    { key: 'today', label: 'Idag', value: stats.dueToday, alert: false },
    { key: 'week', label: 'Kommande 7 dagar', value: stats.dueWeek, alert: false },
    { key: 'doing', label: 'Pågår', value: stats.inProgress, alert: false },
    { key: 'birthdays', label: 'Födelsedagar', value: stats.birthdaysWeek, alert: false },
  ]

  return <section className="briefing" aria-labelledby="briefing-title" data-testid="daily-briefing" data-tone={briefing.tone}>
    <header className="briefing-header">
      <div className="briefing-heading">
        <p className="briefing-eyebrow"><Sunrise size={14} aria-hidden="true" />{briefing.greeting} · Dagens briefing</p>
        <h2 id="briefing-title">{briefing.headline}</h2>
        <p className="briefing-summary">{briefing.summary}</p>
      </div>
      <div className="briefing-tools">
        <button className="icon-button" type="button" aria-label="Kopiera briefingen som text" title="Kopiera som text" onClick={copy}><Copy size={17} /></button>
        <button className="icon-button" type="button" aria-label={savedToday ? 'Dagens sammanfattning finns redan i historiken' : 'Spara briefingen i Daglig sammanfattning'} title={savedToday ? 'Finns redan i historiken' : 'Spara i historiken'} disabled={saving || savedToday} onClick={save}>{savedToday ? <Check size={17} /> : <Archive size={17} />}</button>
      </div>
    </header>

    {status && <p className={`briefing-status ${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.tone === 'ok' && <Check size={14} aria-hidden="true" />}{status.text}</p>}

    <dl className="briefing-stats" aria-label="Läget just nu">
      {statItems.map(item => <div className={`briefing-stat${item.alert ? ' is-alert' : ''}${item.value === 0 ? ' is-zero' : ''}`} key={item.key} data-stat={item.key}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>

    <div className="briefing-grid">
      <section className="briefing-block" aria-labelledby="briefing-focus-title" data-testid="briefing-focus">
        <h3 id="briefing-focus-title"><AlarmClock size={16} aria-hidden="true" />Gör först</h3>
        {briefing.focus.length > 0 ? <ol className="briefing-focus">
          {briefing.focus.map((item, index) => <li key={item.task.id}>
            <button type="button" className="briefing-focus-row" data-task-id={item.task.id} aria-label={`Öppna ${item.task.title}${item.reasons.length ? `: ${item.reasons.join(', ')}` : ''}`} onClick={() => onOpenTask(item.task.id)}>
              <span className="briefing-rank" aria-hidden="true">{index + 1}</span>
              <span className="briefing-focus-copy"><strong>{item.task.title}</strong>
                <span className="briefing-reasons">{item.reasons.map(reason => <span className={`briefing-reason${/^Försenad/.test(reason) ? ' is-late' : /^Deadline idag/.test(reason) ? ' is-today' : reason === 'Hög prioritet' ? ' is-high' : ''}`} key={reason}>{reason}</span>)}{item.column && !item.reasons.includes(item.column) && <span className="briefing-column">{item.column}</span>}</span>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </li>)}
        </ol> : <div className="briefing-empty"><p>Inga öppna uppgifter i Planner.</p><button className="button secondary" type="button" onClick={onOpenPlanner}>Öppna Planner<ArrowRight size={15} /></button></div>}
      </section>

      <section className="briefing-block" aria-labelledby="briefing-tips-title" data-testid="briefing-tips">
        <h3 id="briefing-tips-title"><Zap size={16} aria-hidden="true" />Förslag</h3>
        <ul className="briefing-tips">
          {tips.map(tip => {
            const Icon = tipIcons[tip.kind]
            const giftExists = !!tip.gift && taskIds.has(tip.gift.id)
            return <li className="briefing-tip" key={tip.id} data-tip={tip.kind}>
              <span className="briefing-tip-icon" aria-hidden="true"><Icon size={16} /></span>
              <div className="briefing-tip-copy"><strong>{tip.title}</strong><p>{tip.detail}</p>
                {(tip.taskId || tip.gift || tip.birthdayId || tip.kind === 'empty') && <div className="briefing-tip-actions">
                  {tip.taskId && taskIds.has(tip.taskId) && <button className="button ghost" type="button" onClick={() => onOpenTask(tip.taskId!)}>Öppna uppgiften<ArrowRight size={14} /></button>}
                  {tip.gift && (giftExists
                    ? <button className="button ghost" type="button" onClick={() => onOpenTask(tip.gift!.id)}><Check size={14} />Finns i Planner</button>
                    : <button className="button secondary" type="button" onClick={() => createGift(tip)}><ListPlus size={14} />Lägg till i Planner</button>)}
                  {tip.birthdayId && !tip.gift && <button className="button ghost" type="button" onClick={onOpenBirthdays}>Visa födelsedagar<ArrowRight size={14} /></button>}
                  {tip.kind === 'empty' && <button className="button secondary" type="button" onClick={onOpenPlanner}>Öppna Planner<ArrowRight size={14} /></button>}
                </div>}
              </div>
            </li>
          })}
        </ul>
        {briefing.tips.length > PREVIEW_TIPS && <button className="button ghost briefing-more" type="button" aria-expanded={showAllTips} onClick={() => setShowAllTips(value => !value)}>{showAllTips ? 'Visa färre' : `Visa alla förslag (${briefing.tips.length})`}<ChevronDown size={15} className={showAllTips ? 'is-open' : ''} /></button>}
      </section>
    </div>

    {briefing.agenda.length > 0 && <section className="briefing-agenda" aria-labelledby="briefing-agenda-title" data-testid="briefing-agenda">
      <h3 id="briefing-agenda-title"><CalendarRange size={16} aria-hidden="true" />Kommande 7 dagar</h3>
      <ol>{briefing.agenda.map(day => <li key={day.date} className={day.date === today ? 'is-today' : ''} data-date={day.date}>
        <time dateTime={day.date}>{day.label}</time>
        <ul>
          {day.birthdays.map(entry => <li key={entry.birthday.id}><button type="button" className="briefing-agenda-item is-birthday" onClick={onOpenBirthdays}><Cake size={13} aria-hidden="true" />{entry.birthday.name} fyller {entry.age}</button></li>)}
          {day.tasks.map(task => <li key={task.id}><button type="button" className={`briefing-agenda-item${task.priority === 'high' ? ' is-high' : ''}`} onClick={() => onOpenTask(task.id)}>{task.deadlineTime && <span className="briefing-time">{task.deadlineTime}</span>}{task.title}</button></li>)}
        </ul>
      </li>)}</ol>
    </section>}

    <p className="briefing-footnote">Räknas fram på enheten från Planner och födelsedagar. Uppdateras när du ändrar något.</p>
  </section>
}
