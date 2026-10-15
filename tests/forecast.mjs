// SMHI as primary forecast, Open-Meteo for earlier hours of the week and as fallback, days/hours/sun for the weather page.
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
const fixture = JSON.parse(await readFile(new URL('./fixtures/smhi-goteborg-2026-10-15.json', import.meta.url), 'utf8'))

const { DEFAULT_PLACE, stepKind } = weather
const { smhiUrl, inSmhiArea, parseSmhi, SMHI_SYMBOLS } = smhi
const { openMeteoUrl, parseOpenMeteo, buildForecast, loadForecast, currentStep, nextHours, stepsOn, hourlySummary, daySymbol, compass, dayLength, isNightAt } = forecast
const TODAY = '2026-10-15' // Thursday; the fixture is SMHI's real forecast for Göteborg from 07:30 that morning.
const NOW = new Date('2026-10-15T07:50:00+02:00')
const local = iso => new Date(iso).toLocaleString('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })

/* ---------------- Sun ---------------- */
const hm = date => date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
const gbg = sun.sunTimes('2026-10-15', 57.7089, 11.9746)
assert.equal(hm(gbg.sunrise), '07:45'); assert.equal(hm(gbg.sunset), '18:09'); assert.equal(gbg.special, null)
const midsummer = sun.sunTimes('2026-06-21', 57.7089, 11.9746)
assert.equal(hm(midsummer.sunrise), '04:10'); assert.equal(hm(midsummer.sunset), '22:16')
const solstice = sun.sunTimes('2026-12-21', 59.3293, 18.0686)
assert.equal(hm(solstice.sunrise), '08:43'); assert.equal(hm(solstice.sunset), '14:47')
assert.equal(sun.sunTimes('2026-12-21', 67.8558, 20.2253).special, 'polar-night', 'Kiruna in December.')
assert.equal(sun.sunTimes('2026-06-21', 67.8558, 20.2253).special, 'midnight-sun', 'Kiruna at midsummer.')
assert.equal(sun.isNight(new Date('2026-10-15T12:00:00+02:00'), '2026-10-15', 57.7089, 11.9746), false)
assert.equal(sun.isNight(new Date('2026-10-15T22:00:00+02:00'), '2026-10-15', 57.7089, 11.9746), true)
assert.equal(sun.isNight(new Date('2026-12-21T12:00:00+01:00'), '2026-12-21', 67.8558, 20.2253), true, 'Polar night is night all day.')
assert.equal(isNightAt('2026-10-15T20:00:00.000Z', DEFAULT_PLACE), true, '22:00 in October.')
assert.equal(isNightAt('2026-10-15T10:00:00.000Z', DEFAULT_PLACE), false)
assert.equal(dayLength({ sunrise: gbg.sunrise.toISOString(), sunset: gbg.sunset.toISOString(), sun: null }), '10 h 24 min')
assert.equal(dayLength({ sunrise: null, sunset: null, sun: 'polar-night' }), 'Polarnatt')
assert.equal(dayLength({ sunrise: null, sunset: null, sun: 'midnight-sun' }), 'Midnattssol')

/* ---------------- SMHI ---------------- */
assert.equal(smhiUrl(DEFAULT_PLACE), 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/11.9746/lat/57.7089/data.json')
assert.match(smhiUrl({ name: 'X', latitude: 57.123456789, longitude: 11.987654321 }), /lon\/11\.987654\/lat\/57\.123457\//, 'At most six decimals, as SMHI requires.')
assert.equal(inSmhiArea(DEFAULT_PLACE), true)
assert.equal(inSmhiArea({ name: 'Kiruna', latitude: 67.86, longitude: 20.23 }), true)
assert.equal(inSmhiArea({ name: 'Madrid', latitude: 40.42, longitude: -3.7 }), false)
for (let code = 1; code <= 27; code++) assert.ok(SMHI_SYMBOLS[code]?.label, `Wsymb2 ${code} has a label`)
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 15, 18, 19, 21, 22, 25].map(code => SMHI_SYMBOLS[code].kind),
  ['sun', 'mostly-sunny', 'partly-cloudy', 'partly-cloudy', 'cloudy', 'cloudy', 'fog', 'showers', 'thunder', 'sleet', 'snow', 'drizzle', 'rain', 'thunder', 'sleet', 'snow'])

const parsed = parseSmhi(fixture)
assert.equal(parsed.steps.length, 80, 'Every step of the real forecast is usable.')
assert.equal(parsed.referenceTime, '2026-10-15T05:30:00.000Z')
assert.deepEqual(parsed.steps[0], {
  time: '2026-10-15T06:00:00.000Z', start: '2026-10-15T05:00:00.000Z', temp: 12.2, kind: 'partly-cloudy', label: 'Växlande molnighet',
  rain: 0, mm: 0, wind: 6.5, gust: 11.1, windDir: parsed.steps[0].windDir, humidity: 89, pressure: 1019.8, visibility: 11.1, source: 'smhi',
})
assert.equal(typeof parsed.steps[0].windDir, 'number')
const twelveHours = parsed.steps.find(step => step.time === '2026-10-25T12:00:00.000Z')
assert.equal(twelveHours.start, '2026-10-25T00:00:00.000Z', 'Ten days out a step covers twelve hours.')
assert.equal(twelveHours.mm, 1.8)
// 9999 means missing; a step without temperature or symbol is left out; broken input is refused.
const broken = structuredClone(fixture)
broken.timeSeries[0].data.wind_speed = 9999
broken.timeSeries[0].data.probability_of_precipitation = 9999
broken.timeSeries[1].data.air_temperature = 9999
broken.timeSeries[2].data.symbol_code = 42
const partial = parseSmhi(broken)
assert.equal(partial.steps.length, 78)
assert.equal(partial.steps[0].wind, null)
assert.equal(partial.steps[0].rain, null, 'A missing chance is unknown, never 0 %.')
assert.equal(partial.steps[1].time, '2026-10-15T09:00:00.000Z')
assert.throws(() => parseSmhi({}), /SMHI-data saknas/)
assert.throws(() => parseSmhi(null), /SMHI-data saknas/)
assert.throws(() => parseSmhi({ timeSeries: [{ time: 'x', data: {} }] }), /saknar värden/)

/* ---------------- Open-Meteo (earlier hours and fallback) ---------------- */
const omUrl = new URL(openMeteoUrl(DEFAULT_PLACE, TODAY))
assert.equal(omUrl.origin + omUrl.pathname, 'https://api.open-meteo.com/v1/forecast')
assert.equal(omUrl.searchParams.get('start_date'), '2026-10-12', 'From Monday, so the past days of the week have weather too.')
assert.equal(omUrl.searchParams.get('end_date'), '2026-10-24', 'Ten days including today.')
assert.equal(omUrl.searchParams.get('timeformat'), 'unixtime')
assert.equal(omUrl.searchParams.get('wind_speed_unit'), 'ms')
assert.match(omUrl.searchParams.get('hourly'), /temperature_2m.*weather_code.*precipitation_probability.*precipitation/)

// A synthetic Open-Meteo answer: Monday rain, Tuesday sun, Wednesday clouds, then fair weather.
function openMeteoHours(from = '2026-10-12', to = '2026-10-24') {
  const time = [], temp = [], code = [], chance = [], amount = []
  for (let ms = Date.parse(`${from}T00:00:00+02:00`); ms <= Date.parse(`${to}T23:00:00+02:00`); ms += 3_600_000) {
    const date = new Date(ms), weekday = date.getDay(), hour = date.getHours()
    time.push(ms / 1000)
    temp.push(6 + 6 * Math.sin(((hour - 9) / 24) * 2 * Math.PI))
    code.push(weekday === 1 ? 63 : weekday === 2 ? 0 : weekday === 3 ? 3 : 2)
    chance.push(weekday === 1 ? 90 : 5)
    amount.push(weekday === 1 ? 0.5 : 0)
  }
  return { hourly: { time, temperature_2m: temp, weather_code: code, precipitation_probability: chance, precipitation: amount, wind_speed_10m: time.map(() => 4), wind_gusts_10m: time.map(() => 9), wind_direction_10m: time.map(() => 225), relative_humidity_2m: time.map(() => 80), pressure_msl: time.map(() => 1012), visibility: time.map(() => 24000) } }
}
const om = parseOpenMeteo(openMeteoHours())
assert.equal(om.steps.length, 13 * 24)
assert.equal(om.steps[0].time, new Date('2026-10-12T00:00:00+02:00').toISOString())
assert.equal(om.steps[0].start, new Date('2026-10-11T23:00:00+02:00').toISOString(), 'Each hourly value covers the hour before.')
assert.equal(om.steps[0].visibility, 24, 'Metres become kilometres.')
assert.equal(om.steps[0].source, 'open-meteo')
assert.throws(() => parseOpenMeteo({}), /Väderdata saknas/)
assert.throws(() => parseOpenMeteo({ hourly: { time: [1], temperature_2m: ['x'], weather_code: [0] } }), /Väderdata saknas/)

/* ---------------- Days ---------------- */
// A sunny morning does not hide a wet afternoon, and five hours of rain beat seven of drizzle.
const at = (hour, kind, label, mm = 0, hours = 1) => ({ start: new Date(`2026-10-16T${String(hour - hours).padStart(2, '0')}:00:00+02:00`).toISOString(), time: new Date(`2026-10-16T${String(hour).padStart(2, '0')}:00:00+02:00`).toISOString(), kind, label, mm })
const mixed = [at(8, 'sun', 'Klart'), at(9, 'sun', 'Klart'), at(10, 'sun', 'Klart'), at(11, 'sun', 'Klart'), at(15, 'drizzle', 'Lätt regn', 0.2), at(16, 'rain', 'Regn', 1.4), at(17, 'rain', 'Regn', 1.2)]
assert.deepEqual(daySymbol(mixed, 80), { kind: 'rain', label: 'Regn' })
assert.deepEqual(daySymbol(mixed, 30), { kind: 'sun', label: 'Klart' }, 'Under 50 % the day looks like most of its daytime.')
assert.deepEqual(daySymbol([at(3, 'rain', 'Regn', 2), at(12, 'cloudy', 'Mulet', 0, 6), at(18, 'cloudy', 'Mulet', 0, 6)], 90), { kind: 'cloudy', label: 'Mulet' }, 'Night rain alone does not make a rainy day.')
assert.deepEqual(daySymbol([at(12, 'sun', 'Klart', 0, 12), at(14, 'showers', 'Regnskurar', 0.4, 2)], 20), { kind: 'sun', label: 'Klart' }, 'Steps count by the hours they cover.')

/* ---------------- SMHI only ---------------- */
const onlySmhi = buildForecast(DEFAULT_PLACE, TODAY, parsed, null, NOW)
assert.equal(onlySmhi.source, 'smhi')
assert.deepEqual(onlySmhi.sources, ['smhi'])
assert.equal(onlySmhi.fetchedAt, NOW.toISOString())
assert.equal(onlySmhi.referenceTime, '2026-10-15T05:30:00.000Z')
assert.deepEqual(onlySmhi.days.map(day => day.date), ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
const friday = onlySmhi.days[1]
assert.deepEqual({ kind: friday.kind, label: friday.label, max: friday.max, min: friday.min, rain: friday.rain, mm: friday.mm }, { kind: 'rain', label: 'Regn', max: 14, min: 10, rain: 87, mm: 9.7 }, 'SMHI’s rainy Friday: highest chance and the day’s total.')
assert.deepEqual(onlySmhi.days.slice(2, 6).map(day => day.kind), ['sun', 'sun', 'sun', 'sun'], 'The high pressure over the weekend.')
assert.equal(onlySmhi.days[0].kind, 'cloudy')
assert.equal(hm(new Date(onlySmhi.days[0].sunrise)), '07:45')
assert.equal(hm(new Date(onlySmhi.days[0].sunset)), '18:09')
assert.ok(onlySmhi.days.every(day => day.max >= day.min && Number.isInteger(day.max) && Number.isInteger(day.min)))
// Night steps get the moon, day steps the sun.
const lateNight = onlySmhi.steps.find(step => step.time === '2026-10-16T23:00:00.000Z')
assert.equal(lateNight.night, true); assert.equal(stepKind(lateNight), 'clear-night', 'A clear night shows the moon.')
const noon = onlySmhi.steps.find(step => step.time === '2026-10-17T10:00:00.000Z')
assert.equal(noon.night, false); assert.equal(stepKind(noon), 'sun')

/* ---------------- Merged: SMHI ahead, Open-Meteo before it ---------------- */
const merged = buildForecast(DEFAULT_PLACE, TODAY, parsed, om, NOW)
assert.equal(merged.source, 'smhi')
assert.deepEqual(merged.sources, ['smhi', 'open-meteo'])
assert.deepEqual(merged.days.slice(0, 3).map(day => [day.date, day.kind, day.rain]), [['2026-10-12', 'rain', 90], ['2026-10-13', 'sun', 5], ['2026-10-14', 'cloudy', 5]], 'Monday–Wednesday from Open-Meteo.')
assert.equal(merged.days[4].rain, 87, 'Friday is still SMHI’s.')
assert.equal(merged.steps[0].time, new Date('2026-10-15T00:00:00+02:00').toISOString(), 'Steps kept from the start of today.')
assert.ok(merged.steps.filter(step => step.time <= parsed.steps[0].start).every(step => step.source === 'open-meteo'), 'Open-Meteo only before SMHI’s first hour.')
assert.ok(merged.steps.filter(step => step.time > parsed.steps[0].start).every(step => step.source === 'smhi'), 'SMHI from its first hour on — never mixed.')
assert.equal(new Set(merged.steps.map(step => step.time)).size, merged.steps.length, 'No hour twice.')
assert.equal(merged.days[3].date, TODAY)
assert.ok(merged.days[3].min <= onlySmhi.days[0].min, 'Today’s low includes the night before SMHI’s first hour.')

/* ---------------- Fallback: Open-Meteo alone ---------------- */
const fallback = buildForecast(DEFAULT_PLACE, TODAY, null, om, NOW)
assert.equal(fallback.source, 'open-meteo')
assert.deepEqual(fallback.sources, ['open-meteo'])
assert.equal(fallback.referenceTime, null)
assert.deepEqual(fallback.days.map(day => day.date).slice(0, 3), ['2026-10-12', '2026-10-13', '2026-10-14'])
assert.equal(fallback.days.at(-1).date, '2026-10-24')
assert.throws(() => buildForecast(DEFAULT_PLACE, TODAY, null, null, NOW), /Väderdata saknas/)
assert.throws(() => buildForecast(DEFAULT_PLACE, '2026-11-20', parsed, null, NOW), /kommande dagarna/, 'An old forecast is not passed off as current.')

/* ---------------- Fetching ---------------- */
function fakeFetch(answers) {
  const calls = []
  const fetchJson = async url => {
    calls.push(url)
    const answer = url.startsWith('https://opendata-download-metfcst.smhi.se/') ? answers.smhi : answers.openMeteo
    if (answer instanceof Error) throw answer
    return answer
  }
  return { calls, fetchJson }
}
{
  const { calls, fetchJson } = fakeFetch({ smhi: fixture, openMeteo: openMeteoHours() })
  const result = await loadForecast(DEFAULT_PLACE, TODAY, fetchJson, () => NOW)
  assert.equal(calls.length, 2, 'SMHI and Open-Meteo are asked at the same time.')
  assert.equal(calls[0], smhiUrl(DEFAULT_PLACE))
  assert.equal(result.source, 'smhi'); assert.deepEqual(result.sources, ['smhi', 'open-meteo'])
}
{
  const { fetchJson } = fakeFetch({ smhi: new Error('Väder 404'), openMeteo: openMeteoHours() })
  const result = await loadForecast(DEFAULT_PLACE, TODAY, fetchJson, () => NOW)
  assert.equal(result.source, 'open-meteo', 'SMHI down → Open-Meteo takes over.')
}
{
  const { fetchJson } = fakeFetch({ smhi: fixture, openMeteo: new Error('Väder 503') })
  const result = await loadForecast(DEFAULT_PLACE, TODAY, fetchJson, () => NOW)
  assert.equal(result.source, 'smhi'); assert.deepEqual(result.sources, ['smhi'], 'Open-Meteo down → SMHI alone, from now on.')
}
{
  const { calls, fetchJson } = fakeFetch({ smhi: fixture, openMeteo: openMeteoHours() })
  const result = await loadForecast({ name: 'Madrid', latitude: 40.42, longitude: -3.7 }, TODAY, fetchJson, () => NOW)
  assert.equal(calls.length, 1, 'Outside SMHI’s area only Open-Meteo is asked.')
  assert.equal(result.source, 'open-meteo')
}
{
  const { fetchJson } = fakeFetch({ smhi: new Error('Load failed'), openMeteo: new Error('Load failed') })
  await assert.rejects(loadForecast(DEFAULT_PLACE, TODAY, fetchJson, () => NOW), /Load failed/)
}

/* ---------------- Reading it: now, the next 24 hours, a day ---------------- */
const now = currentStep(merged, NOW)
assert.equal(now.time, '2026-10-15T06:00:00.000Z', '07:50 belongs to the 07–08 hour.')
assert.equal(now.source, 'smhi')
assert.equal(currentStep(merged, new Date('2026-10-30T12:00:00+01:00')), merged.steps.at(-1), 'Past the end: the last step.')

const hours = nextHours(merged, NOW)
assert.equal(hours[0].type, 'step'); assert.equal(hours[0].now, true)
const hourSteps = hours.filter(item => item.type === 'step')
assert.equal(hourSteps.length, 24, 'Nu (07–08) and every hour until the same time tomorrow.')
assert.deepEqual(hours.filter(item => item.type !== 'step').map(item => [item.type, hm(new Date(item.time))]), [['sunset', '18:09'], ['sunrise', '07:47']], 'Sunset tonight and sunrise tomorrow slot in.')
const sunsetIndex = hours.findIndex(item => item.type === 'sunset')
assert.equal(local(hours[sunsetIndex - 1].step.time), 'tors 18:00'); assert.equal(local(hours[sunsetIndex + 1].step.time), 'tors 19:00')
assert.equal(hours[sunsetIndex + 1].step.night, true)

assert.equal(hourlySummary(merged, NOW), 'Lätt regn väntas i morgon kring 07:00 (50 % risk). Byar upp till 15 m/s.')
assert.match(hourlySummary(merged, new Date('2026-10-16T12:20:00+02:00')), /^Regn just nu\. Uppehåll väntas kring 21:00\./)
assert.match(hourlySummary(merged, new Date('2026-10-18T09:00:00+02:00')), /^Uppehåll det närmaste dygnet/)

const fridayHours = stepsOn(merged, '2026-10-16', NOW)
assert.equal(fridayHours.length, 24, 'Friday hour by hour.')
assert.ok(fridayHours.every(step => new Date(step.time).getDate() === 16))
const todayHours = stepsOn(merged, TODAY, NOW)
assert.equal(todayHours[0].time, now.time, 'Today starts at the current hour.')
const farDay = stepsOn(merged, '2026-10-23', NOW)
assert.deepEqual(farDay.map(step => hm(new Date(step.time))), ['02:00', '14:00'], 'Ten days out SMHI gives two steps a day.')

/* ---------------- Wind ---------------- */
assert.deepEqual(compass(0), { short: 'N', word: 'nordlig' })
assert.deepEqual(compass(225), { short: 'SV', word: 'sydvästlig' })
assert.deepEqual(compass(350), { short: 'N', word: 'nordlig' })
assert.deepEqual(compass(-90), { short: 'V', word: 'västlig' })
assert.equal(compass(null), null)

console.log('Forecast passed: sunrise/sunset incl. polar night, SMHI URL/symbols/parsing of the real Göteborg forecast (9999, 12-hour steps), Open-Meteo hours, day symbols, SMHI+Open-Meteo merge without overlap, fallback both ways, outside SMHI’s area, now/next 24 h with sunrise and sunset, summary sentence, a day’s hours, wind compass.')
