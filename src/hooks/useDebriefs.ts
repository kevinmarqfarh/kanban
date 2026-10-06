import { useCallback, useEffect, useRef, useState } from 'react'
import type { DailyDebrief } from '../lib/types'
import { dismissDebrief, isDailyDebrief, markDebriefRead, mergeDebrief, parseDebriefPayload, unreadDebriefs } from '../lib/debriefs'
import { supabase } from '../lib/supabase'
import { mergeRecordChanges } from '../lib/workspaceMerge'
import { isIsoTimestamp } from '../lib/workspaceValidation'

interface PendingState {
  readAt: string | null
  dismissedAt: string | null
  content: string
}

interface DebriefCache {
  version: 1
  entries: DailyDebrief[]
  pending: Record<string, PendingState>
}

interface Context extends DebriefCache { ownerId: string | null }

const cacheKey = (ownerId: string | null) => `forma:debriefs:v1:${ownerId ?? 'guest'}`
const contentKey = (entry: DailyDebrief) => JSON.stringify([entry.title, entry.summary, entry.body, entry.createdAt])
const storageError = 'Debriefingen finns kvar här, men kunde inte sparas på enheten. Frigör utrymme och försök igen.'
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nullableDate = (value: unknown) => value === null || isIsoTimestamp(value)
const blockedRecovery = new Set<string>()

function readCache(ownerId: string | null): Context | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(cacheKey(ownerId))
    if (!raw) { blockedRecovery.delete(cacheKey(ownerId)); return null }
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.version !== 1 || !Array.isArray(value.entries) || !value.entries.every(isDailyDebrief)
      || new Set(value.entries.map(entry => entry.id)).size !== value.entries.length || !object(value.pending)
      || !Object.values(value.pending).every(state => object(state) && nullableDate(state.readAt) && nullableDate(state.dismissedAt) && typeof state.content === 'string')) throw new Error('Invalid cache')
    blockedRecovery.delete(cacheKey(ownerId))
    return { ownerId, version: 1, entries: value.entries, pending: value.pending as unknown as Record<string, PendingState> }
  } catch {
    if (raw) {
      try { localStorage.setItem(`${cacheKey(ownerId)}:recovery:${Date.now()}`, raw); blockedRecovery.delete(cacheKey(ownerId)) }
      catch { blockedRecovery.add(cacheKey(ownerId)) }
    }
    return null
  }
}

function initialContext(ownerId: string | null): Context {
  return readCache(ownerId) ?? { ownerId, version: 1, entries: [], pending: {} }
}

function mergeCache(base: Context, edited: Context, latest: Context): Context {
  const originals = new Map(base.entries.map(entry => [entry.id, entry]))
  const changes = new Map(edited.entries.map(entry => [entry.id, entry]))
  const entries = latest.entries.map(entry => {
    const before = originals.get(entry.id)
    const changed = changes.get(entry.id)
    if (!before || !changed || JSON.stringify(before) === JSON.stringify(changed)) return entry
    if (contentKey(before) !== contentKey(changed)) return changed
    // An old read/dismiss update never applies to newly revised server content.
    return contentKey(before) === contentKey(entry) ? mergeRecordChanges(before, changed, entry) : entry
  })
  for (const entry of edited.entries) if (!originals.has(entry.id) && !entries.some(current => current.id === entry.id)) entries.push(entry)
  const pending = { ...latest.pending }
  for (const [id, state] of Object.entries(edited.pending)) {
    if (JSON.stringify(state) === JSON.stringify(base.pending[id])) continue
    const entry = entries.find(entry => entry.id === id)
    if (entry && state.content === contentKey(entry)) pending[id] = { readAt: entry.readAt, dismissedAt: entry.dismissedAt, content: contentKey(entry) }
  }
  return { ...latest, entries: entries.sort((a, b) => b.date.localeCompare(a.date)), pending }
}

function writeCache(context: Context): string | null {
  if (blockedRecovery.has(cacheKey(context.ownerId))) {
    readCache(context.ownerId)
    if (blockedRecovery.has(cacheKey(context.ownerId))) return 'Dina tidigare debriefingar kunde inte säkerhetskopieras. Originalet har bevarats. Frigör lagringsutrymme och försök igen.'
  }
  try {
    const { ownerId, ...cache } = context
    localStorage.setItem(cacheKey(ownerId), JSON.stringify(cache))
    return null
  } catch { return storageError }
}

