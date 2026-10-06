import type { Birthday, BirthdayReminder, BirthdayNotification, Workspace } from './types'

export const REMINDER_OPTIONS: { value: BirthdayReminder; label: string }[] = [
  { value: 'week', label: '7 dagar' },
  { value: 'two-weeks', label: '14 dagar' },
  { value: 'month', label: '30 dagar' },
]
const schedulingOptions = [...REMINDER_OPTIONS, { value: 'day' as const, label: 'På födelsedagen' }]

export function localDateString(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Calendar arithmetic uses local noon so crossing DST never changes the day.
function calendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0)
  date.setFullYear(year, month, day)
  date.setHours(12, 0, 0, 0)
  return date
}

export function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  return year > 0 && localDateString(calendarDate(year, month - 1, day)) === value
}

function anniversary(birthDate: string, year: number): Date {
  const [, month, day] = birthDate.split('-').map(Number)
  // Observe February 29 on February 28 in years without a leap day.
  const lastDay = calendarDate(year, month, 0).getDate()
  return calendarDate(year, month - 1, Math.min(day, lastDay))
}

export function nextBirthday(birthDate: string, today: Date = new Date()): { date: string; age: number } {
  if (!isValidBirthDate(birthDate)) throw new Error('Ogiltigt födelsedatum')
  const birthYear = Number(birthDate.slice(0, 4))
  let year = Math.max(today.getFullYear(), birthYear)
  let occasion = anniversary(birthDate, year)
  if (localDateString(occasion) < localDateString(today)) occasion = anniversary(birthDate, ++year)
  return { date: localDateString(occasion), age: year - birthYear }
}

export function currentAge(birthDate: string, today: Date = new Date()): number {
  const next = nextBirthday(birthDate, today)
  return Math.max(0, next.age - (next.date === localDateString(today) ? 0 : 1))
}
export const currentBirthdayAge = currentAge

