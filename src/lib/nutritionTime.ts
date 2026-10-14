import type { NutritionHabit, NutritionTime, Workspace } from './types'
import { isNutritionComplete } from './others'

/** Choices in the habit form. `null` is hela dagen: shown in both the morning and the evening view. */
export const NUTRITION_TIME_OPTIONS: { value: NutritionTime | null; label: string }[] = [
  { value: 'morning', label: 'Morgon' },
  { value: 'evening', label: 'Kväll' },
  { value: null, label: 'Hela dagen' },
]

export const nutritionTimeLabel = (time: NutritionTime | null | undefined) =>
  time === 'morning' ? 'Morgon' : time === 'evening' ? 'Kväll' : 'Hela dagen'

/** The morning view lasts until 14:00; after that the evening view is the natural default. */
export const EVENING_FROM_HOUR = 14
export function currentNutritionTime(now: Date = new Date()): NutritionTime {
  return now.getHours() >= 5 && now.getHours() < EVENING_FROM_HOUR ? 'morning' : 'evening'
}

/** Only worth a toggle when at least one habit is tied to morning or evening. */
export const usesNutritionTimes = (habits: readonly NutritionHabit[]) => habits.some(habit => habit.time === 'morning' || habit.time === 'evening')

/** Habits for one part of the day: its own plus the all-day ones, in their stored order. */
export function habitsForTime<T extends NutritionHabit>(habits: readonly T[], time: NutritionTime): T[] {
  return habits.filter(habit => habit.time === time || !habit.time)
}

export function nutritionTimeProgress(workspace: Workspace, time: NutritionTime, date: string) {
  const habits = habitsForTime(workspace.nutritionHabits ?? [], time)
  const done = habits.filter(habit => isNutritionComplete(workspace, habit.id, date)).length
  return { habits, done, total: habits.length }
}

/** Morning first, then evening, then all day — keeping the stored order inside each group. */
export function groupHabitsByTime<T extends NutritionHabit>(habits: readonly T[]) {
  return ([['morning', 'Morgon'], ['evening', 'Kväll'], [null, 'Hela dagen']] as const)
    .map(([time, label]) => ({ time, label, habits: habits.filter(habit => (habit.time ?? null) === time) }))
    .filter(group => group.habits.length > 0)
}
