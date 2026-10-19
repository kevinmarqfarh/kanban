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
const time = await module('../src/lib/nutritionTime.ts')
const { isWorkspace } = await module('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })
const { createEmptyWorkspace } = await module('../src/lib/seed.ts')

/* ---------------- Weather (shared model) ---------------- */
// The forecast itself (SMHI, Open-Meteo, days, hours) is covered by tests/forecast.mjs.
const { weatherKind, weatherWeek, showRainChance, stepKind, parsePlaces, geocodeUrl, isPlace, usableCache, isStale, samePlace, weekForecast, DEFAULT_PLACE } = weather
const TODAY = '2026-10-14' // Wednesday

// WMO codes (Open-Meteo fallback) → icon family the user asked for: sunny, cloudy, rainy, cloud/rain …
const kinds = { 0: 'sun', 1: 'mostly-sunny', 2: 'partly-cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 55: 'drizzle', 56: 'sleet', 61: 'rain', 63: 'rain', 65: 'rain', 66: 'sleet', 71: 'snow', 77: 'snow', 80: 'showers', 82: 'showers', 85: 'snow', 95: 'thunder', 99: 'thunder', 42: 'cloudy' }
for (const [code, kind] of Object.entries(kinds)) assert.equal(weatherKind(Number(code)).kind, kind, `code ${code}`)
assert.equal(weatherKind(0).label, 'Klart')
assert.equal(weatherKind(80).label, 'Regnskurar')

// The moon replaces the sun after dark; cloudy and rainy icons stay the same.
assert.equal(stepKind({ kind: 'sun', night: true }), 'clear-night')
assert.equal(stepKind({ kind: 'mostly-sunny', night: true }), 'mostly-clear-night')
assert.equal(stepKind({ kind: 'partly-cloudy', night: true }), 'partly-cloudy-night')
assert.equal(stepKind({ kind: 'showers', night: true }), 'showers-night')
assert.equal(stepKind({ kind: 'rain', night: true }), 'rain')
assert.equal(stepKind({ kind: 'sun', night: false }), 'sun')

// Monday–Sunday of the current ISO week, also across a month and year boundary.
assert.deepEqual(weatherWeek(TODAY), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
assert.deepEqual(weatherWeek('2026-10-18'), weatherWeek('2026-10-12'), 'Sunday belongs to the same week as Monday.')
assert.deepEqual(weatherWeek('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])

// Apple-style rain chance in the week strip: only for wet weather and at least 30 %.
const day = (kind, rain) => ({ date: TODAY, kind, label: '', max: 10, min: 5, rain })
assert.equal(showRainChance(day('rain', 85)), true)
assert.equal(showRainChance(day('showers', 60)), true)
assert.equal(showRainChance(day('cloudy', 20)), false, 'Cloudy with 20 % shows no percentage.')
assert.equal(showRainChance(day('cloudy', 60)), false, 'The strip only shows a chance under a wet icon.')
assert.equal(showRainChance(day('rain', 20)), false)
assert.equal(showRainChance(day('rain', null)), false, 'A missing chance stays unknown, not 0.')

// Cache: same place and still about today or later; stale after 30 minutes.
const step = { time: '2026-10-14T06:00:00.000Z', start: '2026-10-14T05:00:00.000Z', temp: 9, kind: 'cloudy', label: 'Mulet', rain: 0, mm: 0, wind: 3, gust: 6, windDir: 200, humidity: 80, pressure: 1010, visibility: 20, night: true, source: 'smhi' }
const forecastDay = date => ({ date, kind: 'cloudy', label: 'Mulet', max: 12, min: 5, rain: 10, mm: 0, wind: 4, gust: 8, sunrise: null, sunset: null, sun: null })
const cached = { place: DEFAULT_PLACE, source: 'smhi', sources: ['smhi', 'open-meteo'], fetchedAt: '2026-10-14T05:42:00.000Z', referenceTime: '2026-10-14T05:00:00.000Z', steps: [step], days: weatherWeek(TODAY).map(forecastDay) }
assert.equal(usableCache(cached, DEFAULT_PLACE, TODAY), cached)
assert.equal(usableCache(cached, DEFAULT_PLACE, '2026-10-18'), cached, 'Still useful on Sunday.')
assert.equal(usableCache(cached, DEFAULT_PLACE, '2026-10-19'), null, 'Nothing left about the coming days.')
assert.equal(usableCache(cached, { name: 'Malmö', latitude: 55.605, longitude: 13.0038 }, TODAY), null)
assert.equal(usableCache({ ...cached, days: 'x' }, DEFAULT_PLACE, TODAY), null)
assert.equal(usableCache({ ...cached, source: 'yr' }, DEFAULT_PLACE, TODAY), null)
assert.equal(usableCache({ ...cached, steps: [{ ...step, temp: 'warm' }] }, DEFAULT_PLACE, TODAY), null)
assert.equal(usableCache({ place: DEFAULT_PLACE, days: [], fetchedAt: cached.fetchedAt }, DEFAULT_PLACE, TODAY), null, 'The old v1 week format is not reused.')
assert.equal(usableCache(null, DEFAULT_PLACE, TODAY), null)
assert.equal(isStale(cached, new Date('2026-10-14T08:00:00+02:00')), false)
assert.equal(isStale(cached, new Date('2026-10-14T08:12:00+02:00')), true, 'Exactly 30 minutes old is due (the timer fires at 30:00).')
assert.equal(isStale(cached, new Date('2026-10-14T08:10:00+02:00')), false)
assert.equal(isStale({ ...cached, fetchedAt: 'nonsense' }, new Date()), true)
assert.equal(samePlace(DEFAULT_PLACE, { name: 'Gbg', latitude: 57.70891, longitude: 11.97461 }), true)
assert.deepEqual([...weekForecast({ ...cached, days: [...cached.days, forecastDay('2026-10-19')] }, TODAY).keys()], weatherWeek(TODAY), 'The strip takes Monday–Sunday only.')
assert.equal(weekForecast(null, TODAY).size, 0)

// Places.
assert.equal(isPlace(DEFAULT_PLACE), true)
assert.equal(isPlace({ name: '', latitude: 1, longitude: 1 }), false)
assert.equal(isPlace({ name: 'X', latitude: 91, longitude: 1 }), false)
assert.equal(isPlace({ name: 'X', latitude: '57', longitude: 1 }), false)
const search = new URL(geocodeUrl('  Angered '))
assert.equal(search.searchParams.get('name'), 'Angered')
assert.equal(search.searchParams.get('language'), 'sv')
assert.deepEqual(parsePlaces({ results: [
  { name: 'Angered', latitude: 57.79, longitude: 12.05, admin1: 'Västra Götaland', admin2: 'Göteborgs Stad', country: 'Sverige' },
  { name: 'Göteborg', latitude: 57.7, longitude: 11.97, admin1: 'Västra Götaland', admin2: 'Göteborg', country: 'Sverige' },
  { name: 'Broken', latitude: 'x', longitude: 1 },
] }), [
  { name: 'Angered', latitude: 57.79, longitude: 12.05, detail: 'Göteborgs Stad, Västra Götaland, Sverige' },
  { name: 'Göteborg', latitude: 57.7, longitude: 11.97, detail: 'Västra Götaland, Sverige' },
])
assert.deepEqual(parsePlaces({}), [])
assert.deepEqual(parsePlaces(null), [])

/* ---------------- Morgon / Kväll ---------------- */
const { nutritionTimeLabel, NUTRITION_TIME_OPTIONS } = time
assert.deepEqual(NUTRITION_TIME_OPTIONS.map(option => [option.value, option.label]), [['morning', 'Morgon'], ['midday', 'Mitt på dagen'], ['evening', 'Kväll'], ['anytime', 'När som helst']], 'All supported daily habit times are available.')
assert.equal(nutritionTimeLabel('morning'), 'Morgon')
assert.equal(nutritionTimeLabel('evening'), 'Kväll')
assert.equal(nutritionTimeLabel(undefined), null, 'Habits saved before the choice existed get no pill.')
assert.equal(nutritionTimeLabel(null), null)

const created = '2026-09-01T09:00:00.000Z'
const habit = (id, t) => ({ id, title: id.toUpperCase(), amount: '1', unit: 'st', createdAt: created, ...(t === undefined ? {} : { time: t }) })
const workspace = { ...createEmptyWorkspace(), nutritionHabits: [habit('d', 'morning'), habit('m', 'evening'), habit('legacy'), habit('cleared', null)], nutritionCompletions: [] }
// Validation: the new field is optional and strict.
assert.equal(isWorkspace(workspace), true)
assert.equal(isWorkspace({ ...workspace, nutritionHabits: [habit('a', 'noon')] , nutritionCompletions: [] }), false)
assert.equal(isWorkspace({ ...workspace, nutritionHabits: [habit('a', 3)], nutritionCompletions: [] }), false)

console.log('Weather and Morgon/Kväll passed: WMO icons, night icons, Monday–Sunday range, rain chance in the strip, forecast cache/staleness, place search; Morgon/Kväll labels, legacy habits without a pill, and validation.')

assert.equal(nutritionTimeLabel('midday'), 'Mitt på dagen')
assert.equal(nutritionTimeLabel('anytime'), 'När som helst')
for (const value of ['midday', 'anytime']) assert.ok(isWorkspace({ ...workspace, nutritionHabits: [habit('new', value)] }))
