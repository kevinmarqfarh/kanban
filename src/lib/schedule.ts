import type { Task, TaskSchedule, ScheduleColor } from './types'
import { isValidBirthDate } from './birthdays'
import { addLocalDays, parseLocalDate } from './others'

export const SCHEDULE_COLORS: { value: ScheduleColor; label: string }[] = [
  { value: 'sage', label: 'Grön' }, { value: 'blue', label: 'Blå' }, { value: 'violet', label: 'Lila' },
  { value: 'rose', label: 'Rosa' }, { value: 'amber', label: 'Gul' }, { value: 'gray', label: 'Grå' },
]

export const sameSchedule = (a: TaskSchedule | null | undefined, b: TaskSchedule) => a?.date === b.date && a?.scope === b.scope && a?.startTime === b.startTime && a?.endTime === b.endTime && a?.color === b.color && a?.label === b.label

export function weekStart(date: string): string {
  return addLocalDays(date, -((parseLocalDate(date).getDay() + 6) % 7))
}
export function validSchedule(value: unknown): value is TaskSchedule | null | undefined {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const s = value as TaskSchedule
  if (typeof s.date !== 'string' || !isValidBirthDate(s.date) || (s.scope !== undefined && s.scope !== 'day' && s.scope !== 'week')) return false
  if (s.color !== undefined && !SCHEDULE_COLORS.some(color => color.value === s.color)) return false
  if (s.label !== undefined && (typeof s.label !== 'string' || s.label.length > 60)) return false
  if (s.scope === 'week' && (s.date !== weekStart(s.date) || s.startTime || s.endTime)) return false
  if (s.startTime === undefined && s.endTime === undefined) return true
  return typeof s.startTime === 'string' && typeof s.endTime === 'string'
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.startTime)
    && /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(s.endTime) && s.startTime < s.endTime
}
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
export const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
export type ScheduleEditMode = 'move' | 'resize'

/** Snap edited times while keeping a moved event's duration and the visible day's bounds. */
export function editScheduleRange(start: number, end: number, delta: number, mode: ScheduleEditMode, first = 0, last = 1440): [number, number] {
  if (mode === 'move') {
    const nextStart = Math.max(first, Math.min(last - (end - start), Math.round((start + delta) / 30) * 30))
    return [nextStart, nextStart + end - start]
  }
  return [start, Math.max(start + Math.min(30, end - start), Math.min(last, Math.round((end + delta) / 30) * 30))]
}

export function calendarFile(tasks: Task[]): string {
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
  const stamp = (date: string, time: string) => `${(time === '24:00' ? addLocalDays(date, 1) : date).replace(/-/g, '')}T${(time === '24:00' ? '00:00' : time).replace(':', '')}00`
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FORMA//Planner//SV', 'CALSCALE:GREGORIAN']
  for (const task of tasks) {
    const s = task.schedule
    if (!s?.startTime || !s.endTime || s.scope === 'week') continue
    lines.push('BEGIN:VEVENT', `UID:${task.id}@forma`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART:${stamp(s.date, s.startTime)}`, `DTEND:${stamp(s.date, s.endTime)}`, `SUMMARY:${escape(task.title)}`, 'END:VEVENT')
  }
  return lines.join('\r\n') + '\r\n'
}

/** Assign columns only within connected overlap groups. */
export function scheduleLayout(tasks: Task[]): Map<string, { left: number; width: number }> {
  const result = new Map<string, { left: number; width: number }>()
  const sorted = tasks.filter(t => t.schedule?.startTime && t.schedule.endTime).sort((a,b) => minutes(a.schedule!.startTime!) - minutes(b.schedule!.startTime!))
  let group: { task: Task; column: number }[] = []
  let ends: number[] = []
  const flush = () => { for (const { task, column } of group) result.set(task.id, { left: column * 100 / ends.length, width: 100 / ends.length }); group = []; ends = [] }
  for (const task of sorted) {
    const start = minutes(task.schedule!.startTime!)
    if (ends.length && ends.every(end => end <= start)) flush()
    let column = ends.findIndex(end => end <= start)
    if (column < 0) column = ends.length
    ends[column] = minutes(task.schedule!.endTime!)
    group.push({ task, column })
  }
  flush()
  return result
}
