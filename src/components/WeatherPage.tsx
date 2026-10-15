import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, Droplet, Droplets, Eye, Gauge, MapPin, RotateCw, Sunrise, Sunset, Wind } from 'lucide-react'
import { useNow } from '../hooks/useNow'
import { useWeather } from '../hooks/useWeather'
import { compass, currentStep, dayLength, formatClock, formatWhen, hourlySummary, nextHours, stepsOn } from '../lib/forecast'
import { addLocalDays, parseLocalDate } from '../lib/others'
import { SOURCE_LINKS, SOURCE_NAMES, rainChanceText, stepKind, type Forecast, type ForecastDay, type WeatherStep } from '../lib/weather'
import { Modal } from './Modal'
import { WeatherIcon } from './WeatherIcon'
import { WeatherPlacePicker } from './WeatherPlacePicker'

const SHORT_DAYS = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
const number = (value: number, digits = 1) => value.toLocaleString('sv-SE', { maximumFractionDigits: digits })
const degrees = (value: number) => `${Math.round(value)}°`
const dayName = (date: string, today: string) => date === today ? 'Idag' : date === addLocalDays(today, 1) ? 'Imorgon' : SHORT_DAYS[parseLocalDate(date).getDay()]
const longDate = (date: string) => { const text = parseLocalDate(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }); return text.charAt(0).toUpperCase() + text.slice(1) }
const hourLabel = (iso: string) => String(new Date(iso).getHours()).padStart(2, '0')

