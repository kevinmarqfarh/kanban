// Daily briefing: a deterministic overview built from the Planner board and birthdays.
// Everything is computed on the device from the current workspace. Nothing is invented:
// every sentence refers to a real task, deadline or birthday, and the rules are documented
// in docs/briefing.md so the suggestions stay predictable.
import type { Birthday, Column, Task, Workspace } from './types'
import { doneColumnId, isTaskDone } from './helpers'
import { isValidBirthDate, nextBirthday } from './birthdays'
import { addLocalDays, daysBetween, parseLocalDate } from './others'

export type BriefingTone = 'calm' | 'steady' | 'busy' | 'overloaded'

export type DeadlineState =
  | { kind: 'overdue'; days: number; time: string | null }
  | { kind: 'today'; time: string | null }
  | { kind: 'upcoming'; days: number; time: string | null }
  | { kind: 'none' }

export interface FocusItem {
  task: Task
  column: string
  reasons: string[]
  score: number
}

export type TipKind = 'overload' | 'overdue' | 'timed' | 'wip' | 'start' | 'quick-win'
  | 'birthday-today' | 'birthday-soon' | 'birthday-plan' | 'evening' | 'stale' | 'calm' | 'empty'

export interface GiftTaskDraft {
  id: string
  title: string
  description: string
  deadline: string
  birthdayId: string
}

export interface BriefingTip {
  id: string
  kind: TipKind
  title: string
  detail: string
  taskId?: string
  birthdayId?: string
  gift?: GiftTaskDraft
}

export interface AgendaBirthday { birthday: Birthday; age: number }
export interface AgendaDay {
  date: string
  label: string
  tasks: Task[]
  birthdays: AgendaBirthday[]
}

export interface BriefingStats {
  open: number
  overdue: number
  dueToday: number
  dueWeek: number
  inProgress: number
  highPriority: number
  birthdaysWeek: number
}

export interface DailyBriefing {
  date: string
  greeting: string
  tone: BriefingTone
  headline: string
  summary: string
  stats: BriefingStats
  focus: FocusItem[]
  tips: BriefingTip[]
  agenda: AgendaDay[]
}

