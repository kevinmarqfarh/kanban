// Quiet improvements (2026-10-18): dates in quick add, supplements by time of day, the weather sentence,
// the home screen following the sun, and Ångra that puts back exactly what was removed.
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
const weather = await module('../src/lib/weather.ts', { './others': others })
const sun = await module('../src/lib/sun.ts')
const smhi = await module('../src/lib/smhi.ts')
const forecast = await module('../src/lib/forecast.ts', { './others': others, './smhi': smhi, './sun': sun, './weather': weather })
const quick = await module('../src/lib/quickAdd.ts', { './others': others })
const time = await module('../src/lib/nutritionTime.ts')
const undo = await module('../src/lib/undo.ts')
const fixture = JSON.parse(await readFile(new URL('./fixtures/smhi-goteborg-2026-10-15.json', import.meta.url), 'utf8'))

/* ---------------- Quick add understands dates ---------------- */
const { parseQuickTask, deadlineLabel } = quick
const TODAY = '2026-10-18' // Sunday
const q = text => { const r = parseQuickTask(text, TODAY); return [r.title, r.deadline, r.deadlineTime] }
assert.deepEqual(q('Ring tandläkaren fre 14'), ['Ring tandläkaren', '2026-10-23', '14:00'])
assert.deepEqual(q('Ring tandläkaren fredag kl. 14.30'), ['Ring tandläkaren', '2026-10-23', '14:30'])
assert.deepEqual(q('Hämta paket imorgon kl 17'), ['Hämta paket', '2026-10-19', '17:00'])
assert.deepEqual(q('Hämta paket i morgon'), ['Hämta paket', '2026-10-19', null])
assert.deepEqual(q('Betala hyran övermorgon'), ['Betala hyran', '2026-10-20', null])
assert.deepEqual(q('Städa idag'), ['Städa', TODAY, null])
assert.deepEqual(q('Städa på söndag'), ['Städa', TODAY, null], 'Today’s weekday means today.')
assert.deepEqual(q('Handla mån'), ['Handla', '2026-10-19', null])
assert.deepEqual(q('Möte tors 9'), ['Möte', '2026-10-22', '09:00'])
assert.deepEqual(q('Möte 24/10'), ['Möte', '2026-10-24', null])
assert.deepEqual(q('Möte 24/10 13:15'), ['Möte', '2026-10-24', '13:15'])
assert.deepEqual(q('Deklarera 2 maj'), ['Deklarera', '2027-05-02', null], 'A passed date means next year.')
assert.deepEqual(q('Deklarera 2 maj 2026'), ['Deklarera 2 maj 2026', null, null], 'An unrecognised ending is left alone.')
assert.deepEqual(q('Julklappar 24 dec'), ['Julklappar', '2026-12-24', null])
assert.deepEqual(q('Ansökan 2026-11-01'), ['Ansökan', '2026-11-01', null])
assert.deepEqual(q('Ring mamma kl 19'), ['Ring mamma', TODAY, '19:00'])
assert.deepEqual(q('Ring mamma 19:30'), ['Ring mamma', TODAY, '19:30'])
// Titles that only look like dates stay untouched.
assert.deepEqual(q('Läs kapitel 14'), ['Läs kapitel 14', null, null])
assert.deepEqual(q('Fredagsmys'), ['Fredagsmys', null, null])
assert.deepEqual(q('fre'), ['fre', null, null], 'A date alone is a title, not an empty task.')
assert.deepEqual(q('Möte 31/2'), ['Möte 31/2', null, null], 'Impossible dates are not guessed.')
assert.deepEqual(q('Möte fre 25'), ['Möte fre 25', null, null], 'Impossible times are not guessed.')
assert.deepEqual(q('  Möte   fre   14  '), ['Möte', '2026-10-23', '14:00'])
assert.equal(deadlineLabel(TODAY, '14:00', TODAY), 'Idag 14:00')
assert.equal(deadlineLabel('2026-10-19', null, TODAY), 'Imorgon')
assert.equal(deadlineLabel('2026-10-23', '14:00', TODAY), 'Fre 14:00', 'Within a week the chip needs only the weekday.')
assert.equal(deadlineLabel('2026-10-23', '14:00', TODAY, true), 'Fre 23 okt 14:00')
assert.equal(deadlineLabel('2026-12-24', null, TODAY), '24 dec')

/* ---------------- Supplements by time of day ---------------- */
const { orderHabitsByTime, currentNutritionTime } = time
const habits = [{ id: 'd', time: 'morning' }, { id: 'm', time: 'evening' }, { id: 'o', time: 'morning' }, { id: 'w', time: null }, { id: 'z', time: 'evening' }, { id: 'p' }]
const at = hour => new Date(2026, 9, 18, hour, 0)
assert.equal(currentNutritionTime(at(7)), 'morning')
assert.equal(currentNutritionTime(at(14)), 'morning')
assert.equal(currentNutritionTime(at(15)), 'evening')
assert.equal(currentNutritionTime(at(23)), 'evening')
assert.equal(currentNutritionTime(at(2)), 'evening', 'Late night is still evening.')
assert.equal(currentNutritionTime(at(4)), 'morning')
assert.deepEqual(orderHabitsByTime(habits, at(8)).map(h => h.id), ['d', 'o', 'w', 'p', 'm', 'z'], 'Morning first, then untimed, saved order kept.')
assert.deepEqual(orderHabitsByTime(habits, at(20)).map(h => h.id), ['m', 'z', 'w', 'p', 'd', 'o'], 'In the evening magnesium and co. come first.')
assert.equal(habits[0].id, 'd', 'The saved order itself never changes.')

