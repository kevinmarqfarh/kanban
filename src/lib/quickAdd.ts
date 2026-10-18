// Quick add understands a date (and time) written at the end of the title, in plain Swedish:
//   "Ring tandläkaren fre 14"      → "Ring tandläkaren", next Friday 14:00
//   "Hämta paket imorgon kl 17.30" → tomorrow 17:30
//   "Möte 24/10", "Deklarera 2 maj", "Städa på söndag", "Möte kl 9"
// Only the end of the text is read, so "Läs kapitel 14" or "Fredagsmys" stay as they are.
import { addLocalDays, parseLocalDate } from './others'

export interface QuickTask {
  title: string
  deadline: string | null
  deadlineTime: string | null
}

const WEEKDAYS: [RegExp, number][] = [
  [/^mån(dag)?$/, 1], [/^tis(dag)?$/, 2], [/^ons(dag)?$/, 3], [/^tors?(dag)?$/, 4], [/^fre(dag)?$/, 5], [/^lör(dag)?$/, 6], [/^sön(dag)?$/, 0],
]
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

const DATE = String.raw`(i\s?dag|idag|i\s?morgon|imorgon|i\s?övermorgon|övermorgon|(?:på\s)?(?:måndag|mån|tisdag|tis|onsdag|ons|torsdag|tors|tor|fredag|fre|lördag|lör|söndag|sön)|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s(?:jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-zä]*\.?)`
const TIME = String.raw`(?:kl\.?\s?)?(\d{1,2})(?:[:.](\d{2}))?`
// Date with an optional time, or a time on its own marked with "kl" or written as HH:MM.
const WITH_DATE = new RegExp(String.raw`\s+${DATE}(?:\s+${TIME})?\s*$`, 'i')
const TIME_ONLY = new RegExp(String.raw`\s+(?:kl\.?\s?(\d{1,2})(?:[:.](\d{2}))?|(\d{1,2}):(\d{2}))\s*$`, 'i')

const pad = (value: number) => String(value).padStart(2, '0')
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`

function validDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** A day and month without a year is the next one to come (today counts). */
function upcoming(today: string, month: number, day: number): string | null {
  const year = Number(today.slice(0, 4))
  for (const candidate of [year, year + 1]) {
    if (validDate(candidate, month, day) && iso(candidate, month, day) >= today) return iso(candidate, month, day)
  }
  return null
}

function resolveDate(word: string, today: string): string | null {
  const text = word.toLowerCase().replace(/\s+/g, ' ').replace(/^på /, '').replace(/\.$/, '')
  if (text === 'idag' || text === 'i dag') return today
  if (text === 'imorgon' || text === 'i morgon') return addLocalDays(today, 1)
  if (text === 'övermorgon' || text === 'i övermorgon') return addLocalDays(today, 2)
  for (const [pattern, weekday] of WEEKDAYS) {
    if (pattern.test(text)) {
      // The coming one, today included: "fre" on a Friday means today.
      const current = parseLocalDate(today).getDay()
      return addLocalDays(today, (weekday - current + 7) % 7)
    }
  }
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (match) return validDate(+match[1], +match[2], +match[3]) ? text : null
  match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(text)
  if (match) {
    const day = +match[1], month = +match[2]
    if (!match[3]) return upcoming(today, month, day)
    const year = match[3].length === 2 ? 2000 + +match[3] : +match[3]
    return validDate(year, month, day) ? iso(year, month, day) : null
  }
  match = /^(\d{1,2}) ([a-zä]+)$/.exec(text)
  if (match) {
    const month = MONTHS.findIndex(name => match![2].startsWith(name)) + 1
    return month ? upcoming(today, month, +match[1]) : null
  }
  return null
}

function resolveTime(hours?: string, minutes?: string): string | null | undefined {
  if (hours === undefined) return null
  const h = Number(hours), m = minutes === undefined ? 0 : Number(minutes)
  if (!Number.isInteger(h) || h > 23 || m > 59) return undefined
  return `${pad(h)}:${pad(m)}`
}

/** Split a quick-add text into title, deadline and time. Without a recognised ending nothing changes. */
export function parseQuickTask(text: string, today: string): QuickTask {
  const clean = text.trim().replace(/\s+/g, ' ')
  const plain: QuickTask = { title: clean, deadline: null, deadlineTime: null }
  const withDate = WITH_DATE.exec(clean)
  if (withDate) {
    const deadline = resolveDate(withDate[1], today)
    const time = resolveTime(withDate[2], withDate[3])
    const title = clean.slice(0, withDate.index).trim()
    if (deadline && time !== undefined && title) return { title, deadline, deadlineTime: time }
  }
  const timeOnly = TIME_ONLY.exec(clean)
  if (timeOnly) {
    const time = resolveTime(timeOnly[1] ?? timeOnly[3], timeOnly[2] ?? timeOnly[4])
    const title = clean.slice(0, timeOnly.index).trim()
    if (time && title) return { title, deadline: today, deadlineTime: time }
  }
  return plain
}

const SHORT_DAYS = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör']
/**
 * Label for a deadline. Short (for the chip next to the field): "Idag 14:00", "Imorgon", "Fre 14:00" within the
 * coming week, "2 maj" further away. Long (for the confirmation): always with the date, "Fre 23 okt 14:00".
 */
export function deadlineLabel(deadline: string, time: string | null, today: string, long = false): string {
  const date = parseLocalDate(deadline)
  const weekday = `${SHORT_DAYS[date.getDay()].charAt(0).toUpperCase()}${SHORT_DAYS[date.getDay()].slice(1)}`
  const days = Math.round((date.getTime() - parseLocalDate(today).getTime()) / 86_400_000)
  const day = deadline === today ? 'Idag' : days === 1 ? 'Imorgon'
    : long ? `${weekday} ${date.getDate()} ${MONTHS[date.getMonth()]}`
    : days > 1 && days < 7 ? weekday : `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return time ? `${day} ${time}` : day
}
