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
const { isWorkspace } = await module('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })
const { createEmptyWorkspace } = await module('../src/lib/seed.ts')
const { mergeWorkspaceChanges, mergeRecordChanges } = await module('../src/lib/workspaceMerge.ts')
const { addLocalDays, daysBetween, isoWeek, isNonnegativeDecimal, isNonnegativeInteger, isNutritionComplete, nutritionCompletionId, parseLocalDate, safeRecipeURL, validateRecipeUrl, weekDates, weekStart, workoutRawText } = others

assert.equal(weekStart('2026-10-06'), '2026-10-05')
assert.equal(weekStart('2026-10-11'), '2026-10-05')
assert.deepEqual(weekDates('2026-10-06'), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
assert.deepEqual(weekDates('2026-12-31'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
assert.equal(isoWeek('2026-10-06'), 41)
assert.equal(isoWeek('2027-01-01'), 53, 'ISO weeks can belong to the preceding year.')
assert.equal(isoWeek('2027-01-04'), 1)
assert.equal(isoWeek('2028-01-01'), 52)
assert.equal(addLocalDays('2026-03-28', 2), '2026-03-30')
assert.equal(addLocalDays('2026-10-24', 2), '2026-10-26')
assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2, 'Spring DST does not shorten a calendar-day interval.')
assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, 'Autumn DST does not lengthen a calendar-day interval.')
assert.equal(daysBetween('2026-10-06', '2026-10-05'), -1)
assert.equal(parseLocalDate('0001-01-01').getFullYear(), 1)
assert.throws(() => parseLocalDate('2026-02-30'), /Ogiltigt datum/)
assert.equal(safeRecipeURL(' https://example.com/recept '), 'https://example.com/recept')
assert.equal(safeRecipeURL('http://example.com/recept'), 'http://example.com/recept')
assert.equal(validateRecipeUrl(''), true, 'Recipes can have steps without an external link.')
for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'ftp://example.com', 'https://user:password@example.com', 'not a url']) {
  assert.equal(safeRecipeURL(url), null)
  assert.equal(validateRecipeUrl(url), false)
}
for (const value of ['0', '3', '2,5', '2.5', '0,25', '00.50']) assert.equal(isNonnegativeDecimal(value), true)
assert.equal(isNonnegativeDecimal('', true), true)
assert.equal(isNonnegativeDecimal(''), false, 'Habit amount is required even though workout amounts can be empty.')
assert.equal(isNonnegativeInteger('', true), true)
for (const value of ['0', '120', '007']) assert.equal(isNonnegativeInteger(value), true)
for (const value of ['-1', 'NaN', 'Infinity', 'text', '1e2', '.5', '2.', '2,', '2,5.0', ' 2,5 ', 2.5, null]) assert.equal(isNonnegativeDecimal(value), false)
for (const value of ['120,5', '120.5', '-1', 'NaN', 'text', '1e2', 120]) assert.equal(isNonnegativeInteger(value), false, 'BPM must be an optional integer string.')

