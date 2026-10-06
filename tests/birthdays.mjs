import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

process.env.TZ = 'Europe/Stockholm'
const source = await readFile(new URL('../src/lib/birthdays.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
const exports = {}
new Function('exports', outputText)(exports)
const { applyBirthdayReminders, isValidBirthDate, localDateString, nextBirthday, reminderDate } = exports

const today = (date) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}
const birthday = (values = {}) => ({
  id: 'anna', name: 'Anna', birthDate: '1995-11-04',
  reminders: ['month', 'two-weeks', 'week', 'day'],
  createdAt: '2026-10-04T10:00:00.000Z', generatedReminders: [], ...values,
})
const board = (birthdays = [birthday()]) => ({
  columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }],
  tasks: [], projects: [], birthdays,
})

for (const value of ['1995-11-04', '2000-02-29', '0001-01-01']) assert.equal(isValidBirthDate(value), true)
for (const value of ['', '0000-01-01', '2025-02-29', '2026-13-01', '2026-04-31', '2026-1-01', '2026-01-00']) assert.equal(isValidBirthDate(value), false)
assert.equal(localDateString(new Date('2026-10-03T22:30:00.000Z')), '2026-10-04', 'Use the local date, even when UTC is still yesterday.')
assert.deepEqual(nextBirthday('1995-11-04', today('2026-10-04')), { date: '2026-11-04', age: 31 })
assert.deepEqual(nextBirthday('1995-11-04', today('2026-11-04')), { date: '2026-11-04', age: 31 }, 'The birthday itself belongs to this year.')
assert.deepEqual(nextBirthday('1995-11-04', today('2026-11-05')), { date: '2027-11-04', age: 32 })
assert.deepEqual(nextBirthday('2000-02-29', today('2027-01-01')), { date: '2027-02-28', age: 27 })
assert.deepEqual(nextBirthday('2000-02-29', today('2028-01-01')), { date: '2028-02-29', age: 28 })
assert.deepEqual(nextBirthday('2026-10-04', today('2026-10-04')), { date: '2026-10-04', age: 0 })
assert.equal(reminderDate('2027-03-31', 'month'), '2027-02-28')
assert.equal(reminderDate('2028-03-31', 'month'), '2028-02-29')
assert.equal(reminderDate('2027-01-04', 'month'), '2026-12-04')
assert.equal(reminderDate('2026-04-02', 'week'), '2026-03-26', 'Spring DST preserves calendar days.')
assert.equal(reminderDate('2026-11-01', 'week'), '2026-10-25', 'Autumn DST preserves calendar days.')
assert.equal(reminderDate('2027-02-28', 'two-weeks'), '2027-02-14')

const initial = board()
let workspace = applyBirthdayReminders(initial, today('2026-10-04'))
assert.equal(workspace.tasks.length, 1)
assert.equal(workspace.tasks[0].title, 'Anna fyller 31 år')
assert.equal(workspace.tasks[0].deadline, '2026-11-04')
assert.equal(workspace.tasks[0].columnId, 'todo')
assert.match(workspace.tasks[0].description, /Födelsedag: 4 november 2026/)
assert.match(workspace.tasks[0].description, /1 månad före födelsedagen/)
assert.deepEqual(initial.birthdays[0].generatedReminders, [], 'Do not mutate the persisted source workspace.')
assert.equal(initial.tasks.length, 0)
assert.equal(applyBirthdayReminders(workspace, today('2026-10-04')), workspace, 'An unchanged check returns the same reference.')
workspace = applyBirthdayReminders(workspace, today('2026-10-21'))
assert.equal(workspace.tasks.length, 2)
workspace = applyBirthdayReminders(workspace, today('2026-10-28'))
assert.equal(workspace.tasks.length, 3)
workspace = applyBirthdayReminders(workspace, today('2026-11-04'))
assert.equal(workspace.tasks.length, 4)
assert.match(workspace.tasks[3].description, /Påminnelse: På födelsedagen\./)
assert.equal(new Set(workspace.tasks.map(task => task.id)).size, 4)
assert.equal(applyBirthdayReminders(workspace, today('2026-11-05')), workspace, 'Do not generate an old anniversary after it has passed.')
workspace = applyBirthdayReminders(workspace, today('2027-10-04'))
assert.equal(workspace.tasks.length, 5)
assert.equal(workspace.tasks[4].title, 'Anna fyller 32 år', 'The next year gets a fresh occurrence and age.')

