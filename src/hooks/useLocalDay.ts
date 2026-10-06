import { useEffect, useState } from 'react'
import { localDateString } from '../lib/birthdays'

/** Keep today's date current while the app stays open across midnight. */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => localDateString(new Date()))
  useEffect(() => {
    const refresh = () => setDay(localDateString(new Date()))
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(visible, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  return day
}
