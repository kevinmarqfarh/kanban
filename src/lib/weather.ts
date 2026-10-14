// Weekly weather (Monday–Sunday) for the docked home screen, from Open-Meteo (free, no key, CORS).
// Data by Open-Meteo.com, CC BY 4.0 — the attribution is shown under the forecast.
import { weekDates } from './others'

export interface WeatherPlace { name: string; latitude: number; longitude: number }
export const DEFAULT_PLACE: WeatherPlace = { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 }

export type WeatherKind = 'sun' | 'mostly-sunny' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'sleet' | 'snow' | 'thunder'

export interface WeatherDay {
  date: string
  code: number
  kind: WeatherKind
  label: string
  max: number
  min: number
  /** Chance of precipitation in percent, when the model provides it. */
  rain: number | null
}

export interface WeatherWeek {
  place: WeatherPlace
  days: WeatherDay[]
  fetchedAt: string
}

/** WMO weather interpretation codes → an icon family and a Swedish label. */
export function weatherKind(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'sun', label: 'Soligt' }
  if (code === 1) return { kind: 'mostly-sunny', label: 'Mest soligt' }
  if (code === 2) return { kind: 'partly-cloudy', label: 'Växlande molnighet' }
  if (code === 3) return { kind: 'cloudy', label: 'Mulet' }
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Dimma' }
  if (code >= 51 && code <= 55) return { kind: 'drizzle', label: 'Duggregn' }
  if (code === 56 || code === 57 || code === 66 || code === 67) return { kind: 'sleet', label: 'Underkylt regn' }
  if (code >= 61 && code <= 65) return { kind: 'rain', label: code === 65 ? 'Kraftigt regn' : 'Regn' }
  if (code >= 80 && code <= 82) return { kind: 'showers', label: 'Regnskurar' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Snö' }
  if (code >= 95 && code <= 99) return { kind: 'thunder', label: 'Åska' }
  return { kind: 'cloudy', label: 'Molnigt' }
}

/** Monday–Sunday of the ISO week that contains `today`. */
export const weatherWeek = (today: string) => weekDates(today)

export function forecastUrl(place: WeatherPlace, today: string): string {
  const days = weatherWeek(today)
  const params = new URLSearchParams({
    latitude: place.latitude.toFixed(4),
    longitude: place.longitude.toFixed(4),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Europe/Stockholm',
    start_date: days[0],
    end_date: days[6],
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Validate an Open-Meteo daily response and keep exactly the requested week, in order. Missing days stay out. */
export function parseForecast(json: unknown, place: WeatherPlace, today: string, now: Date = new Date()): WeatherWeek {
  const daily = (json as { daily?: Record<string, unknown> } | null)?.daily
  const time = daily?.time
  if (!daily || !Array.isArray(time)) throw new Error('Väderdata saknas.')
  const column = (key: string) => (Array.isArray(daily[key]) ? daily[key] as unknown[] : [])
  const codes = column('weather_code'), max = column('temperature_2m_max'), min = column('temperature_2m_min'), rain = column('precipitation_probability_max')
  const days: WeatherDay[] = []
  for (const date of weatherWeek(today)) {
    const index = time.indexOf(date)
    if (index < 0 || !finite(codes[index]) || !finite(max[index]) || !finite(min[index])) continue
    const { kind, label } = weatherKind(codes[index] as number)
    days.push({ date, code: codes[index] as number, kind, label, max: Math.round(max[index] as number), min: Math.round(min[index] as number), rain: finite(rain[index]) ? Math.round(rain[index] as number) : null })
  }
  if (!days.length) throw new Error('Väderdata saknas för veckan.')
  return { place, days, fetchedAt: now.toISOString() }
}

/** Rain chance worth showing next to the icon (like Apple Weather): wet weather and at least 30 %. */
export const showRainChance = (day: WeatherDay) => day.rain !== null && day.rain >= 30 && ['drizzle', 'rain', 'showers', 'sleet', 'snow', 'thunder'].includes(day.kind)

/* ---------- Place search (Open-Meteo geocoding) ---------- */

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
export const WEATHER_CACHE_KEY = 'forma-weather-cache'
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

/** A cached week is usable when it is for the same place and the same Monday–Sunday. */
export function usableCache(value: unknown, place: WeatherPlace, today: string): WeatherWeek | null {
  const cached = value as WeatherWeek | null
  if (!cached || !isPlace(cached.place) || !samePlace(cached.place, place) || !Array.isArray(cached.days) || typeof cached.fetchedAt !== 'string') return null
  const week = weatherWeek(today)
  if (!cached.days.length || !cached.days.every(day => week.includes(day.date))) return null
  return cached
}

/** A minute of slack so the 30-minute timer always finds the forecast due, never "29:59 old, keep it". */
export const isStale = (week: WeatherWeek, now: Date = new Date()) => now.getTime() - Date.parse(week.fetchedAt) >= WEATHER_REFRESH_MS - 60_000 || !Number.isFinite(Date.parse(week.fetchedAt))
