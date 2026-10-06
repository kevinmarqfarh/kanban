import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/lib/debriefs.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
const exports = {}
new Function('exports', outputText)(exports)
const { isDailyDebrief, parseDebriefPayload, mergeDebrief, markDebriefRead, dismissDebrief, unreadDebriefs } = exports

const now = new Date('2026-10-05T08:00:00.000Z')
const later = new Date('2026-10-05T12:00:00.000Z')
const payload = (values = {}) => ({ date: '2026-10-05', title: 'Dagens debriefing', summary: 'Tre saker att prioritera.', body: 'Börja med uppgiften som närmar sig sin deadline.', ...values })
const parsed = parseDebriefPayload(payload(), now)
assert.ok(isDailyDebrief(parsed))
assert.equal(parsed.id, '2026-10-05')
assert.equal(parsed.createdAt, now.toISOString())
assert.equal(parsed.readAt, null)
assert.equal(parsed.dismissedAt, null)
assert.deepEqual(parseDebriefPayload(JSON.stringify(payload()), now), parsed)
const trimmed = parseDebriefPayload(payload({ title: '  Rubrik  ', summary: '  ', body: '\n Rad ett\nRad två \n', readAt: now.toISOString(), dismissedAt: now.toISOString(), id: 'arbitrary', unknown: 'ignored' }), now)
assert.equal(trimmed.title, 'Rubrik')
assert.equal(trimmed.summary, '')
assert.equal(trimmed.body, 'Rad ett\nRad två')
assert.equal(trimmed.readAt, null, 'An imported payload cannot set read state.')
assert.equal(trimmed.dismissedAt, null)
assert.equal(trimmed.id, trimmed.date)
assert.equal('unknown' in trimmed, false)
const plainText = '<script>window.bad = true</script>\n"Citat" & <strong>text</strong>\\slut'
assert.equal(parseDebriefPayload(JSON.stringify(payload({ body: plainText })), now).body, plainText, 'Keep escaped JSON and HTML-looking content as plain text.')
for (const date of ['0001-01-01', '2020-02-29', '2026-01-01', '2027-10-05', '9999-12-31']) assert.equal(parseDebriefPayload(payload({ date }), now).date, date, 'Historical and future reports are valid.')
for (const date of ['0000-01-01', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-01', '05-10-2026', '2026-10-05T00:00:00Z']) {
  assert.throws(() => parseDebriefPayload(payload({ date }), now), /Datumet/)
}
for (const value of [null, [], {}, 4, '{}', '{ bad', 'null', '[{}]']) assert.throws(() => parseDebriefPayload(value, now), /JSON|Datumet/)
for (const [key, value] of [['title', ' '], ['title', 4], ['title', 'a'.repeat(121)], ['summary', null], ['summary', 'a'.repeat(501)], ['body', ' '], ['body', false], ['body', 'a'.repeat(20001)], ['body', 'text\0end']]) {
  assert.throws(() => parseDebriefPayload(payload({ [key]: value }), now), /text|tom|tecken/)
}
assert.equal(parseDebriefPayload(payload({ title: '🎂'.repeat(120) }), now).title, '🎂'.repeat(120), 'Character limits match Unicode characters in PostgreSQL.')
for (const createdAt of ['2026-10-05T08:00:00.000Z', '2026-10-05T10:00:00+02:00', '2026-10-05T08:00:00.123456+00:00', '0001-01-01T00:00:00Z']) {
  assert.equal(parseDebriefPayload(payload({ createdAt }), now).createdAt, createdAt)
}
for (const createdAt of ['2026-02-30T10:00:00Z', '2026-10-05', '2026-10-05T10:00:00', '2026-10-05T24:00:00Z', '2026-10-05T08:60:00Z', '2026-10-05T08:00:60Z', '2026-10-05T08:00:00+24:00', 'now', null]) {
  assert.throws(() => parseDebriefPayload(payload({ createdAt }), now), /ISO-tid/)
}
for (const value of [{ ...parsed, id: 'other' }, { ...parsed, date: '2026-04-31' }, { ...parsed, title: '' }, { ...parsed, body: null }, { ...parsed, readAt: '2026-02-30T08:00:00Z' }, { ...parsed, dismissedAt: undefined }, { ...parsed, createdAt: 'infinity' }]) {
  assert.equal(isDailyDebrief(value), false, 'Bad cache and remote rows must be rejected.')
}
assert.ok(isDailyDebrief({ ...parsed, readAt: now.toISOString(), dismissedAt: later.toISOString() }))

const older = parseDebriefPayload(payload({ date: '2026-10-03', title: 'Äldre' }), now)
const newer = parseDebriefPayload(payload({ date: '2026-10-06', title: 'Nyare' }), now)
let list = mergeDebrief([older], parsed)
list = mergeDebrief(list, newer)
assert.deepEqual(list.map(entry => entry.date), ['2026-10-06', '2026-10-05', '2026-10-03'])
assert.equal(unreadDebriefs(list).length, 3)
const unsortedCache = [older, newer, parsed]
assert.deepEqual(unreadDebriefs(unsortedCache).map(entry => entry.date), ['2026-10-06', '2026-10-05', '2026-10-03'], 'The newest unread report opens first even when cached entries are out of order.')
assert.equal(unsortedCache[0], older, 'Sorting unread reports must not reorder the source cache.')
const beforeRead = list
list = markDebriefRead(list, parsed.id, now)
assert.equal(beforeRead[1].readAt, null, 'State helpers must not mutate the source array.')
assert.equal(list[1].readAt, now.toISOString())
assert.equal(list[0], beforeRead[0], 'Unchanged report objects keep their reference.')
assert.equal(markDebriefRead(list, parsed.id, later), list)
assert.equal(markDebriefRead(list, 'missing', later), list)
assert.equal(unreadDebriefs(list).length, 2)
list = dismissDebrief(list, older.id, later)
assert.equal(list[2].readAt, null, 'Dismissal alone does not mark an unread report as read.')
assert.equal(list[2].dismissedAt, later.toISOString())
assert.equal(dismissDebrief(list, older.id, now), list)
assert.equal(dismissDebrief(list, 'missing', now), list)
assert.equal(unreadDebriefs(list).length, 1)
assert.equal(list.length, 3, 'Dismissal retains history.')

assert.equal(mergeDebrief(list, parseDebriefPayload(payload(), later)), list, 'An identical import without createdAt preserves its read state and array reference.')
assert.equal(mergeDebrief(list, parseDebriefPayload(payload({ date: '2026-10-03', title: 'Äldre', createdAt: later.toISOString() }), later)), list, 'An identical dismissed report remains dismissed even if its timestamp changes.')
const revised = mergeDebrief(list, parseDebriefPayload(payload({ body: 'Uppdaterat innehåll.', createdAt: later.toISOString() }), later))
assert.equal(revised.length, 3)
assert.equal(revised[1].body, 'Uppdaterat innehåll.')
assert.equal(revised[1].createdAt, later.toISOString())
assert.equal(revised[1].readAt, null, 'Revised content becomes unread.')
assert.equal(revised[1].dismissedAt, null)
assert.equal(revised[0], list[0])
assert.equal(revised[2], list[2], 'Other days remain unchanged.')
const reopened = mergeDebrief(list, parseDebriefPayload(payload({ date: '2026-10-03', title: 'Äldre', summary: 'Ny sammanfattning.' }), later))
assert.equal(reopened[2].dismissedAt, null, 'A revised dismissed report becomes visible again.')
assert.equal(unreadDebriefs(reopened).length, 2)

console.log('Debrief domain passed: real dates, ISO timestamps, JSON/plain text, limits, history, read/dismiss state, deduplication and revised content.')