export function birthdayDescription(birthday: Birthday, occasion = nextBirthday(birthday.birthDate)): string {
  const [year, month, day] = occasion.date.split('-').map(Number)
  const date = calendarDate(year, month - 1, day).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${birthday.name} fyller ${occasion.age} år.\nFödelsedag: ${date}.`
}

export function reminderDate(occasionDate: string, reminder: BirthdayReminder): string {
  const [year, month, day] = occasionDate.split('-').map(Number)
  const days = reminder === 'month' ? 30 : reminder === 'two-weeks' ? 14 : reminder === 'week' ? 7 : 0
  return localDateString(calendarDate(year, month - 1, day - days))
}

export function birthdayNotificationId(birthdayId: string, occasionDate: string, reminder: BirthdayReminder): string {
  return `birthday-notification:${birthdayId}:${occasionDate}:${reminder}`
}

export function unreadBirthdayNotifications(workspace: Workspace): BirthdayNotification[] {
  return (workspace.birthdayNotifications ?? []).filter(entry => !entry.readAt && !entry.dismissedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.date.localeCompare(b.date))
}

/** Create in-app notifications only. Existing birthday Kanban cards stay intact. */
export function applyBirthdayReminders(workspace: Workspace, now: Date = new Date()): Workspace {
  const birthdays = workspace.birthdays
  const today = localDateString(now)
  let notificationChanged = false
  const notifications = (workspace.birthdayNotifications ?? []).flatMap(entry => {
    if (entry.readAt || entry.dismissedAt) return [entry]
    const person = birthdays?.find(birthday => birthday.id === entry.birthdayId)
    if (!person || !isValidBirthDate(person.birthDate) || person.birthDate > today || !person.reminders.includes(entry.reminder)) {
      notificationChanged = true
      return []
    }
    const occasion = nextBirthday(person.birthDate, now)
    if (entry.date !== occasion.date) { notificationChanged = true; return [] }
    if (entry.name !== person.name || entry.age !== occasion.age) {
      notificationChanged = true
      return [{ ...entry, name: person.name, age: occasion.age }]
    }
    return [entry]
  })
  if (!birthdays?.length) return notificationChanged ? { ...workspace, birthdayNotifications: notifications } : workspace
  const existingIds = new Set(notifications.map(entry => entry.id))
  const addedNotifications: BirthdayNotification[] = []
  let changed = false
  const updatedBirthdays = birthdays.map(birthday => {
    if (!isValidBirthDate(birthday.birthDate) || birthday.birthDate > today || !birthday.reminders.length) return birthday
    const occasion = nextBirthday(birthday.birthDate, now)
    const due = schedulingOptions.filter(option => birthday.reminders.includes(option.value))
      .map(option => ({
        ...option,
        date: reminderDate(occasion.date, option.value),
        id: birthdayNotificationId(birthday.id, occasion.date, option.value),
      }))
      .filter(option => option.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!due.length) return birthday

    const handled = new Set(birthday.generatedReminders)
    const latest = due[due.length - 1]
    // On a late first visit, catch up once using the most recent selected reminder.
    // Earlier due reminders are also recorded so edits/reloads never create a burst.
    if (!handled.has(latest.id) && !existingIds.has(latest.id)) {
      addedNotifications.push({
        id: latest.id,
        birthdayId: birthday.id,
        date: occasion.date,
        reminder: latest.value,
        name: birthday.name,
        age: occasion.age,
        createdAt: now.toISOString(),
        readAt: null,
        dismissedAt: null,
      })
      existingIds.add(latest.id)
    }
    const unhandled = due.filter(option => !handled.has(option.id)).map(option => option.id)
    if (!unhandled.length) return birthday
    changed = true
    return { ...birthday, generatedReminders: [...birthday.generatedReminders, ...unhandled] }
  })

  if (!changed && !addedNotifications.length && !notificationChanged) return workspace
  return { ...workspace, birthdays: updatedBirthdays, birthdayNotifications: [...notifications, ...addedNotifications] }
}

/* ---------- Tags, grouping, manual order and countdown ---------- */

export const BIRTHDAY_TAGS = ['Familj', 'Vänner', 'Jobb'] as const
export const BIRTHDAY_TAG_MAX_LENGTH = 40
export const UNTAGGED_GROUP = 'untagged'
export const UNTAGGED_LABEL = 'Utan tagg'

const tagIdentity = (tag: string) => tag.toLocaleLowerCase('sv')

export function cleanBirthdayTag(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, BIRTHDAY_TAG_MAX_LENGTH).trim()
}

export function isValidBirthdayTag(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'string' && !!value.trim() && value.length <= BIRTHDAY_TAG_MAX_LENGTH)
}

/** Typed text joins an existing tag regardless of case, so "familj" lands in Familj. */
export function resolveBirthdayTag(value: string | null | undefined, existing: readonly (string | null | undefined)[] = []): string | null {
  const clean = cleanBirthdayTag(value ?? '')
  if (!clean) return null
  const identity = tagIdentity(clean)
  return [...BIRTHDAY_TAGS, ...existing].find((tag): tag is string => !!tag && tagIdentity(tag) === identity) ?? clean
}

export function birthdayGroupKey(tag: string | null | undefined): string {
  return tag?.trim() ? `tag:${tagIdentity(tag.trim())}` : UNTAGGED_GROUP
}

/** Presets first, then the person's own tags alphabetically. */
export function birthdayTagOptions(birthdays: readonly Birthday[], extra: readonly (string | null | undefined)[] = []): string[] {
  const custom = new Map<string, string>()
  for (const tag of [...birthdays.map(birthday => birthday.tag), ...extra]) {
    const resolved = resolveBirthdayTag(tag)
    if (resolved && !BIRTHDAY_TAGS.some(preset => tagIdentity(preset) === tagIdentity(resolved)) && !custom.has(tagIdentity(resolved))) custom.set(tagIdentity(resolved), resolved)
  }
  return [...BIRTHDAY_TAGS, ...[...custom.values()].sort((a, b) => a.localeCompare(b, 'sv'))]
}

export interface BirthdayGroup {
  key: string
  tag: string | null
  label: string
  birthdays: Birthday[]
}

/** Group by tag while keeping the stored (manual) order inside every group. */
export function groupBirthdays(birthdays: readonly Birthday[], includeEmptyPresets = false): BirthdayGroup[] {
  const groups = new Map<string, BirthdayGroup>()
  for (const birthday of birthdays) {
    const tag = resolveBirthdayTag(birthday.tag)
    const key = birthdayGroupKey(tag)
    if (!groups.has(key)) groups.set(key, { key, tag, label: tag ?? UNTAGGED_LABEL, birthdays: [] })
    groups.get(key)!.birthdays.push(birthday)
  }
  const presets = BIRTHDAY_TAGS.map(tag => groups.get(birthdayGroupKey(tag))
    ?? (includeEmptyPresets ? { key: birthdayGroupKey(tag), tag, label: tag, birthdays: [] } : null))
    .filter((group): group is BirthdayGroup => !!group)
  const custom = [...groups.values()].filter(group => group.tag && !BIRTHDAY_TAGS.some(tag => birthdayGroupKey(tag) === group.key))
    .sort((a, b) => a.label.localeCompare(b.label, 'sv'))
  const untagged = groups.get(UNTAGGED_GROUP)
  return [...presets, ...custom, ...(untagged ? [untagged] : [])]
}

function utcDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}

/** Whole calendar days until the next celebration (0 on the day itself). */
export function daysUntilBirthday(birthDate: string, today: Date = new Date()): number {
  const occasion = nextBirthday(birthDate, today)
  return Math.round((utcDay(occasion.date) - utcDay(localDateString(today))) / 86_400_000)
}

export type BirthdayUrgency = 'red' | 'yellow' | 'green'

/** Colour level for the countdown: within 7 days red, 14 yellow, 30 green, otherwise none. */
export function birthdayUrgency(days: number): BirthdayUrgency | null {
  if (days <= 7) return 'red'
  if (days <= 14) return 'yellow'
  if (days <= 30) return 'green'
  return null
}

export function birthdayCountdownLabel(days: number): string {
  if (days <= 0) return 'Idag'
  if (days === 1) return 'I morgon'
  return `${days} dagar kvar`
}

/** Soonest first; invalid dates last. Used for the one-time migration and "Sortera efter datum". */
export function sortBirthdaysByUpcoming<T extends Birthday>(birthdays: readonly T[], today: Date = new Date()): T[] {
  const occasion = (birthday: Birthday) => isValidBirthDate(birthday.birthDate) ? nextBirthday(birthday.birthDate, today).date : '9999-12-31'
  return [...birthdays].sort((a, b) => occasion(a).localeCompare(occasion(b)) || a.name.localeCompare(b.name, 'sv'))
}

/**
 * Birthdays used to be listed by date only. The first time tags exist, store that date order
 * as the manual order so nothing visibly jumps, and give every record an explicit tag value.
 */
export function normalizeBirthdays(workspace: Workspace, today: Date = new Date()): Workspace {
  const birthdays = workspace.birthdays
  if (!birthdays?.length || birthdays.every(birthday => birthday.tag !== undefined)) return workspace
  const legacy = birthdays.every(birthday => birthday.tag === undefined)
  const ordered = legacy ? sortBirthdaysByUpcoming(birthdays, today) : birthdays
  return { ...workspace, birthdays: ordered.map(birthday => birthday.tag === undefined ? { ...birthday, tag: null } : birthday) }
}
