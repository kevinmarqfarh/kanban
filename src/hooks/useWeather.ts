import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWithTimeout } from '../lib/cloud'
import { loadForecast } from '../lib/forecast'
import { LEGACY_WEATHER_CACHE_KEY, WEATHER_CACHE_KEY, WEATHER_PLACE_KEY, WEATHER_REFRESH_MS, isPlace, isStale, readPlace, usableCache, type Forecast, type WeatherPlace } from '../lib/weather'

const PLACE_EVENT = 'forma-weather-place'
const FORECAST_EVENT = 'forma-weather-forecast'

export type WeatherStatus = 'loading' | 'ready' | 'stale' | 'error'

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetchWithTimeout(url)
  if (!response.ok) throw new Error(`Väder ${response.status}`)
  return response.json()
}

// One request per place and day at a time: a remount right after start, or Home and the weather page, never fetch twice.
const inflight = new Map<string, Promise<Forecast>>()
function fetchForecast(place: WeatherPlace, today: string): Promise<Forecast> {
  const key = `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)},${today}`
  const running = inflight.get(key)
  if (running) return running
  const request = loadForecast(place, today, fetchJson).finally(() => inflight.delete(key))
  inflight.set(key, request)
  return request
}

function readCache(place: WeatherPlace, today: string): Forecast | null {
  try { return usableCache(JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? 'null'), place, today) } catch { return null }
}

function writeCache(forecast: Forecast) {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(forecast))
    localStorage.removeItem(LEGACY_WEATHER_CACHE_KEY)
  } catch { /* Shown anyway; fetched again next time. */ }
  // Other mounted instances (the menu badge, the weather page) pick up the new forecast without fetching.
  window.dispatchEvent(new Event(FORECAST_EVENT))
}

/**
 * The forecast for this device's place: SMHI, with Open-Meteo for earlier hours and as fallback.
 * Shows the cached forecast at once (also offline), refreshes every 30 minutes while visible,
 * when the screen wakes, when the network returns, on a new day and when the place changes.
 * With `enabled` false it only reads the cache (settings, the Others menu).
 */
export function useWeather(today: string, enabled = true) {
  const [place, setPlaceState] = useState<WeatherPlace>(readPlace)
  const [forecast, setForecast] = useState<Forecast | null>(() => readCache(readPlace(), today))
  const [status, setStatus] = useState<WeatherStatus>(() => forecast ? 'ready' : 'loading')
  const request = useRef(0)

  const load = useCallback(async (force = false) => {
    const cached = readCache(place, today)
    if (cached) setForecast(cached)
    if (cached && !force && !isStale(cached)) { setStatus('ready'); return }
    const id = ++request.current
    if (!cached) setStatus('loading')
    try {
      const next = await fetchForecast(place, today)
      if (id !== request.current) return
      setForecast(next); setStatus('ready')
      writeCache(next)
    } catch {
      if (id !== request.current) return
      setStatus(cached ? 'stale' : 'error')
    }
  }, [place, today])

  useEffect(() => {
    if (!enabled) return
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, WEATHER_REFRESH_MS)
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    const online = () => void load(true)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', online)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', online) }
  }, [enabled, load])

  // A forecast saved by another instance in this tab, or by another tab.
  useEffect(() => {
    const refreshed = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== WEATHER_CACHE_KEY) return
      const cached = readCache(place, today)
      if (cached) { setForecast(cached); setStatus('ready') }
    }
    window.addEventListener(FORECAST_EVENT, refreshed)
    window.addEventListener('storage', refreshed)
    return () => { window.removeEventListener(FORECAST_EVENT, refreshed); window.removeEventListener('storage', refreshed) }
  }, [place, today])

  // Another tab or the settings changed the place.
  useEffect(() => {
    const changed = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== WEATHER_PLACE_KEY) return
      const next = readPlace()
      setPlaceState(current => {
        if (current.name === next.name && current.latitude === next.latitude && current.longitude === next.longitude) return current
        setForecast(readCache(next, today))
        return next
      })
    }
    window.addEventListener('storage', changed)
    window.addEventListener(PLACE_EVENT, changed)
    return () => { window.removeEventListener('storage', changed); window.removeEventListener(PLACE_EVENT, changed) }
  }, [today])

  const setPlace = useCallback((next: WeatherPlace) => {
    if (!isPlace(next)) return
    try { localStorage.setItem(WEATHER_PLACE_KEY, JSON.stringify(next)) } catch { /* Applies for this visit. */ }
    setPlaceState(next)
    setForecast(null)
    setStatus('loading')
    // Same-tab listeners (Home behind the settings dialog) update at once.
    window.dispatchEvent(new Event(PLACE_EVENT))
  }, [])

  return { place, setPlace, forecast, status, retry: () => void load(true) }
}
