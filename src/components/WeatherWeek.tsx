import { RotateCw } from 'lucide-react'
import { showRainChance, weatherWeek, type WeatherPlace, type WeatherWeek as Week } from '../lib/weather'
import type { WeatherStatus } from '../hooks/useWeather'
import { isoWeek, parseLocalDate } from '../lib/others'
import { WeatherIcon } from './WeatherIcon'

const short = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const pad = (value: number) => String(value).padStart(2, '0')

/** Monday–Sunday at a glance, Apple Weather style: day, icon, rain chance and high/low. */
export function WeatherWeek({ today, place, week, status, onRetry, className = 'hs-card hs-weather' }: {
  today: string; place: WeatherPlace; week: Week | null; status: WeatherStatus; onRetry: () => void; className?: string;
}) {
  const dates = weatherWeek(today)
  const byDate = new Map((week?.days ?? []).map(day => [day.date, day]))
  const updated = week ? new Date(week.fetchedAt) : null
  return <section className={className} aria-label={`Väder vecka ${isoWeek(today)}, ${place.name}`} data-testid={className.includes('home-weather') ? 'home-weather' : 'home-screen-weather'} data-status={status}>
    <div className="wx-place">
      <strong>{place.name}</strong>
      <small>{status === 'loading' ? 'Hämtar väder…'
        : status === 'error' ? 'Vädret kunde inte hämtas'
        : status === 'stale' ? `Sparat ${updated ? `${pad(updated.getHours())}:${pad(updated.getMinutes())}` : ''} · offline`
        : updated ? `Uppdaterat ${pad(updated.getHours())}:${pad(updated.getMinutes())}` : ''}</small>
      {(status === 'error' || status === 'stale') && <button className="button ghost wx-retry" type="button" onClick={onRetry}><RotateCw size={14} />Försök igen</button>}
      <a className="wx-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Väder: Open-Meteo</a>
    </div>
    <ol className="wx-days">{dates.map((date, index) => {
      const day = byDate.get(date)
      const isToday = date === today
      const label = isToday ? 'Idag' : short[index]
      const full = parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
      return <li key={date} data-date={date} className={`wx-day${isToday ? ' is-today' : ''}${date < today ? ' is-past' : ''}${day ? '' : ' is-empty'}`}
        aria-label={day ? `${full}: ${day.label}, högst ${day.max} grader, lägst ${day.min} grader${showRainChance(day) ? `, ${day.rain} procent risk för nederbörd` : ''}` : `${full}: ingen prognos`}>
        <span className="wx-day-name" aria-hidden="true">{label}</span>
        {day ? <>
          <span className="wx-icon" aria-hidden="true"><WeatherIcon kind={day.kind} size={38} /></span>
          <span className="wx-rain-chance" aria-hidden="true">{showRainChance(day) ? `${day.rain}%` : ''}</span>
          <span className="wx-temps" aria-hidden="true"><strong>{day.max}°</strong><small>{day.min}°</small></span>
        </> : <span className="wx-placeholder" aria-hidden="true" />}
      </li>
    })}</ol>
  </section>
}
