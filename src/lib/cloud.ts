// Network helpers that work on every browser Forma supports, including Safari 15.4–15.x
// (iPad mini 4 / iPad Air 2 / iPad 5th gen stay on iPadOS 15.8). Those browsers lack
// AbortSignal.timeout (Safari 16) and AbortSignal.any (Safari 17.4), so neither is used here.

export const REQUEST_TIMEOUT_MS = 15_000
export const TIMEOUT_MESSAGE = 'Request timeout: molnet svarade inte i tid.'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** fetch with a time limit that also honours a caller's own abort signal. */
export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeout = REQUEST_TIMEOUT_MS, fetchImpl: Fetch = fetch): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
  const outer = init.signal
  const forward = () => controller.abort()
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', forward, { once: true })
  }
  return fetchImpl(input, { ...init, signal: controller.signal })
    .catch(error => { throw timedOut ? new Error(TIMEOUT_MESSAGE) : error })
    .finally(() => { clearTimeout(timer); outer?.removeEventListener('abort', forward) })
}

export type CloudErrorKind = 'offline' | 'unsupported' | 'timeout' | 'unreachable' | 'setup' | 'credentials' | 'unconfirmed' | 'exists' | 'rate-limit' | 'other'

const patterns: [CloudErrorKind, RegExp][] = [
  // A missing browser API must never be mistaken for an outage (that is how the iPad bug hid).
  ['unsupported', /is not a function|is not a constructor|is not defined|undefined is not an object|not supported/i],
  ['timeout', /timeout|timed out|tog för lång tid/i],
  ['unreachable', /failed to fetch|load failed|networkerror|network request failed|network connection was lost|fetch/i],
  ['setup', /kanban_workspaces|schema cache|permission denied|relation.*does not exist/i],
  ['credentials', /invalid login credentials|invalid_credentials/i],
  ['unconfirmed', /email not confirmed/i],
  ['exists', /user already registered/i],
  ['rate-limit', /rate limit|too many requests|security purposes/i],
]

export function cloudErrorKind(message: string, online = true): CloudErrorKind {
  if (!online) return 'offline'
  return patterns.find(([, pattern]) => pattern.test(message))?.[0] ?? 'other'
}

export const cloudErrorText: Record<Exclude<CloudErrorKind, 'other'>, string> = {
  offline: 'Du är offline. Dina ändringar finns kvar på enheten och synkas när du är online.',
  unsupported: 'Webbläsaren saknar en funktion som molnsynken behöver. Ladda om sidan; hjälper det inte, uppdatera Safari. Dina ändringar finns kvar på enheten.',
  timeout: 'Molnet svarade inte i tid. Kontrollera anslutningen och försök igen. Dina ändringar finns kvar på enheten.',
  unreachable: 'Kunde inte nå molnet. Kontrollera internetanslutningen och försök igen. Dina ändringar finns kvar på enheten.',
  setup: 'Molntavlan är inte klar ännu. Databastabellen och dess behörigheter behöver anslutas.',
  credentials: 'E-postadressen eller lösenordet stämmer inte.',
  unconfirmed: 'Bekräfta din e-postadress innan du loggar in.',
  exists: 'Det finns redan ett konto med den e-postadressen.',
  'rate-limit': 'För många försök på kort tid. Vänta en stund och försök igen.',
}

export function cloudErrorMessage(error: unknown, online = true): string {
  const message = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : ''
  const kind = cloudErrorKind(message, online)
  return kind === 'other' ? message || 'Något gick fel. Dina ändringar finns kvar på enheten.' : cloudErrorText[kind]
}

/** Errors worth retrying automatically when the connection comes back. */
export function isRetryableNetworkError(error: unknown, online = true): boolean {
  const message = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : ''
  const kind = cloudErrorKind(message, online)
  return kind === 'offline' || kind === 'timeout' || kind === 'unreachable'
}
