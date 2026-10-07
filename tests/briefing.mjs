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
const helpers = await module('../src/lib/helpers.ts')
const others = await module('../src/lib/others.ts', { './birthdays': birthdays })
const briefing = await module('../src/lib/briefing.ts', { './helpers': helpers, './birthdays': birthdays, './others': others })
const debriefs = await module('../src/lib/debriefs.ts')
const { buildDailyBriefing, briefingToText, briefingDebriefPayload, deadlineState, giftTaskDraft, giftTaskId, intakeColumn, inProgressColumn, weekdayLabel, FOCUS_LIMIT, TIP_LIMIT } = briefing

const TODAY = '2026-10-07' // Wednesday
const at = (time, date = TODAY) => new Date(`${date}T${time}:00+02:00`)
const columns = [
  { id: 'todo', title: 'Att göra', color: 'gray' },
  { id: 'doing', title: 'Pågår', color: 'blue' },
  { id: 'done', title: 'Klart', color: 'green' },
  { id: 'finalized', title: 'Finalized', color: 'green' },
]
let seq = 0
const task = (title, values = {}) => ({ id: `t${++seq}`, title, description: '', columnId: 'todo', labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: '2026-10-01T09:00:00.000Z', ...values })
const person = (name, birthDate, values = {}) => ({ id: `b-${name}`, name, birthDate, reminders: [], createdAt: '2026-01-01T00:00:00.000Z', generatedReminders: [], tag: null, ...values })
const workspace = (tasks, people = []) => ({ columns, tasks, projects: [], birthdays: people })
const checklist = (done, total) => Array.from({ length: total }, (_, i) => ({ id: `c${i}`, title: `Punkt ${i + 1}`, completed: i < done }))

// --- Deadline state honours time of day and calendar days ---
assert.deepEqual(deadlineState(task('x', { deadline: '2026-10-05' }), TODAY, '09:00'), { kind: 'overdue', days: 2, time: null })
assert.deepEqual(deadlineState(task('x', { deadline: TODAY }), TODAY, '09:00'), { kind: 'today', time: null })
assert.deepEqual(deadlineState(task('x', { deadline: TODAY, deadlineTime: '08:30' }), TODAY, '09:00'), { kind: 'overdue', days: 0, time: '08:30' })
assert.deepEqual(deadlineState(task('x', { deadline: TODAY, deadlineTime: '14:00' }), TODAY, '09:00'), { kind: 'today', time: '14:00' })
assert.deepEqual(deadlineState(task('x', { deadline: '2026-10-08' }), TODAY, '09:00'), { kind: 'upcoming', days: 1, time: null })
assert.deepEqual(deadlineState(task('x', { deadline: 'not-a-date' }), TODAY, '09:00'), { kind: 'none' })
assert.deepEqual(deadlineState(task('x', { deadline: TODAY, deadlineTime: '25:99' }), TODAY, '23:00'), { kind: 'today', time: null }, 'Invalid times are ignored.')
// DST: 2026-10-25 is the autumn change in Sweden; days must still count by calendar.
assert.deepEqual(deadlineState(task('x', { deadline: '2026-10-26' }), '2026-10-24', '12:00'), { kind: 'upcoming', days: 2, time: null })

assert.equal(weekdayLabel(TODAY, TODAY), 'Idag')
assert.equal(weekdayLabel('2026-10-08', TODAY), 'I morgon')
assert.match(weekdayLabel('2026-10-10', TODAY), /^Lördag 10 okt/)

// --- Empty workspace is honest ---
{
  const result = buildDailyBriefing({ columns, tasks: [], projects: [] }, TODAY, at('08:00'))
  assert.equal(result.headline, 'Ett tomt blad')
  assert.equal(result.summary, 'Planner är tom.')
  assert.equal(result.greeting, 'God morgon')
  assert.deepEqual(result.focus, [])
  assert.deepEqual(result.agenda, [])
  assert.deepEqual(result.tips.map(tip => tip.kind), ['empty'])
  assert.equal(result.tips[0].title, 'Lägg till dagens uppgifter')
}

// --- All done ---
{
  const result = buildDailyBriefing(workspace([task('Klar sak', { columnId: 'done' }), task('Arkiverad', { columnId: 'finalized' })]), TODAY, at('12:00'))
  assert.equal(result.stats.open, 0)
  assert.equal(result.tips[0].title, 'Allt i Planner är klart')
  assert.equal(result.greeting, 'Hej')
}

