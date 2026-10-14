import { Moon, Sun } from 'lucide-react'
import type { NutritionTime, Workspace } from '../lib/types'
import { nutritionTimeProgress } from '../lib/nutritionTime'

/** Morgon | Kväll with today's progress for each, used on Home and the iPad home screen. */
export function NutritionTimeToggle({ workspace, date, value, onChange, className = '' }: {
  workspace: Workspace; date: string; value: NutritionTime; onChange: (time: NutritionTime) => void; className?: string;
}) {
  return <div className={`segmented-control nutrition-time-toggle ${className}`} role="group" aria-label="Visa morgon eller kväll">
    {([['morning', 'Morgon', Sun], ['evening', 'Kväll', Moon]] as const).map(([time, label, Icon]) => {
      const { done, total } = nutritionTimeProgress(workspace, time, date)
      return <button key={time} type="button" className={value === time ? 'active' : ''} aria-pressed={value === time} data-time={time} onClick={() => onChange(time)} aria-label={`${label}, ${done} av ${total} klara`}>
        <Icon size={15} aria-hidden="true" /><span>{label}</span><small className={total && done === total ? 'is-complete' : ''}>{done}/{total}</small>
      </button>
    })}
  </div>
}
