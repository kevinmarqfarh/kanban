import type { Workspace, Workout, WorkoutRow } from './types'
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

export type NutritionDayStatus = 'complete' | 'incomplete'

/**
 * Week overview colour for one date: every habit that existed that day is done → complete,
 * one or more missing → incomplete. Future days and days before any habit existed stay neutral.
 */
export function nutritionDayStatus(workspace: Workspace, date: string, today: string): NutritionDayStatus | null {
  if (date > today) return null
  const habits = (workspace.nutritionHabits ?? []).filter(habit => {
    const created = Date.parse(habit.createdAt)
    return (Number.isFinite(created) && localDateString(new Date(created)) <= date) || isNutritionComplete(workspace, habit.id, date)
  })
  if (!habits.length) return null
  return habits.every(habit => isNutritionComplete(workspace, habit.id, date)) ? 'complete' : 'incomplete'
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

export const predefinedRecipeLabels = ['frukost', 'snacks', 'middag']
export const recipeLabelKey = (label: string) => label.trim().toLocaleLowerCase('sv')

/** Presets first (frukost, snacks, middag), then the person's own labels alphabetically, one spelling per label. */
export function recipeLabelOptions(recipes: readonly { labels: string[] }[], extra: readonly string[] = []): string[] {
  const own = new Map<string, string>()
  for (const label of [...recipes.flatMap(recipe => recipe.labels), ...extra]) {
    const key = recipeLabelKey(label)
    if (key && !predefinedRecipeLabels.includes(key) && !own.has(key)) own.set(key, label.trim())
  }
  return [...predefinedRecipeLabels, ...[...own.values()].sort((a, b) => a.localeCompare(b, 'sv'))]
}

export function validateRecipeUrl(value: string): boolean {
  return !value.trim() || safeRecipeUrl(value) !== null
}

export function workoutRawText(workout: Workout): string {
  const heading = `${workout.title?.trim() || 'Träningspass'} · ${workout.date}`
  const rows = workout.rows.map(row => [
    row.title,
    row.amount ? `${row.amount} ${row.amountUnit === 'sets' ? 'sets' : 'min'}` : '',
    row.load ? row.loadUnit === 'level' ? `nivå ${row.load}` : `${row.load} ${row.loadUnit === 'kg' ? 'kg' : 'min'}` : '',
    row.bpm ? `${row.bpm} BPM` : '',
  ].filter(Boolean).join(' · '))
  return [heading, ...rows].join('\n')
}

export const workoutLoadUnits: { value: WorkoutRow['loadUnit']; label: string; field: string; heading: string; suffix: string }[] = [
  { value: 'kg', label: 'Kg', field: 'Vikt (kg)', heading: 'Vikt', suffix: 'kg' },
  { value: 'time', label: 'Min', field: 'Tid (min)', heading: 'Tid', suffix: 'min' },
  { value: 'level', label: 'Nivå', field: 'Nivå', heading: 'Nivå', suffix: 'nivå' },
]

export interface ExerciseHistory {
  title: string
  date: string
  row: WorkoutRow
}

const exerciseIdentity = (title: string) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv')

/** Distinct exercise names, most recently trained first, with the values used that time. */
export function recentExercises(workouts: readonly Workout[], excludeWorkoutId?: string): ExerciseHistory[] {
  const seen = new Set<string>()
  const result: ExerciseHistory[] = []
  const ordered = [...workouts].filter(workout => workout.id !== excludeWorkoutId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  for (const workout of ordered) for (const row of workout.rows) {
    const identity = exerciseIdentity(row.title)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    result.push({ title: row.title.trim(), date: workout.date, row })
  }
  return result
}

/** Suggestions for the exercise field: all recent names when empty, otherwise matches (prefix first). */
export function exerciseSuggestions(history: readonly ExerciseHistory[], query: string, limit = 8): ExerciseHistory[] {
  const text = exerciseIdentity(query)
  if (!text) return history.slice(0, limit)
  const matches = history.filter(entry => exerciseIdentity(entry.title).includes(text) && exerciseIdentity(entry.title) !== text)
  return [...matches.filter(entry => exerciseIdentity(entry.title).startsWith(text)), ...matches.filter(entry => !exerciseIdentity(entry.title).startsWith(text))].slice(0, limit)
}

export function findExercise(history: readonly ExerciseHistory[], title: string): ExerciseHistory | undefined {
  const identity = exerciseIdentity(title)
  return identity ? history.find(entry => exerciseIdentity(entry.title) === identity) : undefined
}

export function exerciseSummary(row: WorkoutRow): string {
  return [
    row.amount ? `${row.amount} ${row.amountUnit === 'sets' ? 'set' : 'min'}` : '',
    row.load ? row.loadUnit === 'level' ? `nivå ${row.load}` : `${row.load} ${row.loadUnit === 'kg' ? 'kg' : 'min'}` : '',
    row.bpm ? `${row.bpm} BPM` : '',
  ].filter(Boolean).join(' · ')
}