function feedError(error: unknown): string {
  if (!navigator.onLine) return 'Du är offline. Sparade debriefingar finns kvar. Nya hämtas när du är online.'
  const message = object(error) && typeof error.message === 'string' ? error.message : ''
  if (/daily_debriefs|schema cache|permission denied|relation.*does not exist/i.test(message)) return 'Inkorgen för debriefingar behöver anslutas till molnet. Sparade sammanfattningar finns kvar.'
  return 'Nya debriefingar kunde inte hämtas just nu. Dina sparade sammanfattningar finns kvar.'
}

/** A separate feed keeps automation writes independent of kanban edits. */
export function useDebriefs(ownerId: string | null, ready: boolean) {
  const [context, setContext] = useState<Context>(() => initialContext(ownerId))
  const contextRef = useRef(context)
  const cacheBase = useRef(context)
  const storageFailure = useRef<string | null>(null)
  const unsavedOwners = useRef(new Map<string | null, { context: Context; base: Context; failure: string }>())
  const activeOwner = useRef(ownerId)
  activeOwner.current = ownerId
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const latestContext = useCallback((): Context => {
    const current = contextRef.current
    const saved = readCache(current.ownerId)
    if (!saved || JSON.stringify(saved) === JSON.stringify(cacheBase.current)) return current
    const next = storageFailure.current && cacheBase.current.ownerId === current.ownerId
      ? mergeCache(cacheBase.current, current, saved) : saved
    cacheBase.current = saved
    contextRef.current = next
    setContext(next)
    return next
  }, [])
  const commit = useCallback((next: Context) => {
    contextRef.current = next
    setContext(next)
    const failure = writeCache(next)
    storageFailure.current = failure
    if (!failure) { cacheBase.current = next; unsavedOwners.current.delete(next.ownerId) }
    else unsavedOwners.current.set(next.ownerId, { context: next, base: cacheBase.current, failure })
    if (failure) setError(failure)
    return failure
  }, [])

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === cacheKey(contextRef.current.ownerId) && event.newValue) latestContext()
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [latestContext])

  useEffect(() => {
    if (!ready) return
    if (contextRef.current.ownerId !== ownerId) {
      const preserved = unsavedOwners.current.get(ownerId)
      const next = preserved?.context ?? initialContext(ownerId)
      cacheBase.current = preserved?.base ?? next
      storageFailure.current = preserved?.failure ?? null
      contextRef.current = next
      setContext(next)
      setError(null)
    }
    const cacheFailure = commit(latestContext())
    if (cacheFailure) setError(cacheFailure)
    else setError(null)
    if (!ownerId || !supabase) return
    const client = supabase
    let alive = true
    let running = false
    let blocked = false
    const currentOwner = () => alive && activeOwner.current === ownerId && contextRef.current.ownerId === ownerId

    const poll = async () => {
      if (!currentOwner() || running || blocked || document.visibilityState !== 'visible') return
      running = true
      try {
        // Retry read/dismiss states first; their local overlay also protects an offline visit.
        for (const [id, pending] of Object.entries(latestContext().pending)) {
          const entry = contextRef.current.entries.find(entry => entry.id === id)
          if (!entry) continue
          const result = await client.from('daily_debriefs').update({ read_at: pending.readAt, dismissed_at: pending.dismissedAt })
            .eq('user_id', ownerId).eq('date', entry.date).eq('created_at', entry.createdAt).select('date')
          if (!currentOwner()) return
          if (result.error) throw result.error
          const current = latestContext()
          if (JSON.stringify(current.pending[id]) === JSON.stringify(pending)) {
            const nextPending = { ...current.pending }
            delete nextPending[id]
            commit({ ...current, pending: nextPending })
          }
        }
        const snapshot = latestContext()
        const result = await client.from('daily_debriefs').select('date,title,summary,body,created_at,read_at,dismissed_at')
          .eq('user_id', ownerId).order('date', { ascending: false })
        if (!currentOwner()) return
        if (result.error) throw result.error
        const entries: DailyDebrief[] = (result.data ?? []).map(row => ({
          id: row.date, date: row.date, title: row.title, summary: row.summary, body: row.body,
          createdAt: row.created_at, readAt: row.read_at, dismissedAt: row.dismissed_at,
        }))
        if (!entries.every(isDailyDebrief)) throw new Error('Invalid debrief format')
        const current = latestContext()
        const overlaid = entries.map(entry => {
          const pending = current.pending[entry.id]
          return pending && pending.content === contentKey(entry)
            ? { ...entry, readAt: pending.readAt, dismissedAt: pending.dismissedAt } : entry
        })
        const failure = commit(mergeCache(snapshot, current, { ...current, entries: overlaid }))
        if (!failure) setError(null)
      } catch (failure) {
        if (!currentOwner()) return
        const message = object(failure) && typeof failure.message === 'string' ? failure.message : ''
        if (/schema cache|permission denied|relation.*does not exist/i.test(message)) blocked = true
        setError(storageFailure.current ?? feedError(failure))
      } finally { running = false }
    }
    void poll()
    const check = () => { void poll() }
    const timer = window.setInterval(check, 60_000)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [ownerId, ready, refresh, commit, latestContext])

  const updateState = useCallback((id: string, action: 'read' | 'dismiss') => {
    if (!ready || activeOwner.current !== ownerId || contextRef.current.ownerId !== ownerId) return
    const current = latestContext()
    const entries = action === 'read' ? markDebriefRead(current.entries, id) : dismissDebrief(current.entries, id)
    if (entries === current.entries) {
      if (storageFailure.current && !commit(current)) setError(null)
      return
    }
    const entry = entries.find(entry => entry.id === id)!
    const pending = ownerId ? { ...current.pending, [id]: { readAt: entry.readAt, dismissedAt: entry.dismissedAt, content: contentKey(entry) } } : current.pending
    const failure = commit({ ...current, entries, pending })
    if (!failure) setError(null)
    if (ownerId) setRefresh(value => value + 1)
  }, [ownerId, ready, commit, latestContext])

  const importDebrief = useCallback(async (value: unknown): Promise<string | null> => {
    if (!ready || activeOwner.current !== ownerId || contextRef.current.ownerId !== ownerId) return 'Vänta tills din inkorg har laddats.'
    try {
      const values = Array.isArray(value) ? value : [value]
      if (!values.length || values.length > 100) return 'Välj en fil med 1–100 debriefingar.'
      const incoming = values.map(value => parseDebriefPayload(value))
      if (new Set(incoming.map(entry => entry.id)).size !== incoming.length) return 'Filen innehåller flera debriefingar för samma dag.'
      if (ownerId && supabase) {
        const result = await supabase.from('daily_debriefs').insert(incoming.map(entry => ({
          user_id: ownerId, date: entry.date, title: entry.title, summary: entry.summary, body: entry.body, created_at: entry.createdAt,
        })))
        if (activeOwner.current !== ownerId) return 'Kontot ändrades. Läs in filen igen i rätt inkorg.'
        if (result.error?.code === '23505') return 'Det finns redan en debriefing för den dagen.'
        if (result.error) throw result.error
      }
      const latest = latestContext()
      const entries = incoming.reduce((list, entry) => mergeDebrief(list, entry), latest.entries)
      if (entries === latest.entries && !storageFailure.current) return null
      const failure = commit({ ...latest, entries })
      if (!failure) setError(null)
      if (ownerId) setRefresh(value => value + 1)
      return failure
    } catch (failure) {
      return failure instanceof Error ? failure.message : feedError(failure)
    }
  }, [ownerId, ready, commit, latestContext])

  const entries = ready && context.ownerId === ownerId ? context.entries : []
  return {
    debriefs: entries,
    unread: unreadDebriefs(entries),
    error,
    markRead: (id: string) => updateState(id, 'read'),
    dismiss: (id: string) => updateState(id, 'dismiss'),
    importDebrief,
    retry: () => setRefresh(value => value + 1),
  }
}
