import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Run the real hooks with controlled React scheduling and browser storage.
// No Supabase requests are made; a shared storage hub represents two open tabs.
let activeRunner
const react = {
  useState: initial => activeRunner.state(initial),
  useRef: initial => activeRunner.ref(initial),
  useCallback: (callback, deps) => activeRunner.callback(callback, deps),
  useEffect: (effect, deps) => activeRunner.effect(effect, deps),
}
async function module(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  })
  return exports
}
const seed = await module('../src/lib/seed.ts')
const birthdays = await module('../src/lib/birthdays.ts')
const debriefs = await module('../src/lib/debriefs.ts')
const others = await module('../src/lib/others.ts', { './birthdays': birthdays })
const validation = await module('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })
const merge = await module('../src/lib/workspaceMerge.ts')
const cloudHelpers = await module('../src/lib/cloud.ts')
const backend = { supabase: null, supabaseConfigurationError: 'Molnet är inte anslutet.' }
const { useWorkspace } = await module('../src/hooks/useWorkspace.ts', { react, '../lib/seed': seed, '../lib/supabase': backend, '../lib/workspaceValidation': validation, '../lib/birthdays': birthdays, '../lib/workspaceMerge': merge, '../lib/cloud': cloudHelpers })
const { useDebriefs } = await module('../src/hooks/useDebriefs.ts', { react, '../lib/supabase': backend, '../lib/debriefs': debriefs, '../lib/workspaceMerge': merge, '../lib/workspaceValidation': validation })

const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
class Hub {
  values = new Map()
  runners = []
  notices = []
  storage(runner) {
    return {
      getItem: key => this.values.get(key) ?? null,
      setItem: (key, value) => {
        if (runner.failWrite?.(key)) throw new Error('QuotaExceededError')
        const oldValue = this.values.get(key) ?? null
        this.values.set(key, value)
        if (oldValue !== value) for (const other of this.runners) if (other !== runner) this.notices.push({ runner: other, event: { key, oldValue, newValue: value } })
      },
    }
  }
  deliver() {
    const notices = this.notices.splice(0)
    for (const { runner, event } of notices) runner.run(() => { for (const handler of runner.events.get('storage') ?? []) handler(event) })
  }
}
class Runner {
  online = true
  timers = new Map()
  intervals = new Map()
  timerId = 0
  slots = []
  effects = []
  events = new Map()
  dirty = true
  constructor(hub, hook, args = []) {
    this.hub = hub; this.hook = hook; this.args = args
    this.storage = hub.storage(this)
    hub.runners.push(this)
  }
  environment(fn) {
    activeRunner = this
    globalThis.localStorage = this.storage
    globalThis.window = {
      addEventListener: (name, handler) => { const list = this.events.get(name) ?? new Set(); list.add(handler); this.events.set(name, list) },
      removeEventListener: (name, handler) => this.events.get(name)?.delete(handler),
      setInterval: callback => { const id = ++this.timerId; this.intervals.set(id, callback); return id }, clearInterval: id => this.intervals.delete(id),
      setTimeout: callback => { const id = ++this.timerId; this.timers.set(id, callback); return id }, clearTimeout: id => this.timers.delete(id), location: { origin: 'http://localhost' },
    }
    globalThis.document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} }
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: this.online } })
    return fn()
  }
  slot(initial) { const index = this.cursor++; return this.slots[index] ?? (this.slots[index] = initial()) }
  state(initial) {
    const slot = this.slot(() => ({ value: typeof initial === 'function' ? initial() : initial }))
    slot.set ??= value => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; this.dirty = true } }
    return [slot.value, slot.set]
  }
  ref(initial) { return this.slot(() => ({ current: initial })) }
  callback(callback, deps) { const slot = this.slot(() => ({})); if (!sameDeps(slot.deps, deps)) { slot.value = callback; slot.deps = deps } return slot.value }
  effect(effect, deps) { const slot = this.slot(() => ({})); if (!sameDeps(slot.deps, deps)) { slot.deps = deps; this.effects.push({ slot, effect }) } }
  render() {
    let count = 0
    while (this.dirty) {
      assert.ok(++count < 40, 'Hook scheduling must settle without a render loop.')
      this.dirty = false; this.cursor = 0
      this.environment(() => { this.result = this.hook(...this.args); for (const { slot, effect } of this.effects.splice(0)) { slot.cleanup?.(); slot.cleanup = effect() } })
    }
    return this.result
  }
  run(fn) { const result = this.environment(() => fn(this.result)); this.render(); return result }
  changeArgs(...args) { this.args = args; this.dirty = true; return this.render() }
}

