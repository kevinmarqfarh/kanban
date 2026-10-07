// Domain checks for birthday tags/order/countdown, nutrition day status, workout history and recipe labels.
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
const { isWorkspace, migrateWorkspace, purgeNoteTrash } = await module('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })
const notesLib = await module('../src/lib/notes.ts')
const { mergeWorkspaceChanges, mergeRecordChanges } = await module('../src/lib/workspaceMerge.ts')
const {
  BIRTHDAY_TAGS, birthdayCountdownLabel, birthdayUrgency, birthdayGroupKey, birthdayTagOptions, cleanBirthdayTag, daysUntilBirthday, groupBirthdays,
  isValidBirthdayTag, normalizeBirthdays, resolveBirthdayTag, sortBirthdaysByUpcoming, UNTAGGED_GROUP,
} = birthdays
const {
  exerciseSuggestions, exerciseSummary, isRecipeImage, findExercise, nutritionCompletionId, nutritionDayStatus, recentExercises, recipeLabelOptions,
  workoutLoadUnits, workoutRawText,
} = others

const day = date => { const [year, month, dayOfMonth] = date.split('-').map(Number); return new Date(year, month - 1, dayOfMonth, 12) }
const stamp = '2026-10-01T09:00:00.000Z'
const person = (id, name, birthDate, tag) => ({ id, name, birthDate, reminders: [], createdAt: stamp, generatedReminders: [], ...(tag === undefined ? {} : { tag }) })
const base = { columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }], tasks: [], projects: [] }

/* ---------- Birthday tags ---------- */
assert.deepEqual([...BIRTHDAY_TAGS], ['Familj', 'Vänner', 'Jobb'])
assert.equal(cleanBirthdayTag('  Gamla   klassen  '), 'Gamla klassen')
assert.equal(cleanBirthdayTag('x'.repeat(60)).length, 40)
assert.equal(resolveBirthdayTag('familj'), 'Familj', 'Typed preset names join the preset regardless of case.')
assert.equal(resolveBirthdayTag(' VÄNNER '), 'Vänner')
assert.equal(resolveBirthdayTag('padel', ['Padel']), 'Padel', 'Custom tags reuse the existing spelling.')
assert.equal(resolveBirthdayTag('Bokklubben'), 'Bokklubben')
for (const value of ['', '   ', null, undefined]) assert.equal(resolveBirthdayTag(value), null)
assert.equal(birthdayGroupKey('Familj'), birthdayGroupKey('familj'))
assert.equal(birthdayGroupKey(null), UNTAGGED_GROUP)
assert.equal(birthdayGroupKey('  '), UNTAGGED_GROUP)
for (const value of [undefined, null, 'Familj', 'x'.repeat(40)]) assert.equal(isValidBirthdayTag(value), true)
for (const value of ['', '   ', 'x'.repeat(41), 4, ['Familj'], {}]) assert.equal(isValidBirthdayTag(value), false)
assert.deepEqual(birthdayTagOptions([person('a', 'A', '1990-01-01', 'padel'), person('b', 'B', '1990-01-01', 'Bokklubben'), person('c', 'C', '1990-01-01', 'familj'), person('d', 'D', '1990-01-01', 'Padel')]),
  ['Familj', 'Vänner', 'Jobb', 'Bokklubben', 'padel'], 'Presets first, then distinct own tags in Swedish order.')

