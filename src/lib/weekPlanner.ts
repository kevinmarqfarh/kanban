import type { Task, Workspace } from './types'
import { isTaskDone } from './helpers'
import { addLocalDays } from './others'
import { minutes, weekStart } from './schedule'

export interface PlanningStats {
  taskCount: number
  timedCount: number
  bookedMinutes: number
  overlapPairs: number
  conflictTaskIds: Set<string>
}

/** Booked time is the sum of blocks, not an estimate of available capacity. */
export function planningStats(tasks: Task[]): PlanningStats {
  const timed = tasks.filter(task => task.schedule?.scope !== 'week' && task.schedule?.startTime && task.schedule.endTime)
  const conflictTaskIds = new Set<string>()
  let overlapPairs = 0
  for (let index = 0; index < timed.length; index++) {
    const left = timed[index]
    for (let other = index + 1; other < timed.length; other++) {
      const right = timed[other]
      if (left.schedule!.date !== right.schedule!.date) continue
      if (minutes(left.schedule!.startTime!) < minutes(right.schedule!.endTime!)
        && minutes(right.schedule!.startTime!) < minutes(left.schedule!.endTime!)) {
        overlapPairs++
        conflictTaskIds.add(left.id)
        conflictTaskIds.add(right.id)
      }
    }
  }
  return {
    taskCount: tasks.length,
    timedCount: timed.length,
    bookedMinutes: timed.reduce((sum, task) => sum + minutes(task.schedule!.endTime!) - minutes(task.schedule!.startTime!), 0),
    overlapPairs,
    conflictTaskIds,
  }
}

function byPlanningOrder(left: Task, right: Task): number {
  const priority = { high: 0, medium: 1, low: 2 }
  return (left.schedule?.startTime ?? '99').localeCompare(right.schedule?.startTime ?? '99')
    || (priority[left.priority ?? 'low'] - priority[right.priority ?? 'low'])
    || (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999')
    || left.title.localeCompare(right.title, 'sv')
}

/** Filters affect cards, while all active tasks contribute to booked time and conflicts. */
export function buildWeekPlan(workspace: Workspace, visibleTasks: Task[], anchor: string) {
  const monday = weekStart(anchor)
  const active = workspace.tasks.filter(task => !isTaskDone(task, workspace))
  const visible = new Set(visibleTasks.map(task => task.id))
  const weekOnly = active.filter(task => task.schedule?.scope === 'week' && task.schedule.date === monday)
  const unscheduled = active.filter(task => !task.schedule)
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(monday, index)
    const allTasks = active.filter(task => task.schedule && task.schedule.scope !== 'week' && task.schedule.date === date)
    return { date, tasks: allTasks.filter(task => visible.has(task.id)).sort(byPlanningOrder), stats: planningStats(allTasks) }
  })
  const weekEnd = addLocalDays(monday, 7)
  const allWeekTasks = active.filter(task => task.schedule && (task.schedule.scope === 'week'
    ? task.schedule.date === monday : task.schedule.date >= monday && task.schedule.date < weekEnd))
  return {
    monday,
    days,
    weekTasks: weekOnly.filter(task => visible.has(task.id)).sort(byPlanningOrder),
    weekTaskCount: weekOnly.length,
    unscheduledTasks: unscheduled.filter(task => visible.has(task.id)).sort(byPlanningOrder),
    unscheduledTaskCount: unscheduled.length,
    stats: planningStats(allWeekTasks),
  }
}

export function bookedTimeLabel(value: number): string {
  const hours = Math.floor(value / 60)
  const remaining = value % 60
  return hours ? `${hours} h${remaining ? ` ${remaining} min` : ''}` : `${remaining} min`
}
