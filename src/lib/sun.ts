// Sunrise and sunset from the standard sunrise equation (NOAA/Wikipedia form), accurate to a minute or two
// at Nordic latitudes. Used for night icons in the hourly forecast and for Soluppgång / Solnedgång.

const rad = Math.PI / 180
const J1970 = 2440587.5
const J2000 = 2451545

const toJulian = (ms: number) => ms / 86_400_000 + J1970
const fromJulian = (julian: number) => new Date((julian - J1970) * 86_400_000)

export interface SunTimes {
  sunrise: Date | null
  sunset: Date | null
  /** 'polar-night' when the sun never rises, 'midnight-sun' when it never sets. */
  special: 'polar-night' | 'midnight-sun' | null
}

/** `date` is a local calendar date (YYYY-MM-DD); longitude is east-positive. */
export function sunTimes(date: string, latitude: number, longitude: number): SunTimes {
  const [year, month, day] = date.split('-').map(Number)
  const noon = toJulian(Date.UTC(year, month - 1, day, 12))
  const n = Math.round(noon - J2000 + 0.0008)
  const meanNoon = n - longitude / 360
  const M = (357.5291 + 0.98560028 * meanNoon) % 360
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad)
  const lambda = (M + C + 180 + 102.9372) % 360
  const transit = J2000 + meanNoon + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad)
  const sinDecl = Math.sin(lambda * rad) * Math.sin(23.4397 * rad)
  const cosDecl = Math.cos(Math.asin(sinDecl))
  const cosHour = (Math.sin(-0.833 * rad) - Math.sin(latitude * rad) * sinDecl) / (Math.cos(latitude * rad) * cosDecl)
  if (cosHour > 1) return { sunrise: null, sunset: null, special: 'polar-night' }
  if (cosHour < -1) return { sunrise: null, sunset: null, special: 'midnight-sun' }
  const hourAngle = Math.acos(cosHour) / rad
  return { sunrise: fromJulian(transit - hourAngle / 360), sunset: fromJulian(transit + hourAngle / 360), special: null }
}

/** Is the sun down at this moment? Polar night counts as night, midnight sun as day. */
export function isNight(moment: Date, date: string, latitude: number, longitude: number): boolean {
  const { sunrise, sunset, special } = sunTimes(date, latitude, longitude)
  if (special) return special === 'polar-night'
  return moment < sunrise! || moment > sunset!
}
