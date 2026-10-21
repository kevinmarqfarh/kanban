import type { OvertimeEntry } from './types'

/** Clock minutes; an earlier end time means the following day. */
export function overtimeMinutes(start: string, end: string): number {
  const valid = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (!valid.test(start) || !valid.test(end) || start === end) return 0
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  return (minutes(end) - minutes(start) + 1440) % 1440
}

export function overtimeBalance(entries: readonly OvertimeEntry[]): number {
  return entries.reduce((total, entry) => total + (entry.taken ? 0 : overtimeMinutes(entry.startTime, entry.endTime)), 0)
}

export function formatOvertime(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
