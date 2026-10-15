import type { NutritionTime } from './types'

/** When a supplement is taken. Unset (habits saved before the choice existed) shows no pill. */
export const NUTRITION_TIME_OPTIONS: { value: NutritionTime; label: string }[] = [
  { value: 'morning', label: 'Morgon' },
  { value: 'evening', label: 'Kväll' },
]

export const nutritionTimeLabel = (time: NutritionTime | null | undefined): string | null =>
  time === 'morning' ? 'Morgon' : time === 'evening' ? 'Kväll' : null
