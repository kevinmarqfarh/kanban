import type { DailyDebrief } from './types'

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const length = (value: string) => Array.from(value).length
const text = (value: unknown, maximum: number, required: boolean): value is string => typeof value === 'string'
  && !value.includes('\0') && length(value) <= maximum && (!required || !!value.trim())

function dayDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1) return false
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  return !!match && dayDate(match[1]) && Number(match[2]) <= 23 && Number(match[3]) <= 59
    && Number(match[4]) <= 59 && (!match[6] || (Number(match[6]) <= 23 && Number(match[7]) <= 59))
    && Number.isFinite(Date.parse(value))
}

const nullableTimestamp = (value: unknown) => value === null || timestamp(value)

/** Validate both local cache records and rows returned by the separate debrief feed. */
export function isDailyDebrief(value: unknown): value is DailyDebrief {
  return object(value) && dayDate(value.date) && value.id === value.date
    && text(value.title, 120, true) && text(value.summary, 500, false) && text(value.body, 20_000, true)
    && timestamp(value.createdAt) && nullableTimestamp(value.readAt) && nullableTimestamp(value.dismissedAt)
}

/** The import contract contains plain text and no client-controlled read state. */
export function parseDebriefPayload(value: unknown, now: Date = new Date()): DailyDebrief {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) }
    catch { throw new Error('Filen innehåller inte giltig JSON.') }
  }
  if (!object(value)) throw new Error('Varje debriefing måste vara ett JSON-objekt.')
  if (!dayDate(value.date)) throw new Error('Datumet måste vara ett giltigt datum i formatet ÅÅÅÅ-MM-DD.')
  const readText = (key: 'title' | 'summary' | 'body', label: string, maximum: number, required: boolean) => {
    if (typeof value[key] !== 'string') throw new Error(`${label} måste vara text.`)
    const result = value[key].trim()
    if (required && !result) throw new Error(`${label} får inte vara tom.`)
    if (!text(result, maximum, required)) throw new Error(`${label} får innehålla högst ${maximum.toLocaleString('sv-SE')} tecken och inga nolltecken.`)
    return result
  }
  const title = readText('title', 'Rubriken', 120, true)
  const summary = readText('summary', 'Sammanfattningen', 500, false)
  const body = readText('body', 'Debriefingen', 20_000, true)
  if (value.createdAt !== undefined && !timestamp(value.createdAt)) throw new Error('Skapad tid måste vara en giltig ISO-tid med tidszon.')
  if (!Number.isFinite(now.getTime())) throw new Error('Den aktuella tiden är ogiltig.')
  return {
    id: value.date, date: value.date, title, summary, body,
    createdAt: value.createdAt === undefined ? now.toISOString() : value.createdAt as string,
    readAt: null, dismissedAt: null,
  }
}

/** Re-importing identical content keeps read/dismiss state, regardless of import time. */
export function mergeDebrief(existing: DailyDebrief[], incoming: DailyDebrief): DailyDebrief[] {
  const previous = existing.find(entry => entry.id === incoming.id)
  if (previous && previous.date === incoming.date && previous.title === incoming.title
    && previous.summary === incoming.summary && previous.body === incoming.body) return existing
  const fresh = { ...incoming, readAt: null, dismissedAt: null }
  return [...existing.filter(entry => entry.id !== incoming.id), fresh].sort((a, b) => b.date.localeCompare(a.date))
}

export function markDebriefRead(list: DailyDebrief[], id: string, now: Date = new Date()): DailyDebrief[] {
  const entry = list.find(entry => entry.id === id)
  if (!entry || entry.readAt !== null) return list
  const readAt = now.toISOString()
  return list.map(item => item.id === id ? { ...item, readAt } : item)
}

export function dismissDebrief(list: DailyDebrief[], id: string, now: Date = new Date()): DailyDebrief[] {
  const entry = list.find(entry => entry.id === id)
  if (!entry || entry.dismissedAt !== null) return list
  const dismissedAt = now.toISOString()
  return list.map(item => item.id === id ? { ...item, dismissedAt } : item)
}

export function unreadDebriefs(list: DailyDebrief[]): DailyDebrief[] {
  return list.filter(entry => !entry.readAt && !entry.dismissedAt).sort((a, b) => b.date.localeCompare(a.date))
}