const task = id => ({ id, title: `Uppgift ${id}`, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: '2026-10-05T08:00:00.000Z' })
const payload = (date, body = 'En enkel sammanfattning.') => ({ date, title: `Debrief ${date}`, summary: 'Dagens fokus.', body })
const workKey = 'forma:workspace:v1:guest'
const feedKey = 'forma:debriefs:v1:guest'

const hub = new Hub()
const first = new Runner(hub, useWorkspace)
first.render()
const second = new Runner(hub, useWorkspace)
second.render()
assert.equal(first.run(data => data.setWorkspace(current => ({ ...current, tasks: [...current.tasks, task('new-a')] }))), null)
// Deliberately do not deliver the storage event before the older tab edits.
assert.equal(second.run(data => data.setWorkspace(current => ({ ...current, tasks: [...current.tasks, task('new-b')] }))), null)
assert.ok(JSON.parse(hub.values.get(workKey)).workspace.tasks.some(task => task.id === 'new-a'), 'Reading the newest cache before each update preserves cards added by another tab.')
hub.deliver()
assert.ok(first.result.workspace.tasks.some(task => task.id === 'new-b'), 'Storage events update other open tabs.')
const reloaded = new Runner(hub, useWorkspace)
reloaded.render()
assert.ok(reloaded.result.workspace.tasks.some(task => task.id === 'new-a') && reloaded.result.workspace.tasks.some(task => task.id === 'new-b'), 'Both cards survive reload.')

first.failWrite = () => true
const failed = first.run(data => data.setWorkspace(current => ({ ...current, tasks: [...current.tasks, task('unsaved-a')] })))
assert.match(failed, /kunde inte sparas/)
assert.equal(first.result.syncStatus, 'error')
assert.ok(first.result.workspace.tasks.some(task => task.id === 'unsaved-a'), 'A quota failure retains the edit in memory.')
assert.ok(!JSON.parse(hub.values.get(workKey)).workspace.tasks.some(task => task.id === 'unsaved-a'), 'A failed write never reports itself as persisted.')
second.run(data => data.setWorkspace(current => ({ ...current, tasks: [...current.tasks, task('saved-b')] })))
first.failWrite = null
first.run(data => data.retrySync())
const repaired = JSON.parse(hub.values.get(workKey)).workspace
assert.ok(repaired.tasks.some(task => task.id === 'unsaved-a') && repaired.tasks.some(task => task.id === 'saved-b'), 'Retry merges unsaved changes with cards saved in another tab.')
assert.equal(first.result.syncStatus, 'local')
assert.equal(first.result.syncError, null)

const original = task('edited')
original.checklist = [{ id: 'item', title: 'Steg', completed: false }]
const edited = { ...original, title: 'Ny titel', comments: [{ id: 'local-comment', text: 'Lokal', createdAt: original.createdAt }] }
const latest = { ...original, description: 'Ny beskrivning', columnId: 'doing', checklist: [{ ...original.checklist[0], completed: true }, { id: 'remote-item', title: 'Nytt steg', completed: false }], comments: [{ id: 'remote-comment', text: 'Annan flik', createdAt: original.createdAt }] }
const merged = merge.mergeRecordChanges(original, edited, latest)
assert.equal(merged.title, 'Ny titel')
assert.equal(merged.description, 'Ny beskrivning')
assert.equal(merged.columnId, 'doing')
assert.equal(merged.checklist[0].completed, true)
assert.equal(merged.checklist.length, 2)
assert.deepEqual(new Set(merged.comments.map(comment => comment.id)), new Set(['local-comment', 'remote-comment']))
const base = { ...seed.createEmptyWorkspace(), tasks: [original] }
assert.equal(merge.mergeWorkspaceChanges(base, { ...base, tasks: [edited] }, { ...base, tasks: [] }).tasks.length, 0, 'A stale editor/cache never resurrects a remotely deleted card.')

