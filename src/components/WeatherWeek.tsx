import { ChevronRight, Info, RotateCw } from 'lucide-react'
import { SOURCE_LINKS, SOURCE_NAMES, showRainChance, weatherWeek, weekForecast, type Forecast, type WeatherPlace } from '../lib/weather'
import type { WeatherStatus } from '../hooks/useWeather'
import { isoWeek, parseLocalDate } from '../lib/others'
import { WeatherIcon } from './WeatherIcon'

const short = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const pad = (value: number) => String(value).padStart(2, '0')
/** The time the forecast was fetched is only worth showing once it is this old (normally it refreshes every 30 min). */
export const STALE_NOTE_MS = 2 * 60 * 60_000

/** Monday–Sunday at a glance, Apple Weather style: day, icon, rain chance and high/low. Tapping a day shows its hours. */
export function WeatherWeek({ today, place, forecast, status, onRetry, onOpen, className = 'hs-card hs-weather' }: {
  today: string; place: WeatherPlace; forecast: Forecast | null; status: WeatherStatus; onRetry: () => void;
  /** Show a day's hours (today when no date is given). */
  onOpen?: (date?: string) => void; className?: string;
}) {
  const dates = weatherWeek(today)
  const byDate = weekForecast(forecast, today)
  const updated = forecast ? new Date(forecast.fetchedAt) : null
  return <section className={className} aria-label={`Väder vecka ${isoWeek(today)}, ${place.name}`} data-testid={className.includes('home-weather') ? 'home-weather' : 'home-screen-weather'} data-status={status} data-source={forecast?.source ?? 'none'}>
    <div className="wx-place">
      {onOpen ? <button className="wx-open" type="button" onClick={() => onOpen()} aria-label={`Visa timprognos för idag i ${place.name}`}><strong>{place.name}</strong><ChevronRight size={15} aria-hidden="true" /></button> : <strong>{place.name}</strong>}
      {/* Quiet when all is well: a time only when the forecast is old, offline or missing. */}
      {(status !== 'ready' || (updated && Date.now() - updated.getTime() > STALE_NOTE_MS)) && <small>{status === 'loading' ? 'Hämtar väder…'
        : status === 'error' ? 'Vädret kunde inte hämtas'
        : status === 'stale' ? `Sparat ${updated ? `${pad(updated.getHours())}:${pad(updated.getMinutes())}` : ''} · offline`
        : updated ? `Från ${pad(updated.getHours())}:${pad(updated.getMinutes())}` : ''}</small>}
      {(status === 'error' || status === 'stale') && <button className="button ghost wx-retry" type="button" onClick={onRetry}><RotateCw size={14} />Försök igen</button>}
      {forecast && <a className="wx-credit" href={SOURCE_LINKS[forecast.source]} target="_blank" rel="noreferrer" title={`Källa: ${forecast.sources.map(source => SOURCE_NAMES[source]).join(' · ')}`}><Info size={14} aria-hidden="true" /><span className="sr-only">Källa: {forecast.sources.map(source => SOURCE_NAMES[source]).join(' · ')}</span></a>}
    </div>
    <ol className="wx-days">{dates.map((date, index) => {
      const day = byDate.get(date)
      const isToday = date === today
      const label = isToday ? 'Idag' : short[index]
      const full = parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
      const content = <>
        <span className="wx-day-name" aria-hidden="true">{label}</span>
        {day ? <>
          <span className="wx-icon" aria-hidden="true"><WeatherIcon kind={day.kind} size={38} /></span>
          <span className="wx-rain-chance" aria-hidden="true">{showRainChance(day) ? `${day.rain}%` : ''}</span>
          <span className="wx-temps" aria-hidden="true"><strong>{day.max}°</strong><small>{day.min}°</small></span>
        </> : <span className="wx-placeholder" aria-hidden="true" />}
      </>
      const description = day ? `${full}: ${day.label}, högst ${day.max} grader, lägst ${day.min} grader${showRainChance(day) ? `, ${day.rain} procent risk för nederbörd` : ''}` : `${full}: ingen prognos`
      const canOpen = !!onOpen && !!day && date >= today
      return <li key={date} data-date={date} className={`wx-day${isToday ? ' is-today' : ''}${date < today ? ' is-past' : ''}${day ? '' : ' is-empty'}${canOpen ? ' has-button' : ''}`} aria-label={canOpen ? undefined : description}>
        {canOpen ? <button className="wx-day-button" type="button" aria-label={`${description}. Visa timprognos.`} onClick={() => onOpen!(date)}>{content}</button> : content}
      </li>
    })}</ol>
  </section>
}
