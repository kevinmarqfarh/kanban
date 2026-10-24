import { useNow } from '../hooks/useNow'
import { formatClock, forecastHours } from '../lib/forecast'
import { localDateString, parseLocalDate } from '../lib/others'
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
  const steps = forecastHours(forecast, day.date, now)
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
        <details className="wxp-details"><summary>Detaljer per timme · risk och vind</summary><table className="wxp-table">
          <thead><tr><th scope="col">Tid</th><th scope="col"><span className="sr-only">Väder</span></th><th scope="col">Risk</th><th scope="col">Mängd</th><th scope="col">Temp</th><th scope="col">Vind</th></tr></thead>
          <tbody>{steps.map(step => <tr key={step.time} data-time={step.time}>
            <th scope="row">{formatClock(step.time)}{steps.some(other => other.time !== step.time && formatClock(other.time) === formatClock(step.time)) && <small className="wxp-time-zone">{new Date(step.time).getTimezoneOffset() === -120 ? 'Sommartid' : 'Normaltid'}</small>}{localDateString(new Date(step.time)) !== localDateString(new Date(steps[0].time)) && <small className="wxp-time-zone">{new Date(step.time).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</small>}</th>
            <td><WeatherIcon kind={stepKind(step)} size={26} title={step.label} /></td>
            <td className="wxp-blue">{step.rain === null ? '–' : `${step.rain} %`}</td>
            <td>{step.mm === null ? '–' : `${number(step.mm)} mm`}</td>
            <td className="wxp-table-temp">{degrees(step.temp)}</td>
            <td>{step.wind === null ? '–' : `${number(step.wind, 0)}${step.gust !== null ? ` (${number(step.gust, 0)})` : ''} m/s`}</td>
          </tr>)}</tbody>
        </table></details>
      </> : <p className="wxp-sheet-note">Prognosen för resten av dagen är inte hämtad ännu.</p>}
      <p className="wxp-sheet-credit">Källa: <a href={SOURCE_LINKS[forecast.source]} target="_blank" rel="noreferrer">{SOURCE_NAMES[forecast.source]}</a>{forecast.source === 'smhi' && forecast.sources.includes('open-meteo') && <>, tidigare timmar <a href={SOURCE_LINKS['open-meteo']} target="_blank" rel="noreferrer">Open-Meteo</a></>} · hämtad {formatClock(forecast.fetchedAt)}</p>
    </div>
  </Modal>
}

/** Temperature and precipitation share a scrollable time axis. Amounts cover the source interval. */
function DayChart({ steps }: { steps: WeatherStep[] }) {
  const from = Date.parse(steps[0].time)
  const to = Date.parse(steps[steps.length - 1].time)
  const width = Math.max(320, ((to - from) / 3_600_000 + 1) * 64), left = 32, right = 32
  const x = (ms: number) => left + (ms - from) / Math.max(1, to - from) * (width - left - right)
  const hourly = steps.every(step => Date.parse(step.time) - Date.parse(step.start) <= 3_600_000)
  const hourText = (step: WeatherStep, index: number) => {
    const repeated = steps.some((other, i) => i !== index && hourLabel(other.time) === hourLabel(step.time))
    return repeated ? `${hourLabel(step.time)} ${new Date(step.time).getTimezoneOffset() === -120 ? 'sommartid' : 'normaltid'}` : hourLabel(step.time)
  }
  const temps = steps.map(step => step.temp)
  const lo = Math.min(...temps) - 2, hi = Math.max(...temps) + 2
  const y = (temp: number) => 22 + (hi - temp) / (hi - lo) * 54
  const line = steps.map((step, i) => `${i ? 'L' : 'M'}${x(Date.parse(step.time))} ${y(step.temp)}`).join(' ')
  const amounts = steps.flatMap(step => step.mm === null ? [] : [step.mm])
  const maximum = Math.max(1, ...amounts)
  const wet = steps.find(step => (step.mm ?? 0) > 0)
  const summary = wet
    ? `Nederbörd väntas cirka kl. ${formatClock(wet.start)}–${formatClock(wet.time)}.`
    : amounts.length === steps.length ? 'Ingen nederbörd väntas under perioden.' : 'Uppgifter om nederbörd saknas för delar av perioden.'
  return <section className="wxp-timeline" aria-label="Prognos timme för timme">
    <div className="wxp-timeline-heading"><strong>{hourly ? 'Timme för timme' : 'Prognosintervall'}</strong><span>24 timmar · {hourly ? '1 h intervall' : 'källans intervall'}</span></div>
    <p className="wxp-timeline-summary">{summary}</p><p className="wxp-swipe-hint">Svep eller rulla för fler timmar →</p>
    <div className="wxp-timeline-scroll" tabIndex={0} role="region" aria-label="Temperatur och nederbörd, rulla i sidled">
      <div style={{ width, maxWidth: 'none' }}>
        <div className="wxp-hour-symbols" style={{ width }}>{steps.map((step, index) => <div key={step.time} style={{ left: x(Date.parse(step.time)) }}>
          <span>{hourText(step, index)}</span><WeatherIcon kind={stepKind(step)} size={24} title={step.label} />
        </div>)}</div>
        <svg className="wxp-hour-chart" viewBox={`0 0 ${width} 96`} role="img" aria-label="Temperatur i grader per klockslag">
          {[lo + 1, (lo + hi) / 2, hi - 1].map((temp, i) => <line key={i} className="wxp-chart-base" x1={left} x2={width - right} y1={y(temp)} y2={y(temp)} />)}
          {steps.map(step => <line key={step.time} className="wxp-hour-guide" x1={x(Date.parse(step.time))} x2={x(Date.parse(step.time))} y1={16} y2={90} />)}
          <path className="wxp-chart-line" d={line} />
          {steps.map(step => <g key={step.time}><circle className="wxp-chart-dot" cx={x(Date.parse(step.time))} cy={y(step.temp)} r="3" /><text className="wxp-chart-label" x={x(Date.parse(step.time))} y={y(step.temp) - 12} textAnchor="middle">{degrees(step.temp)}</text></g>)}
        </svg>
        <div className="wxp-rain-heading">Nederbörd <span>{hourly ? 'mm per timme' : 'mm per prognosintervall'}</span></div>
        <svg className="wxp-hour-chart" viewBox={`0 0 ${width} 98`} role="img" aria-label={`Nederbörd i millimeter. ${summary}`}>
          <line className="wxp-chart-base" x1={left} x2={width - right} y1="78" y2="78" />
          {steps.map(step => {
            const end = x(Date.parse(step.time))
            const height = (step.mm ?? 0) / maximum * 48
            return <g key={step.time}><title>{formatClock(step.start)}–{formatClock(step.time)}: {step.mm === null ? 'uppgift saknas' : `${number(step.mm)} mm`}</title>
              {height > 0 && <rect className="wxp-chart-bar" x={end - 20} width={40} y={78 - height} height={height} rx="3" />}
              <text className="wxp-chart-label" x={end} y={height > 0 ? 70 - height : 70} textAnchor="middle">{step.mm === null ? '–' : number(step.mm)}</text>
              <text className="wxp-chart-tick" x={end} y="96" textAnchor="middle">{hourLabel(step.time)}</text>
            </g>
          })}
        </svg>
      </div>
    </div>
  </section>
}
