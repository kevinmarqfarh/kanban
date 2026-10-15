import { Moon, Sun } from 'lucide-react'
import type { NutritionTime } from '../lib/types'
import { nutritionTimeLabel } from '../lib/nutritionTime'

/** A small ☀ Morgon / ☾ Kväll marker under a supplement's name. Renders nothing when no time is set. */
export function NutritionTimePill({ time, className = '' }: { time?: NutritionTime | null; className?: string }) {
  const label = nutritionTimeLabel(time)
  if (!label || !time) return null
  const Icon = time === 'morning' ? Sun : Moon
  return <span className={`time-pill time-pill-${time} ${className}`} data-time={time}><Icon size={11} strokeWidth={2.2} aria-hidden="true" />{label}</span>
}