const combinedProject = { id: 'project', title: 'Ett projekt', description: 'Privat', icon: 'folder', color: 'gray', deadline: '2026-10-10', createdAt: original.createdAt }
const person = { id: 'person', name: 'Anna', birthDate: '1995-11-04', reminders: [], generatedReminders: [], createdAt: original.createdAt }
first.run(data => data.setWorkspace(current => ({ ...current, projects: [...current.projects, combinedProject], tasks: [...current.tasks, { ...task('main-task'), projectId: combinedProject.id, checklist: [{ id: 'subtask', title: 'Första steget', completed: true }] }], birthdays: [person] })))
const fullReload = new Runner(hub, useWorkspace)
fullReload.render()
assert.ok(fullReload.result.workspace.projects.some(project => project.id === combinedProject.id))
assert.equal(fullReload.result.workspace.tasks.find(task => task.id === 'main-task').checklist[0].completed, true)
assert.equal(fullReload.result.workspace.birthdays[0].name, 'Anna')
assert.equal(fullReload.result.workspace.tasks.find(task => task.id === 'main-task').projectId, null)
assert.equal(fullReload.result.workspace.projects.find(project => project.id === combinedProject.id).tasks[0].checklist[0].completed, true)
const independentBoard = structuredClone(fullReload.result.workspace.tasks)
fullReload.run(data => data.setWorkspace(current => ({ ...current, projects: current.projects.map(project => project.id === combinedProject.id ? { ...project, tasks: project.tasks.map(task => ({ ...task, completed: true, title: 'Only changed in Projects' })) } : project) })))
assert.deepEqual(fullReload.result.workspace.tasks, independentBoard)
const projectReload = new Runner(hub, useWorkspace)
projectReload.render()
assert.equal(projectReload.result.workspace.projects.find(project => project.id === combinedProject.id).tasks[0].completed, true)
assert.deepEqual(projectReload.result.workspace.tasks, independentBoard)
const independentBase = structuredClone(projectReload.result.workspace)
const projectChange = structuredClone(independentBase)
projectChange.projects.find(project => project.id === combinedProject.id).tasks[0].description = 'Concurrent project edit'
const boardChange = structuredClone(independentBase)
boardChange.tasks.find(task => task.id === 'main-task').title = 'Concurrent board edit'
const independentlyMerged = merge.mergeWorkspaceChanges(independentBase, projectChange, boardChange)
assert.equal(independentlyMerged.tasks.find(task => task.id === 'main-task').title, 'Concurrent board edit')
assert.equal(independentlyMerged.projects.find(project => project.id === combinedProject.id).tasks[0].description, 'Concurrent project edit')