/* ---------------- The weather sentence ---------------- */
const { buildForecast, weatherNote } = forecast
const place = weather.DEFAULT_PLACE
const real = buildForecast(place, '2026-10-15', smhi.parseSmhi(fixture), null, new Date('2026-10-15T07:50:00+02:00'))
const note = iso => weatherNote(real, new Date(iso))
assert.equal(note('2026-10-15T07:50:00+02:00'), 'Uppehåll resten av dagen, som varmast 15°.')
assert.equal(note('2026-10-15T19:00:00+02:00'), 'I morgon: regn 06–19, ta med paraply.', 'From 18:00 it is about tomorrow.')
assert.equal(note('2026-10-16T08:30:00+02:00'), 'Regn nu, fram till 19, ta med paraply.')
assert.equal(note('2026-10-16T19:00:00+02:00'), 'I morgon: klart, 6°–11°.')
assert.equal(weatherNote(null, new Date()), '')
// Frost overnight is mentioned.
const cold = { ...real, steps: real.steps.map(step => step.time > '2026-10-15T20:00:00.000Z' && step.time < '2026-10-16T06:00:00.000Z' ? { ...step, temp: -2.4 } : step) }
assert.match(weatherNote(cold, new Date('2026-10-15T09:00:00+02:00')), / Frost i natt, ner mot −2°\.$/)

/* ---------------- The home screen follows the sun ---------------- */
// useSunTheme's rule: dark between sunset (18:09) and sunrise (07:45) in Göteborg on 15 October.
const night = iso => sun.isNight(new Date(iso), '2026-10-15', place.latitude, place.longitude)
assert.equal(night('2026-10-15T07:30:00+02:00'), true)
assert.equal(night('2026-10-15T08:00:00+02:00'), false)
assert.equal(night('2026-10-15T18:00:00+02:00'), false)
assert.equal(night('2026-10-15T18:20:00+02:00'), true)

/* ---------------- Ångra ---------------- */
const { restoreRemoved } = undo
const before = {
  tasks: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }],
  projects: [{ id: 'p', title: 'P', tasks: [{ id: 'p1' }, { id: 'p2' }] }],
  birthdays: [{ id: 'x' }], birthdayNotifications: [{ id: 'n1', birthdayId: 'x' }],
  notes: [{ id: 'note', title: 'N', deletedAt: null }],
  columns: [{ id: 'todo' }],
}
// Delete task B: it comes back in its place.
let after = { ...before, tasks: before.tasks.filter(t => t.id !== 'b') }
assert.deepEqual(restoreRemoved(before, after, after).tasks.map(t => t.id), ['a', 'b', 'c'])
// …even when another change happened in between (a new task, an edited one): those stay.
const later = { ...after, tasks: [{ id: 'a', title: 'A2' }, { id: 'c', title: 'C' }, { id: 'd', title: 'D' }] }
assert.deepEqual(restoreRemoved(before, after, later).tasks, [{ id: 'a', title: 'A2' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }, { id: 'd', title: 'D' }])
// A birthday and its reminder come back together.
after = { ...before, birthdays: [], birthdayNotifications: [] }
const back = restoreRemoved(before, after, after)
assert.deepEqual([back.birthdays.length, back.birthdayNotifications.length], [1, 1])
// A task inside a project.
after = { ...before, projects: [{ ...before.projects[0], tasks: [{ id: 'p1' }] }] }
assert.deepEqual(restoreRemoved(before, after, after).projects[0].tasks.map(t => t.id), ['p1', 'p2'])
// A whole project with its tasks.
after = { ...before, projects: [] }
assert.deepEqual(restoreRemoved(before, after, after).projects, before.projects)
// A note moved to the trash comes out again.
after = { ...before, notes: [{ ...before.notes[0], deletedAt: '2026-10-18T10:00:00Z' }] }
assert.equal(restoreRemoved(before, after, after).notes[0].deletedAt, null)
// Something restored elsewhere (another tab) is not duplicated.
after = { ...before, tasks: before.tasks.filter(t => t.id !== 'b') }
assert.equal(restoreRemoved(before, after, before).tasks.length, 3)
// Nothing else is touched.
assert.equal(restoreRemoved(before, after, after).columns, after.columns)

console.log('Improvements passed: quick-add dates (weekdays, idag/imorgon/övermorgon, 24/10, 2 maj, ISO, kl/HH:MM, false friends left alone), supplements by time of day, the weather sentence incl. tomorrow and frost, sun-based dark mode, and Ångra restoring exactly what was removed.')