/** Apple-like temperature colours: blue when cold, green when mild, orange when warm. */
const STOPS: [number, [number, number, number]][] = [[-15, [122, 92, 255]], [-5, [74, 140, 255]], [3, [79, 176, 240]], [9, [86, 205, 190]], [15, [163, 214, 94]], [20, [246, 201, 67]], [25, [245, 154, 58]], [32, [239, 91, 58]]]
export function temperatureColor(value: number): string {
  if (value <= STOPS[0][0]) return `rgb(${STOPS[0][1].join(',')})`
  for (let index = 1; index < STOPS.length; index++) {
    const [to, high] = STOPS[index], [from, low] = STOPS[index - 1]
    if (value <= to) { const t = (value - from) / (to - from); return `rgb(${low.map((channel, i) => Math.round(channel + (high[i] - channel) * t)).join(',')})` }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`
}

/** The sky behind the page follows the weather right now, like Apple Weather. */
function sky(step: WeatherStep | null): string {
  if (!step) return 'cloudy'
  const wet = ['drizzle', 'rain', 'showers', 'sleet', 'thunder'].includes(step.kind)
  if (step.night) return wet || step.kind === 'cloudy' || step.kind === 'fog' ? 'night-cloudy' : 'night'
  if (step.kind === 'snow') return 'snow'
  if (wet) return 'rain'
  if (step.kind === 'cloudy' || step.kind === 'fog') return 'cloudy'
  if (step.kind === 'partly-cloudy') return 'partly'
  return 'clear'
}

/** Others → Väder: SMHI's forecast laid out like Apple Weather. Now, the next 24 hours, ten days, and details. */
export function WeatherPage({ today, initialDate }: { today: string; initialDate?: string | null }) {
  const now = useNow()
  const { place, forecast, status, retry } = useWeather(today)
  const [selected, setSelected] = useState<string | null>(initialDate ?? null)
  const [choosingPlace, setChoosingPlace] = useState(false)
  useEffect(() => { if (initialDate) setSelected(initialDate) }, [initialDate])

  const current = forecast ? currentStep(forecast, now) : null
  const days = useMemo(() => (forecast?.days ?? []).filter(day => day.date >= today).slice(0, 10), [forecast, today])
  const todayForecast = days.find(day => day.date === today) ?? null
  const updated = forecast ? formatClock(forecast.fetchedAt) : null
  const selectedDay = selected ? days.find(day => day.date === selected) ?? null : null

  return <div className="wxp" data-testid="weather-page" data-sky={sky(current)} data-status={status} data-source={forecast?.source ?? 'none'}>
    <header className="wxp-hero" aria-live="polite">
      <button className="wxp-place" type="button" onClick={() => setChoosingPlace(open => !open)} aria-expanded={choosingPlace} aria-controls="wxp-place-picker">
        <MapPin size={15} aria-hidden="true" /><span>{place.name}</span>
      </button>
      {current ? <>
        <p className="wxp-now" aria-label={`Just nu ${Math.round(current.temp)} grader, ${current.label}`}>
          <span className="wxp-temp">{degrees(current.temp)}</span>
        </p>
        <p className="wxp-condition">{current.label}</p>
        {todayForecast && <p className="wxp-highlow"><span>H: {todayForecast.max}°</span><span>L: {todayForecast.min}°</span></p>}
      </> : <p className="wxp-condition wxp-empty">{status === 'error' ? 'Vädret kunde inte hämtas just nu.' : 'Hämtar prognosen från SMHI…'}</p>}
      <p className="wxp-status">
        {status === 'loading' && forecast ? 'Uppdaterar…' : status === 'stale' ? `Sparat ${updated} · offline` : updated ? `Uppdaterat ${updated}` : ''}
        {(status === 'error' || status === 'stale') && <button className="wxp-retry" type="button" onClick={retry}><RotateCw size={13} aria-hidden="true" />Försök igen</button>}
      </p>
    </header>

    {choosingPlace && <section id="wxp-place-picker" className="wxp-card wxp-picker" aria-label="Byt ort">
      <WeatherPlacePicker onChosen={() => setChoosingPlace(false)} />
    </section>}

    {forecast && current && <>
      <HourlyCard forecast={forecast} now={now} />
      <section className="wxp-card wxp-days" aria-labelledby="wxp-days-title">
        <h3 id="wxp-days-title" className="wxp-card-title"><CalendarDays size={14} aria-hidden="true" />{days.length}-dagarsprognos</h3>
        <DayList days={days} today={today} current={current} onSelect={setSelected} />
      </section>
      <DetailTiles forecast={forecast} current={current} today={todayForecast} now={now} />
      <p className="wxp-credit">
        Källa: <a href={SOURCE_LINKS[forecast.source]} target="_blank" rel="noreferrer">{SOURCE_NAMES[forecast.source]}</a>
        {forecast.referenceTime && forecast.source === 'smhi' ? `, prognos från ${formatClock(forecast.referenceTime)}` : ''}
        {forecast.source === 'smhi' && forecast.sources.includes('open-meteo') ? <> · tidigare timmar: <a href={SOURCE_LINKS['open-meteo']} target="_blank" rel="noreferrer">Open-Meteo</a></> : ''}
        {forecast.source === 'open-meteo' ? ' (SMHI svarade inte eller orten ligger utanför SMHI:s område)' : ''}
      </p>
    </>}

    {selectedDay && forecast && <DaySheet forecast={forecast} days={days} day={selectedDay} today={today} now={now} placeName={place.name} onSelect={setSelected} onClose={() => setSelected(null)} />}
  </div>
}

function HourlyCard({ forecast, now }: { forecast: Forecast; now: Date }) {
  const items = nextHours(forecast, now)
  return <section className="wxp-card wxp-hourly" aria-labelledby="wxp-hourly-title">
    <h3 id="wxp-hourly-title" className="wxp-card-title"><Clock size={14} aria-hidden="true" />Timprognos</h3>
    <p className="wxp-summary">{hourlySummary(forecast, now)}</p>
    <ol className="wxp-hours" aria-label="De kommande 24 timmarna">{items.map(item => {
      if (item.type !== 'step') {
        const rise = item.type === 'sunrise'
        return <li key={`${item.type}-${item.time}`} className="wxp-hour is-sun" data-kind={item.type} aria-label={`${rise ? 'Soluppgång' : 'Solnedgång'} ${formatClock(item.time)}`}>
          <span className="wxp-hour-time" aria-hidden="true">{formatClock(item.time)}</span>
          <span className="wxp-hour-icon" aria-hidden="true">{rise ? <Sunrise size={24} /> : <Sunset size={24} />}</span>
          <span className="wxp-hour-rain" aria-hidden="true" />
          <span className="wxp-hour-temp" aria-hidden="true">{rise ? 'Upp' : 'Ned'}</span>
        </li>
      }
      const { step } = item
      const chance = rainChanceText(step.rain)
      return <li key={step.time} className={`wxp-hour${item.now ? ' is-now' : ''}`} data-time={step.time} aria-label={`${item.now ? 'Nu' : `Klockan ${formatClock(step.time)}`}: ${Math.round(step.temp)} grader, ${step.label}${step.rain !== null ? `, ${step.rain} procent risk för nederbörd` : ''}`}>
        <span className="wxp-hour-time" aria-hidden="true">{item.now ? 'Nu' : hourLabel(step.time)}</span>
        <span className="wxp-hour-icon" aria-hidden="true"><WeatherIcon kind={stepKind(step)} size={30} /></span>
        <span className="wxp-hour-rain" aria-hidden="true">{chance}</span>
        <span className="wxp-hour-temp" aria-hidden="true">{degrees(step.temp)}</span>
      </li>
    })}</ol>
  </section>
}

function DayList({ days, today, current, onSelect }: { days: ForecastDay[]; today: string; current: WeatherStep; onSelect: (date: string) => void }) {
  const low = Math.min(...days.map(day => day.min)), high = Math.max(...days.map(day => day.max))
  const span = Math.max(1, high - low)
  const at = (value: number) => `${((value - low) / span) * 100}%`
  return <ol className="wxp-day-list">{days.map(day => {
    const chance = rainChanceText(day.rain)
    const isToday = day.date === today
    const nowTemp = Math.min(day.max, Math.max(day.min, current.temp))
    return <li key={day.date}>
      <button type="button" className={`wxp-day${isToday ? ' is-today' : ''}`} data-date={day.date} onClick={() => onSelect(day.date)}
        aria-label={`${longDate(day.date)}: ${day.label}, högst ${day.max} grader, lägst ${day.min} grader${day.rain !== null ? `, ${day.rain} procent risk för nederbörd` : ''}. Visa timprognos.`}>
        <span className="wxp-day-name" aria-hidden="true">{dayName(day.date, today)}</span>
        <span className="wxp-day-icon" aria-hidden="true"><WeatherIcon kind={day.kind} size={28} /><small>{chance}</small></span>
        <span className="wxp-day-min" aria-hidden="true">{day.min}°</span>
        <span className="wxp-range" aria-hidden="true">
          <i style={{ left: at(day.min), width: `calc(${at(day.max)} - ${at(day.min)})`, background: `linear-gradient(90deg, ${temperatureColor(day.min)}, ${temperatureColor(day.max)})` }} />
          {isToday && <b style={{ left: at(nowTemp) }} />}
        </span>
        <span className="wxp-day-max" aria-hidden="true">{day.max}°</span>
      </button>
    </li>
  })}</ol>
}

function DetailTiles({ forecast, current, today, now }: { forecast: Forecast; current: WeatherStep; today: ForecastDay | null; now: Date }) {
  const until = new Date(now.getTime() + 24 * 3_600_000).toISOString()
  const coming = forecast.steps.filter(step => step.time >= current.time && step.start < until)
  const amounts = coming.map(step => step.mm).filter((mm): mm is number => mm !== null)
  const mm = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null
  const peak = coming.reduce<WeatherStep | null>((top, step) => (step.rain ?? -1) > (top?.rain ?? -1) ? step : top, null)
  const direction = compass(current.windDir)
  const tomorrow = forecast.days.find(day => day.date > (today?.date ?? ''))
  const sunDay = today ?? forecast.days[0]
  return <div className="wxp-tiles">
    <section className="wxp-card wxp-tile" aria-labelledby="wxp-tile-rain">
      <h3 id="wxp-tile-rain" className="wxp-card-title"><Droplets size={14} aria-hidden="true" />Nederbörd</h3>
      <p className="wxp-tile-value">{mm === null ? '–' : `${number(mm)} mm`}</p>
      <p className="wxp-tile-caption">de kommande 24 timmarna</p>
      <p className="wxp-tile-note">{peak && (peak.rain ?? 0) >= 10 ? `Störst risk ${peak.rain} % ${formatWhen(peak.time, now)}.` : 'Ingen risk värd att nämna.'}{tomorrow?.mm ? ` ${number(tomorrow.mm)} mm väntas ${tomorrow.date === addLocalDays(today?.date ?? tomorrow.date, 1) ? 'i morgon' : longDate(tomorrow.date).toLowerCase()}.` : ''}</p>
    </section>
    <section className="wxp-card wxp-tile" aria-labelledby="wxp-tile-wind">
      <h3 id="wxp-tile-wind" className="wxp-card-title"><Wind size={14} aria-hidden="true" />Vind</h3>
      <div className="wxp-wind">
        <p className="wxp-tile-value">{current.wind === null ? '–' : `${number(current.wind, 0)} m/s`}</p>
        {current.windDir !== null && <svg className="wxp-compass" viewBox="0 0 40 40" role="img" aria-label={`${direction!.word} vind, från ${Math.round(current.windDir)} grader`}>
          <circle cx="20" cy="20" r="18" />
          <text x="20" y="9" textAnchor="middle">N</text>
          {/* The arrow points where the wind blows to: from the given direction, through the centre. */}
          <g transform={`rotate(${current.windDir + 180} 20 20)`}><path d="M20 8l4.5 9h-3v15h-3V17h-3z" /></g>
        </svg>}
      </div>
      <p className="wxp-tile-caption">{direction ? `${direction.word.charAt(0).toUpperCase()}${direction.word.slice(1)} vind (${direction.short})` : ''}</p>
      <p className="wxp-tile-note">{current.gust !== null ? `Byar upp till ${number(current.gust, 0)} m/s.` : ''}</p>
    </section>
    <section className="wxp-card wxp-tile" aria-labelledby="wxp-tile-humidity">
      <h3 id="wxp-tile-humidity" className="wxp-card-title"><Droplet size={14} aria-hidden="true" />Luftfuktighet</h3>
      <p className="wxp-tile-value">{current.humidity === null ? '–' : `${Math.round(current.humidity)} %`}</p>
      <p className="wxp-tile-caption">relativ fuktighet just nu</p>
    </section>
    <section className="wxp-card wxp-tile" aria-labelledby="wxp-tile-sun">
      <h3 id="wxp-tile-sun" className="wxp-card-title"><Sunrise size={14} aria-hidden="true" />Sol</h3>
      {sunDay?.sun ? <p className="wxp-tile-value">{dayLength(sunDay)}</p> : <>
        <p className="wxp-tile-value wxp-sun-times"><span><Sunrise size={18} aria-hidden="true" />{sunDay?.sunrise ? formatClock(sunDay.sunrise) : '–'}</span><span><Sunset size={18} aria-hidden="true" />{sunDay?.sunset ? formatClock(sunDay.sunset) : '–'}</span></p>
        <p className="wxp-tile-caption">Soluppgång och solnedgång</p>
        <p className="wxp-tile-note">{sunDay ? `Dagen är ${dayLength(sunDay)} lång.` : ''}</p>
      </>}
    </section>
    {current.visibility !== null && <section className="wxp-card wxp-tile" aria-labelledby="wxp-tile-visibility">
      <h3 id="wxp-tile-visibility" className="wxp-card-title"><Eye size={14} aria-hidden="true" />Sikt</h3>
      <p className="wxp-tile-value">{current.visibility >= 10 ? Math.round(current.visibility) : number(current.visibility)} km</p>
      <p className="wxp-tile-caption">{current.visibility < 1 ? 'Mycket dålig sikt' : current.visibility < 4 ? 'Nedsatt sikt' : 'God sikt'}</p>
    </section>}
    {current.pressure !== null && <section className="wxp-card wxp-tile" aria-labelledby="wxp-tile-pressure">
      <h3 id="wxp-tile-pressure" className="wxp-card-title"><Gauge size={14} aria-hidden="true" />Lufttryck</h3>
      <p className="wxp-tile-value">{Math.round(current.pressure)} hPa</p>
      <p className="wxp-tile-caption">{current.pressure >= 1020 ? 'Högtryck' : current.pressure <= 1000 ? 'Lågtryck' : 'Normalt'}</p>
    </section>}
  </div>
}

function DaySheet({ forecast, days, day, today, now, placeName, onSelect, onClose }: {
  forecast: Forecast; days: ForecastDay[]; day: ForecastDay; today: string; now: Date; placeName: string; onSelect: (date: string) => void; onClose: () => void
}) {
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
