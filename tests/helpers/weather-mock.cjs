// Hermetic weather for acceptance tests: SMHI's real Göteborg forecast (moved to the test's day) and a
// deterministic Open-Meteo week. Both routes record their calls so tests can check what was asked.
const fs = require('node:fs');
const path = require('node:path');

const SMHI = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'smhi-goteborg-2026-10-15.json'), 'utf8'));
const DAY = 86_400_000;
const cors = { 'access-control-allow-origin': '*' };

/** The real forecast from 15 October 2026, moved by whole days (default: so it starts on the test's morning). */
function smhiFor(isoNow, shiftDays = Math.round((Date.parse(isoNow) - Date.parse(SMHI.createdTime)) / DAY)) {
  const shift = value => new Date(Date.parse(value) + shiftDays * DAY).toISOString().replace('.000Z', 'Z');
  return {
    ...SMHI, createdTime: shift(SMHI.createdTime), referenceTime: shift(SMHI.referenceTime),
    timeSeries: SMHI.timeSeries.map(entry => ({ ...entry, time: shift(entry.time), intervalParametersStartTime: shift(entry.intervalParametersStartTime) })),
  };
}

/** The same forecast with clear skies and no precipitation (used for "another town"). */
const sunny = json => ({ ...json, timeSeries: json.timeSeries.map(entry => ({ ...entry, data: { ...entry.data, symbol_code: 1, probability_of_precipitation: 0, precipitation_amount_mean: 0 } })) });

// Monday rain, Tuesday sun, Wednesday partly cloudy, Thursday showers, Friday mostly sunny, Saturday rain, Sunday cloudy.
const WEEK = { 1: [61, 85, 6, 10], 2: [0, 0, 3, 13], 3: [2, 10, 4, 12], 4: [80, 60, 6, 10], 5: [1, 5, 5, 13], 6: [63, 90, 5, 9], 0: [3, 20, 5, 11] };
/** Open-Meteo hourly answer for start_date…end_date (Europe/Stockholm), coldest at 03, warmest at 15. */
function openMeteoFor(params, allSun = false) {
  const hourly = { time: [], temperature_2m: [], weather_code: [], precipitation_probability: [], precipitation: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], relative_humidity_2m: [], pressure_msl: [], visibility: [] };
  const from = Date.parse(`${params.get('start_date')}T00:00:00+02:00`), to = Date.parse(`${params.get('end_date')}T23:00:00+02:00`);
  for (let ms = from; ms <= to; ms += 3_600_000) {
    const date = new Date(ms);
    const local = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
    const [code, chance, lo, hi] = allSun ? [0, 0, 8, 16] : WEEK[local.getDay()];
    hourly.time.push(ms / 1000);
    hourly.temperature_2m.push(lo + (hi - lo) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (local.getHours() - 3)) / 24)));
    hourly.weather_code.push(code);
    hourly.precipitation_probability.push(chance);
    hourly.precipitation.push(chance >= 50 ? 0.4 : 0);
    hourly.wind_speed_10m.push(4); hourly.wind_gusts_10m.push(9); hourly.wind_direction_10m.push(225);
    hourly.relative_humidity_2m.push(80); hourly.pressure_msl.push(1012); hourly.visibility.push(24000);
  }
  return { hourly };
}

/**
 * Route SMHI and Open-Meteo for a browser context. `state.mode`: 'ok', 'fail' (no network), 'smhi-down'.
 * Malmö (latitude 55.605) gets clear skies from both sources.
 */
async function routeWeather(context, state, isoNow, shiftDays) {
  Object.assign(state, { smhiCalls: state.smhiCalls ?? [], forecastCalls: state.forecastCalls ?? [], mode: state.mode ?? 'ok' });
  await context.route('https://opendata-download-metfcst.smhi.se/**', route => {
    const url = route.request().url();
    state.smhiCalls.push(url);
    if (state.mode === 'fail') return route.abort('internetdisconnected');
    if (state.mode === 'smhi-down') return route.fulfill({ status: 503, headers: cors, body: 'Service Unavailable' });
    const json = smhiFor(isoNow, shiftDays);
    return route.fulfill({ headers: cors, json: /\/lat\/55\.605\//.test(url) ? sunny(json) : json });
  });
  await context.route('https://api.open-meteo.com/**', route => {
    const url = new URL(route.request().url());
    state.forecastCalls.push(url.searchParams);
    if (state.mode === 'fail') return route.abort('internetdisconnected');
    return route.fulfill({ headers: cors, json: openMeteoFor(url.searchParams, url.searchParams.get('latitude') === '55.6050') });
  });
}

module.exports = { smhiFor, sunny, openMeteoFor, routeWeather, cors };