/* ---------- Grouping keeps manual order inside each group ---------- */
const people = [
  person('erik', 'Erik', '1988-10-07', null), person('mamma', 'Mamma', '1962-12-03', 'Familj'), person('anna', 'Anna', '1990-10-20', 'Vänner'),
  person('sara', 'Sara', '2019-03-14', 'familj'), person('ola', 'Ola', '1985-06-01', 'Padel'), person('bo', 'Bo', '1970-02-02', 'Bokklubben'),
]
const groups = groupBirthdays(people)
assert.deepEqual(groups.map(group => group.label), ['Familj', 'Vänner', 'Bokklubben', 'Padel', 'Utan tagg'])
assert.deepEqual(groups[0].birthdays.map(entry => entry.id), ['mamma', 'sara'], 'Case variants share a group and keep stored order.')
assert.equal(groups.at(-1).tag, null)
assert.deepEqual(groupBirthdays(people, true).map(group => group.label), ['Familj', 'Vänner', 'Jobb', 'Bokklubben', 'Padel', 'Utan tagg'], 'Empty presets can be offered as drop targets.')
assert.deepEqual(groupBirthdays([]), [])

/* ---------- Countdown ---------- */
assert.equal(daysUntilBirthday('1988-10-07', day('2026-10-06')), 1)
assert.equal(daysUntilBirthday('1988-10-06', day('2026-10-06')), 0)
assert.equal(daysUntilBirthday('1988-10-05', day('2026-10-06')), 364, 'Yesterday counts to next year.')
assert.equal(daysUntilBirthday('2000-02-29', day('2027-02-27')), 1, 'Leap-day birthdays are celebrated on 28 February in common years.')
assert.equal(daysUntilBirthday('2000-02-29', day('2028-02-27')), 2)
assert.equal(daysUntilBirthday('1990-03-30', day('2027-03-27')), 3, 'Counting across the spring DST change stays in whole days.')
assert.equal(daysUntilBirthday('1990-10-31', day('2026-10-24')), 7, 'Counting across the autumn DST change stays in whole days.')
assert.deepEqual([0, 1, 7, 8, 14, 15, 30, 31, 200].map(birthdayUrgency), ['red', 'red', 'red', 'yellow', 'yellow', 'green', 'green', null, null], 'Red within 7 days, yellow within 14, green within 30.')
assert.equal(birthdayCountdownLabel(0), 'Idag')
assert.equal(birthdayCountdownLabel(1), 'I morgon')
assert.equal(birthdayCountdownLabel(23), '23 dagar kvar')

/* ---------- Ordering and one-time migration ---------- */
assert.deepEqual(sortBirthdaysByUpcoming(people, day('2026-10-06')).map(entry => entry.id), ['erik', 'anna', 'mamma', 'bo', 'sara', 'ola'])
const legacy = { ...base, birthdays: [person('mamma', 'Mamma', '1962-12-03'), person('erik', 'Erik', '1988-10-07'), person('anna', 'Anna', '1990-10-20')] }
const migrated = normalizeBirthdays(legacy, day('2026-10-06'))
assert.deepEqual(migrated.birthdays.map(entry => entry.id), ['erik', 'anna', 'mamma'], 'Legacy lists keep the date order they were shown in.')
assert.ok(migrated.birthdays.every(entry => entry.tag === null))
assert.equal(normalizeBirthdays(migrated, day('2027-01-01')), migrated, 'Migration runs once; a manual order is never re-sorted.')
const mixed = { ...base, birthdays: [person('mamma', 'Mamma', '1962-12-03', 'Familj'), person('new', 'Ny från äldre flik', '1999-10-10')] }
assert.deepEqual(normalizeBirthdays(mixed, day('2026-10-06')).birthdays.map(entry => [entry.id, entry.tag]), [['mamma', 'Familj'], ['new', null]], 'A record from an older client gets a tag without reordering.')
assert.equal(normalizeBirthdays(base), base)
const full = migrateWorkspace(legacy, day('2026-10-06'))
assert.ok(isWorkspace(full))
assert.deepEqual(migrateWorkspace(full, day('2026-10-06')), full, 'Migration is idempotent.')