const exercise = { id: 'exercise', title: 'Bänkpress', amount: '3', amountUnit: 'sets', load: '70', loadUnit: 'kg', bpm: '120' }
const workout = { id: 'workout', date: '2026-10-06', rows: [exercise], createdAt: original.createdAt }
const water = { id: 'water', title: 'Vatten', amount: '2', unit: 'l', createdAt: original.createdAt }
const vitamins = { id: 'vitamins', title: 'Vitaminer', amount: '1', unit: 'st', createdAt: original.createdAt }
const recipe = { id: 'soup', title: 'Soppa', url: 'https://example.com/recept', steps: 'Hacka\nKoka', labels: ['Lunch'], createdAt: original.createdAt }
first.run(data => data.setWorkspace(current => ({ ...current, workouts: [workout], nutritionHabits: [water, vitamins], nutritionCompletions: [], recipes: [recipe] })))
second.run(data => data.setWorkspace(current => ({ ...current, recipes: [...current.recipes, { ...recipe, id: 'remote-recipe', title: 'Pasta' }] })))
assert.equal(JSON.parse(hub.values.get(workKey)).workspace.workouts.length, 1, 'A recipe saved in another tab retains the workout module.')
first.failWrite = () => true
assert.match(first.run(data => data.setWorkspace(current => ({
  ...current,
  workouts: current.workouts.map(entry => ({ ...entry, rows: entry.rows.map(row => ({ ...row, amount: '4' })) })),
  nutritionCompletions: [...current.nutritionCompletions, { id: others.nutritionCompletionId(water.id, workout.date), habitId: water.id, date: workout.date, completed: true }],
}))), /kunde inte sparas/)
second.run(data => data.setWorkspace(current => ({
  ...current,
  workouts: current.workouts.map(entry => ({ ...entry, rows: entry.rows.map(row => ({ ...row, load: '75' })) })),
  nutritionCompletions: [...current.nutritionCompletions, { id: others.nutritionCompletionId(vitamins.id, workout.date), habitId: vitamins.id, date: workout.date, completed: true }],
})))
first.failWrite = null
first.run(data => data.retrySync())
const othersReload = new Runner(hub, useWorkspace); othersReload.render()
assert.equal(othersReload.result.workspace.workouts[0].rows[0].amount, '4')
assert.equal(othersReload.result.workspace.workouts[0].rows[0].load, '75', 'Nested workout fields merge across quota failure and another tab.')
assert.equal(othersReload.result.workspace.recipes.length, 2)
assert.equal(othersReload.result.workspace.nutritionCompletions.length, 2)
assert.ok(others.isNutritionComplete(othersReload.result.workspace, water.id, workout.date))
assert.ok(others.isNutritionComplete(othersReload.result.workspace, vitamins.id, workout.date))
assert.equal(others.isNutritionComplete(othersReload.result.workspace, water.id, '2026-10-07'), false)
const occasion = others.addLocalDays(birthdays.localDateString(new Date()), 7)
const notificationPerson = { ...person, id: 'notification-person', birthDate: `1996-${occasion.slice(5)}`, reminders: ['week'] }
const taskCount = first.result.workspace.tasks.length
first.run(data => data.setWorkspace(current => ({ ...current, birthdays: [...current.birthdays, notificationPerson] })))
const notification = first.result.workspace.birthdayNotifications.find(entry => entry.birthdayId === notificationPerson.id)
assert.ok(notification)
assert.equal(first.result.workspace.tasks.length, taskCount, 'Birthday scheduling no longer inserts Kanban tasks.')
first.run(data => data.setWorkspace(current => ({ ...current, birthdayNotifications: current.birthdayNotifications.map(entry => entry.id === notification.id ? { ...entry, readAt: original.createdAt } : entry) })))
const notificationReload = new Runner(hub, useWorkspace); notificationReload.render()
assert.equal(notificationReload.result.workspace.birthdayNotifications.find(entry => entry.id === notification.id).readAt, original.createdAt)
assert.ok(notificationReload.result.workspace.recipes.some(entry => entry.id === 'remote-recipe'))
assert.ok(validation.isWorkspace(notificationReload.result.workspace))

const feedHub = new Hub()
const feedA = new Runner(feedHub, useDebriefs, [null, true]); feedA.render()
const feedB = new Runner(feedHub, useDebriefs, [null, true]); feedB.render()
assert.equal(await feedA.run(data => data.importDebrief(payload('2026-10-05'))), null)
assert.equal(await feedB.run(data => data.importDebrief(payload('2026-10-04'))), null)
assert.equal(JSON.parse(feedHub.values.get(feedKey)).entries.length, 2, 'Two tabs importing different days retain both debriefs.')
feedA.run(data => data.markRead('2026-10-05'))
feedB.run(data => data.dismiss('2026-10-04'))
feedHub.deliver()
assert.equal(feedA.result.unread.length, 0, 'Read/dismiss changes propagate without losing another day.')
const feedReload = new Runner(feedHub, useDebriefs, [null, true]); feedReload.render()
assert.equal(feedReload.result.debriefs.length, 2)
assert.equal(feedReload.result.unread.length, 0)
feedA.failWrite = () => true
assert.match(await feedA.run(data => data.importDebrief(payload('2026-10-03'))), /kunde inte sparas/)
assert.match(await feedA.run(data => data.importDebrief(payload('2026-10-03'))), /kunde inte sparas/, 'Identical imports retry a failed write instead of returning false success.')
feedB.run(data => data.importDebrief(payload('2026-10-02')))
feedA.failWrite = null
feedA.run(data => data.retry())
assert.equal(JSON.parse(feedHub.values.get(feedKey)).entries.length, 4, 'Debrief retry retains unsaved reports and another tab\'s new reports.')
assert.equal(feedA.result.error, null)
assert.ok(!feedHub.values.has(workKey), 'Debrief persistence never modifies the workspace cache.')

