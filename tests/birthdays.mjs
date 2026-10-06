import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

process.env.TZ = 'Europe/Stockholm'
const source = await readFile(new URL('../src/lib/birthdays.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
const exports = {}
new Function('exports', outputText)(exports)
const { applyBirthdayReminders, birthdayNotificationId, currentAge, isValidBirthDate, localDateString, nextBirthday, reminderDate, REMINDER_OPTIONS, unreadBirthdayNotifications } = exports

const today = date => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}
const birthday = (values = {}) => ({
  id: 'anna', name: 'Anna', birthDate: '1995-11-04', reminders: ['month', 'two-weeks', 'week', 'day'],
  createdAt: '2026-10-04T10:00:00.000Z', generatedReminders: [], ...values,
})
const board = (birthdays = [birthday()]) => ({ columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }], tasks: [], projects: [], birthdays })
const id = reminder => birthdayNotificationId('anna', '2026-11-04', reminder)

assert.deepEqual(REMINDER_OPTIONS.map(option => option.label), ['7 dagar', '14 dagar', '30 dagar'])
assert.equal(REMINDER_OPTIONS.length, 3, 'New forms show only the three requested day thresholds.')
for (const value of ['1995-11-04', '2000-02-29', '0001-01-01']) assert.equal(isValidBirthDate(value), true)
for (const value of ['', '0000-01-01', '2025-02-29', '2026-13-01', '2026-04-31', '2026-1-01', '2026-01-00']) assert.equal(isValidBirthDate(value), false)
assert.equal(localDateString(new Date('2026-10-03T22:30:00.000Z')), '2026-10-04')
assert.deepEqual(nextBirthday('1995-11-04', today('2026-10-04')), { date: '2026-11-04', age: 31 })
assert.deepEqual(nextBirthday('1995-11-04', today('2026-11-05')), { date: '2027-11-04', age: 32 })
assert.equal(currentAge('1995-11-04', today('2026-10-04')), 30)
assert.equal(currentAge('1995-11-04', today('2026-11-04')), 31)
assert.equal(currentAge('1995-11-04', today('2026-11-05')), 31)
assert.equal(currentAge('2026-10-04', today('2026-10-04')), 0)
assert.deepEqual(nextBirthday('2000-02-29', today('2027-01-01')), { date: '2027-02-28', age: 27 })
assert.deepEqual(nextBirthday('2000-02-29', today('2028-01-01')), { date: '2028-02-29', age: 28 })
assert.equal(currentAge('2000-02-29', today('2027-02-28')), 27)
assert.equal(reminderDate('2026-11-04', 'month'), '2026-10-05', 'The legacy month key now means exactly 30 calendar days, not one calendar month.')
assert.equal(reminderDate('2027-03-31', 'month'), '2027-03-01')
assert.equal(reminderDate('2028-03-31', 'month'), '2028-03-01')
assert.equal(reminderDate('2027-01-04', 'month'), '2026-12-05')
assert.equal(reminderDate('2026-04-02', 'week'), '2026-03-26', 'Spring DST preserves calendar days.')
assert.equal(reminderDate('2026-11-01', 'week'), '2026-10-25', 'Autumn DST preserves calendar days.')
assert.equal(reminderDate('2027-02-28', 'two-weeks'), '2027-02-14')

const initial = board()
assert.equal(applyBirthdayReminders(initial, today('2026-10-04')), initial, 'No 30-day notification occurs a day early.')
let workspace = applyBirthdayReminders(initial, today('2026-10-05'))
assert.equal(workspace.birthdayNotifications.length, 1)
assert.equal(workspace.birthdayNotifications[0].id, id('month'))
assert.equal(workspace.birthdayNotifications[0].date, '2026-11-04')
assert.equal(workspace.birthdayNotifications[0].name, 'Anna')
assert.equal(workspace.birthdayNotifications[0].age, 31)
assert.equal(workspace.tasks, initial.tasks, 'New birthday reminders never create or replace Kanban cards.')
assert.equal(workspace.tasks.length, 0)
assert.deepEqual(initial.birthdays[0].generatedReminders, [], 'The source workspace is immutable.')
assert.equal(applyBirthdayReminders(workspace, today('2026-10-05')), workspace)
workspace = applyBirthdayReminders(workspace, today('2026-10-21'))
assert.equal(workspace.birthdayNotifications.length, 2)
workspace = applyBirthdayReminders(workspace, today('2026-10-28'))
assert.equal(workspace.birthdayNotifications.length, 3)
workspace = applyBirthdayReminders(workspace, today('2026-11-04'))
assert.equal(workspace.birthdayNotifications.length, 4, 'An already-saved legacy day option still works.')
assert.equal(unreadBirthdayNotifications(workspace).length, 4)
assert.equal(new Set(workspace.birthdayNotifications.map(entry => entry.id)).size, 4)
const readId = workspace.birthdayNotifications[0].id
workspace = { ...workspace, birthdayNotifications: workspace.birthdayNotifications.map(entry => entry.id === readId ? { ...entry, readAt: '2026-11-04T12:00:00Z' } : entry) }
assert.equal(unreadBirthdayNotifications(workspace).length, 3)
workspace = applyBirthdayReminders(workspace, today('2026-11-05'))
assert.equal(workspace.birthdayNotifications.length, 1, 'Past unread reminders expire while read history remains.')
assert.equal(workspace.birthdayNotifications[0].id, readId)
workspace = applyBirthdayReminders(workspace, today('2027-10-05'))
assert.equal(workspace.birthdayNotifications.length, 2)
assert.equal(workspace.birthdayNotifications[1].age, 32)

