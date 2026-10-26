import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

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
const birthdays = await module('../src/lib/birthdays.ts')
const others = await module('../src/lib/others.ts', { './birthdays': birthdays })
const schedule = await module('../src/lib/schedule.ts', { './birthdays': birthdays, './others': others })
const helpers = await module('../src/lib/helpers.ts')
const { getPlanningFeedback } = await module('../src/lib/planningFeedback.ts', { './helpers': helpers, './schedule': schedule })
const date = '2026-10-26'
const timed = (id, startTime, endTime, fields = {}) => ({ id, title: id, columnId: 'todo', schedule: { date, startTime, endTime }, ...fields })
const workspace = { columns: [{ id: 'todo' }, { id: 'done' }, { id: 'finalized' }], projects: [], tasks: [
  timed('edited', '09:00', '10:30'),
  timed('overlap', '09:30', '10:00'),
  timed('adjacent-before', '08:00', '09:00'),
  timed('adjacent-after', '10:30', '11:00'),
  timed('nested', '09:40', '09:50'),
  timed('different-date', '09:00', '10:00', { schedule: { date: '2026-10-27', startTime: '09:00', endTime: '10:00' } }),
  timed('completed', '09:00', '10:00', { columnId: 'done' }),
  timed('archived', '09:00', '10:00', { columnId: 'finalized' }),
  { id: 'untimed', title: 'Untimed', columnId: 'todo', schedule: { date } },
  { id: 'week-only', title: 'Week', columnId: 'todo', schedule: { date, scope: 'week' } },
  { id: 'unplanned', title: 'Unplanned', columnId: 'todo' },
  timed('midnight', '23:00', '24:00'),
] }
const original = JSON.stringify(workspace)
let result = getPlanningFeedback(workspace, { date, startTime: '09:00', endTime: '10:30' }, 'edited')
assert.equal(result.valid, true)
assert.equal(result.durationMinutes, 90)
assert.deepEqual(result.conflicts.map(task => task.id), ['overlap', 'nested'], 'Preview includes all actual active same-day overlaps, not self/completed/adjacent/day-only/week-only.')
result = getPlanningFeedback(workspace, { date, startTime: '09:30', endTime: '09:45' }, 'overlap')
assert.equal(result.durationMinutes, 15)
assert.deepEqual(result.conflicts.map(task => task.id), ['edited', 'nested'], 'Containing and partially containing intervals both conflict.')
result = getPlanningFeedback(workspace, { date, startTime: '23:30', endTime: '24:00' })
assert.equal(result.durationMinutes, 30)
assert.deepEqual(result.conflicts.map(task => task.id), ['midnight'])
assert.deepEqual(getPlanningFeedback(workspace, { date }), { valid: true, durationMinutes: null, conflicts: [] }, 'Untimed plans do not imply timed capacity or collisions.')
assert.deepEqual(getPlanningFeedback(workspace, { date, scope: 'week' }), { valid: true, durationMinutes: null, conflicts: [] })
for (const draft of [{ date: '' }, { date: '2026-02-30' }, { date, startTime: '10:00', endTime: '09:00' }, { date, startTime: '10:00', endTime: '10:00' }, { date, startTime: '23:00', endTime: '25:00' }, { date, scope: 'week', startTime: '10:00', endTime: '11:00' }]) {
  assert.deepEqual(getPlanningFeedback(workspace, draft), { valid: false, durationMinutes: null, conflicts: [] }, 'Incomplete/invalid drafts do not show misleading computed feedback.')
}
assert.equal(JSON.stringify(workspace), original, 'Preview is read-only.')
console.log('PASS planning feedback: full-data active overlap preview, self/excluded statuses, adjacent/nested/date bounds, midnight, invalid drafts, duration and immutability')
