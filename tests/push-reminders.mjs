import assert from 'node:assert/strict'
import { events } from '../supabase/functions/forma-push/reminders.ts'

const device = { time_zone: 'Europe/Stockholm', enabled: true, tasks: true, schedule: true, birthdays: true, lead_minutes: 15, quiet_start: null, quiet_end: null }
const task = { id: 'task-1', title: 'Möte', columnId: 'doing', deadline: '2026-10-28', deadlineTime: '10:00', schedule: { date: '2026-10-28', startTime: '10:00', scope: 'day' } }
const workspace = { columns: [{ id: 'doing', title: 'Pågår' }, { id: 'done', title: 'Klart' }], tasks: [task], birthdays: [] }
const due = events(workspace, device, new Date('2026-10-28T08:45:00Z'))
assert.equal(due.length, 2)
assert.deepEqual(new Set(due.map(event => event.url)), new Set(['/?view=planner', '/?view=schedule']))
assert.equal(events(workspace, device, new Date('2026-10-28T08:42:00Z')).length, 0)
assert.equal(events({ ...workspace, tasks: [{ ...task, columnId: 'done' }] }, device, new Date('2026-10-28T08:45:00Z')).length, 0)
assert.equal(events(workspace, { ...device, quiet_start: '09:00', quiet_end: '10:00' }, new Date('2026-10-28T08:45:00Z')).length, 0)
assert.equal(events(workspace, { ...device, quiet_start: '09:45', quiet_end: '09:45' }, new Date('2026-10-28T08:45:00Z')).length, 2)
const birthday = { id: 'person-1', name: 'Anna', birthDate: '1990-10-28', reminders: ['day', 'week', 'month'] }
const birthdayWorkspace = { columns: [], tasks: [], birthdays: [birthday] }
const onDay = events(birthdayWorkspace, device, new Date('2026-10-28T08:00:00Z'))
assert.equal(onDay.length, 1)
assert.match(onDay[0].body, /idag/)
assert.equal(events(birthdayWorkspace, device, new Date('2026-09-28T07:00:00Z')).length, 1)
const leapDay = { ...birthday, birthDate: '2000-02-29', reminders: ['day'] }
assert.equal(events({ ...birthdayWorkspace, birthdays: [leapDay] }, device, new Date('2027-02-28T08:00:00Z')).length, 1)
console.log('PASS push reminder timing, completed tasks, quiet hours, birthdays')
