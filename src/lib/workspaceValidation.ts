import type { Workspace } from './types'
import { isValidBirthDate } from './birthdays'

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

/** Reject malformed remote/cache data before it reaches the editor. */
export function isWorkspace(value: unknown): value is Workspace {
  if (!object(value) || !Array.isArray(value.columns) || !Array.isArray(value.tasks) || !Array.isArray(value.projects)) return false
  if (!value.columns.length || !value.columns.every(column => object(column) && typeof column.id === 'string' && !!column.id.trim() && typeof column.title === 'string' && !!column.title.trim() && typeof column.color === 'string')) return false
  if (!value.projects.every(project => object(project) && filled(project.id) && filled(project.title) && typeof project.description === 'string' && typeof project.icon === 'string' && typeof project.color === 'string' && deadline(project.deadline) && timestamp(project.createdAt))) return false
  if (!value.tasks.every(task => object(task) && filled(task.id) && filled(task.title) && typeof task.description === 'string' && filled(task.columnId) && strings(task.labels) && deadline(task.deadline) && nullableString(task.projectId) && timestamp(task.createdAt) && Array.isArray(task.checklist) && task.checklist.every(item => object(item) && filled(item.id) && filled(item.title) && typeof item.completed === 'boolean') && Array.isArray(task.comments) && task.comments.every(comment => object(comment) && filled(comment.id) && filled(comment.text) && timestamp(comment.createdAt)))) return false
  if (value.birthdays !== undefined && (!Array.isArray(value.birthdays) || !value.birthdays.every(birthday => object(birthday)
    && typeof birthday.id === 'string' && !!birthday.id.trim()
    && typeof birthday.name === 'string' && !!birthday.name.trim()
    && typeof birthday.birthDate === 'string' && isValidBirthDate(birthday.birthDate)
    && strings(birthday.reminders) && birthday.reminders.every(reminder => ['month', 'two-weeks', 'week', 'day'].includes(reminder))
    && new Set(birthday.reminders).size === birthday.reminders.length
    && timestamp(birthday.createdAt) && strings(birthday.generatedReminders) && birthday.generatedReminders.every(filled)
    && new Set(birthday.generatedReminders).size === birthday.generatedReminders.length))) return false
  const workspace = value as unknown as Workspace
  const unique = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length
  return unique(workspace.columns) && unique(workspace.tasks) && unique(workspace.projects)
    && unique(workspace.birthdays ?? [])
    && workspace.tasks.every(task => workspace.columns.some(column => column.id === task.columnId)
      && (task.projectId === null || workspace.projects.some(project => project.id === task.projectId))
      && unique(task.checklist) && unique(task.comments))
}
