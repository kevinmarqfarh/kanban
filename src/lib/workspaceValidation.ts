import type { Workspace } from './types'
import { birthdayNotificationId, isValidBirthDate, isValidBirthdayTag, normalizeBirthdays } from './birthdays'
import { isNonnegativeDecimal, isNonnegativeInteger, nutritionCompletionId, validateRecipeUrl } from './others'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const nullableString = (value: unknown) => value === null || typeof value === 'string'
const filled = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
const deadline = (value: unknown) => value === null || (typeof value === 'string' && isValidBirthDate(value))
export const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  return !!parts && isValidBirthDate(parts[1]) && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60
    && (!parts[5] || (Number(parts[5]) < 24 && Number(parts[6]) < 60)) && Number.isFinite(Date.parse(value))
}
const timestamp = isIsoTimestamp
const reminders = ['month', 'two-weeks', 'week', 'day']
const date = (value: unknown): value is string => typeof value === 'string' && isValidBirthDate(value)
const nullableTimestamp = (value: unknown) => value === null || timestamp(value)

/** Reject malformed remote/cache data before it reaches the editor. */
export function isWorkspace(value: unknown): value is Workspace {
  if (!object(value) || !Array.isArray(value.columns) || !Array.isArray(value.tasks) || !Array.isArray(value.projects)) return false
  if (!value.columns.length || !value.columns.every(column => object(column) && typeof column.id === 'string' && !!column.id.trim() && typeof column.title === 'string' && !!column.title.trim() && typeof column.color === 'string' && (column.collapsed === undefined || typeof column.collapsed === 'boolean'))) return false
  if (!value.projects.every(project => object(project) && filled(project.id) && filled(project.title) && typeof project.description === 'string' && typeof project.icon === 'string' && typeof project.color === 'string' && deadline(project.deadline) && timestamp(project.createdAt))) return false
  const validTask = (task: unknown): boolean => object(task) && filled(task.id) && filled(task.title) && typeof task.description === 'string' && strings(task.labels) && deadline(task.deadline) && timestamp(task.createdAt) && Array.isArray(task.checklist) && task.checklist.every(item => object(item) && filled(item.id) && filled(item.title) && typeof item.completed === 'boolean') && Array.isArray(task.comments) && task.comments.every(comment => object(comment) && filled(comment.id) && filled(comment.text) && timestamp(comment.createdAt))
  if (!value.tasks.every(task => validTask(task) && object(task) && filled(task.columnId) && nullableString(task.projectId))) return false
  if (!value.tasks.every(task => object(task) && (task.deadlineTime === undefined || task.deadlineTime === null || (typeof task.deadlineTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.deadlineTime) && typeof task.deadline === 'string')))) return false
  if (!value.projects.every(project => object(project) && (project.tasks === undefined || (Array.isArray(project.tasks) && project.tasks.every(task => validTask(task) && object(task) && typeof task.completed === 'boolean'))))) return false
  if (value.birthdays !== undefined && (!Array.isArray(value.birthdays) || !value.birthdays.every(birthday => object(birthday)
    && typeof birthday.id === 'string' && !!birthday.id.trim()
    && typeof birthday.name === 'string' && !!birthday.name.trim()
    && typeof birthday.birthDate === 'string' && isValidBirthDate(birthday.birthDate)
    && strings(birthday.reminders) && birthday.reminders.every(reminder => reminders.includes(reminder))
    && new Set(birthday.reminders).size === birthday.reminders.length
    && timestamp(birthday.createdAt) && strings(birthday.generatedReminders) && birthday.generatedReminders.every(filled)
    && new Set(birthday.generatedReminders).size === birthday.generatedReminders.length
    && isValidBirthdayTag(birthday.tag)))) return false
  const optional = (key: string, validate: (entry: unknown) => boolean) => value[key] === undefined
    || (Array.isArray(value[key]) && value[key].every(validate))
  if (!optional('workouts', entry => object(entry) && filled(entry.id) && date(entry.date)
    && (entry.title === undefined || typeof entry.title === 'string') && timestamp(entry.createdAt)
    && Array.isArray(entry.rows) && entry.rows.every(row => object(row) && filled(row.id) && filled(row.title)
      && isNonnegativeDecimal(row.amount, true) && typeof row.amountUnit === 'string' && ['sets', 'min'].includes(row.amountUnit)
      && isNonnegativeDecimal(row.load, true) && typeof row.loadUnit === 'string' && ['time', 'kg', 'level'].includes(row.loadUnit) && isNonnegativeInteger(row.bpm, true)))) return false
  if (!optional('nutritionHabits', entry => object(entry) && filled(entry.id) && filled(entry.title)
    && isNonnegativeDecimal(entry.amount) && typeof entry.unit === 'string' && ['st', 'ml', 'l', 'g', 'portion'].includes(entry.unit) && timestamp(entry.createdAt))) return false
  if (!optional('nutritionCompletions', entry => object(entry) && filled(entry.habitId) && date(entry.date)
    && entry.id === nutritionCompletionId(entry.habitId, entry.date) && typeof entry.completed === 'boolean')) return false
  if (!optional('recipes', entry => object(entry) && filled(entry.id) && filled(entry.title) && typeof entry.url === 'string'
    && validateRecipeUrl(entry.url) && typeof entry.steps === 'string' && strings(entry.labels) && timestamp(entry.createdAt))) return false
  if (!optional('notes', entry => object(entry) && filled(entry.id) && filled(entry.title) && entry.title.length <= 160
    && typeof entry.content === 'string' && entry.content.length <= 200_000
    && typeof entry.font === 'string' && ['system', 'serif', 'mono'].includes(entry.font)
    && timestamp(entry.createdAt) && timestamp(entry.updatedAt))) return false
  if (!optional('birthdayNotifications', entry => object(entry) && filled(entry.birthdayId) && date(entry.date)
    && typeof entry.reminder === 'string' && reminders.includes(entry.reminder)
    && entry.id === birthdayNotificationId(entry.birthdayId, entry.date, entry.reminder as import('./types').BirthdayReminder)
    && filled(entry.name) && Number.isInteger(entry.age) && Number(entry.age) >= 0 && timestamp(entry.createdAt)
    && nullableTimestamp(entry.readAt) && nullableTimestamp(entry.dismissedAt))) return false
  const workspace = value as unknown as Workspace
  const unique = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length
  return workspace.projects.every(project => !project.tasks || (unique(project.tasks) && project.tasks.every(task => unique(task.checklist) && unique(task.comments))))
    && unique(workspace.columns) && unique(workspace.tasks) && unique(workspace.projects)
    && unique(workspace.birthdays ?? [])
    && unique(workspace.birthdayNotifications ?? []) && unique(workspace.workouts ?? []) && unique(workspace.nutritionHabits ?? [])
    && unique(workspace.nutritionCompletions ?? []) && unique(workspace.recipes ?? [])
    && unique(workspace.notes ?? [])
    && (workspace.workouts ?? []).every(workout => unique(workout.rows))
    && (workspace.nutritionCompletions ?? []).every(entry => workspace.nutritionHabits?.some(habit => habit.id === entry.habitId))
    && workspace.tasks.every(task => workspace.columns.some(column => column.id === task.columnId)
      && (task.projectId === null || workspace.projects.some(project => project.id === task.projectId))
      && unique(task.checklist) && unique(task.comments))
}

/** Keep legacy board cards and copy their project work into independent records. */
export function separateProjectTasks(workspace: Workspace): Workspace {
  if (!workspace.tasks.some(task => task.projectId) && workspace.projects.every(project => project.tasks !== undefined)) return workspace
  const done = workspace.columns.find(column => column.id === 'done')?.id ?? workspace.columns.at(-1)?.id
  return {
    ...workspace,
    projects: workspace.projects.map(project => ({
      ...project,
      tasks: [...(project.tasks ?? []), ...workspace.tasks.filter(task => task.projectId === project.id && !project.tasks?.some(existing => existing.id === task.id)).map(({ columnId, projectId: _projectId, ...task }) => ({ ...structuredClone(task), completed: columnId === done }))],
    })),
    tasks: workspace.tasks.map(task => task.projectId ? { ...task, projectId: null } : task),
  }
}

/** Every load path runs the same idempotent upgrades, so old caches and cloud copies stay compatible. */
export function migrateWorkspace(workspace: Workspace, today: Date = new Date()): Workspace {
  return normalizeBirthdays(separateProjectTasks(workspace), today)
}