const caughtUp = applyBirthdayReminders(board(), today('2026-10-28'))
assert.equal(caughtUp.tasks.length, 1, 'A late visit creates only the most recent due reminder.')
assert.match(caughtUp.tasks[0].id, /:week$/)
assert.equal(caughtUp.birthdays[0].generatedReminders.length, 3, 'Older due reminders are handled without generating extra cards.')
const taskDeleted = { ...caughtUp, tasks: [] }
assert.equal(applyBirthdayReminders(taskDeleted, today('2026-10-28')), taskDeleted, 'A manually deleted reminder never reappears.')
const disabled = { ...caughtUp, birthdays: caughtUp.birthdays.map(person => ({ ...person, reminders: [] })) }
assert.equal(applyBirthdayReminders(disabled, today('2026-11-04')), disabled, 'Disabling reminders leaves existing tasks intact.')

const newestAlreadyHandled = board([birthday({ generatedReminders: ['birthday:anna:2026-11-04:week'] })])
const repairedLedger = applyBirthdayReminders(newestAlreadyHandled, today('2026-10-28'))
assert.equal(repairedLedger.tasks.length, 0, 'Never regenerate older options when the latest option has already been handled.')
assert.equal(repairedLedger.birthdays[0].generatedReminders.length, 3)
const existingTaskWithoutLedger = { ...board(), tasks: caughtUp.tasks }
assert.equal(applyBirthdayReminders(existingTaskWithoutLedger, today('2026-10-28')).tasks.length, 1, 'Restore the ledger without duplicating an existing reminder task.')

const noReminders = board([birthday({ reminders: [] })])
assert.equal(applyBirthdayReminders(noReminders, today('2026-10-28')), noReminders)
const invalidBirthDate = board([birthday({ birthDate: '2026-02-30' })])
assert.equal(applyBirthdayReminders(invalidBirthDate, today('2026-10-28')), invalidBirthDate)
const futureBirthDate = board([birthday({ birthDate: '2027-11-04' })])
assert.equal(applyBirthdayReminders(futureBirthDate, today('2026-10-28')), futureBirthDate)
const oldAnniversary = board([birthday({ birthDate: '1995-09-04' })])
assert.equal(applyBirthdayReminders(oldAnniversary, today('2026-10-04')), oldAnniversary)
const noBirthdayField = { columns: initial.columns, tasks: [], projects: [] }
assert.equal(applyBirthdayReminders(noBirthdayField, today('2026-10-04')), noBirthdayField, 'Old saved workspaces stay compatible.')
const customColumns = { ...board(), columns: [{ id: 'inbox', title: 'Inbox', color: 'gray' }] }
assert.equal(applyBirthdayReminders(customColumns, today('2026-10-04')).tasks[0].columnId, 'inbox')
const newborn = applyBirthdayReminders(board([birthday({ birthDate: '2026-10-04', reminders: ['day'] })]), today('2026-10-04'))
assert.equal(newborn.tasks[0].title, 'Anna fyller 0 år')
const leapDay = applyBirthdayReminders(board([birthday({ birthDate: '2000-02-29', reminders: ['day'] })]), today('2027-02-28'))
assert.equal(leapDay.tasks[0].title, 'Anna fyller 27 år')
assert.equal(leapDay.tasks[0].deadline, '2027-02-28')

console.log('Birthday scheduling passed: calendar dates, age, leap years, DST, annual recurrence, catch-up, deduplication, deleted tasks and compatibility.')
