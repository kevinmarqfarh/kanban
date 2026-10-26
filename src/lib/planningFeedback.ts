import type { Task, TaskSchedule, Workspace } from './types'
import { isTaskDone } from './helpers'
import { minutes, validSchedule } from './schedule'

export interface PlanningFeedback {
  valid: boolean
  durationMinutes: number | null
  conflicts: Task[]
}

/** Evaluate the entire active workspace, independent of the current search or visible week cards. */
export function getPlanningFeedback(workspace: Workspace, schedule: TaskSchedule, editedTaskId?: string): PlanningFeedback {
  if (!validSchedule(schedule)) return { valid: false, durationMinutes: null, conflicts: [] }
  if (schedule.scope === 'week' || !schedule.startTime || !schedule.endTime) {
    return { valid: true, durationMinutes: null, conflicts: [] }
  }
  const start = minutes(schedule.startTime)
  const end = minutes(schedule.endTime)
  const conflicts = workspace.tasks.filter(task => {
    const other = task.schedule
    return task.id !== editedTaskId && !isTaskDone(task, workspace)
      && !!other && other.scope !== 'week' && other.date === schedule.date
      && !!other.startTime && !!other.endTime
      && start < minutes(other.endTime) && minutes(other.startTime) < end
  }).sort((left, right) => left.schedule!.startTime!.localeCompare(right.schedule!.startTime!) || left.title.localeCompare(right.title, 'sv'))
  return { valid: true, durationMinutes: end - start, conflicts }
}
