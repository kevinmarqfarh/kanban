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
