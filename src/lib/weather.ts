// Shared weather model: places, icon families, the forecast shape and per-device storage.
// Forecasts come from SMHI (src/lib/smhi.ts) with Open-Meteo for earlier hours of the week and as fallback
// (src/lib/forecast.ts). Both are free, keyless and allow CORS; the source is credited wherever weather shows.
import { weekDates } from './others'

export interface WeatherPlace { name: string; latitude: number; longitude: number }
export const DEFAULT_PLACE: WeatherPlace = { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 }

export type DayKind = 'sun' | 'mostly-sunny' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'sleet' | 'snow' | 'thunder'
export type NightKind = 'clear-night' | 'mostly-clear-night' | 'partly-cloudy-night' | 'showers-night'
export type WeatherKind = DayKind | NightKind
export type WeatherSource = 'smhi' | 'open-meteo'

/** One forecast step. Instant values (temperature, wind …) are valid at `time`; precipitation covers `start`–`time`. */
export interface WeatherStep {
  time: string
  start: string
  temp: number
  /** The daytime icon family; `night` swaps in the moon where it applies (see stepKind). */
  kind: DayKind
  label: string
  /** Chance of precipitation in percent. */
  rain: number | null
  /** Precipitation in mm during the interval. */
  mm: number | null
  wind: number | null
  gust: number | null
  windDir: number | null
  humidity: number | null
  pressure: number | null
  /** Visibility in km. */
  visibility: number | null
  night: boolean
  source: WeatherSource
}

export interface WeatherDay {
  date: string
  kind: DayKind
  label: string
  max: number
  min: number
  /** Highest chance of precipitation during the day, in percent. */
  rain: number | null
}

export interface ForecastDay extends WeatherDay {
  mm: number | null
  wind: number | null
  gust: number | null
  sunrise: string | null
  sunset: string | null
  /** The sun never rises (polar night) or never sets (midnight sun). */
  sun: 'polar-night' | 'midnight-sun' | null
}

export interface Forecast {
  place: WeatherPlace
  /** Where the coming hours come from. */
  source: WeatherSource
  /** Every source that contributed (SMHI ahead, Open-Meteo for earlier hours of the week). */
  sources: WeatherSource[]
  fetchedAt: string
  /** The model run the forecast is based on (SMHI's referenceTime), when known. */
  referenceTime: string | null
  /** From the start of the fetch day onward, in time order. */
  steps: WeatherStep[]
  /** Monday of the current week onward, in date order. */
  days: ForecastDay[]
}

export const WET_KINDS: readonly DayKind[] = ['drizzle', 'rain', 'showers', 'sleet', 'snow', 'thunder']
export const isWet = (kind: DayKind) => WET_KINDS.includes(kind)

const NIGHT: Partial<Record<DayKind, NightKind>> = { sun: 'clear-night', 'mostly-sunny': 'mostly-clear-night', 'partly-cloudy': 'partly-cloudy-night', showers: 'showers-night' }
/** The icon for a step: the moon replaces the sun after dark. */
export const stepKind = (step: Pick<WeatherStep, 'kind' | 'night'>): WeatherKind => (step.night && NIGHT[step.kind]) || step.kind

