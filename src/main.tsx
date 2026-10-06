import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './fonts.css'
import './styles.css'
import './birthdays.css'
import './debriefs.css'
import './home.css'
import './others.css'
import './notes.css'
import './responsive.css'

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
