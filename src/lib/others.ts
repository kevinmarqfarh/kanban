import type { Workspace, Workout } from './types'
import { isValidBirthDate, localDateString } from './birthdays'
export { currentAge, currentBirthdayAge, localDateString } from './birthdays'

/** Keep the user's comma or decimal point as entered; no number conversion is needed. */
export function isNonnegativeDecimal(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && ((allowEmpty && value === '') || /^\d+(?:[.,]\d+)?$/.test(value))
}

export function isNonnegativeInteger(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && ((allowEmpty && value === '') || /^\d+$/.test(value))
}

export function parseLocalDate(date: string): Date {
  if (!isValidBirthDate(date)) throw new Error('Ogiltigt datum')
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(0)
  result.setFullYear(year, month - 1, day)
  result.setHours(12, 0, 0, 0)
  return result
}

export function addLocalDays(date: string, days: number): string {
  const result = parseLocalDate(date)
  result.setDate(result.getDate() + days)
  return localDateString(result)
}

/** ISO weeks start on Monday; calendar arithmetic remains local across DST. */
export function weekStart(anchor: Date | string = new Date()): string {
  const date = typeof anchor === 'string' ? anchor : localDateString(anchor)
  const weekday = parseLocalDate(date).getDay()
  return addLocalDays(date, -(weekday === 0 ? 6 : weekday - 1))
}

export function weekDays(anchor: Date | string = new Date()): string[] {
  const monday = weekStart(anchor)
  return Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index))
}
export const weekDates = weekDays

export function daysBetween(from: string, to: string): number {
  const utc = (value: string) => {
    const local = parseLocalDate(value)
    const date = new Date(0)
    date.setUTCFullYear(local.getFullYear(), local.getMonth(), local.getDate())
    date.setUTCHours(0, 0, 0, 0)
    return date.getTime()
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

export function isoWeek(anchor: Date | string = new Date()): number {
  const local = parseLocalDate(typeof anchor === 'string' ? anchor : localDateString(anchor))
  const thursday = new Date(0)
  thursday.setUTCFullYear(local.getFullYear(), local.getMonth(), local.getDate())
  thursday.setUTCHours(0, 0, 0, 0)
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
  const start = new Date(0)
  start.setUTCFullYear(thursday.getUTCFullYear(), 0, 1)
  start.setUTCHours(0, 0, 0, 0)
  return Math.ceil(((thursday.getTime() - start.getTime()) / 86_400_000 + 1) / 7)
}

export function nutritionCompletionId(habitId: string, date: string): string {
  return `nutrition:${habitId}:${date}`
}

export function isNutritionComplete(workspace: Workspace, habitId: string, date: string): boolean {
  return workspace.nutritionCompletions?.some(entry => entry.habitId === habitId && entry.date === date && entry.completed) ?? false
}

/** Return only navigable web links. Empty strings are valid for link-free recipes. */
export function safeRecipeUrl(value: string): string | null {
  if (!value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch { return null }
}
export const safeRecipeURL = safeRecipeUrl

export function validateRecipeUrl(value: string): boolean {
  return !value.trim() || safeRecipeUrl(value) !== null
}

export function workoutRawText(workout: Workout): string {
  const heading = `${workout.title?.trim() || 'Träningspass'} · ${workout.date}`
  const rows = workout.rows.map(row => [
    row.title,
    row.amount ? `${row.amount} ${row.amountUnit === 'sets' ? 'sets' : 'min'}` : '',
    row.load ? `${row.load} ${row.loadUnit === 'kg' ? 'kg' : 'min'}` : '',
    row.bpm ? `${row.bpm} BPM` : '',
  ].filter(Boolean).join(' · '))
  return [heading, ...rows].join('\n')
}