export const FOCUS_LIMIT = 3
export const TIP_LIMIT = 6
export const AGENDA_DAYS = 7
/** More cards than this in the in-progress column triggers the "finish before starting" tip. */
export const WIP_LIMIT = 3
/** Overdue + due today above this makes the day "overloaded". */
export const OVERLOAD_LIMIT = 5
export const STALE_DAYS = 21

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const validDate = (value: string | null | undefined): value is string => !!value && isValidBirthDate(value)
const validTime = (value: string | null | undefined): string | null => value && timePattern.test(value) ? value : null
const pad = (value: number) => String(value).padStart(2, '0')
export const clockTime = (now: Date) => `${pad(now.getHours())}:${pad(now.getMinutes())}`

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const days = (count: number) => plural(count, 'dag', 'dagar')
const tasksWord = (count: number) => plural(count, 'uppgift', 'uppgifter')

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} och ${items.at(-1)}`
}

const quote = (title: string) => `”${title}”`

export function weekdayLabel(date: string, today: string): string {
  const offset = daysBetween(today, date)
  if (offset === 0) return 'Idag'
  if (offset === 1) return 'I morgon'
  const label = parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function weekdayName(date: string): string {
  return parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long' })
}

/** Where a task stands relative to the current moment, honouring an optional deadline time. */
export function deadlineState(task: Task, today: string, now: string): DeadlineState {
  if (!validDate(task.deadline)) return { kind: 'none' }
  const time = validTime(task.deadlineTime)
  const offset = daysBetween(today, task.deadline)
  if (offset < 0) return { kind: 'overdue', days: -offset, time }
  if (offset === 0) return time && time < now ? { kind: 'overdue', days: 0, time } : { kind: 'today', time }
  return { kind: 'upcoming', days: offset, time }
}

export function deadlineReason(state: DeadlineState): string | null {
  switch (state.kind) {
    case 'overdue': return state.days === 0 ? `Försenad sedan ${state.time}` : `Försenad ${days(state.days)}`
    case 'today': return state.time ? `Deadline idag ${state.time}` : 'Deadline idag'
    case 'upcoming': return state.days === 1 ? `Deadline i morgon${state.time ? ` ${state.time}` : ''}` : `Deadline om ${days(state.days)}`
    default: return null
  }
}

/** The column that means "in progress": id `doing`, otherwise a column titled Pågår/Doing. */
export function inProgressColumn(columns: Column[]): Column | undefined {
  return columns.find(column => column.id === 'doing')
    ?? columns.find(column => /^(pågår|doing|in progress|pågående)$/i.test(column.title.trim()))
}

function checklistProgress(task: Task) {
  const total = task.checklist.length
  const complete = task.checklist.filter(item => item.completed).length
  return { total, complete, remaining: total - complete, ratio: total ? complete / total : 0 }
}

/**
 * Higher score = do sooner. Deadlines dominate, priority comes next, and work already
 * started gets a nudge so it is finished before something new begins.
 */
export function focusScore(task: Task, state: DeadlineState, inProgress: boolean): number {
  let score = 0
  if (state.kind === 'overdue') score += 1100 + Math.min(state.days, 30) * 5
  // Timed deadlines today rank above untimed ones, the earliest time first.
  // Bands: overdue 1100+, timed today 905–1000 (earliest first), untimed today 800–900, then later days.
  else if (state.kind === 'today') score += 800 + (state.time ? 200 - Math.floor((Number(state.time.slice(0, 2)) * 60 + Number(state.time.slice(3))) / 15) : 0)
  else if (state.kind === 'upcoming') score += state.days === 1 ? 500 : state.days <= 3 ? 320 - state.days * 10 : state.days <= 7 ? 160 - state.days * 5 : 40
  if (task.priority === 'high') score += 260
  else if (task.priority === 'medium') score += 80
  else if (task.priority === 'low') score -= 20
  // Momentum (already started, checklist nearly done) breaks ties, but never outranks a clock time:
  // a 10:30 call must come before a 15:00 deadline even if the latter is in progress.
  if (state.kind === 'today' && state.time) return score
  if (inProgress) score += 60
  const progress = checklistProgress(task)
  if (progress.total && progress.ratio >= 0.5) score += Math.round(progress.ratio * 40)
  return score
}

function focusReasons(task: Task, state: DeadlineState, inProgress: boolean): string[] {
  const reasons: string[] = []
  const deadline = deadlineReason(state)
  if (deadline) reasons.push(deadline)
  if (task.priority === 'high') reasons.push('Hög prioritet')
  if (inProgress) reasons.push('Pågår')
  const progress = checklistProgress(task)
  if (progress.total) reasons.push(`${progress.complete}/${progress.total} i checklistan`)
  return reasons
}

function greetingFor(now: Date): string {
  const hour = now.getHours()
  if (hour < 5) return 'God natt'
  if (hour < 10) return 'God morgon'
  if (hour < 17) return 'Hej'
  return 'God kväll'
}

export function giftTaskId(birthdayId: string, occasion: string) {
  return `briefing-gift:${birthdayId}:${occasion}`
}

/** A Planner card the user can create from a birthday tip. Deadline is the day before, never in the past. */
export function giftTaskDraft(birthday: Birthday, occasion: string, age: number, today: string): GiftTaskDraft {
  const dayBefore = addLocalDays(occasion, -1)
  const date = parseLocalDate(occasion).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
  return {
    id: giftTaskId(birthday.id, occasion),
    title: `Present till ${birthday.name}`,
    description: `${birthday.name} fyller ${age} år den ${date}.`,
    deadline: dayBefore < today ? today : dayBefore,
    birthdayId: birthday.id,
  }
}

/** Column a new card should land in: the first one that is neither done nor in progress. */
export function intakeColumn(workspace: Workspace): Column | undefined {
  const doing = inProgressColumn(workspace.columns)
  const doneId = doneColumnId(workspace)
  const done = (column: Column) => column.id === 'finalized' || column.id === doneId
  return workspace.columns.find(column => column.id === 'todo')
    ?? workspace.columns.find(column => column !== doing && !done(column))
    ?? workspace.columns.find(column => !done(column))
}

export function buildDailyBriefing(workspace: Workspace, today: string, now: Date = new Date()): DailyBriefing {
  const time = clockTime(now)
  const columnTitle = new Map(workspace.columns.map(column => [column.id, column.title]))
  const doing = inProgressColumn(workspace.columns)
  const open = workspace.tasks.filter(task => !isTaskDone(task, workspace))
  const entries = open.map(task => {
    const state = deadlineState(task, today, time)
    const inProgress = !!doing && task.columnId === doing.id
    return { task, state, inProgress, score: focusScore(task, state, inProgress) }
  })

  const overdue = entries.filter(entry => entry.state.kind === 'overdue')
    .sort((a, b) => (b.state.kind === 'overdue' ? b.state.days : 0) - (a.state.kind === 'overdue' ? a.state.days : 0))
  const dueToday = entries.filter(entry => entry.state.kind === 'today')
  const dueWeek = entries.filter(entry => entry.state.kind === 'upcoming' && entry.state.days < AGENDA_DAYS)
  const inProgress = entries.filter(entry => entry.inProgress)
  const highPriority = entries.filter(entry => entry.task.priority === 'high')
  const tomorrow = entries.filter(entry => entry.state.kind === 'upcoming' && entry.state.days === 1)

  const focus: FocusItem[] = [...entries]
    .sort((a, b) => b.score - a.score || a.task.createdAt.localeCompare(b.task.createdAt) || a.task.title.localeCompare(b.task.title, 'sv'))
    .slice(0, FOCUS_LIMIT)
    .map(entry => ({ task: entry.task, column: columnTitle.get(entry.task.columnId) ?? '', reasons: focusReasons(entry.task, entry.state, entry.inProgress), score: entry.score }))

  const birthdays = (workspace.birthdays ?? []).filter(person => isValidBirthDate(person.birthDate) && person.birthDate <= today)
    .map(person => {
      const occasion = nextBirthday(person.birthDate, parseLocalDate(today))
      return { person, date: occasion.date, age: occasion.age, days: daysBetween(today, occasion.date) }
    })
    .sort((a, b) => a.days - b.days || a.person.name.localeCompare(b.person.name, 'sv'))
  const birthdaysToday = birthdays.filter(entry => entry.days === 0)
  const birthdaysWeek = birthdays.filter(entry => entry.days < AGENDA_DAYS)

  const stats: BriefingStats = {
    open: open.length, overdue: overdue.length, dueToday: dueToday.length, dueWeek: dueWeek.length,
    inProgress: inProgress.length, highPriority: highPriority.length, birthdaysWeek: birthdaysWeek.length,
  }

  const pressing = overdue.length + dueToday.length
  const tone: BriefingTone = pressing > OVERLOAD_LIMIT ? 'overloaded'
    : overdue.length > 0 || dueToday.length >= 3 ? 'busy'
    : dueToday.length > 0 || highPriority.length > 0 || tomorrow.length > 0 ? 'steady'
    : 'calm'
  const headline = !workspace.tasks.length && !birthdays.length ? 'Ett tomt blad'
    : { overloaded: 'Mer än en dag rymmer', busy: 'En dag för fokus', steady: 'En hanterbar dag', calm: 'En lugn dag' }[tone]

  // One or two sentences that state the facts before any advice.
  const facts: string[] = []
  if (dueToday.length) facts.push(`${tasksWord(dueToday.length)} har deadline idag`)
  if (overdue.length) facts.push(`${plural(overdue.length, 'är försenad', 'är försenade')}`)
  if (!facts.length && tomorrow.length) facts.push(`${tasksWord(tomorrow.length)} har deadline i morgon`)
  if (!facts.length && dueWeek.length) facts.push(`${tasksWord(dueWeek.length)} har deadline den här veckan`)
  let summary = facts.length ? `${list(facts)}.` : open.length ? `Inget har deadline idag. Du har ${tasksWord(open.length)} öppna i Planner.` : 'Planner är tom.'
  summary = summary.charAt(0).toUpperCase() + summary.slice(1)
  if (birthdaysToday.length) summary += ` ${list(birthdaysToday.map(entry => entry.person.name))} fyller år idag.`
  else if (birthdaysWeek.length) {
    const next = birthdaysWeek[0]
    summary += ` ${next.person.name} fyller ${next.age} ${next.days === 1 ? 'i morgon' : `på ${weekdayName(next.date)}`}.`
  }

  const tips: BriefingTip[] = []
  const add = (tip: BriefingTip) => { if (!tips.some(existing => existing.id === tip.id)) tips.push(tip) }

  // Birthdays happening today come first: they cannot be moved.
  for (const entry of birthdaysToday) add({
    id: `birthday-today:${entry.person.id}`, kind: 'birthday-today', birthdayId: entry.person.id,
    title: `${entry.person.name} fyller ${entry.age} idag`,
    detail: 'Hör av dig redan på förmiddagen – ett samtal eller ett personligt meddelande räcker långt.',
  })

  if (tone === 'overloaded') add({
    id: 'overload', kind: 'overload',
    title: 'Välj tre, flytta resten',
    detail: `${tasksWord(pressing)} är försenade eller ska vara klara idag. Gör de tre under Gör först och ge resten ett nytt, realistiskt datum så att listan blir ärlig igen.`,
  })

  if (overdue.length) {
    const oldest = overdue[0]
    add({
      id: 'overdue', kind: 'overdue', taskId: oldest.task.id,
      title: overdue.length === 1 ? 'Ta hand om det försenade' : `${overdue.length} försenade uppgifter`,
      detail: `Börja med ${quote(oldest.task.title)}${oldest.state.kind === 'overdue' && oldest.state.days > 0 ? ` (${days(oldest.state.days)} sen)` : ''}. Gör klart den eller sätt ett nytt datum – en ärlig deadline är bättre än en gammal.`,
    })
  }

  const timed = dueToday.filter(entry => entry.state.kind === 'today' && entry.state.time)
    .sort((a, b) => (a.state.kind === 'today' && a.state.time || '').localeCompare(b.state.kind === 'today' && b.state.time || ''))
  if (timed.length) add({
    id: 'timed', kind: 'timed', taskId: timed[0].task.id,
    title: 'Passa tiderna',
    detail: `${list(timed.slice(0, 3).map(entry => `${entry.state.kind === 'today' ? entry.state.time : ''} ${quote(entry.task.title)}`))}. Lägg annat arbete runt de här tiderna.`,
  })

  for (const entry of birthdays.filter(entry => entry.days >= 1 && entry.days <= 14).slice(0, 3)) {
    const gift = giftTaskDraft(entry.person, entry.date, entry.age, today)
    const when = entry.days === 1 ? 'i morgon' : entry.days < AGENDA_DAYS ? `på ${weekdayName(entry.date)}` : `om ${days(entry.days)}`
    add(entry.days <= 3 ? {
      id: `birthday-soon:${entry.person.id}`, kind: 'birthday-soon', birthdayId: entry.person.id, gift,
      title: `${entry.person.name} fyller ${entry.age} ${when}`,
      detail: 'Har du ingen present än är det dags idag. Ett presentkort, en upplevelse eller blommor går att ordna samma dag.',
    } : entry.days < AGENDA_DAYS ? {
      id: `birthday-soon:${entry.person.id}`, kind: 'birthday-soon', birthdayId: entry.person.id, gift,
      title: `${entry.person.name} fyller ${entry.age} ${when}`,
      detail: 'Bra läge att ordna present eller hälsning nu. Ska något skickas med post behöver det iväg inom ett par dagar.',
    } : {
      id: `birthday-plan:${entry.person.id}`, kind: 'birthday-plan', birthdayId: entry.person.id, gift,
      title: `${entry.person.name} fyller ${entry.age} ${when}`,
      detail: 'Det finns gott om tid. Skriv ner en presentidé nu så slipper du stressa sista veckan.',
    })
  }

  if (doing && inProgress.length > WIP_LIMIT) add({
    id: 'wip', kind: 'wip',
    title: 'Avsluta innan du börjar nytt',
    detail: `${tasksWord(inProgress.length)} ligger i ${doing.title}. Gör klart minst en innan du drar in något nytt – fler halvfärdiga saker gör allt långsammare.`,
  })
  else if (doing && !inProgress.length && focus.length && tone !== 'overloaded') add({
    id: 'start', kind: 'start', taskId: focus[0].task.id,
    title: 'Välj en sak att starta',
    detail: `Inget ligger i ${doing.title}. Flytta ${quote(focus[0].task.title)} dit så har dagen en tydlig början.`,
  })

  const quickWin = entries.map(entry => ({ entry, progress: checklistProgress(entry.task) }))
    .filter(({ progress }) => progress.total >= 2 && progress.remaining > 0 && progress.remaining <= 2 && progress.ratio >= 0.5)
    .sort((a, b) => a.progress.remaining - b.progress.remaining || b.entry.score - a.entry.score)[0]
  if (quickWin) add({
    id: 'quick-win', kind: 'quick-win', taskId: quickWin.entry.task.id,
    title: 'Snabb vinst',
    detail: `${quote(quickWin.entry.task.title)} har bara ${plural(quickWin.progress.remaining, 'punkt', 'punkter')} kvar i checklistan. Bra att ta när energin är låg.`,
  })

  if (now.getHours() >= 17 && tomorrow.length) add({
    id: 'evening', kind: 'evening', taskId: tomorrow[0].task.id,
    title: 'Förbered morgondagen',
    detail: `I morgon har ${list(tomorrow.slice(0, 3).map(entry => quote(entry.task.title)))} deadline. Fem minuter i kväll gör morgonen lugnare.`,
  })

  if (tone === 'calm' && open.length) {
    const cutoff = addLocalDays(today, -STALE_DAYS)
    const stale = entries.filter(entry => entry.state.kind === 'none' && entry.task.createdAt.slice(0, 10) <= cutoff)
      .sort((a, b) => a.task.createdAt.localeCompare(b.task.createdAt))[0]
    if (stale) add({
      id: 'stale', kind: 'stale', taskId: stale.task.id,
      title: 'Något har legat länge',
      detail: `${quote(stale.task.title)} har väntat sedan ${parseLocalDate(stale.task.createdAt.slice(0, 10)).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}. Gör den, ge den ett datum eller ta bort den.`,
    })
    add({
      id: 'calm', kind: 'calm', taskId: focus[0]?.task.id,
      title: 'Använd lugnet',
      detail: focus[0] ? `Inget brådskar idag. Ägna en fokuserad stund åt ${quote(focus[0].task.title)} – det viktiga som inte har en deadline blir annars aldrig gjort.` : 'Inget brådskar idag.',
    })
  }

  if (!open.length) add({
    id: 'empty', kind: 'empty',
    title: workspace.tasks.length ? 'Allt i Planner är klart' : 'Lägg till dagens uppgifter',
    detail: workspace.tasks.length ? 'Bra jobbat. Skriv ner nästa sak du vill få gjort, eller njut av en tom lista.' : 'Skriv in det du vill få gjort så kan briefingen hjälpa dig att prioritera.',
  })

  const agenda: AgendaDay[] = []
  for (let offset = 0; offset < AGENDA_DAYS; offset++) {
    const date = addLocalDays(today, offset)
    const tasks = entries.filter(entry => entry.task.deadline === date && entry.state.kind !== 'overdue')
      .sort((a, b) => (validTime(a.task.deadlineTime) ?? '99').localeCompare(validTime(b.task.deadlineTime) ?? '99') || b.score - a.score)
      .map(entry => entry.task)
    const people = birthdays.filter(entry => entry.date === date).map(entry => ({ birthday: entry.person, age: entry.age }))
    if (tasks.length || people.length) agenda.push({ date, label: weekdayLabel(date, today), tasks, birthdays: people })
  }

  return { date: today, greeting: greetingFor(now), tone, headline, summary, stats, focus, tips: tips.slice(0, TIP_LIMIT), agenda }
}

/** Plain-text version for copying or saving into the debrief history. */
export function briefingToText(briefing: DailyBriefing): string {
  const lines: string[] = [briefing.headline, briefing.summary]
  if (briefing.focus.length) {
    lines.push('', 'Gör först')
    briefing.focus.forEach((item, index) => lines.push(`${index + 1}. ${item.task.title}${item.reasons.length ? ` – ${item.reasons.join(', ')}` : ''}`))
  }
  if (briefing.tips.length) {
    lines.push('', 'Förslag')
    for (const tip of briefing.tips) lines.push(`• ${tip.title}: ${tip.detail}`)
  }
  if (briefing.agenda.length) {
    lines.push('', 'Kommande dagar')
    for (const day of briefing.agenda) {
      const items = [...day.birthdays.map(entry => `${entry.birthday.name} fyller ${entry.age}`), ...day.tasks.map(task => `${task.deadlineTime && timePattern.test(task.deadlineTime) ? `${task.deadlineTime} ` : ''}${task.title}`)]
      lines.push(`${day.label}: ${items.join(' · ')}`)
    }
  }
  return lines.join('\n')
}

export function briefingDebriefPayload(briefing: DailyBriefing, now: Date = new Date()) {
  return {
    date: briefing.date,
    title: `Dagens briefing – ${briefing.headline}`.slice(0, 120),
    summary: Array.from(briefing.summary).slice(0, 500).join(''),
    body: briefingToText(briefing),
    createdAt: now.toISOString(),
  }
}
