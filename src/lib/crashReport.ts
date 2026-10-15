// Crash handling and self-recovery. A docked iPad runs unattended, so an error must never leave a blank
// screen: it is shown with its technical details, kept on the device (`forma-last-error`), and the app
// reloads itself (at most a few times) so the kitchen screen heals on its own. Nothing is sent anywhere.

export const APP_VERSION: string = typeof __FORMA_VERSION__ === 'string' ? __FORMA_VERSION__ : 'dev'
export const LAST_ERROR_KEY = 'forma-last-error'
export const AUTO_RELOAD_KEY = 'forma-auto-reloads'
/** At most this many automatic reloads within the window; after that the message stays until someone taps. */
export const AUTO_RELOAD_LIMIT = 3
export const AUTO_RELOAD_WINDOW_MS = 15 * 60_000

export interface CrashRecord {
  message: string
  stack: string
  source: 'render' | 'error' | 'promise' | 'boot'
  at: string
  version: string
  userAgent: string
  url: string
}

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1)}…` : text)

export function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: clip(`${error.name}: ${error.message}`, 500), stack: clip(error.stack ?? '', 4000) }
  if (typeof error === 'string') return { message: clip(error, 500), stack: '' }
  try { return { message: clip(JSON.stringify(error) ?? String(error), 500), stack: '' } } catch { return { message: String(error), stack: '' } }
}

export function crashRecord(error: unknown, source: CrashRecord['source'], extraStack = '', now: Date = new Date()): CrashRecord {
  const { message, stack } = describe(error)
  return {
    message, stack: clip([stack, extraStack].filter(Boolean).join('\n--- component stack ---\n'), 6000), source,
    at: now.toISOString(), version: APP_VERSION,
    userAgent: typeof navigator === 'undefined' ? '' : clip(navigator.userAgent, 300),
    url: typeof location === 'undefined' ? '' : clip(location.pathname + location.search, 300),
  }
}

export function readLastError(): CrashRecord | null {
  try { return JSON.parse(localStorage.getItem(LAST_ERROR_KEY) ?? 'null') } catch { return null }
}

export function reportCrash(record: CrashRecord): void {
  try { localStorage.setItem(LAST_ERROR_KEY, JSON.stringify(record)) } catch { /* Storage full or blocked. */ }
}

/** Errors outside React rendering (timers, event handlers, promises) are recorded too. */
export function installGlobalCrashHandlers(target: Window = window): void {
  target.addEventListener('error', event => {
    // Resource load errors (an image) have no error object and are not crashes.
    if (!event.error && !event.message) return
    reportCrash(crashRecord(event.error ?? event.message, 'error'))
  })
  target.addEventListener('unhandledrejection', event => { reportCrash(crashRecord(event.reason, 'promise')) })
}

/** Decide whether an automatic reload is allowed now, and remember it. Stops reload loops. */
export function claimAutoReload(now: number = Date.now(), storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): boolean {
  let recent: number[] = []
  try { recent = (JSON.parse(storage.getItem(AUTO_RELOAD_KEY) ?? '[]') as unknown[]).filter((value): value is number => typeof value === 'number' && now - value < AUTO_RELOAD_WINDOW_MS) } catch { recent = [] }
  if (recent.length >= AUTO_RELOAD_LIMIT) return false
  try { storage.setItem(AUTO_RELOAD_KEY, JSON.stringify([...recent, now])) } catch { return false }
  return true
}

/** `behavior: 'instant'` is not understood by every Safari; scrolling to the top must never throw. */
export function scrollToTop(): void {
  try { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) } catch {
    try { window.scrollTo(0, 0) } catch { /* Nothing to scroll. */ }
  }
}
