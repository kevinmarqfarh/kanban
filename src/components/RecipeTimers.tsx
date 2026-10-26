import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, RotateCcw, Timer, X } from 'lucide-react'
import type { Recipe } from '../lib/types'
import { timerClock, timerDuration } from '../lib/recipeTimers'

interface CookingTimer { id: string; recipeId: string; recipeTitle: string; step: number; seconds: number; remaining: number; endsAt: number | null; finished: boolean }
const timerId = (recipeId: string, step: number, seconds: number) => `${recipeId}:${step}:${seconds}`
function read(key: string): CookingTimer[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((item): item is CookingTimer => !!item && typeof item === 'object'
      && typeof item.id === 'string' && typeof item.recipeId === 'string' && typeof item.recipeTitle === 'string'
      && Number.isInteger(item.step) && item.step >= 0 && Number.isInteger(item.seconds) && item.seconds > 0 && item.seconds <= 86400
      && Number.isFinite(item.remaining) && item.remaining >= 0 && item.remaining <= item.seconds * 1000
      && (item.endsAt === null || (Number.isFinite(item.endsAt) && item.endsAt > 0 && item.endsAt <= Date.now() + 86400000)) && typeof item.finished === 'boolean')
      .filter((item, index, items) => items.findIndex(other => other.id === item.id) === index).slice(0, 8)
  } catch { return [] }
}
const Context = createContext<{
  timers: CookingTimer[]; now: number; storageError: boolean;
  start: (recipe: Recipe, step: number, seconds: number) => void;
  toggle: (id: string) => void; reset: (id: string) => void; remove: (id: string) => void;
} | null>(null)

/** Timers belong to this device/account. End timestamps survive reloads and browser timer throttling. */
export function RecipeTimersProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const key = `forma-recipe-timers-v1:${scope}`
  const [timers, setTimers] = useState(() => read(key))
  const [now, setNow] = useState(Date.now)
  const [storageError, setStorageError] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  function unlockAudio() {
    try {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!audio.current && Audio) audio.current = new Audio()
      void audio.current?.resume().catch(() => {})
    } catch { /* The visible completion state remains available without audio. */ }
  }
  const expired = timers.filter(timer => timer.endsAt !== null && timer.endsAt <= now)
  const expiredIds = expired.map(timer => timer.id).join('|')
  useEffect(() => {
    if (!expiredIds) return
    const ids = new Set(expired.map(timer => timer.id))
    setTimers(current => current.map(timer => ids.has(timer.id) ? { ...timer, endsAt: null, remaining: 0, finished: true } : timer))
    const context = audio.current
    if (!context || context.state !== 'running') return
    try {
      for (let index = 0; index < 3; index++) {
        const oscillator = context.createOscillator(), volume = context.createGain(), start = context.currentTime + index * .32
        oscillator.frequency.value = 880; volume.gain.setValueAtTime(.12, start); volume.gain.exponentialRampToValueAtTime(.001, start + .22)
        oscillator.connect(volume); volume.connect(context.destination); oscillator.start(start); oscillator.stop(start + .25)
      }
    } catch { /* A suspended audio device must never stop the countdown. */ }
  }, [expiredIds])
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(timers)); setStorageError(false) } catch { setStorageError(true) }
  }, [key, timers])
  const running = timers.some(timer => timer.endsAt !== null)
  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    tick()
    const interval = window.setInterval(tick, 500)
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(interval); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [running])
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === key) { setTimers(read(key)); setNow(Date.now()) } }
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener('storage', sync); void audio.current?.close().catch(() => {}) }
  }, [key])
  function start(recipe: Recipe, step: number, seconds: number) {
    unlockAudio()
    const instant = Date.now(); setNow(instant)
    setTimers(current => current.length >= 8 || current.some(timer => timer.id === timerId(recipe.id, step, seconds)) ? current : [...current, { id: timerId(recipe.id, step, seconds), recipeId: recipe.id, recipeTitle: recipe.title, step, seconds, remaining: seconds * 1000, endsAt: instant + seconds * 1000, finished: false }])
  }
  function toggle(id: string) {
    unlockAudio()
    const instant = Date.now(); setNow(instant)
    setTimers(current => current.map(timer => timer.id !== id ? timer : timer.endsAt !== null
      ? { ...timer, remaining: Math.max(0, timer.endsAt - instant), endsAt: null }
      : { ...timer, finished: false, endsAt: instant + (timer.finished ? timer.seconds * 1000 : timer.remaining) }))
  }
  return <Context.Provider value={{ timers, now, storageError, start, toggle,
    reset: id => { setNow(Date.now()); setTimers(current => current.map(timer => timer.id === id ? { ...timer, remaining: timer.seconds * 1000, endsAt: null, finished: false } : timer)) },
    remove: id => setTimers(current => current.filter(timer => timer.id !== id)),
  }}>{children}</Context.Provider>
}
export function useRecipeTimers() {
  const context = useContext(Context)
  if (!context) throw new Error('Recipe timers need a provider')
  return context
}
export function RecipeTimerStart({ recipe, step, seconds, label }: { recipe: Recipe; step: number; seconds: number; label: string }) {
  const { timers, start } = useRecipeTimers()
  const exists = timers.some(timer => timer.id === timerId(recipe.id, step, seconds))
  return <button type="button" className="recipe-timer-start" disabled={exists || timers.length >= 8} aria-label={`Starta timer på ${label} för steg ${step + 1}`} onClick={() => start(recipe, step, seconds)}><Timer size={17} aria-hidden="true" />{exists ? `${label} · startad` : `Timer ${label}`}</button>
}
export function RecipeTimerDock() {
  const { timers, now, storageError, toggle, reset, remove } = useRecipeTimers()
  if (!timers.length) return null
  return <section className="recipe-timer-dock" aria-label="Dina timers">
    <div className="recipe-timer-cards">{timers.map(timer => <div className={`recipe-timer-card${timer.finished ? ' is-finished' : ''}`} key={timer.id} data-timer-id={timer.id}>
      <div className="recipe-timer-copy"><span title={timer.recipeTitle}>{timer.recipeTitle} · Steg {timer.step + 1}</span><strong>{timer.finished ? 'Klar!' : timerClock(timer.endsAt !== null ? timer.endsAt - now : timer.remaining)}</strong><small>{timer.finished ? `${timerDuration(timer.seconds)} har gått` : timer.endsAt !== null ? 'Pågår' : 'Pausad'}</small></div>
      <div className="recipe-timer-actions"><button className="icon-button" type="button" aria-label={`${timer.endsAt !== null ? 'Pausa' : timer.finished ? 'Starta om' : 'Fortsätt'} timer för steg ${timer.step + 1}`} onClick={() => toggle(timer.id)}>{timer.endsAt !== null ? <Pause size={19} /> : <Play size={19} />}</button><button className="icon-button" type="button" aria-label={`Återställ timer för steg ${timer.step + 1}`} onClick={() => reset(timer.id)}><RotateCcw size={18} /></button><button className="icon-button" type="button" aria-label={`Ta bort timer för steg ${timer.step + 1}`} onClick={() => remove(timer.id)}><X size={19} /></button></div>
      {timer.finished && <span className="sr-only" role="alert">Timer klar för {timer.recipeTitle}, steg {timer.step + 1}.</span>}
    </div>)}</div>
    {(storageError || timers.length >= 8) && <p className="recipe-timer-help">{storageError ? 'Timern går, men kan inte sparas på enheten.' : 'Du kan ha åtta timers samtidigt. Ta bort en för att starta en ny.'}</p>}
  </section>
}
