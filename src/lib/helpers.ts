import type { Task, Workspace } from './types'

export function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Safari also supports local-network previews, where randomUUID needs HTTPS.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export const doneColumnId = (workspace: Workspace) => workspace.columns.find(column => column.id === 'done')?.id ?? workspace.columns.at(-1)?.id
export const isTaskDone = (task: Task, workspace: Workspace) => task.columnId === doneColumnId(workspace)
export function dateLabel(date: string | null) {
  if (!date) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${date}T00:00:00`)
  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days === 0) return 'Idag'
  if (days === 1) return 'Imorgon'
  return target.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
export function overdue(task: Task, workspace: Workspace) {
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return !!task.deadline && task.deadline < date && !isTaskDone(task, workspace)
}
export function projectProgress(projectId: string, workspace: Workspace) {
  const tasks = workspace.tasks.filter(task => task.projectId === projectId)
  const complete = tasks.filter(task => isTaskDone(task, workspace)).length
  return { tasks, complete, percent: tasks.length ? Math.round(complete / tasks.length * 100) : 0 }
}
