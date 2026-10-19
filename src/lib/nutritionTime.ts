import type { NutritionTime } from './types'

/** When a supplement is taken. Unset (habits saved before the choice existed) shows no pill. */
export const NUTRITION_TIME_OPTIONS: { value: NutritionTime; label: string }[] = [
  { value: 'morning', label: 'Morgon' },
  { value: 'midday', label: 'Mitt på dagen' },
  { value: 'evening', label: 'Kväll' },
  { value: 'anytime', label: 'När som helst' },
]

export const nutritionTimeLabel = (time: NutritionTime | null | undefined): string | null =>
  time === 'morning' ? 'Morgon' : time === 'evening' ? 'Kväll' : time === 'midday' ? 'Mitt på dagen' : time === 'anytime' ? 'När som helst' : null

/** From 15:00 (and until 04:00) it is evening for supplements; 11:00–14:59 is midday; the remaining hours are morning. */
export const EVENING_FROM_HOUR = 15
export const EVENING_UNTIL_HOUR = 4
export function currentNutritionTime(now: Date = new Date()): NutritionTime {
  const hour = now.getHours()
  if (hour >= 11 && hour < EVENING_FROM_HOUR) return 'midday'
  return hour >= EVENING_FROM_HOUR || hour < EVENING_UNTIL_HOUR ? 'evening' : 'morning'
}

/**
 * The supplements for this time of day first, then those without a time, then the rest (usually already taken).
 * Only the order changes, never the content; within each group the saved order is kept.
 */
export function orderHabitsByTime<T extends { time?: NutritionTime | null }>(habits: readonly T[], now: Date = new Date()): T[] {
  const current = currentNutritionTime(now)
  const rank = (habit: T) => (habit.time === current ? 0 : habit.time && habit.time !== 'anytime' ? 2 : 1)
  return habits.map((habit, index) => ({ habit, index })).sort((a, b) => rank(a.habit) - rank(b.habit) || a.index - b.index).map(entry => entry.habit)
}