const guestEntries = JSON.parse(feedHub.values.get(feedKey)).entries.length
feedA.changeArgs('account-a', true)
assert.equal(feedA.result.debriefs.length, 0, 'A new account does not inherit guest reports.')
await feedA.run(data => data.importDebrief(payload('2026-10-01')))
feedA.changeArgs('account-b', true)
assert.equal(feedA.result.debriefs.length, 0)
feedA.changeArgs(null, true)
assert.equal(feedA.result.debriefs.length, guestEntries, 'Account changes retain the separate guest cache.')
feedA.failWrite = () => true
assert.match(await feedA.run(data => data.importDebrief(payload('2026-09-30'))), /kunde inte sparas/)
feedA.changeArgs('account-c', true)
assert.equal(feedA.result.debriefs.length, 0)
feedA.changeArgs(null, true)
assert.ok(feedA.result.debriefs.some(entry => entry.date === '2026-09-30'), 'An account change must not discard a failed in-memory guest import.')
feedA.failWrite = null
feedA.run(data => data.retry())
assert.ok(JSON.parse(feedHub.values.get(feedKey)).entries.some(entry => entry.date === '2026-09-30'))

const recoveryHub = new Hub()
const unsupported = '{"version":99,"important":"preserve this data"}'
recoveryHub.values.set(workKey, unsupported)
const recovery = new Runner(recoveryHub, useWorkspace)
recovery.failWrite = key => key.includes(':recovery:')
recovery.render()
assert.equal(recoveryHub.values.get(workKey), unsupported, 'A failed recovery backup must never overwrite the original unsupported cache.')
assert.equal(recovery.result.syncStatus, 'error')
recovery.failWrite = null
recovery.run(data => data.retrySync())
assert.ok([...recoveryHub.values.entries()].some(([key, value]) => key.includes(':recovery:') && value === unsupported))
assert.ok(validation.isWorkspace(JSON.parse(recoveryHub.values.get(workKey)).workspace))

console.log('Persistence passed: actual hooks, stale tabs, storage events, quota/retry, reload, projects/subtasks, birthday notifications, workout rows, recipes, daily nutrition, debrief history, account isolation and recovery protection.')