/* ---------- Validation and merging ---------- */
assert.ok(isWorkspace({ ...base, birthdays: [person('a', 'A', '1990-01-01', 'Familj')] }))
assert.ok(isWorkspace({ ...base, birthdays: [person('a', 'A', '1990-01-01')] }), 'Records saved before tags still load.')
assert.equal(isWorkspace({ ...base, birthdays: [person('a', 'A', '1990-01-01', '')] }), false)
assert.equal(isWorkspace({ ...base, birthdays: [person('a', 'A', '1990-01-01', 'x'.repeat(41))] }), false)
const original = person('a', 'Anna', '1990-10-20', 'Vänner')
assert.equal(mergeRecordChanges(original, { ...original, tag: 'Familj' }, { ...original, name: 'Anna A.' }).tag, 'Familj', 'A tag change and a name change from another tab both survive.')
assert.equal(mergeRecordChanges(original, { ...original, tag: 'Familj' }, { ...original, name: 'Anna A.' }).name, 'Anna A.')
const ordered = { ...base, birthdays: [person('a', 'A', '1990-01-01', null), person('b', 'B', '1990-01-02', null), person('c', 'C', '1990-01-03', null)] }
const reordered = { ...ordered, birthdays: [ordered.birthdays[2], ordered.birthdays[0], ordered.birthdays[1]] }
const otherTab = { ...ordered, birthdays: [...ordered.birthdays, person('d', 'D', '1990-01-04', null)] }
assert.deepEqual(mergeWorkspaceChanges(ordered, reordered, otherTab).birthdays.map(entry => entry.id), ['c', 'a', 'b', 'd'], 'A dragged order merges with a person added in another tab.')

/* ---------- Nutrition day status ---------- */
const habit = (id, createdAt = '2026-09-28T08:00:00.000Z') => ({ id, title: id, amount: '1', unit: 'st', createdAt })
const done = (habitId, date, completed = true) => ({ id: nutritionCompletionId(habitId, date), habitId, date, completed })
const nutrition = { ...base, nutritionHabits: [habit('vatten'), habit('vitamin'), habit('frukt', '2026-10-06T06:00:00.000Z')], nutritionCompletions: [
  done('vatten', '2026-10-05'), done('vitamin', '2026-10-05'),
  done('vatten', '2026-10-06'),
  done('vatten', '2026-10-04'), done('vitamin', '2026-10-04', false),
] }
assert.equal(nutritionDayStatus(nutrition, '2026-10-05', '2026-10-06'), 'complete', 'Every habit that existed that day is done → green.')
assert.equal(nutritionDayStatus(nutrition, '2026-10-06', '2026-10-06'), 'incomplete', 'Today with something missing → orange.')
assert.equal(nutritionDayStatus(nutrition, '2026-10-04', '2026-10-06'), 'incomplete', 'An unchecked habit counts as missing.')
assert.equal(nutritionDayStatus(nutrition, '2026-10-03', '2026-10-06'), 'incomplete', 'A past day with nothing logged is orange.')
assert.equal(nutritionDayStatus(nutrition, '2026-10-07', '2026-10-06'), null, 'Future days stay neutral.')
assert.equal(nutritionDayStatus(nutrition, '2026-09-27', '2026-10-06'), null, 'Days before any habit existed stay neutral.')
assert.equal(nutritionDayStatus({ ...base }, '2026-10-06', '2026-10-06'), null)
assert.equal(nutritionDayStatus({ ...nutrition, nutritionCompletions: [...nutrition.nutritionCompletions, done('frukt', '2026-10-01')] }, '2026-10-01', '2026-10-06'), 'incomplete', 'A habit logged before its creation date also counts on that day.')
const allToday = { ...nutrition, nutritionCompletions: [...nutrition.nutritionCompletions, done('vitamin', '2026-10-06'), done('frukt', '2026-10-06')] }
assert.equal(nutritionDayStatus(allToday, '2026-10-06', '2026-10-06'), 'complete')