const caughtUp = applyBirthdayReminders(board(), today('2026-10-28'))
assert.equal(caughtUp.birthdayNotifications.length, 1, 'A late visit creates only the latest selected due threshold.')
assert.match(caughtUp.birthdayNotifications[0].id, /:week$/)
assert.equal(caughtUp.birthdays[0].generatedReminders.length, 3)
const deleted = { ...caughtUp, birthdayNotifications: [] }
assert.equal(applyBirthdayReminders(deleted, today('2026-10-28')), deleted, 'The ledger prevents recreation after a notification is deleted.')
const dismissed = { ...caughtUp, birthdayNotifications: caughtUp.birthdayNotifications.map(entry => ({ ...entry, dismissedAt: '2026-10-28T12:00:00Z' })) }
assert.equal(unreadBirthdayNotifications(dismissed).length, 0)
assert.equal(applyBirthdayReminders(dismissed, today('2026-10-28')), dismissed)
const latestHandled = board([birthday({ generatedReminders: [id('week')] })])
const repaired = applyBirthdayReminders(latestHandled, today('2026-10-28'))
assert.equal(repaired.birthdayNotifications.length, 0)
assert.equal(repaired.birthdays[0].generatedReminders.length, 3)
const noLedger = { ...board(), birthdayNotifications: caughtUp.birthdayNotifications }
assert.equal(applyBirthdayReminders(noLedger, today('2026-10-28')).birthdayNotifications.length, 1, 'Repair missing ledger entries without duplicating an existing notification.')

const oldTask = { id: 'birthday:anna:2026-11-04:month', title: 'Anna fyller 31 år', description: 'Tidigare påminnelse', columnId: 'todo', labels: ['Födelsedag'], checklist: [], deadline: '2026-11-04', comments: [], projectId: null, createdAt: '2026-10-04T12:00:00Z' }
const legacy = { ...board([birthday({ generatedReminders: [oldTask.id] })]), tasks: [oldTask] }
const migrated = applyBirthdayReminders(legacy, today('2026-10-05'))
assert.equal(migrated.tasks, legacy.tasks)
assert.equal(migrated.tasks[0], oldTask)
assert.equal(migrated.birthdayNotifications.length, 1, 'Legacy task IDs do not suppress new in-app notifications.')
assert.ok(migrated.birthdays[0].generatedReminders.includes(oldTask.id))
assert.ok(migrated.birthdays[0].generatedReminders.includes(id('month')))

const renamed = applyBirthdayReminders({ ...caughtUp, birthdays: caughtUp.birthdays.map(person => ({ ...person, name: 'Anna Maria', birthDate: '1990-11-04' })) }, today('2026-10-28'))
assert.equal(renamed.birthdayNotifications[0].name, 'Anna Maria')
assert.equal(renamed.birthdayNotifications[0].age, 36, 'Pending notifications reflect edited birth years and names.')
assert.equal(renamed.birthdayNotifications[0].id, caughtUp.birthdayNotifications[0].id)
const changedDate = applyBirthdayReminders({ ...caughtUp, birthdays: caughtUp.birthdays.map(person => ({ ...person, birthDate: '1995-12-04' })) }, today('2026-10-28'))
assert.equal(changedDate.birthdayNotifications.length, 0, 'Changing the birthday removes obsolete pending occurrences.')
const disabled = applyBirthdayReminders({ ...caughtUp, birthdays: caughtUp.birthdays.map(person => ({ ...person, reminders: [] })) }, today('2026-10-28'))
assert.equal(disabled.birthdayNotifications.length, 0)
assert.equal(disabled.tasks, caughtUp.tasks)
for (const person of [birthday({ reminders: [] }), birthday({ birthDate: '2026-02-30' }), birthday({ birthDate: '2027-11-04' }), birthday({ birthDate: '1995-09-04' })]) {
  const empty = board([person])
  assert.equal(applyBirthdayReminders(empty, today('2026-10-04')), empty)
}
const oldWorkspace = { columns: initial.columns, tasks: [], projects: [] }
assert.equal(applyBirthdayReminders(oldWorkspace, today('2026-10-04')), oldWorkspace)
const leap = applyBirthdayReminders(board([birthday({ birthDate: '2000-02-29', reminders: ['day'] })]), today('2027-02-28'))
assert.equal(leap.birthdayNotifications[0].age, 27)
assert.equal(leap.birthdayNotifications[0].date, '2027-02-28')

console.log('Birthday notifications passed: exact 7/14/30 days, current/turning age, leap years, DST, annual recurrence, catch-up, deduplication, edits, read state and legacy-card preservation.')
