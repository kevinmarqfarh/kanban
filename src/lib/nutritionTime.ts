import type { NutritionTime } from './types'

/** When a supplement is taken. Unset (habits saved before the choice existed) shows no pill. */
export const NUTRITION_TIME_OPTIONS: { value: NutritionTime; label: string }[] = [
  { value: 'morning', label: 'Morgon' },
  { value: 'evening', label: 'Kväll' },
]

export const nutritionTimeLabel = (time: NutritionTime | null | undefined): string | null =>
  time === 'morning' ? 'Morgon' : time === 'evening' ? 'Kväll' : null

/** From 15:00 (and until 04:00) it is evening for supplements; otherwise morning. */
export const EVENING_FROM_HOUR = 15
export const EVENING_UNTIL_HOUR = 4
export function currentNutritionTime(now: Date = new Date()): NutritionTime {
  const hour = now.getHours()
  return hour >= EVENING_FROM_HOUR || hour < EVENING_UNTIL_HOUR ? 'evening' : 'morning'
}

/**
 * The supplements for this time of day first, then those without a time, then the rest (usually already taken).
 * Only the order changes, never the content; within each group the saved order is kept.
 */
export function orderHabitsByTime<T extends { time?: NutritionTime | null }>(habits: readonly T[], now: Date = new Date()): T[] {
  const current = currentNutritionTime(now)
  const rank = (habit: T) => (habit.time === current ? 0 : habit.time ? 2 : 1)
  return habits.map((habit, index) => ({ habit, index })).sort((a, b) => rank(a.habit) - rank(b.habit) || a.index - b.index).map(entry => entry.habit)
}
