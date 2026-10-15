import { useEffect, useState } from 'react'

/**
 * Hemskärm: a glanceable, no-scroll Home for a docked tablet (e.g. an iPad in the kitchen).
 * The choice is stored per device, because the same account can be used on a phone and a docked iPad.
 */
export type HomeScreenMode = 'auto' | 'on' | 'off'
export const HOME_SCREEN_KEY = 'forma-homescreen'
/** Touch tablets in either orientation: iPad mini 768×1024 and larger. Phones in landscape are too short. */
export const TABLET_QUERY = '(pointer: coarse) and (min-width: 700px) and (min-height: 600px)'
/** The one-screen layout needs room: below this it never applies, even when set to På (a phone stays a phone). */
export const WIDE_QUERY = '(min-width: 700px) and (min-height: 600px)'

function readMode(): HomeScreenMode {
  try {
    const saved = localStorage.getItem(HOME_SCREEN_KEY)
    return saved === 'on' || saved === 'off' ? saved : 'auto'
  } catch { return 'auto' }
}

function matches(query: string): boolean {
  try { return window.matchMedia(query).matches } catch { return false }
}

export function useHomeScreen() {
  const [mode, setModeState] = useState<HomeScreenMode>(readMode)
  const [tablet, setTablet] = useState(() => matches(TABLET_QUERY))
  const [wide, setWide] = useState(() => matches(WIDE_QUERY))
  useEffect(() => {
    const queries = [window.matchMedia(TABLET_QUERY), window.matchMedia(WIDE_QUERY)]
    const update = () => { setTablet(queries[0].matches); setWide(queries[1].matches) }
    update()
    // Safari 13 lacked addEventListener on MediaQueryList; keep the legacy path for very old iPads.
    for (const media of queries) { if (media.addEventListener) media.addEventListener('change', update); else media.addListener(update) }
    window.addEventListener('resize', update)
    return () => {
      for (const media of queries) { if (media.removeEventListener) media.removeEventListener('change', update); else media.removeListener(update) }
      window.removeEventListener('resize', update)
    }
  }, [])
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === HOME_SCREEN_KEY) setModeState(readMode()) }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function setMode(next: HomeScreenMode) {
    setModeState(next)
    try { if (next === 'auto') localStorage.removeItem(HOME_SCREEN_KEY); else localStorage.setItem(HOME_SCREEN_KEY, next) } catch { /* Applies for this visit. */ }
  }
  return { mode, setMode, tablet, available: wide, active: wide && (mode === 'on' || (mode === 'auto' && tablet)) }
}

/** Minutes without a touch before a docked screen returns to Home. */
export const IDLE_RETURN_MS = 3 * 60_000
/** How often a docked screen pulls changes made on other devices. */
export const HOME_SCREEN_REFRESH_MS = 60_000
