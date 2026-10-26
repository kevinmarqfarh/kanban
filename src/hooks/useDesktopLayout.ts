import { useEffect, useState } from 'react'

// Use the primary input: a large touch tablet stays a tablet; a touchscreen PC with a mouse stays a PC.
export const DESKTOP_QUERY = '(min-width: 1100px) and (pointer: fine) and (hover: hover)'
export function useDesktopLayout() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY)
    const update = () => setDesktop(media.matches)
    update()
    if (media.addEventListener) media.addEventListener('change', update)
    else media.addListener(update)
    return () => { if (media.removeEventListener) media.removeEventListener('change', update); else media.removeListener(update) }
  }, [])
  return desktop
}
