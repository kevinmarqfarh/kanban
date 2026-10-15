// SMHI open data: the point forecast (category snow1g, version 1). Free, no key, CORS allowed.
// https://opendata.smhi.se/metfcst/snow1gv1 — replaced pmp3g, which stopped on 31 March 2026.
// About ten days ahead: hourly for the first ~2.5 days, then every 2–6 hours, then every 12 hours. Times are UTC.
// Missing values are 9999. Precipitation amounts are totals for the interval intervalParametersStartTime–time.
import type { DayKind, WeatherPlace, WeatherStep } from './weather'

export const SMHI_BASE = 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point'

/** SMHI allows at most six decimals in the coordinates. */
export const smhiUrl = (place: WeatherPlace) => `${SMHI_BASE}/lon/${Number(place.longitude.toFixed(6))}/lat/${Number(place.latitude.toFixed(6))}/data.json`

/** Roughly SMHI's model area (the Nordics and the Baltic). Outside it there is no point asking; Open-Meteo answers. */
export const inSmhiArea = (place: WeatherPlace) => place.latitude >= 52.5 && place.latitude <= 71 && place.longitude >= 2 && place.longitude <= 38

/** Wsymb2: SMHI's 27 weather symbols → icon family and SMHI's own Swedish wording. */
export const SMHI_SYMBOLS: Record<number, { kind: DayKind; label: string }> = {
  1: { kind: 'sun', label: 'Klart' },
  2: { kind: 'mostly-sunny', label: 'Nästan klart' },
  3: { kind: 'partly-cloudy', label: 'Växlande molnighet' },
  4: { kind: 'partly-cloudy', label: 'Halvklart' },
  5: { kind: 'cloudy', label: 'Molnigt' },
  6: { kind: 'cloudy', label: 'Mulet' },
  7: { kind: 'fog', label: 'Dimma' },
  8: { kind: 'showers', label: 'Lätta regnskurar' },
  9: { kind: 'showers', label: 'Regnskurar' },
  10: { kind: 'showers', label: 'Kraftiga regnskurar' },
  11: { kind: 'thunder', label: 'Åskskurar' },
  12: { kind: 'sleet', label: 'Lätta byar av snöblandat regn' },
  13: { kind: 'sleet', label: 'Byar av snöblandat regn' },
  14: { kind: 'sleet', label: 'Kraftiga byar av snöblandat regn' },
  15: { kind: 'snow', label: 'Lätta snöbyar' },
  16: { kind: 'snow', label: 'Snöbyar' },
  17: { kind: 'snow', label: 'Kraftiga snöbyar' },
  18: { kind: 'drizzle', label: 'Lätt regn' },
  19: { kind: 'rain', label: 'Regn' },
  20: { kind: 'rain', label: 'Kraftigt regn' },
  21: { kind: 'thunder', label: 'Åska' },
  22: { kind: 'sleet', label: 'Lätt snöblandat regn' },
  23: { kind: 'sleet', label: 'Snöblandat regn' },
  24: { kind: 'sleet', label: 'Kraftigt snöblandat regn' },
  25: { kind: 'snow', label: 'Lätt snöfall' },
  26: { kind: 'snow', label: 'Snöfall' },
  27: { kind: 'snow', label: 'Kraftigt snöfall' },
}

const MISSING = 9999
const value = (data: Record<string, unknown>, key: string): number | null => {
  const raw = data[key]
  return typeof raw === 'number' && Number.isFinite(raw) && raw !== MISSING ? raw : null
}
const iso = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export interface SourceSteps { steps: Omit<WeatherStep, 'night'>[]; referenceTime: string | null }

/** Validate an SMHI snow1g response. Steps without a temperature or a known symbol are left out. */
export function parseSmhi(json: unknown): SourceSteps {
  const root = json as { timeSeries?: unknown; referenceTime?: unknown } | null
  if (!root || !Array.isArray(root.timeSeries)) throw new Error('SMHI-data saknas.')
  const steps: SourceSteps['steps'] = []
  let previous: string | null = null
  for (const entry of root.timeSeries as { time?: unknown; intervalParametersStartTime?: unknown; data?: unknown }[]) {
    const time = iso(entry?.time)
    const data = entry?.data as Record<string, unknown> | undefined
    if (!time || !data || typeof data !== 'object') continue
    const temp = value(data, 'air_temperature')
    const symbol = SMHI_SYMBOLS[value(data, 'symbol_code') ?? 0]
    if (temp === null || !symbol) continue
    // The first step's interval is given; if it is ever missing, the previous step (or one hour) is the start.
    const start = iso(entry.intervalParametersStartTime) ?? previous ?? new Date(Date.parse(time) - 3_600_000).toISOString()
    previous = time
    const mm = value(data, 'precipitation_amount_mean')
    steps.push({
      time, start: start < time ? start : new Date(Date.parse(time) - 3_600_000).toISOString(),
      temp, kind: symbol.kind, label: symbol.label,
      rain: value(data, 'probability_of_precipitation'),
      mm: mm === null ? null : Math.max(0, mm),
      wind: value(data, 'wind_speed'), gust: value(data, 'wind_speed_of_gust'), windDir: value(data, 'wind_from_direction'),
      humidity: value(data, 'relative_humidity'), pressure: value(data, 'air_pressure_at_mean_sea_level'), visibility: value(data, 'visibility_in_air'),
      source: 'smhi',
    })
  }
  if (!steps.length) throw new Error('SMHI-prognosen saknar värden.')
  steps.sort((a, b) => a.time.localeCompare(b.time))
  return { steps: steps.filter((step, index) => index === 0 || step.time !== steps[index - 1].time), referenceTime: iso(root.referenceTime) }
}
