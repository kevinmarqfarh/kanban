import { useNow } from '../hooks/useNow'
import { formatClock, stepsOn } from '../lib/forecast'
import { parseLocalDate } from '../lib/others'
import { SOURCE_LINKS, SOURCE_NAMES, stepKind, type Forecast, type WeatherStep } from '../lib/weather'
import { Modal } from './Modal'
import { WeatherIcon } from './WeatherIcon'

const SHORT_DAYS = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
const number = (value: number, digits = 1) => value.toLocaleString('sv-SE', { maximumFractionDigits: digits })
const degrees = (value: number) => `${Math.round(value)}°`
const longDate = (date: string) => { const text = parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }); return text.charAt(0).toUpperCase() + text.slice(1) }
const hourLabel = (iso: string) => String(new Date(iso).getHours()).padStart(2, '0')

/**
 * One day's weather, hour by hour: opened by tapping a day (or the town) in the week strip on Home and on the
 * iPad home screen. Closing it returns to where you were.
 */
export function WeatherDaySheet({ forecast, date, today, placeName, onSelect, onClose }: {
  forecast: Forecast; date: string; today: string; placeName: string; onSelect: (date: string) => void; onClose: () => void
}) {
  const now = useNow()
  const days = forecast.days.filter(entry => entry.date >= today).slice(0, 10)
  const day = days.find(entry => entry.date === date) ?? days[0]
  if (!day) return null
  const steps = stepsOn(forecast, day.date, now)
  const longest = Math.max(1, ...steps.map(step => Math.round((Date.parse(step.time) - Date.parse(step.start)) / 3_600_000)))
  return <Modal title={longDate(day.date)} subtitle={`Väder i ${placeName}`} onClose={onClose} phoneFullscreen wide>
    <div className="wxp-sheet" data-testid="weather-day" data-date={day.date}>
      <ol className="wxp-chips" aria-label="Välj dag">{days.map(entry => <li key={entry.date}>
        <button type="button" className={`wxp-chip${entry.date === day.date ? ' is-selected' : ''}`} aria-pressed={entry.date === day.date} onClick={() => onSelect(entry.date)} aria-label={longDate(entry.date)}>
          <small aria-hidden="true">{entry.date === today ? 'Idag' : SHORT_DAYS[parseLocalDate(entry.date).getDay()]}</small>
          <strong aria-hidden="true">{Number(entry.date.slice(-2))}</strong>
        </button>
      </li>)}</ol>
      <div className="wxp-sheet-head">
        <WeatherIcon kind={day.kind} size={44} />
        <div>
          <p className="wxp-sheet-label">{day.label}</p>
          <p className="wxp-sheet-meta">
            <span>H: {day.max}°</span><span>L: {day.min}°</span>
            {day.rain !== null && <span className="wxp-blue">{day.rain} % risk</span>}
            {day.mm !== null && <span>{number(day.mm)} mm</span>}
            {day.gust !== null && <span>Byar {number(day.gust, 0)} m/s</span>}
          </p>
        </div>
      </div>
      {steps.length > 0 ? <>
        <DayChart steps={steps} />
        {longest > 1 && <p className="wxp-sheet-note">Så här långt fram ger SMHI prognos var {longest}:e timme.</p>}
        <table className="wxp-table">
          <thead><tr><th scope="col">Tid</th><th scope="col"><span className="sr-only">Väder</span></th><th scope="col">Risk</th><th scope="col">Mängd</th><th scope="col">Temp</th><th scope="col">Vind</th></tr></thead>
          <tbody>{steps.map(step => <tr key={step.time} data-time={step.time}>
            <th scope="row">{formatClock(step.time)}</th>
            <td><WeatherIcon kind={stepKind(step)} size={26} title={step.label} /></td>
            <td className="wxp-blue">{step.rain === null ? '–' : `${step.rain} %`}</td>
            <td>{step.mm === null ? '–' : `${number(step.mm)} mm`}</td>
            <td className="wxp-table-temp">{degrees(step.temp)}</td>
            <td>{step.wind === null ? '–' : `${number(step.wind, 0)}${step.gust !== null ? ` (${number(step.gust, 0)})` : ''} m/s`}</td>
          </tr>)}</tbody>
        </table>
      </> : <p className="wxp-sheet-note">Prognosen för resten av dagen är inte hämtad ännu.</p>}
      <p className="wxp-sheet-credit">Källa: <a href={SOURCE_LINKS[forecast.source]} target="_blank" rel="noreferrer">{SOURCE_NAMES[forecast.source]}</a>{forecast.source === 'smhi' && forecast.sources.includes('open-meteo') && <>, tidigare timmar <a href={SOURCE_LINKS['open-meteo']} target="_blank" rel="noreferrer">Open-Meteo</a></>} · hämtad {formatClock(forecast.fetchedAt)}</p>
    </div>
  </Modal>
}

/** Temperature as a line, chance of precipitation as blue bars, on one shared time axis. */
function DayChart({ steps }: { steps: WeatherStep[] }) {
  const width = 320, height = 132, top = 18, bottom = 22, left = 6, right = 6
  const from = Math.min(...steps.map(step => Date.parse(step.start)))
  const to = Math.max(...steps.map(step => Date.parse(step.time)))
  const x = (ms: number) => left + ((ms - from) / Math.max(1, to - from)) * (width - left - right)
  const temps = steps.map(step => step.temp)
  const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1
  const y = (temp: number) => top + (1 - (temp - lo) / Math.max(1, hi - lo)) * (height - top - bottom - 18)
  const barBase = height - bottom
  const points = steps.map(step => [x(Date.parse(step.time)), y(step.temp)] as const)
  const line = points.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
  const warmest = steps.reduce((a, b) => b.temp > a.temp ? b : a), coldest = steps.reduce((a, b) => b.temp < a.temp ? b : a)
  const ticks = steps.filter(step => new Date(step.time).getHours() % 6 === 0)
  return <svg className="wxp-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Temperaturen går från ${Math.round(steps[0].temp)} till ${Math.round(steps[steps.length - 1].temp)} grader, högst ${Math.round(warmest.temp)} grader klockan ${formatClock(warmest.time)}.`}>
    <line className="wxp-chart-base" x1={left} x2={width - right} y1={barBase} y2={barBase} />
    {steps.map(step => step.rain ? <rect key={`bar-${step.time}`} className="wxp-chart-bar" x={x(Date.parse(step.start)) + 0.6} width={Math.max(1.5, x(Date.parse(step.time)) - x(Date.parse(step.start)) - 1.2)} y={barBase - (step.rain / 100) * 34} height={(step.rain / 100) * 34} rx="1.5" /> : null)}
    <path className="wxp-chart-line" d={line} />
    {points.length === 1 && <circle className="wxp-chart-dot" cx={points[0][0]} cy={points[0][1]} r="3" />}
    {[warmest, coldest].filter((step, index, all) => index === 0 || step !== all[0]).map(step => <text key={`t-${step.time}`} className="wxp-chart-label" x={Math.min(width - 14, Math.max(14, x(Date.parse(step.time))))} y={y(step.temp) - 6} textAnchor="middle">{degrees(step.temp)}</text>)}
    {ticks.map(step => <text key={`x-${step.time}`} className="wxp-chart-tick" x={Math.min(width - 10, Math.max(10, x(Date.parse(step.time))))} y={height - 6} textAnchor="middle">{hourLabel(step.time)}</text>)}
  </svg>
}
