import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWithTimeout } from '../lib/cloud'
import { WEATHER_CACHE_KEY, WEATHER_PLACE_KEY, WEATHER_REFRESH_MS, forecastUrl, isPlace, isStale, parseForecast, readPlace, usableCache, type WeatherPlace, type WeatherWeek } from '../lib/weather'

const PLACE_EVENT = 'forma-weather-place'

export type WeatherStatus = 'loading' | 'ready' | 'stale' | 'error'

// One request per URL at a time: a remount right after start must not fetch twice.
const inflight = new Map<string, Promise<WeatherWeek>>()
function fetchWeek(place: WeatherPlace, today: string): Promise<WeatherWeek> {
  const url = forecastUrl(place, today)
  const running = inflight.get(url)
  if (running) return running
  const request = fetchWithTimeout(url).then(async response => {
    if (!response.ok) throw new Error(`Väder ${response.status}`)
    return parseForecast(await response.json(), place, today)
  }).finally(() => inflight.delete(url))
  inflight.set(url, request)
  return request
}

function readCache(place: WeatherPlace, today: string): WeatherWeek | null {
  try { return usableCache(JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? 'null'), place, today) } catch { return null }
}

/**
 * Monday–Sunday forecast for this device's place. Shows the cached week at once (also offline),
 * refreshes every 30 minutes while visible, on a new day and when the place changes.
 */
export function useWeather(today: string, enabled = true) {
  const [place, setPlaceState] = useState<WeatherPlace>(readPlace)
  const [week, setWeek] = useState<WeatherWeek | null>(() => readCache(readPlace(), today))
  const [status, setStatus] = useState<WeatherStatus>(() => week ? 'ready' : 'loading')
  const request = useRef(0)

  const load = useCallback(async (force = false) => {
    const cached = readCache(place, today)
    if (cached) setWeek(cached)
    if (cached && !force && !isStale(cached)) { setStatus('ready'); return }
    const id = ++request.current
    if (!cached) setStatus('loading')
    try {
      const next = await fetchWeek(place, today)
      if (id !== request.current) return
      setWeek(next); setStatus('ready')
      try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(next)) } catch { /* Shown anyway; fetched again next time. */ }
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

  // Another tab or the settings dialog changed the place.
  useEffect(() => {
    const changed = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== WEATHER_PLACE_KEY) return
      const next = readPlace()
      setPlaceState(current => {
        if (current.name === next.name && current.latitude === next.latitude && current.longitude === next.longitude) return current
        setWeek(null)
        return next
      })
    }
    window.addEventListener('storage', changed)
    window.addEventListener(PLACE_EVENT, changed)
    return () => { window.removeEventListener('storage', changed); window.removeEventListener(PLACE_EVENT, changed) }
  }, [])

  const setPlace = useCallback((next: WeatherPlace) => {
    if (!isPlace(next)) return
    try { localStorage.setItem(WEATHER_PLACE_KEY, JSON.stringify(next)) } catch { /* Applies for this visit. */ }
    setPlaceState(next)
    setWeek(null)
    // Same-tab listeners (the home screen behind the settings dialog) update at once.
    window.dispatchEvent(new Event(PLACE_EVENT))
  }, [])

  return { place, setPlace, week, status, retry: () => void load(true) }
}
