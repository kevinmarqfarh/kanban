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
const validation = await module('../src/lib/workspaceValidation.ts', { './birthdays': birthdays })
const merge = await module('../src/lib/workspaceMerge.ts')
const backend = { supabase: null, supabaseConfigurationError: 'Molnet är inte anslutet.' }
const { useWorkspace } = await module('../src/hooks/useWorkspace.ts', { react, '../lib/seed': seed, '../lib/supabase': backend, '../lib/workspaceValidation': validation, '../lib/birthdays': birthdays, '../lib/workspaceMerge': merge })
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
      setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {}, location: { origin: 'http://localhost' },
    }
    globalThis.document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} }
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
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

console.log('Persistence passed: actual hooks, stale tabs, storage events, quota/retry, reload, project/subtask/birthday data, debrief history, account isolation and recovery protection.')
