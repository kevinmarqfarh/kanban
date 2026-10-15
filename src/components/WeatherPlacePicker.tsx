import { useState, type FormEvent } from 'react'
import { MapPin, Search } from 'lucide-react'
import { useWeather } from '../hooks/useWeather'
import { fetchWithTimeout } from '../lib/cloud'
import { DEFAULT_PLACE, geocodeUrl, parsePlaces, samePlace, type WeatherPlace } from '../lib/weather'
import { localDateString } from '../lib/birthdays'

/** Settings → Väder and the weather page: choose the town for the forecast. Stored on this device only. */
export function WeatherPlacePicker({ onChosen }: { onChosen?: (place: WeatherPlace) => void } = {}) {
  const { place, setPlace } = useWeather(localDateString(new Date()), false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(WeatherPlace & { detail: string })[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  async function search(event: FormEvent) {
    event.preventDefault()
    if (query.trim().length < 2) { setMessage('Skriv minst två bokstäver.'); return }
    setBusy(true); setMessage(null)
    try {
      const response = await fetchWithTimeout(geocodeUrl(query))
      if (!response.ok) throw new Error(String(response.status))
      const found = parsePlaces(await response.json())
      setResults(found)
      if (!found.length) setMessage(`Hittade ingen ort som heter ”${query.trim()}”.`)
    } catch {
      setMessage('Kunde inte söka just nu. Kontrollera anslutningen och försök igen.')
    } finally { setBusy(false) }
  }
  function choose(next: WeatherPlace) {
    setPlace({ name: next.name, latitude: next.latitude, longitude: next.longitude })
    setResults(null); setQuery(''); setMessage(`Vädret visas nu för ${next.name}.`)
    onChosen?.(next)
  }
  return <div className="weather-place" aria-labelledby="weather-place-title">
    <p id="weather-place-title" className="weather-place-current"><MapPin size={15} aria-hidden="true" />Väder för <strong>{place.name}</strong>{!samePlace(place, DEFAULT_PLACE) && <button className="button ghost" type="button" onClick={() => choose(DEFAULT_PLACE)}>Återställ Göteborg</button>}</p>
    <form className="weather-place-search" onSubmit={search} role="search">
      <label className="sr-only" htmlFor="weather-place-query">Sök ort för vädret</label>
      <input id="weather-place-query" className="input" value={query} placeholder="Sök ort, t.ex. Angered" autoComplete="off" enterKeyHint="search" onChange={event => setQuery(event.target.value)} />
      <button className="button secondary" type="submit" disabled={busy} aria-label="Sök ort"><Search size={15} />{busy ? 'Söker…' : 'Sök'}</button>
    </form>
    {results && results.length > 0 && <ul className="weather-place-results" aria-label="Orter">{results.map(result => <li key={`${result.latitude},${result.longitude}`}>
      <button type="button" onClick={() => choose(result)}><strong>{result.name}</strong>{result.detail && <small>{result.detail}</small>}</button>
    </li>)}</ul>}
    {message && <p className="weather-place-message" role="status">{message}</p>}
  </div>
}