// --- A busy day: ordering of focus, reasons, stats and tips ---
{
  seq = 0
  const tasks = [
    task('Försenad rapport', { deadline: '2026-10-04' }),
    task('Lite försenad', { deadline: '2026-10-06' }),
    task('Möte förberedelse', { deadline: TODAY, deadlineTime: '14:00' }),
    task('Tidigt samtal', { deadline: TODAY, deadlineTime: '10:00' }),
    task('Viktig utan datum', { priority: 'high' }),
    task('Pågående sak', { columnId: 'doing', checklist: checklist(3, 4) }),
    task('Nästa vecka', { deadline: '2026-10-12' }),
    task('Långt bort', { deadline: '2026-11-20' }),
    task('Redan klar', { columnId: 'done', deadline: '2026-10-01' }),
  ]
  const result = buildDailyBriefing(workspace(tasks), TODAY, at('09:00'))
  assert.equal(result.tone, 'busy')
  assert.equal(result.headline, 'En dag för fokus')
  assert.deepEqual(result.stats, { open: 8, overdue: 2, dueToday: 2, dueWeek: 1, inProgress: 1, highPriority: 1, birthdaysWeek: 0 })
  assert.equal(result.summary, '2 uppgifter har deadline idag och 2 är försenade.')
  assert.equal(result.focus.length, FOCUS_LIMIT)
  assert.deepEqual(result.focus.map(item => item.task.title), ['Försenad rapport', 'Lite försenad', 'Tidigt samtal'], 'Most overdue first, then the earliest timed deadline.')
  assert.deepEqual(result.focus[0].reasons, ['Försenad 3 dagar'])
  assert.deepEqual(result.focus[2].reasons, ['Deadline idag 10:00'])
  assert.ok(!result.focus.some(item => item.task.title === 'Redan klar'), 'Done cards are never suggested.')
  const kinds = result.tips.map(tip => tip.kind)
  assert.deepEqual(kinds.slice(0, 2), ['overdue', 'timed'])
  assert.match(result.tips[0].detail, /”Försenad rapport” \(3 dagar sen\)/)
  assert.equal(result.tips[0].taskId, tasks[0].id)
  assert.match(result.tips[1].detail, /^10:00 ”Tidigt samtal” och 14:00 ”Möte förberedelse”/)
  assert.ok(kinds.includes('quick-win'), 'A checklist with one item left is a quick win.')
  assert.match(result.tips.find(tip => tip.kind === 'quick-win').detail, /bara 1 punkt kvar/)
  assert.ok(!kinds.includes('calm'))
  assert.ok(result.tips.length <= TIP_LIMIT)
  // Agenda: today (times in order), and Monday's deadline. Overdue items are not repeated in the agenda.
  assert.equal(result.agenda[0].label, 'Idag'); assert.match(result.agenda[1].label, /^Måndag 12 okt/)
  assert.deepEqual(result.agenda[0].tasks.map(t => t.title), ['Tidigt samtal', 'Möte förberedelse'])
  assert.equal(result.agenda.length, 2)
}

// --- Clock times today win over momentum ---
{
  seq = 0
  const result = buildDailyBriefing(workspace([
    task('Presentation 15:00', { deadline: TODAY, deadlineTime: '15:00', columnId: 'doing', checklist: checklist(2, 3) }),
    task('Samtal 10:30', { deadline: TODAY, deadlineTime: '10:30' }),
    task('Utan tid idag', { deadline: TODAY, columnId: 'doing' }),
  ]), TODAY, at('09:00'))
  assert.deepEqual(result.focus.map(item => item.task.title), ['Samtal 10:30', 'Presentation 15:00', 'Utan tid idag'])
}

// --- Time passing turns a timed deadline into overdue ---
{
  seq = 0
  const result = buildDailyBriefing(workspace([task('Lunchmöte', { deadline: TODAY, deadlineTime: '12:00' })]), TODAY, at('13:15'))
  assert.equal(result.stats.overdue, 1)
  assert.deepEqual(result.focus[0].reasons, ['Försenad sedan 12:00'])
  assert.equal(result.agenda.length, 0, 'An overdue card is not shown again under today.')
}

