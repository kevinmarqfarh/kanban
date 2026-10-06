import type { Birthday, BirthdayReminder, Task, Workspace } from './types'

export const REMINDER_OPTIONS: { value: BirthdayReminder; label: string }[] = [
  { value: 'month', label: '1 månad' },
  { value: 'two-weeks', label: '2 veckor' },
  { value: 'week', label: '1 vecka' },
  { value: 'day', label: 'På födelsedagen' },
]

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

export function birthdayDescription(birthday: Birthday, occasion = nextBirthday(birthday.birthDate)): string {
  const [year, month, day] = occasion.date.split('-').map(Number)
  const date = calendarDate(year, month - 1, day).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${birthday.name} fyller ${occasion.age} år.\nFödelsedag: ${date}.`
}

export function reminderDate(occasionDate: string, reminder: BirthdayReminder): string {
  const [year, month, day] = occasionDate.split('-').map(Number)
  if (reminder === 'month') {
    const lastDay = calendarDate(year, month - 1, 0).getDate()
    return localDateString(calendarDate(year, month - 2, Math.min(day, lastDay)))
  }
  const days = reminder === 'two-weeks' ? 14 : reminder === 'week' ? 7 : 0
  return localDateString(calendarDate(year, month - 1, day - days))
}

/** Check the next anniversary only, creating reminders when the app is active. */
export function applyBirthdayReminders(workspace: Workspace, now: Date = new Date()): Workspace {
  const birthdays = workspace.birthdays
  const columnId = workspace.columns.find(column => column.id === 'todo')?.id ?? workspace.columns[0]?.id
  if (!birthdays?.length || !columnId) return workspace

  const today = localDateString(now)
  const existingTaskIds = new Set(workspace.tasks.map(task => task.id))
  const addedTasks: Task[] = []
  let changed = false
  const updatedBirthdays = birthdays.map(birthday => {
    if (!isValidBirthDate(birthday.birthDate) || birthday.birthDate > today || !birthday.reminders.length) return birthday
    const occasion = nextBirthday(birthday.birthDate, now)
    const due = REMINDER_OPTIONS.filter(option => birthday.reminders.includes(option.value))
      .map(option => ({
        ...option,
        date: reminderDate(occasion.date, option.value),
        id: `birthday:${birthday.id}:${occasion.date}:${option.value}`,
      }))
      .filter(option => option.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (!due.length) return birthday

    const handled = new Set(birthday.generatedReminders)
    const latest = due[due.length - 1]
    // On a late first visit, catch up once using the most recent selected reminder.
    // Earlier due reminders are also recorded so edits/reloads never create a burst.
    if (!handled.has(latest.id) && !existingTaskIds.has(latest.id)) {
      const timing = latest.value === 'day' ? 'På födelsedagen' : `${latest.label} före födelsedagen`
      addedTasks.push({
        id: latest.id,
        title: `${birthday.name} fyller ${occasion.age} år`,
        description: `${birthdayDescription(birthday, occasion)}\nPåminnelse: ${timing}.`,
        columnId,
        labels: ['Födelsedag'],
        checklist: [],
        deadline: occasion.date,
        comments: [],
        projectId: null,
        createdAt: now.toISOString(),
      })
      existingTaskIds.add(latest.id)
    }
    const unhandled = due.filter(option => !handled.has(option.id)).map(option => option.id)
    if (!unhandled.length) return birthday
    changed = true
    return { ...birthday, generatedReminders: [...birthday.generatedReminders, ...unhandled] }
  })

  if (!changed && !addedTasks.length) return workspace
  return { ...workspace, birthdays: updatedBirthdays, tasks: [...workspace.tasks, ...addedTasks] }
}
