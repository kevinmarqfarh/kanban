import { Check } from 'lucide-react'
import type { TaskSchedule } from '../lib/types'
import { SCHEDULE_COLORS } from '../lib/schedule'
import '../schedule-appearance.css'

export function ScheduleAppearanceFields({ schedule, onChange }: { schedule: TaskSchedule; onChange: (value: TaskSchedule) => void }) {
  return <fieldset className="schedule-appearance"><legend>Färgetikett i Schema</legend>
    <label className="field">Etikett<input className="input" maxLength={60} placeholder="T.ex. Arbete eller Privat" value={schedule.label ?? ''} onChange={event => onChange({ ...schedule, label: event.target.value || undefined })} /></label>
    <div className="schedule-color-options" role="group" aria-label="Kortfärg">{SCHEDULE_COLORS.map(color => <button key={color.value} type="button" className="schedule-color-option" data-color={color.value} title={color.label} aria-label={color.label} aria-pressed={(schedule.color ?? 'sage') === color.value} onClick={() => onChange({ ...schedule, color: color.value })}><span aria-hidden="true">{(schedule.color ?? 'sage') === color.value && <Check size={17} />}</span></button>)}</div>
  </fieldset>
}