/** WMO weather interpretation codes (Open-Meteo) → an icon family and a Swedish label. */
export function weatherKind(code: number): { kind: DayKind; label: string } {
  if (code === 0) return { kind: 'sun', label: 'Klart' }
  if (code === 1) return { kind: 'mostly-sunny', label: 'Mestadels klart' }
  if (code === 2) return { kind: 'partly-cloudy', label: 'Växlande molnighet' }
  if (code === 3) return { kind: 'cloudy', label: 'Mulet' }
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Dimma' }
  if (code >= 51 && code <= 55) return { kind: 'drizzle', label: 'Duggregn' }
  if (code === 56 || code === 57 || code === 66 || code === 67) return { kind: 'sleet', label: 'Underkylt regn' }
  if (code >= 61 && code <= 65) return { kind: 'rain', label: code === 65 ? 'Kraftigt regn' : code === 61 ? 'Lätt regn' : 'Regn' }
  if (code >= 80 && code <= 82) return { kind: 'showers', label: 'Regnskurar' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Snö' }
  if (code >= 95 && code <= 99) return { kind: 'thunder', label: 'Åska' }
  return { kind: 'cloudy', label: 'Molnigt' }
}

/** Monday–Sunday of the ISO week that contains `today`. */
export const weatherWeek = (today: string) => weekDates(today)

/** Rain chance worth showing in the compact week strip (like Apple Weather): wet weather and at least 30 %. */
export const showRainChance = (day: WeatherDay) => day.rain !== null && day.rain >= 30 && isWet(day.kind)

/* ---------- Place search (Open-Meteo geocoding) ---------- */

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function geocodeUrl(query: string): string {
  return `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: query.trim(), count: '6', language: 'sv', format: 'json' })}`
}

export function parsePlaces(json: unknown): (WeatherPlace & { detail: string })[] {
  const results = (json as { results?: unknown[] } | null)?.results
  if (!Array.isArray(results)) return []
  return results.flatMap(entry => {
    const item = entry as Record<string, unknown>
    if (typeof item.name !== 'string' || !finite(item.latitude) || !finite(item.longitude)) return []
    const detail = [item.admin2, item.admin1, item.country].filter((part, index, all): part is string => typeof part === 'string' && part !== item.name && all.indexOf(part) === index).join(', ')
    return [{ name: item.name, latitude: item.latitude as number, longitude: item.longitude as number, detail }]
  })
}

/* ---------- Per-device storage ---------- */

export const WEATHER_PLACE_KEY = 'forma-weather-place'
/** v2: the full forecast (hours and days). The v1 key held a Monday–Sunday summary and is removed on save. */
export const WEATHER_CACHE_KEY = 'forma-weather-forecast'
export const LEGACY_WEATHER_CACHE_KEY = 'forma-weather-cache'
/** How long a forecast is fresh before it is fetched again. */
export const WEATHER_REFRESH_MS = 30 * 60_000

export function isPlace(value: unknown): value is WeatherPlace {
  const place = value as WeatherPlace | null
  return !!place && typeof place.name === 'string' && !!place.name.trim() && finite(place.latitude) && finite(place.longitude)
    && Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180
}

export function readPlace(): WeatherPlace {
  try {
    const saved = JSON.parse(localStorage.getItem(WEATHER_PLACE_KEY) ?? 'null')
    return isPlace(saved) ? saved : DEFAULT_PLACE
  } catch { return DEFAULT_PLACE }
}

export const samePlace = (a: WeatherPlace, b: WeatherPlace) => a.latitude.toFixed(3) === b.latitude.toFixed(3) && a.longitude.toFixed(3) === b.longitude.toFixed(3)

const isSource = (value: unknown): value is WeatherSource => value === 'smhi' || value === 'open-meteo'

/** A cached forecast is usable for the same place while it still says something about today or later. */
export function usableCache(value: unknown, place: WeatherPlace, today: string): Forecast | null {
  const cached = value as Forecast | null
  if (!cached || typeof cached !== 'object' || !isPlace(cached.place) || !samePlace(cached.place, place)) return null
  if (!isSource(cached.source) || !Array.isArray(cached.sources) || !Array.isArray(cached.steps) || !Array.isArray(cached.days) || typeof cached.fetchedAt !== 'string') return null
  if (!cached.days.every(day => day && typeof day.date === 'string' && finite(day.max) && finite(day.min) && typeof day.kind === 'string')) return null
  if (!cached.steps.every(step => step && typeof step.time === 'string' && finite(step.temp) && typeof step.kind === 'string')) return null
  if (!cached.days.some(day => day.date >= today)) return null
  return cached
}

/** A minute of slack so the 30-minute timer always finds the forecast due, never "29:59 old, keep it". */
export const isStale = (forecast: Pick<Forecast, 'fetchedAt'>, now: Date = new Date()) => now.getTime() - Date.parse(forecast.fetchedAt) >= WEATHER_REFRESH_MS - 60_000 || !Number.isFinite(Date.parse(forecast.fetchedAt))

/** The days of `today`'s Monday–Sunday that the forecast covers. */
export function weekForecast(forecast: Forecast | null, today: string): Map<string, ForecastDay> {
  const week = new Set(weatherWeek(today))
  return new Map((forecast?.days ?? []).filter(day => week.has(day.date)).map(day => [day.date, day]))
}

export const SOURCE_NAMES: Record<WeatherSource, string> = { smhi: 'SMHI', 'open-meteo': 'Open-Meteo' }
export const SOURCE_LINKS: Record<WeatherSource, string> = { smhi: 'https://www.smhi.se/', 'open-meteo': 'https://open-meteo.com/' }