// --- Overload ---
{
  seq = 0
  const tasks = Array.from({ length: 7 }, (_, i) => task(`Uppgift ${i + 1}`, { deadline: i < 3 ? '2026-10-06' : TODAY }))
  const result = buildDailyBriefing(workspace(tasks), TODAY, at('08:00'))
  assert.equal(result.tone, 'overloaded')
  assert.equal(result.headline, 'Mer än en dag rymmer')
  assert.equal(result.tips[0].kind, 'overload')
  assert.match(result.tips[0].detail, /^7 uppgifter är försenade eller ska vara klara idag/)
  assert.ok(!result.tips.some(tip => tip.kind === 'start'), 'No "start something" advice on an overloaded day.')
}

// --- WIP limit and nothing started ---
{
  seq = 0
  const wip = buildDailyBriefing(workspace(Array.from({ length: 4 }, (_, i) => task(`Pågår ${i}`, { columnId: 'doing' }))), TODAY, at('09:00'))
  assert.ok(wip.tips.some(tip => tip.kind === 'wip' && /4 uppgifter ligger i Pågår/.test(tip.detail)))
  const idle = buildDailyBriefing(workspace([task('Börja här', { priority: 'high' }), task('Sen')]), TODAY, at('09:00'))
  const start = idle.tips.find(tip => tip.kind === 'start')
  assert.ok(start && /Flytta ”Börja här” dit/.test(start.detail))
  assert.equal(idle.tone, 'steady')
}

// --- Calm day surfaces stale work, evening prepares tomorrow ---
{
  seq = 0
  const calm = buildDailyBriefing(workspace([
    task('Gammal idé', { createdAt: '2026-08-20T10:00:00.000Z' }),
    task('Ny idé', { createdAt: '2026-10-06T10:00:00.000Z', columnId: 'doing' }),
  ]), TODAY, at('10:00'))
  assert.equal(calm.tone, 'calm')
  assert.equal(calm.headline, 'En lugn dag')
  assert.match(calm.summary, /^Inget har deadline idag\. Du har 2 uppgifter öppna i Planner\./)
  const stale = calm.tips.find(tip => tip.kind === 'stale')
  assert.ok(stale && /”Gammal idé” har väntat sedan 20 augusti/.test(stale.detail))
  assert.ok(calm.tips.some(tip => tip.kind === 'calm'))

  const evening = buildDailyBriefing(workspace([task('Imorgon-grej', { deadline: '2026-10-08' })]), TODAY, at('19:30'))
  assert.equal(evening.greeting, 'God kväll')
  assert.equal(evening.summary, '1 uppgift har deadline i morgon.')
  assert.ok(evening.tips.some(tip => tip.kind === 'evening' && /”Imorgon-grej”/.test(tip.detail)))
  const morning = buildDailyBriefing(workspace([task('Imorgon-grej', { deadline: '2026-10-08' })]), TODAY, at('08:00'))
  assert.ok(!morning.tips.some(tip => tip.kind === 'evening'))
}

// --- Birthdays: today, this week, two weeks, ignored beyond and future-born ---
{
  seq = 0
  const people = [
    person('Anna', '1990-10-07'),
    person('Bo', '1985-10-08'),
    person('Cia', '2000-10-11'),
    person('Dan', '1970-10-19'),
    person('Eva', '1999-12-24'),
    person('Ofödd', '2027-01-01'),
    person('Trasig', '2026-02-30'),
  ]
  const result = buildDailyBriefing(workspace([], people), TODAY, at('09:00'))
  assert.equal(result.stats.birthdaysWeek, 3)
  assert.match(result.summary, /Anna fyller år idag\.$/)
  const kinds = result.tips.map(tip => `${tip.kind}:${tip.birthdayId ?? ''}`)
  assert.equal(kinds[0], 'birthday-today:b-Anna', 'A birthday today is the first suggestion.')
  assert.match(result.tips[0].title, /^Anna fyller 36 idag$/)
  const bo = result.tips.find(tip => tip.birthdayId === 'b-Bo')
  assert.equal(bo.kind, 'birthday-soon'); assert.equal(bo.title, 'Bo fyller 41 i morgon'); assert.match(bo.detail, /dags idag/)
  const cia = result.tips.find(tip => tip.birthdayId === 'b-Cia')
  assert.equal(cia.title, 'Cia fyller 26 på söndag'); assert.match(cia.detail, /post/)
  const dan = result.tips.find(tip => tip.birthdayId === 'b-Dan')
  assert.equal(dan.kind, 'birthday-plan'); assert.equal(dan.title, 'Dan fyller 56 om 12 dagar')
  assert.ok(!result.tips.some(tip => tip.birthdayId === 'b-Eva'), 'Birthdays beyond 14 days stay quiet.')
  assert.ok(!JSON.stringify(result).includes('Ofödd') && !JSON.stringify(result).includes('Trasig'))
  assert.deepEqual(result.agenda.map(day => day.birthdays.map(entry => entry.birthday.name)), [['Anna'], ['Bo'], ['Cia']])
  assert.deepEqual(bo.gift, { id: giftTaskId('b-Bo', '2026-10-08'), title: 'Present till Bo', description: 'Bo fyller 41 år den 8 oktober.', deadline: TODAY, birthdayId: 'b-Bo' }, 'Gift deadline never lands in the past.')
  assert.equal(cia.gift.deadline, '2026-10-10', 'Gift deadline is the day before the birthday.')
  assert.ok(!result.tips.find(tip => tip.birthdayId === 'b-Anna').gift, 'No gift card for a birthday that is today.')
}

