import { useEffect, useState } from 'react'
import { localDateString } from '../lib/birthdays'
import { isNight } from '../lib/sun'
import { readPlace } from '../lib/weather'

/** Dark between sunset and sunrise at the weather place, light otherwise. */
export function sunTheme(now: Date = new Date(), place = readPlace()): 'dark' | 'light' {
  return isNight(now, localDateString(now), place.latitude, place.longitude) ? 'dark' : 'light'
}

/**
 * A docked home screen set to System follows the sun instead of the iPad's own setting: dark after sunset
 * so it does not light up the kitchen at night. Checked every minute and when the screen wakes.
 * Returns null when not enabled, so the normal System behaviour applies.
 */
export function useSunTheme(enabled: boolean): 'dark' | 'light' | null {
  const [theme, setTheme] = useState<'dark' | 'light' | null>(() => (enabled ? sunTheme() : null))
  useEffect(() => {
    if (!enabled) { setTheme(null); return }
    const update = () => setTheme(sunTheme())
    update()
    const timer = window.setInterval(update, 60_000)
    const visible = () => { if (document.visibilityState === 'visible') update() }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('forma-weather-place', update)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('forma-weather-place', update) }
  }, [enabled])
  return theme
}
