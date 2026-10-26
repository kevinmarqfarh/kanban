import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

process.env.TZ = 'Europe/Stockholm'
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
const { planningStats, buildWeekPlan } = await module('../src/lib/weekPlanner.ts', { './helpers': helpers, './others': others, './schedule': schedule })
const createdAt = '2026-10-01T12:00:00.000Z'
const task = (id, fields = {}) => ({ id, title: id, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt, ...fields })
const timed = (id, date, startTime, endTime) => task(id, { schedule: { date, startTime, endTime } })
const monday = '2026-10-26'
const tasks = [
  timed('morning', monday, '09:00', '10:00'),
  timed('overlap', monday, '09:30', '10:30'),
  timed('adjacent', monday, '10:30', '11:00'),
  timed('midnight', '2026-11-01', '23:00', '24:00'),
  task('day', { schedule: { date: monday } }),
  task('week', { schedule: { date: monday, scope: 'week' } }),
  task('unscheduled', { deadline: monday }),
  task('null-schedule', { schedule: null }),
  timed('previous', '2026-10-25', '12:00', '13:00'),
  timed('future', '2026-11-08', '12:00', '13:00'),
  task('old-week', { schedule: { date: '2026-10-19', scope: 'week' } }),
  task('completed', { columnId: 'done', schedule: { date: monday, startTime: '09:00', endTime: '18:00' } }),
  task('archived', { columnId: 'finalized' }),
]
const workspace = { columns: [{ id: 'todo' }, { id: 'done' }, { id: 'finalized' }], projects: [], tasks }
const original = JSON.stringify(workspace)
const plan = buildWeekPlan(workspace, tasks, '2026-11-01')
assert.equal(plan.monday, monday, 'Sunday anchors to the preceding local Monday, across the month boundary.')
assert.deepEqual(plan.days.map(day => day.date), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
assert.deepEqual(new Set(plan.days[0].tasks.map(t => t.id)), new Set(['morning', 'overlap', 'adjacent', 'day']))
assert.deepEqual(plan.days[6].tasks.map(t => t.id), ['midnight'], 'Sunday and an event ending at midnight are retained.')
assert.deepEqual(plan.weekTasks.map(t => t.id), ['week'], 'Week-only tasks appear once, in their week queue.')
assert.deepEqual(new Set(plan.unscheduledTasks.map(t => t.id)), new Set(['unscheduled', 'null-schedule']), 'A deadline is not a schedule; tasks scheduled in other weeks are not unscheduled.')
assert.equal(plan.weekTaskCount, 1)
assert.equal(plan.unscheduledTaskCount, 2)
assert.equal(plan.days[0].stats.bookedMinutes, 150, 'Booked time is the sum of appointments, including overlaps.')
assert.equal(plan.days[0].stats.overlapPairs, 1)
assert.deepEqual(new Set(plan.days[0].stats.conflictTaskIds), new Set(['morning', 'overlap']))
assert.equal(plan.days[6].stats.bookedMinutes, 60)
assert.equal(plan.stats.bookedMinutes, 210)
assert.equal(plan.stats.taskCount, 6, 'Weekly total includes day tasks and the week-only task, excludes completed/out-of-week tasks.')
assert.equal(plan.stats.timedCount, 4)

const filtered = buildWeekPlan(workspace, tasks.filter(t => t.id === 'morning'), monday)
assert.deepEqual(filtered.days[0].tasks.map(t => t.id), ['morning'])
assert.equal(filtered.days[0].stats.bookedMinutes, 150, 'Filtering cards never hides actual booked workload.')
assert.equal(filtered.days[0].stats.overlapPairs, 1)
assert.equal(filtered.stats.bookedMinutes, 210)
assert.equal(filtered.weekTasks.length, 0)
assert.equal(filtered.weekTaskCount, 1, 'Queue total remains honest when its visible cards are filtered.')
assert.equal(filtered.unscheduledTaskCount, 2)
assert.equal(filtered.unscheduledTasks.length, 0)

const adjacency = planningStats([
  timed('one', monday, '08:00', '09:00'), timed('two', monday, '09:00', '10:00'),
  timed('different-day', '2026-10-27', '08:30', '09:30'),
])
assert.equal(adjacency.overlapPairs, 0, 'Adjacent blocks and same times on different days are not conflicts.')
const nested = planningStats([
  timed('outer', monday, '08:00', '12:00'), timed('inner', monday, '09:00', '10:00'), timed('second-inner', monday, '09:30', '11:00'),
])
assert.equal(nested.overlapPairs, 3, 'Every pair of a three-way nested overlap is counted once.')
assert.equal(nested.conflictTaskIds.size, 3)
assert.equal(planningStats([]).bookedMinutes, 0)
assert.equal(buildWeekPlan({ ...workspace, tasks: [] }, [], monday).days.length, 7)
assert.equal(JSON.stringify(workspace), original, 'Building/filtering a plan does not mutate saved data.')
assert.equal(schedule.validSchedule({ date: monday, scope: 'week' }), true)
assert.equal(schedule.validSchedule({ date: '2026-10-27', scope: 'week' }), false)
assert.equal(schedule.validSchedule({ date: monday, scope: 'week', startTime: '09:00', endTime: '10:00' }), false)
assert.equal(schedule.validSchedule({ date: monday, startTime: '23:30', endTime: '24:00' }), true)
assert.equal(schedule.validSchedule({ date: monday, startTime: '10:00', endTime: '09:00' }), false)
assert.equal(schedule.validSchedule({ date: monday, startTime: '09:00', endTime: '09:00' }), false)
console.log('Week planner passed: local Monday/month boundary, day/week/unscheduled queues, full-data workload under filters, adjacent/nested overlaps, midnight, completed exclusions, validation and immutability.')
