import type { Task, Workspace } from './types'
import { isTaskDone, overdue } from './helpers'
export type PlannerFilter = 'all' | 'today' | 'overdue' | 'high'
export function filterPlannerTasks(workspace: Workspace, query: string, filter: PlannerFilter, today: string): Task[] {
  const terms = query.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean)
  return workspace.tasks.filter(task => {
    const text = `${task.title} ${task.description} ${task.labels.join(' ')}`.toLocaleLowerCase('sv')
    if (!terms.every(term => text.includes(term))) return false
    if (filter === 'all') return true
    if (isTaskDone(task, workspace)) return false
    return filter === 'today' ? (task.deadline === today || (task.schedule?.scope !== 'week' && task.schedule?.date === today)) : filter === 'overdue' ? overdue(task, workspace) : task.priority === 'high'
  })
}
