import { useCallback, useEffect, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import type { User } from '@supabase/supabase-js'
import { createEmptyWorkspace, createSeedWorkspace } from '../lib/seed'
import { supabase, supabaseConfigurationError } from '../lib/supabase'
import type { AuthResult, SyncStatus, Workspace } from '../lib/types'
import { isWorkspace, migrateWorkspace } from '../lib/workspaceValidation'
import { applyBirthdayReminders } from '../lib/birthdays'
import { mergeWorkspaceChanges } from '../lib/workspaceMerge'

export { isWorkspace } from '../lib/workspaceValidation'

interface CachedWorkspace {
  version: 1
  workspace: Workspace
  revision: number | null
  dirty: boolean
}

interface Context extends CachedWorkspace {
  ownerId: string | null
}

interface RemoteWorkspace {
  data: Workspace
  revision: number
}

const prefix = 'forma:workspace:v1:'
const cacheKey = (ownerId: string | null) => `${prefix}${ownerId ?? 'guest'}`
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
const blockedRecovery = new Set<string>()

function readCache(ownerId: string | null): CachedWorkspace | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(cacheKey(ownerId))
    if (!raw) { blockedRecovery.delete(cacheKey(ownerId)); return null }
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.version !== 1 || !isWorkspace(value.workspace)) throw new Error('Invalid workspace cache')
    if (typeof value.dirty !== 'boolean' || (value.revision !== null && (!Number.isInteger(value.revision) || Number(value.revision) < 1))) throw new Error('Invalid revision')
    blockedRecovery.delete(cacheKey(ownerId))
    return { version: 1, workspace: migrateWorkspace(value.workspace), revision: value.revision as number | null, dirty: value.dirty === true }
  } catch {
    // Preserve unsupported/corrupt data before an initial workspace replaces the active cache.
    if (raw) {
      try { localStorage.setItem(`${cacheKey(ownerId)}:recovery:${Date.now()}`, raw); blockedRecovery.delete(cacheKey(ownerId)) }
      catch { blockedRecovery.add(cacheKey(ownerId)) }
    }
    return null
  }
}

function writeCache(context: Context): string | null {
  if (blockedRecovery.has(cacheKey(context.ownerId))) {
    readCache(context.ownerId)
    if (blockedRecovery.has(cacheKey(context.ownerId))) return 'Din tidigare tavla kunde inte säkerhetskopieras. Originalet har bevarats. Frigör lagringsutrymme och försök igen.'
  }
  try {
    const { ownerId, ...cache } = context
    localStorage.setItem(cacheKey(ownerId), JSON.stringify(cache))
    return null
  } catch {
    return 'Dina ändringar finns kvar här, men kunde inte sparas på enheten. Frigör lagringsutrymme och försök igen innan du laddar om.'
  }
}

function initialContext(ownerId: string | null): Context {
  return {
    ownerId,
    ...(readCache(ownerId) ?? {
      version: 1 as const,
      workspace: migrateWorkspace(ownerId ? createEmptyWorkspace() : createSeedWorkspace()),
      revision: null,
      dirty: false,
    }),
  }
}

function errorMessage(error: unknown): string {
  if (!navigator.onLine) return 'Du är offline. Dina ändringar finns kvar på enheten och synkas när du är online.'
  const message = object(error) && typeof error.message === 'string' ? error.message : ''
  if (/fetch|network|timeout/i.test(message)) return 'Molnet svarar inte just nu. Dina ändringar finns kvar på enheten.'
  if (/kanban_workspaces|schema cache|permission denied|relation.*does not exist/i.test(message)) return 'Molntavlan är inte klar ännu. Databastabellen och dess behörigheter behöver anslutas.'
  if (/invalid login credentials/i.test(message)) return 'E-postadressen eller lösenordet stämmer inte.'
  if (/email not confirmed/i.test(message)) return 'Bekräfta din e-postadress innan du loggar in.'
  if (/user already registered/i.test(message)) return 'Det finns redan ett konto med den e-postadressen.'
  if (/rate limit|too many requests|security purposes/i.test(message)) return 'För många försök på kort tid. Vänta en stund och försök igen.'
  return message || 'Något gick fel. Dina ändringar finns kvar på enheten.'
}

const conflictMessage = 'Tavlan har ändrats på en annan enhet. Välj vilken version du vill behålla.'