// Summary mentions the next birthday by weekday when none is today.
{
  const result = buildDailyBriefing(workspace([], [person('Cia', '2000-10-11')]), TODAY, at('09:00'))
  assert.match(result.summary, /Cia fyller 26 på söndag\.$/)
}

// Feb 29 birthdays are observed on Feb 28.
{
  const result = buildDailyBriefing(workspace([], [person('Skott', '2000-02-29')]), '2027-02-27', new Date('2027-02-27T09:00:00+01:00'))
  assert.equal(result.tips[0].title, 'Skott fyller 27 i morgon')
}

// --- Columns ---
assert.equal(inProgressColumn(columns).id, 'doing')
assert.equal(inProgressColumn([{ id: 'x', title: 'Doing', color: 'gray' }]).id, 'x')
assert.equal(inProgressColumn([{ id: 'x', title: 'Backlog', color: 'gray' }]), undefined)
assert.equal(intakeColumn(workspace([])).id, 'todo')
assert.equal(intakeColumn({ columns: [{ id: 'doing', title: 'Pågår', color: 'g' }, { id: 'later', title: 'Senare', color: 'g' }, { id: 'done', title: 'Klart', color: 'g' }, { id: 'finalized', title: 'Finalized', color: 'g' }], tasks: [], projects: [] }).id, 'later')

// Custom columns without a "doing" column produce no WIP/start tips.
{
  const custom = { columns: [{ id: 'a', title: 'Backlog', color: 'g' }, { id: 'b', title: 'Done', color: 'g' }], tasks: [task('Ensam')], projects: [] }
  const result = buildDailyBriefing(custom, TODAY, at('09:00'))
  assert.ok(!result.tips.some(tip => tip.kind === 'wip' || tip.kind === 'start'))
}

// --- Determinism: same inputs, same output; input not mutated ---
{
  seq = 0
  const input = workspace([task('A', { deadline: TODAY }), task('B', { priority: 'high' })], [person('Bo', '1985-10-08')])
  const frozen = structuredClone(input)
  const first = buildDailyBriefing(input, TODAY, at('09:00'))
  const second = buildDailyBriefing(input, TODAY, at('09:00'))
  assert.deepEqual(first, second)
  assert.deepEqual(input, frozen)
}

// --- Plain text and debrief payload pass the existing import validator ---
{
  seq = 0
  const result = buildDailyBriefing(workspace([task('Möte', { deadline: TODAY, deadlineTime: '14:00', priority: 'high' })], [person('Bo', '1985-10-08')]), TODAY, at('09:00'))
  const text = briefingToText(result)
  assert.match(text, /^En hanterbar dag\n1 uppgift har deadline idag\. Bo fyller 41 i morgon\.\n\nGör först\n1\. Möte – Deadline idag 14:00, Hög prioritet/)
  assert.match(text, /\nKommande dagar\nIdag: 14:00 Möte\nI morgon: Bo fyller 41$/)
  const payload = briefingDebriefPayload(result, at('09:00'))
  const parsed = debriefs.parseDebriefPayload(payload, at('09:00'))
  assert.equal(parsed.date, TODAY)
  assert.equal(parsed.title, 'Dagens briefing – En hanterbar dag')
  assert.ok(debriefs.isDailyDebrief(parsed))
}

// giftTaskDraft for a birthday far ahead
assert.equal(giftTaskDraft(person('Z', '1990-12-24'), '2026-12-24', 36, TODAY).deadline, '2026-12-23')

console.log('Daily briefing passed: deadlines with times and DST, focus ranking, tone, overload, WIP, quick wins, calm/stale/evening advice, birthdays (today/soon/plan/leap day), gift cards, agenda, determinism and debrief export.')
