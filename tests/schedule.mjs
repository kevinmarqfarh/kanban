import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name] })
  return exports
}
const birthdays = await load('../src/lib/birthdays.ts')
const others = await load('../src/lib/others.ts', { './birthdays': birthdays })
const schedule = await load('../src/lib/schedule.ts', { './birthdays': birthdays, './others': others })
const { validSchedule, calendarFile, scheduleLayout, weekStart } = schedule
assert.equal(weekStart('2026-11-01'), '2026-10-26')
for (const valid of [undefined, null, { date: '2026-10-26' }, { date: '2026-10-26', scope: 'week' }, { date: '2026-10-26', startTime: '23:30', endTime: '24:00' }]) assert.equal(validSchedule(valid), true)
for (const bad of [{ date: '2026-02-30' }, { date: '2026-10-26', startTime: '09:00' }, { date: '2026-10-26', startTime: '09:00', endTime: '08:00' }, { date: '2026-10-26', startTime: '24:00', endTime: '24:00' }, { date: '2026-10-27', scope: 'week' }]) assert.equal(validSchedule(bad), false)
const task = (id, startTime, endTime, title = id) => ({ id, title, schedule: { date: '2026-10-26', startTime, endTime } })
const layout = scheduleLayout([task('a','08:00','09:00'), task('b','09:00','10:00'), task('c','11:00','12:00'), task('d','11:30','12:30')])
assert.equal(layout.get('a').width, 100); assert.equal(layout.get('b').width, 100)
assert.equal(layout.get('c').width, 50); assert.equal(layout.get('d').left, 50)
const ics = calendarFile([task('a','23:30','24:00','Läs, skriv; vila'), { id: 'week', title: 'Veckan', schedule: { date: '2026-10-26', scope: 'week' } }])
assert.ok(ics.includes('DTEND:20261027T000000'))
assert.ok(ics.includes('SUMMARY:Läs\\, skriv\\; vila'))
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1)
const { isWorkspace } = await load('../src/lib/workspaceValidation.ts', { './schedule': schedule, './birthdays': birthdays, './others': others })
const { createSeedWorkspace } = await load('../src/lib/seed.ts')
const workspace = createSeedWorkspace(); workspace.tasks[0].schedule = { date: '2026-10-26', startTime: '08:00', endTime: '09:00' }
assert.equal(isWorkspace(workspace), true)
workspace.tasks[0].schedule.endTime = '07:00'; assert.equal(isWorkspace(workspace), false)
const { editScheduleRange } = schedule
assert.deepEqual(editScheduleRange(540, 600, 80, 'move', 480, 1200), [630, 690])
assert.deepEqual(editScheduleRange(540, 600, -300, 'move', 480, 1200), [480, 540])
assert.deepEqual(editScheduleRange(540, 630, 900, 'move', 480, 1200), [1110, 1200])
assert.deepEqual(editScheduleRange(540, 600, 60, 'resize', 480, 1200), [540, 660])
assert.deepEqual(editScheduleRange(540, 600, -300, 'resize', 480, 1200), [540, 570])
assert.deepEqual(editScheduleRange(1380, 1410, 120, 'resize'), [1380, 1440])
assert.equal(validSchedule({ date: '2026-10-31', color: 'violet', label: 'Arbete' }), true)
assert.equal(validSchedule({ date: '2026-10-31', color: 'arbitrary' }), false)
assert.equal(validSchedule({ date: '2026-10-31', label: 'x'.repeat(61) }), false)
console.log('PASS schedule validation, week boundaries, overlap layout, midnight export and workspace persistence validation')