/* ---------- Workouts: level unit and recent exercises ---------- */
assert.deepEqual(workoutLoadUnits.map(unit => unit.value), ['kg', 'time', 'level'])
assert.equal(workoutLoadUnits.find(unit => unit.value === 'level').field, 'Nivå')
const row = (id, title, values = {}) => ({ id, title, amount: '', amountUnit: 'sets', load: '', loadUnit: 'kg', bpm: '', ...values })
const workout = (id, date, rows, createdAt = `${date}T10:00:00.000Z`) => ({ id, date, title: '', rows, createdAt })
const bike = row('r-bike', 'Cykel', { amount: '20', amountUnit: 'min', load: '8', loadUnit: 'level', bpm: '135' })
assert.equal(workoutRawText(workout('w', '2026-10-06', [bike])), 'Träningspass · 2026-10-06\nCykel · 20 min · nivå 8 · 135 BPM')
assert.ok(isWorkspace({ ...base, workouts: [workout('w', '2026-10-06', [bike])] }), 'Nivå is a valid load unit.')
assert.equal(isWorkspace({ ...base, workouts: [workout('w', '2026-10-06', [{ ...bike, loadUnit: 'stone' }])] }), false)
assert.equal(exerciseSummary(bike), '20 min · nivå 8 · 135 BPM')
assert.equal(exerciseSummary(row('x', 'Knäböj', { amount: '3', load: '60' })), '3 set · 60 kg')
assert.equal(exerciseSummary(row('x', 'Plankan')), '')
const history = [
  workout('old', '2026-09-01', [row('1', 'Knäböj', { amount: '3', load: '50' }), row('2', 'Marklyft', { amount: '3', load: '80' })]),
  workout('new', '2026-10-05', [row('3', ' knäböj ', { amount: '4', load: '60' }), bike]),
  workout('same-day-later', '2026-10-05', [row('4', 'Bänkpress', { amount: '3', load: '40' })], '2026-10-05T18:00:00.000Z'),
]
const recent = recentExercises(history)
assert.deepEqual(recent.map(entry => entry.title), ['Bänkpress', 'knäböj', 'Cykel', 'Marklyft'], 'Most recent first, one entry per exercise regardless of case or spacing.')
assert.equal(recent.find(entry => entry.title === 'knäböj').row.load, '60', 'The latest values are remembered.')
assert.deepEqual(recentExercises(history, 'new').map(entry => entry.title), ['Bänkpress', 'Knäböj', 'Marklyft'], 'The workout being edited is not its own history.')
assert.deepEqual(exerciseSuggestions(recent, '').map(entry => entry.title), ['Bänkpress', 'knäböj', 'Cykel', 'Marklyft'])
assert.deepEqual(exerciseSuggestions(recent, 'k').map(entry => entry.title), ['knäböj', 'Bänkpress', 'Cykel', 'Marklyft'], 'Prefix matches first, then other matches.')
assert.deepEqual(exerciseSuggestions(recent, 'KNÄ').map(entry => entry.title), ['knäböj'])
assert.deepEqual(exerciseSuggestions(recent, 'knäböj'), [], 'An exact match needs no suggestion.')
assert.deepEqual(exerciseSuggestions(recent, 'simning'), [])
assert.equal(exerciseSuggestions(Array.from({ length: 20 }, (_, index) => ({ title: `Övning ${index}`, date: '2026-10-01', row: row(String(index), `Övning ${index}`) })), '').length, 8)
assert.equal(findExercise(recent, 'KNÄBÖJ').row.amount, '4')
assert.equal(findExercise(recent, ''), undefined)

/* ---------- Recipe labels ---------- */
assert.deepEqual(recipeLabelOptions([{ labels: ['frukost', 'Snabbt'] }, { labels: ['snabbt', 'Vegetariskt', 'MIDDAG'] }], ['Asiatiskt']),
  ['frukost', 'snacks', 'middag', 'Asiatiskt', 'Snabbt', 'Vegetariskt'], 'Presets stay first; own labels are distinct and sorted.')
