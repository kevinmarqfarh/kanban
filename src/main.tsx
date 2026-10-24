import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CrashBoundary } from './components/CrashScreen'
import { installGlobalCrashHandlers } from './lib/crashReport'
import './fonts.css'
import './styles.css'
import './birthdays.css'
import './debriefs.css'
import './home.css'
import './briefing.css'
import './homescreen.css'
import './others.css'
import './weather.css'
import './notes.css'
import './tags.css'
import './responsive.css'
import './compat.css'
import './bento.css'

// A reload starts on Home, so a previous tab's scroll position must not carry over.
window.history.scrollRestoration = 'manual'

// Keep the production app available offline after its first successful visit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Local data remains usable even if browser policy disallows app caching.
    })
  })
}

// Record errors outside rendering too (timers, events, promises).
installGlobalCrashHandlers()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><CrashBoundary><App /></CrashBoundary></React.StrictMode>,
)
// The boot watchdog in index.html stands down once the app has started.
window.__formaBooted = true