// Exercise the real hooks across lost connectivity, reload and reconnection.
const owner = 'offline-account'
let remoteWorkspace = { data: seed.createEmptyWorkspace(), revision: 1 }
const remoteDebriefs = new Map()
const requests = []
let failNetwork = false
backend.supabase = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    getSession: async () => ({ data: { session: { user: { id: owner } } }, error: null }),
  },
  from(table) {
    assert.ok(['kanban_workspaces', 'daily_debriefs'].includes(table), 'Supabase is the only remote data destination.')
    let action = 'read', body, filters = {}
    const execute = async () => {
      requests.push({ table, action })
      if (failNetwork) return { data: null, error: { message: 'Failed to fetch' } }
      if (table === 'kanban_workspaces') {
        if (action === 'read') return { data: structuredClone(remoteWorkspace), error: null }
        if (filters.revision !== remoteWorkspace.revision) return { data: null, error: null }
        remoteWorkspace = { data: structuredClone(body.data), revision: remoteWorkspace.revision + 1 }
        return { data: { revision: remoteWorkspace.revision }, error: null }
      }
      if (action === 'insert') {
        if (remoteDebriefs.has(body.date)) return { data: null, error: { code: '23505' } }
        remoteDebriefs.set(body.date, { ...body, read_at: null, dismissed_at: null })
        return { data: null, error: null }
      }
      if (action === 'update') {
        const row = remoteDebriefs.get(filters.date)
        if (row && row.created_at === filters.created_at) Object.assign(row, body)
        return { data: row ? [{ date: row.date }] : [], error: null }
      }
      return { data: filters.date ? remoteDebriefs.get(filters.date) : [...remoteDebriefs.values()], error: null }
    }
    const query = {
      select: () => query, eq: (key, value) => { filters[key] = value; return query }, order: () => query,
      insert: value => { action = 'insert'; body = value; return query },
      update: value => { action = 'update'; body = value; return query },
      maybeSingle: execute, single: execute, then: (resolve, reject) => execute().then(resolve, reject),
    }
    return query
  },
}
const settle = async runner => { for (let n = 0; n < 20; n++) { await Promise.resolve(); runner.render() } }
const flushWrites = async runner => {
  const timers = [...runner.timers.values()]; runner.timers.clear()
  runner.run(() => timers.forEach(callback => callback()))
  await settle(runner)
}
const event = (runner, name) => runner.run(() => { for (const handler of runner.events.get(name) ?? []) handler() })
const cloudHub = new Hub()
const cloudKey = `forma:workspace:v1:${owner}`
cloudHub.values.set(cloudKey, JSON.stringify({ version: 1, workspace: seed.createEmptyWorkspace(), revision: 1, dirty: false }))
const cloud = new Runner(cloudHub, useWorkspace)
cloud.render(); await settle(cloud)
assert.equal(cloud.result.syncStatus, 'synced')
cloud.online = false; event(cloud, 'offline')
assert.equal(cloud.result.syncStatus, 'offline')
const beforeOffline = requests.length
assert.equal(cloud.run(data => data.setWorkspace(current => ({ ...current, tasks: [task('offline-card')] }))), null)
await flushWrites(cloud)
assert.equal(requests.length, beforeOffline, 'No workspace requests are sent while offline.')
assert.equal(JSON.parse(cloudHub.values.get(cloudKey)).dirty, true)
const offlineReload = new Runner(cloudHub, useWorkspace); offlineReload.online = false
offlineReload.render(); await settle(offlineReload)
assert.equal(offlineReload.result.loading, false)
assert.ok(offlineReload.result.workspace.tasks.some(task => task.id === 'offline-card'), 'Offline edits survive a hook reload.')
offlineReload.online = true; event(offlineReload, 'online'); await settle(offlineReload); await flushWrites(offlineReload)
assert.equal(offlineReload.result.syncStatus, 'synced')
assert.equal(remoteWorkspace.data.tasks[0].id, 'offline-card')
assert.equal(JSON.parse(cloudHub.values.get(cloudKey)).dirty, false)
failNetwork = true
offlineReload.run(data => data.setWorkspace(current => ({ ...current, tasks: [...current.tasks, task('temporary-outage')] })))
await flushWrites(offlineReload)
assert.equal(JSON.parse(cloudHub.values.get(cloudKey)).dirty, true)
failNetwork = false
offlineReload.run(() => { for (const callback of offlineReload.intervals.values()) callback() })
await settle(offlineReload); await flushWrites(offlineReload)
assert.equal(offlineReload.result.syncStatus, 'synced', 'Transient network failures recover without a new online event or manual retry.')
assert.ok(remoteWorkspace.data.tasks.some(task => task.id === 'temporary-outage'))
offlineReload.online = false; event(offlineReload, 'offline')
offlineReload.run(data => data.setWorkspace(current => ({ ...current, tasks: [...current.tasks, task('local-conflict')] })))
remoteWorkspace = { data: { ...remoteWorkspace.data, tasks: [...remoteWorkspace.data.tasks, task('remote-conflict')] }, revision: remoteWorkspace.revision + 1 }
offlineReload.online = true; event(offlineReload, 'online'); await settle(offlineReload); await flushWrites(offlineReload)
assert.equal(offlineReload.result.syncStatus, 'conflict')
assert.ok(remoteWorkspace.data.tasks.some(task => task.id === 'remote-conflict'))
assert.ok(!remoteWorkspace.data.tasks.some(task => task.id === 'local-conflict'), 'Reconnection must never overwrite a newer server revision.')

const queuedFeedHub = new Hub()
const queuedFeed = new Runner(queuedFeedHub, useDebriefs, [owner, true]); queuedFeed.online = false
queuedFeed.render(); await settle(queuedFeed)
const beforeImport = requests.length
assert.equal(await queuedFeed.run(data => data.importDebrief(payload('2026-10-06'))), null)
assert.equal(requests.length, beforeImport, 'Offline debrief imports are saved without a network request.')
const queuedReload = new Runner(queuedFeedHub, useDebriefs, [owner, true]); queuedReload.online = false
queuedReload.render(); await settle(queuedReload)
assert.equal(queuedReload.result.debriefs.length, 1)
queuedReload.run(data => data.markRead('2026-10-06'))
await settle(queuedReload)
queuedReload.online = true; event(queuedReload, 'online'); await settle(queuedReload)
assert.ok(remoteDebriefs.get('2026-10-06').read_at, 'Offline import and read status both synchronize on reconnect.')
assert.equal(Object.keys(JSON.parse(queuedFeedHub.values.get(`forma:debriefs:v1:${owner}`)).imports).length, 0)
assert.equal(Object.keys(JSON.parse(queuedFeedHub.values.get(`forma:debriefs:v1:${owner}`)).pending).length, 0)
assert.equal(queuedReload.result.error, null)
console.log('Offline sync passed: cached reload, queued edits/imports/read state, reconnect, automatic network retry, and remote revision conflict protection.')
