// Builds one Forecast from SMHI (primary) and Open-Meteo (earlier hours of the week, and fallback when SMHI is
// unavailable or the place is outside SMHI's area). Hours are grouped into local days the same way for both.
import { addLocalDays, localDateString, weekStart } from './others'
import { inSmhiArea, parseSmhi, smhiUrl, type SourceSteps } from './smhi'
import { sunTimes } from './sun'
import { isWet, weatherKind, type DayKind, type Forecast, type ForecastDay, type WeatherPlace, type WeatherSource, type WeatherStep } from './weather'

const HOUR = 3_600_000
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/* ---------- Open-Meteo hourly ---------- */

const OPEN_METEO_HOURLY = ['temperature_2m', 'weather_code', 'precipitation_probability', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'relative_humidity_2m', 'pressure_msl', 'visibility']

/** Monday of this week through nine days ahead, hourly, wind in m/s, times as Unix seconds. */
export function openMeteoUrl(place: WeatherPlace, today: string): string {
  const params = new URLSearchParams({
    latitude: place.latitude.toFixed(4),
    longitude: place.longitude.toFixed(4),
    hourly: OPEN_METEO_HOURLY.join(','),
    wind_speed_unit: 'ms',
    timeformat: 'unixtime',
    timezone: 'Europe/Stockholm',
    start_date: weekStart(today),
    end_date: addLocalDays(today, 9),
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

export function parseOpenMeteo(json: unknown): SourceSteps {
  const hourly = (json as { hourly?: Record<string, unknown> } | null)?.hourly
  const time = hourly?.time
  if (!hourly || !Array.isArray(time)) throw new Error('Väderdata saknas.')
  const column = (key: string) => (Array.isArray(hourly[key]) ? hourly[key] as unknown[] : [])
  const [temps, codes, rain, mm, wind, gust, dir, humidity, pressure, visibility] = OPEN_METEO_HOURLY.map(column)
  const num = (list: unknown[], index: number) => (finite(list[index]) ? list[index] as number : null)
  const steps: SourceSteps['steps'] = []
  time.forEach((seconds, index) => {
    if (!finite(seconds) || !finite(temps[index]) || !finite(codes[index])) return
    const end = new Date((seconds as number) * 1000)
    const { kind, label } = weatherKind(codes[index] as number)
    const meters = num(visibility, index)
    steps.push({
      time: end.toISOString(), start: new Date(end.getTime() - HOUR).toISOString(),
      temp: temps[index] as number, kind, label,
      rain: num(rain, index), mm: num(mm, index), wind: num(wind, index), gust: num(gust, index), windDir: num(dir, index),
      humidity: num(humidity, index), pressure: num(pressure, index), visibility: meters === null ? null : meters / 1000,
      source: 'open-meteo',
    })
  })
  if (!steps.length) throw new Error('Väderdata saknas.')
  return { steps, referenceTime: null }
}

/* ---------- Days ---------- */

const dateOf = (iso: string) => localDateString(new Date(iso))
/** Interval values (precipitation) belong to the day of the interval's middle: 23–00 counts for the evening. */
const intervalDate = (step: Pick<WeatherStep, 'start' | 'time'>) => localDateString(new Date((Date.parse(step.start) + Date.parse(step.time)) / 2))
const hoursOf = (step: Pick<WeatherStep, 'start' | 'time'>) => Math.max(1, (Date.parse(step.time) - Date.parse(step.start)) / HOUR)

/** Is the sun down at `iso` in this place? Polar night counts as night, midnight sun as day. */
export function isNightAt(iso: string, place: WeatherPlace): boolean {
  const moment = new Date(iso)
  const sun = sunTimes(localDateString(moment), place.latitude, place.longitude)
  if (sun.special) return sun.special === 'polar-night'
  return moment < sun.sunrise! || moment > sun.sunset!
}

/**
 * The day's symbol, the way SMHI and Apple summarise a day: what the daytime (06–21) mostly looks like,
 * weighted by how many hours each step covers. A day with at least 50 % chance of precipitation shows its
 * wettest daytime weather instead, so a rainy afternoon is never hidden behind a sunny morning.
 */
export function daySymbol(steps: readonly Pick<WeatherStep, 'start' | 'time' | 'kind' | 'label' | 'mm'>[], rain: number | null): { kind: DayKind; label: string } {
  const daytime = steps.filter(step => { const hour = new Date((Date.parse(step.start) + Date.parse(step.time)) / 2).getHours(); return hour >= 6 && hour < 21 })
  const pool = daytime.length ? daytime : steps
  const wet = pool.filter(step => isWet(step.kind))
  const wetDay = rain !== null && rain >= 50 && wet.length > 0
  const chosen = wetDay ? wet : pool
  // On a wet day the weather that brings the most precipitation wins (five hours of rain beat seven of drizzle).
  const byAmount = wetDay && chosen.some(step => (step.mm ?? 0) > 0)
  const weight = new Map<DayKind, number>()
  for (const step of chosen) weight.set(step.kind, (weight.get(step.kind) ?? 0) + (byAmount ? step.mm ?? 0 : hoursOf(step)))
  let best = chosen[0].kind
  for (const [kind, hours] of weight) if (hours > weight.get(best)!) best = kind
  const representative = chosen.filter(step => step.kind === best).sort((a, b) => (b.mm ?? 0) - (a.mm ?? 0))[0]
  return { kind: best, label: representative.label }
}

const round1 = (value: number) => Math.round(value * 10) / 10

export function buildDays(steps: readonly WeatherStep[], place: WeatherPlace, from: string): ForecastDay[] {
  const instant = new Map<string, WeatherStep[]>()
  const interval = new Map<string, WeatherStep[]>()
  for (const step of steps) {
    const day = dateOf(step.time), span = intervalDate(step)
    if (day >= from) instant.set(day, [...(instant.get(day) ?? []), step])
    if (span >= from) interval.set(span, [...(interval.get(span) ?? []), step])
  }
  return [...instant.keys()].sort().map(date => {
    const points = instant.get(date)!
    const spans = interval.get(date) ?? points
    const chances = spans.map(step => step.rain).filter(finite)
    const amounts = spans.map(step => step.mm).filter(finite)
    const winds = points.map(step => step.wind).filter(finite)
    const gusts = points.map(step => step.gust).filter(finite)
    const rain = chances.length ? Math.round(Math.max(...chances)) : null
    const symbol = daySymbol(spans, rain)
    const sun = sunTimes(date, place.latitude, place.longitude)
    const temps = points.map(step => step.temp)
    return {
      date, kind: symbol.kind, label: symbol.label,
      max: Math.round(Math.max(...temps)), min: Math.round(Math.min(...temps)), rain,
      mm: amounts.length ? round1(amounts.reduce((sum, mm) => sum + mm, 0)) : null,
      wind: winds.length ? Math.max(...winds) : null, gust: gusts.length ? Math.max(...gusts) : null,
      sunrise: sun.sunrise?.toISOString() ?? null, sunset: sun.sunset?.toISOString() ?? null, sun: sun.special,
    }
  })
}

/**
 * Merge the sources: SMHI from its first interval onward, Open-Meteo for the hours before it (earlier today and
 * earlier days of the week) or everything when SMHI failed. Keeps steps from the start of `today`.
 */
export function buildForecast(place: WeatherPlace, today: string, smhi: SourceSteps | null, openMeteo: SourceSteps | null, now: Date = new Date()): Forecast {
  if (!smhi && !openMeteo) throw new Error('Väderdata saknas.')
  const smhiStart = smhi?.steps[0]?.start
  const earlier = (openMeteo?.steps ?? []).filter(step => !smhiStart || step.time <= smhiStart)
  const merged = [...earlier, ...(smhi?.steps ?? [])].sort((a, b) => a.time.localeCompare(b.time))
  const steps: WeatherStep[] = merged.map(step => ({ ...step, night: isNightAt(step.time, place) }))
  const days = buildDays(steps, place, weekStart(today))
  if (!days.some(day => day.date >= today)) throw new Error('Väderdata saknas för de kommande dagarna.')
  const startOfToday = new Date(`${today}T00:00:00`).toISOString()
  const sources: WeatherSource[] = []
  if (smhi) sources.push('smhi')
  if (earlier.length) sources.push('open-meteo')
  return {
    place, source: smhi ? 'smhi' : 'open-meteo', sources,
    fetchedAt: now.toISOString(), referenceTime: smhi?.referenceTime ?? null,
    steps: steps.filter(step => step.time >= startOfToday), days,
  }
}

export type FetchJson = (url: string) => Promise<unknown>

/**
 * Ask SMHI and Open-Meteo at the same time. SMHI is used whenever it answers; Open-Meteo fills in the earlier
 * hours of the week and takes over completely when SMHI is down or the place is outside its area.
 */
export async function loadForecast(place: WeatherPlace, today: string, fetchJson: FetchJson, now: () => Date = () => new Date()): Promise<Forecast> {
  const [smhi, openMeteo] = await Promise.allSettled([
    inSmhiArea(place) ? fetchJson(smhiUrl(place)).then(parseSmhi) : Promise.reject(new Error('Utanför SMHI:s område.')),
    fetchJson(openMeteoUrl(place, today)).then(parseOpenMeteo),
  ])
  if (smhi.status === 'rejected' && openMeteo.status === 'rejected') throw smhi.reason instanceof Error ? smhi.reason : new Error('Vädret kunde inte hämtas.')
  return buildForecast(place, today, smhi.status === 'fulfilled' ? smhi.value : null, openMeteo.status === 'fulfilled' ? openMeteo.value : null, now())
}

/* ---------- Reading a forecast ---------- */

/** The step that describes right now: the one whose interval contains `now`, else the next one, else the last. */
export function currentStep(forecast: Forecast, now: Date = new Date()): WeatherStep | null {
  const at = now.toISOString()
  return forecast.steps.find(step => step.start <= at && at <= step.time)
    ?? forecast.steps.find(step => step.time >= at)
    ?? forecast.steps[forecast.steps.length - 1] ?? null
}

/** The steps of one local day, from the current hour when it is today. */
export function stepsOn(forecast: Forecast, date: string, now: Date = new Date()): WeatherStep[] {
  const current = currentStep(forecast, now)
  const today = localDateString(now)
  return forecast.steps.filter(step => dateOf(step.time) === date && (date !== today || !current || step.time >= current.time))
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
export const formatClock = clock

/* ---------- One sentence for the briefing ---------- */

const UMBRELLA: readonly DayKind[] = ['drizzle', 'rain', 'showers', 'thunder']
const hourText = (ms: number) => String(new Date(ms).getHours()).padStart(2, '0')
const degreesText = (value: number) => `${Math.round(value) < 0 ? '−' : ''}${Math.abs(Math.round(value))}°`
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/**
 * The weather as one short sentence in the daily briefing: precipitation and when, otherwise a dry spell with the
 * warmest temperature; from 18:00 it is about tomorrow. Frost overnight is mentioned. Empty without data.
 */
export function weatherNote(forecast: Forecast | null, now: Date = new Date()): string {
  if (!forecast) return ''
  const today = localDateString(now)
  const evening = now.getHours() >= 18
  const day = evening ? addLocalDays(today, 1) : today
  const from = evening ? Date.parse(new Date(`${day}T06:00:00`).toISOString()) : now.getTime()
  const to = Date.parse(new Date(`${day}T22:00:00`).toISOString())
  const steps = forecast.steps.filter(step => Date.parse(step.time) > from && Date.parse(step.start) < to)
  if (!steps.length) return ''

  // The first stretch of precipitation (steps that follow each other).
  const firstWet = steps.findIndex(step => isWet(step.kind) && (step.rain ?? 100) >= 40)
  let sentence: string
  if (firstWet >= 0) {
    const block = [steps[firstWet]]
    for (const step of steps.slice(firstWet + 1)) {
      // A short dry-looking hour with a high chance does not split the rain in two.
      if (!(isWet(step.kind) || (step.rain ?? 0) >= 40) || step.start !== block[block.length - 1].time) break
      block.push(step)
    }
    const heaviest = block.filter(step => isWet(step.kind)).reduce((top, step) => (step.mm ?? 0) > (top.mm ?? 0) ? step : top, block[0])
    // End the stretch at its last wet hour.
    while (block.length > 1 && !isWet(block[block.length - 1].kind)) block.pop()
    const start = Math.max(Date.parse(block[0].start), from), end = Date.parse(block[block.length - 1].time)
    const ongoing = !evening && Date.parse(block[0].start) <= now.getTime()
    const when = ongoing ? `fram till ${hourText(end)}` : end - start <= 3_600_000 ? `kring ${hourText(start)}` : `${hourText(start)}–${hourText(end)}`
    const umbrella = UMBRELLA.includes(heaviest.kind) ? ', ta med paraply' : ''
    sentence = evening
      ? `I morgon: ${lower(heaviest.label)} ${when}${umbrella}.`
      : `${heaviest.label} ${ongoing ? 'nu, ' : 'väntas '}${when}${umbrella}.`
  } else if (evening) {
    const tomorrow = forecast.days.find(entry => entry.date === day)
    sentence = tomorrow ? `I morgon: ${lower(tomorrow.label)}, ${degreesText(tomorrow.min)}–${degreesText(tomorrow.max)}.` : 'I morgon: uppehåll.'
  } else {
    const warmest = Math.max(...steps.map(step => step.temp))
    sentence = `Uppehåll resten av dagen, som varmast ${degreesText(warmest)}.`
  }

  // Frost tonight: from now (or 18:00) until 09:00 tomorrow.
  const nightFrom = evening ? now.getTime() : Date.parse(new Date(`${today}T18:00:00`).toISOString())
  const nightTo = Date.parse(new Date(`${addLocalDays(today, 1)}T09:00:00`).toISOString())
  const night = forecast.steps.filter(step => Date.parse(step.time) >= nightFrom && Date.parse(step.time) <= nightTo)
  const coldest = night.length ? Math.min(...night.map(step => step.temp)) : null
  if (coldest !== null && coldest <= 0) sentence += ` Frost i natt, ner mot ${degreesText(coldest)}.`
  return sentence
}