assert.deepEqual(recipeLabelOptions([]), ['frukost', 'snacks', 'middag'])

/* ---------- Recipe images ---------- */
const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(1000)
assert.equal(isRecipeImage(jpeg), true)
assert.equal(isRecipeImage('data:image/png;base64,iVBORw0KGgo='), true)
for (const value of ['', 'https://example.org/bild.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg==', 'data:image/jpeg;base64,<script>', 'data:image/jpeg;base64,' + 'A'.repeat(700_001), 42]) assert.equal(isRecipeImage(value), false, `Rejected: ${String(value).slice(0, 40)}`)
const recipe = { id: 'r', title: 'Pasta', url: '', steps: '', labels: [], createdAt: stamp }
assert.ok(isWorkspace({ ...base, recipes: [recipe] }), 'Recipes without an image stay valid.')
assert.ok(isWorkspace({ ...base, recipes: [{ ...recipe, image: jpeg }] }))
assert.equal(isWorkspace({ ...base, recipes: [{ ...recipe, image: 'javascript:alert(1)' }] }), false)

/* ---------- Task priority ---------- */
const plannerTask = { id: 't', title: 'Kort', description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: stamp }
for (const priority of [undefined, null, 'high', 'medium', 'low']) assert.ok(isWorkspace({ ...base, tasks: [{ ...plannerTask, ...(priority === undefined ? {} : { priority }) }] }), `Priority ${priority} is valid.`)
for (const priority of ['urgent', '', 1, 'High']) assert.equal(isWorkspace({ ...base, tasks: [{ ...plannerTask, priority }] }), false, `Priority ${priority} is rejected.`)

/* ---------- Notes trash (30 days) ---------- */
const note = (id, deletedAt) => ({ id, title: id, content: '', font: 'system', createdAt: stamp, updatedAt: stamp, ...(deletedAt === undefined ? {} : { deletedAt }) })
const now = new Date('2026-10-07T12:00:00.000Z')
const trashed = { ...base, notes: [note('kept'), note('restored', null), note('fresh', '2026-10-06T12:00:00.000Z'), note('last-day', '2026-09-08T00:00:00.000Z'), note('expired', '2026-09-07T12:00:00.000Z'), note('ancient', '2026-01-01T00:00:00.000Z')] }
assert.ok(isWorkspace(trashed), 'deletedAt may be missing, null or a timestamp.')
assert.equal(isWorkspace({ ...base, notes: [note('x', 'igår')] }), false)
assert.deepEqual(purgeNoteTrash(trashed, now).notes.map(entry => entry.id), ['kept', 'restored', 'fresh', 'last-day'], 'Trashed notes older than 30 days are removed for good.')
assert.equal(purgeNoteTrash({ ...base, notes: [note('kept')] }, now).notes.length, 1)
const unchanged = { ...base, notes: [note('fresh', '2026-10-06T12:00:00.000Z')] }
assert.equal(purgeNoteTrash(unchanged, now), unchanged, 'Nothing to purge keeps the same workspace object.')
assert.deepEqual(migrateWorkspace(trashed, now).notes.map(entry => entry.id), ['kept', 'restored', 'fresh', 'last-day'], 'Every load purges expired trash.')
assert.equal(notesLib.trashDaysLeft(note('fresh', '2026-10-06T12:00:00.000Z'), now), 29)
assert.equal(notesLib.trashDaysLeft(note('last-day', '2026-09-08T00:00:00.000Z'), now), 1)
assert.equal(notesLib.trashDaysLeft(note('just', '2026-10-07T12:00:00.000Z'), now), 30)
assert.equal(notesLib.isTrashed(note('a', null)), false); assert.equal(notesLib.isTrashed(note('b', stamp)), true)

console.log('Tags and tracking passed: notes trash, task priority, recipe images, birthday tags, grouping, manual order, countdown, one-time migration and merges; nutrition green/orange days; Nivå and recent exercises; recipe label options.')
