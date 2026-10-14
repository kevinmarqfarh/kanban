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
const time = await module('../src/lib/nutritionTime.ts', { './others': others })
const { isWorkspace } = await module('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })
const { createEmptyWorkspace } = await module('../src/lib/seed.ts')

/* ---------------- Weather ---------------- */
const { weatherKind, weatherWeek, forecastUrl, parseForecast, showRainChance, parsePlaces, geocodeUrl, isPlace, usableCache, isStale, samePlace, DEFAULT_PLACE } = weather
const TODAY = '2026-10-14' // Wednesday

// WMO codes → icon family the user asked for: sunny, cloudy, rainy, cloud/rain …
const kinds = { 0: 'sun', 1: 'mostly-sunny', 2: 'partly-cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 55: 'drizzle', 56: 'sleet', 61: 'rain', 63: 'rain', 65: 'rain', 66: 'sleet', 71: 'snow', 77: 'snow', 80: 'showers', 82: 'showers', 85: 'snow', 95: 'thunder', 99: 'thunder', 42: 'cloudy' }
for (const [code, kind] of Object.entries(kinds)) assert.equal(weatherKind(Number(code)).kind, kind, `code ${code}`)
assert.equal(weatherKind(0).label, 'Soligt')
assert.equal(weatherKind(80).label, 'Regnskurar')

// Monday–Sunday of the current ISO week, also across a month and year boundary.
assert.deepEqual(weatherWeek(TODAY), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
assert.deepEqual(weatherWeek('2026-10-18'), weatherWeek('2026-10-12'), 'Sunday belongs to the same week as Monday.')
assert.deepEqual(weatherWeek('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])

const url = new URL(forecastUrl(DEFAULT_PLACE, TODAY))
assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast')
assert.equal(url.searchParams.get('start_date'), '2026-10-12')
assert.equal(url.searchParams.get('end_date'), '2026-10-18')
assert.equal(url.searchParams.get('timezone'), 'Europe/Stockholm')
assert.equal(url.searchParams.get('latitude'), '57.7089')
assert.match(url.searchParams.get('daily'), /weather_code.*temperature_2m_max.*temperature_2m_min.*precipitation_probability_max/)

const sample = { daily: {
  time: ['2026-10-18', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19'],
  weather_code: [63, 3, 61, 2, 0, 80, 1, 0],
  temperature_2m_max: [8.7, 11.2, 9.6, 12.4, 13.5, 10.1, 12.9, 15],
  temperature_2m_min: [4.9, 5.1, 6.0, 4.4, -0.6, 6.6, 5.0, 1],
  precipitation_probability_max: [90, 20, 85, 10, null, 60, 5, 0],
} }
const now = new Date('2026-10-14T07:42:00+02:00')
const parsed = parseForecast(sample, DEFAULT_PLACE, TODAY, now)
assert.deepEqual(parsed.days.map(day => day.date), weatherWeek(TODAY), 'Ordered Monday–Sunday, extra days dropped.')
assert.deepEqual(parsed.days.map(day => day.kind), ['cloudy', 'rain', 'partly-cloudy', 'sun', 'showers', 'mostly-sunny', 'rain'])
assert.deepEqual(parsed.days.map(day => [day.max, day.min]), [[11, 5], [10, 6], [12, 4], [14, -1], [10, 7], [13, 5], [9, 5]], 'Rounded to whole degrees.')
assert.equal(parsed.days[3].rain, null, 'A missing rain chance stays unknown, not 0.')
assert.equal(parsed.fetchedAt, now.toISOString())
assert.equal(parsed.place, DEFAULT_PLACE)

// Partial or broken responses.
const partial = parseForecast({ daily: { time: ['2026-10-14', '2026-10-15'], weather_code: [2, 'x'], temperature_2m_max: [12, 13], temperature_2m_min: [4, 3] } }, DEFAULT_PLACE, TODAY, now)
assert.deepEqual(partial.days.map(day => day.date), ['2026-10-14'], 'Days with invalid values are left out.')
assert.throws(() => parseForecast({}, DEFAULT_PLACE, TODAY, now), /Väderdata saknas/)
assert.throws(() => parseForecast(null, DEFAULT_PLACE, TODAY, now), /Väderdata saknas/)
assert.throws(() => parseForecast({ daily: { time: ['2025-01-01'], weather_code: [0], temperature_2m_max: [1], temperature_2m_min: [0] } }, DEFAULT_PLACE, TODAY, now), /för veckan/)

// Apple-style rain chance: only for wet weather and at least 30 %.
const [mon, tue, wed, thu, fri] = parsed.days
assert.equal(showRainChance(tue), true)
assert.equal(showRainChance(fri), true)
assert.equal(showRainChance(mon), false, 'Cloudy with 20 % shows no percentage.')
assert.equal(showRainChance(wed), false)
assert.equal(showRainChance(thu), false)
assert.equal(showRainChance({ ...tue, rain: 20 }), false)

// Cache: same place and week only; stale after 30 minutes.
assert.equal(usableCache(parsed, DEFAULT_PLACE, TODAY), parsed)
assert.equal(usableCache(parsed, DEFAULT_PLACE, '2026-10-18'), parsed, 'Still the same week on Sunday.')
assert.equal(usableCache(parsed, DEFAULT_PLACE, '2026-10-19'), null, 'A new week needs a new forecast.')
assert.equal(usableCache(parsed, { name: 'Malmö', latitude: 55.605, longitude: 13.0038 }, TODAY), null)
assert.equal(usableCache({ ...parsed, days: 'x' }, DEFAULT_PLACE, TODAY), null)
assert.equal(usableCache(null, DEFAULT_PLACE, TODAY), null)
assert.equal(isStale(parsed, new Date('2026-10-14T08:00:00+02:00')), false)
assert.equal(isStale(parsed, new Date('2026-10-14T08:12:00+02:00')), true, 'Exactly 30 minutes old is due (the timer fires at 30:00).')
assert.equal(isStale(parsed, new Date('2026-10-14T08:10:00+02:00')), false)
assert.equal(isStale(parsed, new Date('2026-10-14T08:13:00+02:00')), true)
assert.equal(isStale({ ...parsed, fetchedAt: 'nonsense' }, now), true)
assert.equal(samePlace(DEFAULT_PLACE, { name: 'Gbg', latitude: 57.70891, longitude: 11.97461 }), true)

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
const { currentNutritionTime, habitsForTime, usesNutritionTimes, nutritionTimeProgress, groupHabitsByTime, nutritionTimeLabel, NUTRITION_TIME_OPTIONS } = time
const at = hhmm => new Date(`2026-10-14T${hhmm}:00+02:00`)
assert.equal(currentNutritionTime(at('04:59')), 'evening', 'Late night still belongs to the evening.')
assert.equal(currentNutritionTime(at('05:00')), 'morning')
assert.equal(currentNutritionTime(at('13:59')), 'morning')
assert.equal(currentNutritionTime(at('14:00')), 'evening')
assert.equal(currentNutritionTime(at('23:30')), 'evening')
assert.deepEqual(NUTRITION_TIME_OPTIONS.map(option => option.label), ['Morgon', 'Kväll', 'Hela dagen'])
assert.equal(nutritionTimeLabel('morning'), 'Morgon')
assert.equal(nutritionTimeLabel(undefined), 'Hela dagen', 'Habits saved before the choice existed are all-day.')

const created = '2026-09-01T09:00:00.000Z'
const habit = (id, t) => ({ id, title: id.toUpperCase(), amount: '1', unit: 'st', createdAt: created, ...(t === undefined ? {} : { time: t }) })
const habits = [habit('d', 'morning'), habit('m', 'evening'), habit('w', null), habit('o', 'morning'), habit('legacy')]
assert.deepEqual(habitsForTime(habits, 'morning').map(h => h.id), ['d', 'w', 'o', 'legacy'], 'Morning plus all-day, stored order kept.')
assert.deepEqual(habitsForTime(habits, 'evening').map(h => h.id), ['m', 'w', 'legacy'])
assert.equal(usesNutritionTimes(habits), true)
assert.equal(usesNutritionTimes([habit('a'), habit('b', null)]), false, 'No toggle until something is tied to morning or evening.')
assert.deepEqual(groupHabitsByTime(habits).map(group => [group.label, group.habits.map(h => h.id)]), [['Morgon', ['d', 'o']], ['Kväll', ['m']], ['Hela dagen', ['w', 'legacy']]])
assert.deepEqual(groupHabitsByTime([habit('x', 'evening')]).map(group => group.label), ['Kväll'], 'Empty groups are hidden.')

const workspace = { ...createEmptyWorkspace(), nutritionHabits: habits, nutritionCompletions: [
  { id: 'nutrition:d:2026-10-14', habitId: 'd', date: '2026-10-14', completed: true },
  { id: 'nutrition:w:2026-10-14', habitId: 'w', date: '2026-10-14', completed: true },
  { id: 'nutrition:m:2026-10-13', habitId: 'm', date: '2026-10-13', completed: true },
] }
assert.deepEqual((({ done, total }) => ({ done, total }))(nutritionTimeProgress(workspace, 'morning', TODAY)), { done: 2, total: 4 })
assert.deepEqual((({ done, total }) => ({ done, total }))(nutritionTimeProgress(workspace, 'evening', TODAY)), { done: 1, total: 3 }, 'Yesterday’s evening tick does not count today.')

// Validation: the new field is optional and strict.
assert.equal(isWorkspace(workspace), true)
assert.equal(isWorkspace({ ...workspace, nutritionHabits: [habit('a', 'noon')] , nutritionCompletions: [] }), false)
assert.equal(isWorkspace({ ...workspace, nutritionHabits: [habit('a', 3)], nutritionCompletions: [] }), false)

console.log('Weather and Morgon/Kväll passed: WMO icons, Monday–Sunday range, URL, parsing of partial/broken data, rain chance, cache/staleness, place search; morning/evening switch-over at 05:00 and 14:00, all-day and legacy habits, grouping, per-part progress and validation.')