const createdAt = '2026-10-06T08:00:00Z'
const row = { id: 'row', title: 'Bänkpress', amount: '3', amountUnit: 'sets', load: '70', loadUnit: 'kg', bpm: '120' }
const workout = { id: 'workout', date: '2026-10-06', title: 'Styrka', rows: [row], createdAt }
const habit = { id: 'water', title: 'Vatten', amount: '2', unit: 'l', createdAt }
const completion = { id: nutritionCompletionId(habit.id, workout.date), habitId: habit.id, date: workout.date, completed: true }
const recipe = { id: 'recipe', title: 'Soppa', url: 'https://example.com/recept', steps: '1. Hacka\n2. Koka', labels: ['Lunch'], createdAt }
const notification = { id: birthdays.birthdayNotificationId('anna', '2026-11-04', 'month'), birthdayId: 'anna', date: '2026-11-04', reminder: 'month', name: 'Anna', age: 31, createdAt, readAt: null, dismissedAt: null }
const workspace = { ...createEmptyWorkspace(), workouts: [workout], nutritionHabits: [habit], nutritionCompletions: [completion], recipes: [recipe], birthdayNotifications: [notification] }
assert.ok(isWorkspace(workspace))
assert.equal(workoutRawText(workout), 'Styrka · 2026-10-06\nBänkpress · 3 sets · 70 kg · 120 BPM')
const timedWorkout = { ...workout, title: 'Intervall', rows: [{ ...row, title: 'Löpning', amount: '7,5', amountUnit: 'min', load: '2,5', loadUnit: 'time', bpm: '145' }] }
assert.equal(workoutRawText(timedWorkout), 'Intervall · 2026-10-06\nLöpning · 7,5 min · 2,5 min · 145 BPM', 'Minutes use the min unit and preserve decimal commas in copied raw text.')
assert.ok(isWorkspace({ ...workspace, workouts: [timedWorkout], nutritionHabits: [{ ...habit, amount: '2,5' }] }))
assert.ok(isWorkspace({ ...workspace, workouts: [{ ...workout, rows: [{ ...row, amount: '', load: '', bpm: '' }] }] }))
assert.ok(isWorkspace({ ...workspace, workouts: [{ ...workout, rows: [{ ...row, amount: '2.5', load: '70.5' }] }], nutritionHabits: [{ ...habit, amount: '2.5' }] }))
assert.equal(isNutritionComplete(workspace, 'water', '2026-10-06'), true)
assert.equal(isNutritionComplete(workspace, 'water', '2026-10-07'), false, 'Each day has independent habit state.')
assert.ok(isWorkspace({ columns: workspace.columns, tasks: [], projects: [] }), 'Old workspaces without any Others collections remain supported.')
const bad = [
  { ...workspace, workouts: null },
  { ...workspace, workouts: [workout, workout] },
  { ...workspace, workouts: [{ ...workout, date: '2026-02-30' }] },
  { ...workspace, workouts: [{ ...workout, rows: [row, row] }] },
  { ...workspace, workouts: [{ ...workout, rows: [{ ...row, amountUnit: ['sets'] }] }] },
  { ...workspace, workouts: [{ ...workout, rows: [{ ...row, loadUnit: 'stone' }] }] },
  { ...workspace, workouts: [{ ...workout, rows: [{ ...row, amount: '-1' }] }] },
  { ...workspace, workouts: [{ ...workout, rows: [{ ...row, load: 'NaN' }] }] },
  { ...workspace, workouts: [{ ...workout, rows: [{ ...row, amount: 'many' }] }] },
  { ...workspace, workouts: [{ ...workout, rows: [{ ...row, bpm: '120,5' }] }] },
  { ...workspace, workouts: [{ ...workout, rows: [{ ...row, bpm: '120.5' }] }] },
  { ...workspace, nutritionHabits: [{ ...habit, unit: ['l'] }] },
  { ...workspace, nutritionHabits: [{ ...habit, title: '' }] },
  { ...workspace, nutritionHabits: [{ ...habit, amount: '' }] },
  { ...workspace, nutritionHabits: [{ ...habit, amount: '-2' }] },
  { ...workspace, nutritionHabits: [{ ...habit, amount: 'NaN' }] },
  { ...workspace, nutritionCompletions: [{ ...completion, id: 'random' }] },
  { ...workspace, nutritionCompletions: [{ ...completion, completed: 'yes' }] },
  { ...workspace, nutritionHabits: [] },
  { ...workspace, recipes: [{ ...recipe, url: 'javascript:alert(1)' }] },
  { ...workspace, recipes: [{ ...recipe, labels: [4] }] },
  { ...workspace, birthdayNotifications: [{ ...notification, id: 'random' }] },
  { ...workspace, birthdayNotifications: [{ ...notification, age: 31.5 }] },
  { ...workspace, birthdayNotifications: [{ ...notification, readAt: '2026-02-30T08:00:00Z' }] },
]
for (const value of bad) assert.equal(isWorkspace(value), false, 'Malformed optional collections must never reach module editors.')

const changedWorkout = { ...workout, rows: [{ ...row, amount: '4' }] }
const remoteWorkout = { ...workout, rows: [{ ...row, load: '75' }, { ...row, id: 'new-row', title: 'Rodd' }] }
const mergedWorkout = mergeRecordChanges(workout, changedWorkout, remoteWorkout)
assert.equal(mergedWorkout.rows[0].amount, '4')
assert.equal(mergedWorkout.rows[0].load, '75')
assert.equal(mergedWorkout.rows.length, 2)
const local = { ...workspace, workouts: [changedWorkout] }
const remote = { ...workspace, workouts: [remoteWorkout], recipes: [...workspace.recipes, { ...recipe, id: 'remote-recipe' }] }
const merged = mergeWorkspaceChanges(workspace, local, remote)
assert.equal(merged.recipes.length, 2)
assert.equal(merged.workouts[0].rows[0].amount, '4')
assert.equal(merged.workouts[0].rows[0].load, '75')
assert.ok(isWorkspace(merged))
assert.equal(mergeWorkspaceChanges(workspace, local, { ...remote, workouts: [] }).workouts.length, 0, 'A removed workout is not resurrected by a stale cache.')

console.log('Others domain passed: Monday/ISO weeks, DST, day navigation, raw workout copy, daily nutrition state, safe recipe links, optional-collection validation and stale merges.')