export function useWorkspace() {
  const [context, setContext] = useState<Context>(() => initialContext(null))
  const contextRef = useRef(context)
  const cacheBase = useRef(context)
  const storageFailure = useRef<string | null>(null)
  const cacheConflict = useRef(false)
  const unsavedOwners = useRef(new Map<string | null, { context: Context; base: Context; failure: string }>())
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [loading, setLoading] = useState(!!supabase)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [syncTick, setSyncTick] = useState(0)
  const hydrated = useRef(false)
  const generation = useRef(0)
  const syncing = useRef(false)
  const remoteConflict = useRef<RemoteWorkspace | null>(null)
  const retryNetwork = useRef(false)
  const ownerId = user?.id ?? null
  const activeOwner = useRef(ownerId)
  activeOwner.current = ownerId

  const latestContext = useCallback((): Context => {
    cacheConflict.current = false
    const current = contextRef.current
    const saved = readCache(current.ownerId)
    if (!saved) return current
    const disk = { ...saved, ownerId: current.ownerId }
    if (JSON.stringify(disk) === JSON.stringify(cacheBase.current)) return current
    const workspace = storageFailure.current && cacheBase.current.ownerId === current.ownerId
      ? mergeWorkspaceChanges(cacheBase.current.workspace, current.workspace, disk.workspace) : disk.workspace
    if (!isWorkspace(workspace)) {
      cacheConflict.current = true
      storageFailure.current = 'Tavlan har ändrats i en annan flik. Dina osparade ändringar finns kvar här. Stäng inte fliken; kontrollera tavlan och försök igen.'
      setSyncError(storageFailure.current)
      setSyncStatus('error')
      return current
    }
    cacheBase.current = disk
    const next = { ...disk, workspace, dirty: disk.dirty || (current.ownerId !== null && workspace !== disk.workspace) }
    contextRef.current = next
    setContext(next)
    return next
  }, [])

  const applyContext = useCallback((next: Context) => {
    next = { ...next, workspace: migrateWorkspace(next.workspace) }
    contextRef.current = next
    setContext(next)
    const failure = writeCache(next)
    storageFailure.current = failure
    if (!failure) { cacheBase.current = next; unsavedOwners.current.delete(next.ownerId) }
    else unsavedOwners.current.set(next.ownerId, { context: next, base: cacheBase.current, failure })
    if (failure) {
      setSyncError(failure)
      setSyncStatus('error')
    }
    return failure
  }, [])

  const setWorkspace = useCallback((value: SetStateAction<Workspace>): string | null => {
    if (!authReady || loading || activeOwner.current !== ownerId || contextRef.current.ownerId !== ownerId) return 'Vänta tills din tavla har laddats.'
    const current = latestContext()
    if (cacheConflict.current) return storageFailure.current
    const next = applyBirthdayReminders(typeof value === 'function' ? value(current.workspace) : value)
    if (!isWorkspace(next)) {
      const message = 'Tavlan ändrades medan du redigerade. Kontrollera uppgiftens kolumn och projekt och försök igen.'
      setSyncError(message); setSyncStatus('error')
      return message
    }
    if (next === current.workspace && !storageFailure.current) return null
    const failure = applyContext({ ...current, workspace: next, dirty: current.ownerId !== null })
    if (!failure && !current.ownerId) {
      setSyncError(null)
      setSyncStatus('local')
    }
    return failure
  }, [applyContext, latestContext, ownerId, authReady, loading])

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== cacheKey(contextRef.current.ownerId) || !event.newValue) return
      latestContext()
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [latestContext])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    // Supabase auth callbacks remain synchronous to avoid auth-lock deadlocks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setSyncError(errorMessage(error))
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    }).catch(error => {
      if (!alive) return
      setSyncError(errorMessage(error))
      setAuthReady(true)
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!authReady) return
    const run = ++generation.current
    hydrated.current = false
    cacheConflict.current = false
    remoteConflict.current = null
    syncing.current = false
    // Retain the newest in-memory edits when retrying after a failed cache write.
    const preserved = unsavedOwners.current.get(ownerId)
    let current = contextRef.current.ownerId === ownerId ? latestContext() : preserved?.context ?? initialContext(ownerId)
    if (cacheConflict.current) { setLoading(false); return }
    if (cacheBase.current.ownerId !== ownerId) {
      cacheBase.current = preserved?.base ?? current
      storageFailure.current = preserved?.failure ?? null
      contextRef.current = current
      current = latestContext()
    }
    const cacheFailure = applyContext(current)
    setLoading(!!ownerId)
    if (!cacheFailure) setSyncError(null)
    if (!ownerId || !supabase) {
      hydrated.current = true
      setLoading(false)
      if (!cacheFailure) setSyncStatus('local')
      return
    }
    if (!navigator.onLine) {
      retryNetwork.current = true
      setLoading(false)
      if (!cacheFailure) {
        setSyncStatus('offline')
        setSyncError(errorMessage(new Error('offline')))
      }
      return
    }
    retryNetwork.current = false
    setSyncStatus('syncing')
    const client = supabase
    let alive = true

    void (async () => {
      try {
        const { data, error } = await client.from('kanban_workspaces').select('data,revision').eq('user_id', ownerId).maybeSingle()
        if (!alive || run !== generation.current) return
        if (error) throw error
        const local = latestContext()
        if (cacheConflict.current) return
        if (data) {
          if (!isWorkspace(data.data) || !Number.isInteger(data.revision) || data.revision < 1) throw new Error('Molntavlan har ett format som inte stöds. Din lokala kopia finns kvar.')
          if (local.dirty && local.revision !== data.revision) {
            remoteConflict.current = data as RemoteWorkspace
            setSyncStatus('conflict')
            setSyncError(conflictMessage)
          } else if (local.dirty) {
            setSyncStatus('syncing')
          } else {
            const failure = applyContext({ ...local, workspace: data.data, revision: data.revision, dirty: false })
            if (!failure) setSyncStatus('synced')
          }
        } else if (local.revision !== null) {
          throw new Error('Molntavlan kunde inte hittas. Din lokala kopia finns kvar. Försök igen innan du gör fler ändringar.')
        } else {
          // A new account gets an empty workspace; guest examples are imported only by choice.
          applyContext({ ...local, dirty: true })
        }
        hydrated.current = true
        setSyncTick(tick => tick + 1)
      } catch (error) {
        if (!alive || run !== generation.current) return
        retryNetwork.current = !navigator.onLine || /fetch|network|timeout|load failed/i.test(object(error) && typeof error.message === 'string' ? error.message : '')
        setSyncError(storageFailure.current ?? errorMessage(error))
        setSyncStatus(storageFailure.current || !retryNetwork.current ? 'error' : 'offline')
      } finally {
        if (alive && run === generation.current) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [ownerId, authReady, refresh, applyContext, latestContext])

  useEffect(() => {
    if (!authReady || loading || contextRef.current.ownerId !== ownerId) return
    const checkBirthdays = () => {
      if (document.visibilityState === 'visible') setWorkspace(current => current)
    }
    checkBirthdays()
    const timer = window.setInterval(checkBirthdays, 60_000)
    window.addEventListener('focus', checkBirthdays)
    document.addEventListener('visibilitychange', checkBirthdays)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', checkBirthdays)
      document.removeEventListener('visibilitychange', checkBirthdays)
    }
  }, [ownerId, authReady, loading, setWorkspace])

  useEffect(() => {
    if (!supabase || !ownerId || context.ownerId !== ownerId || !context.dirty || !hydrated.current || remoteConflict.current || syncing.current) return
    const client = supabase
    const timer = window.setTimeout(() => {
      const run = generation.current
      const snapshot = latestContext()
      if (cacheConflict.current) return
      if (snapshot.ownerId !== ownerId || remoteConflict.current || syncing.current) return
      if (!navigator.onLine) {
        setSyncStatus('offline')
        setSyncError(errorMessage(new Error('offline')))
        return
      }
      syncing.current = true
      setSyncStatus('syncing')
      setSyncError(null)
      void (async () => {
        try {
          const result = snapshot.revision === null
            ? await client.from('kanban_workspaces').insert({ user_id: ownerId, data: snapshot.workspace }).select('revision').single()
            : await client.from('kanban_workspaces').update({ data: snapshot.workspace }).eq('user_id', ownerId).eq('revision', snapshot.revision).select('revision').maybeSingle()
          if (run !== generation.current) return
          const collision = result.error?.code === '23505' || (!result.error && !result.data)
          if (collision) {
            const remote = await client.from('kanban_workspaces').select('data,revision').eq('user_id', ownerId).single()
            if (run !== generation.current) return
            if (remote.error) throw remote.error
            if (!isWorkspace(remote.data.data) || !Number.isInteger(remote.data.revision) || remote.data.revision < 1) throw new Error('Molntavlan har ett format som inte stöds.')
            remoteConflict.current = remote.data as RemoteWorkspace
            setSyncStatus('conflict')
            setSyncError(conflictMessage)
            return
          }
          if (result.error) throw result.error
          if (!Number.isInteger(result.data?.revision) || result.data!.revision < 1) throw new Error('Molntavlans version kunde inte bekräftas. Din lokala kopia finns kvar.')
          const current = latestContext()
          if (cacheConflict.current) return
          const failure = applyContext({ ...current, revision: result.data!.revision, dirty: current.workspace !== snapshot.workspace })
          if (!failure) {
            setSyncError(null)
            setSyncStatus(current.workspace === snapshot.workspace ? 'synced' : 'syncing')
          }
        } catch (error) {
          if (run !== generation.current) return
          // Retry temporary connection failures after re-reading the server revision.
          retryNetwork.current = !navigator.onLine || /fetch|network|timeout|load failed/i.test(object(error) && typeof error.message === 'string' ? error.message : '')
          hydrated.current = false
          setSyncError(storageFailure.current ?? errorMessage(error))
          setSyncStatus(storageFailure.current || !retryNetwork.current ? 'error' : 'offline')
        } finally {
          if (run === generation.current) {
            syncing.current = false
            setSyncTick(tick => tick + 1)
          }
        }
      })()
    }, 450)
    return () => window.clearTimeout(timer)
  }, [context, ownerId, syncTick, applyContext, latestContext])

  const retrySync = useCallback(() => setRefresh(value => value + 1), [])

  useEffect(() => {
    const reconnect = () => retrySync()
    const refreshOnFocus = () => { if (navigator.onLine && document.visibilityState === 'visible' && ownerId) retrySync() }
    const retryConnection = () => { if (ownerId && navigator.onLine && document.visibilityState === 'visible' && retryNetwork.current && !syncing.current) retrySync() }
    const timer = window.setInterval(retryConnection, 15_000)
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', reconnect)
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('offline', reconnect)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [ownerId, retrySync])

  const resolveConflict = useCallback((choice: 'local' | 'remote') => {
    const remote = remoteConflict.current
    if (!remote || contextRef.current.ownerId !== ownerId) return
    if (choice === 'remote') {
      // Keep a recoverable copy before the user chooses the cloud version.
      try { localStorage.setItem(`${cacheKey(ownerId)}:backup`, JSON.stringify(contextRef.current)) }
      catch { setSyncError('Din lokala version kunde inte säkerhetskopieras. Frigör lagringsutrymme innan du byter version.'); return }
    }
    const current = latestContext()
    if (cacheConflict.current) return
    const failure = applyContext({ ...current, workspace: choice === 'remote' ? remote.data : current.workspace, revision: remote.revision, dirty: choice === 'local' })
    remoteConflict.current = null
    hydrated.current = true
    if (!failure) {
      setSyncError(null)
      setSyncStatus(choice === 'local' ? 'syncing' : 'synced')
    }
    setSyncTick(value => value + 1)
  }, [ownerId, applyContext, latestContext])

  const importLocalWorkspace = useCallback((): AuthResult => {
    if (!ownerId || contextRef.current.ownerId !== ownerId || loading) return { error: 'Logga in och vänta tills din tavla har laddats.' }
    const guest = readCache(null)
    if (!guest) return { error: 'Det finns ingen lokal tavla att importera.' }
    const current = latestContext()
    if (cacheConflict.current) return { error: storageFailure.current }
    if (current.workspace.tasks.length || current.workspace.projects.length || current.workspace.birthdays?.length
      || current.workspace.workouts?.length || current.workspace.nutritionHabits?.length || current.workspace.nutritionCompletions?.length
      || current.workspace.recipes?.length || current.workspace.notes?.length || current.workspace.birthdayNotifications?.length) return { error: 'Din molntavla innehåller redan innehåll. Importera bara till en tom tavla.' }
    const error = setWorkspace(guest.workspace)
    return { error, message: error ? undefined : 'Din lokala tavla har kopierats till kontot. Originalet finns kvar på enheten.' }
  }, [ownerId, loading, setWorkspace, latestContext])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: supabaseConfigurationError }
    const current = latestContext()
    if (cacheConflict.current) return { error: storageFailure.current }
    const cacheError = applyContext(current)
    if (cacheError) return { error: cacheError }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return { error: error ? errorMessage(error) : null }
    } catch (error) { return { error: errorMessage(error) } }
  }, [applyContext, latestContext])

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { error: supabaseConfigurationError }
    const current = latestContext()
    if (cacheConflict.current) return { error: storageFailure.current }
    const cacheError = applyContext(current)
    if (cacheError) return { error: cacheError }
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } })
      return { error: error ? errorMessage(error) : null, message: !error && !data.session ? 'Kontrollera din inkorg och bekräfta din e-postadress. Din lokala tavla finns kvar här.' : undefined }
    } catch (error) { return { error: errorMessage(error) } }
  }, [applyContext, latestContext])

  const signOut = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) return { error: null }
    const current = latestContext()
    if (cacheConflict.current) return { error: storageFailure.current }
    const cacheError = applyContext(current)
    if (cacheError) return { error: cacheError }
    try {
      // Local scope signs out this device; account/guest caches are deliberately retained.
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      return { error: error ? errorMessage(error) : null }
    } catch (error) { return { error: errorMessage(error) } }
  }, [applyContext, latestContext])

  return { workspace: context.workspace, setWorkspace, user, loading: loading || !authReady || context.ownerId !== ownerId, syncStatus, syncError, signIn, signUp, signOut, retrySync, resolveConflict, importLocalWorkspace }
}
