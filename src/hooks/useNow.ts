import { useEffect, useState } from 'react'

/** Current time, updated exactly on each new minute so a wall clock never lags. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: number
    const schedule = () => {
      const current = new Date()
      setNow(current)
      timer = window.setTimeout(schedule, 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()) + 50)
    }
    timer = window.setTimeout(schedule, 60_000 - (new Date().getSeconds() * 1000 + new Date().getMilliseconds()) + 50)
    const visible = () => { if (document.visibilityState === 'visible') setNow(new Date()) }
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
  }, [])
  return now
}
