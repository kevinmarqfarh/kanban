export type Device = { id: string; user_id: string; endpoint: string; p256dh: string; auth_key: string; enabled: boolean; tasks: boolean; schedule: boolean; birthdays: boolean; lead_minutes: number; quiet_start: string | null; quiet_end: string | null; time_zone: string }
type Item = { id: string; name?: string; columnId?: string; title?: string; deadline?: string | null; deadlineTime?: string | null; schedule?: { date: string; startTime?: string; scope?: string } | null; birthDate?: string; reminders?: string[] }
export type Workspace = { tasks?: Item[]; birthdays?: Item[]; columns?: { id: string; title: string }[] }
const localParts = (time: Date, zone: string) => {
  const values = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(time)
  const get = (kind: string) => values.find(x => x.type === kind)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
const minusMinutes = (local: string, count: number) => new Date(Date.parse(`${local}:00Z`) - count * 60_000).toISOString().slice(0, 16)
const quiet = (device: Device, hhmm: string) => {
  if (!device.quiet_start || !device.quiet_end) return false
  const start = device.quiet_start.slice(0, 5), end = device.quiet_end.slice(0, 5)
  if (start === end) return false
  return start < end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end
}
export function events(workspace: Workspace, device: Device, now: Date) {
  const current = localParts(now, device.time_zone)
  const candidates = new Set([current, localParts(new Date(now.getTime() - 60_000), device.time_zone), localParts(new Date(now.getTime() - 120_000), device.time_zone)])
  const found: { key: string; title: string; body: string; url: string }[] = []
  const add = (key: string, local: string, title: string, body: string, path: string) => { if (candidates.has(local)) found.push({ key, title, body, url: path }) }
  if (quiet(device, current.slice(11))) return found
  const done = new Set((workspace.columns ?? []).filter(column => /^(done|finalized|klart|avslutat)$/i.test(column.id) || /^(klart|avslutat)$/i.test(column.title)).map(column => column.id))
  for (const task of workspace.tasks ?? []) {
    if ('columnId' in task && done.has(String(task.columnId))) continue
    if (device.schedule && task.schedule?.date && task.schedule.startTime && task.schedule.scope !== 'week') {
      const start = `${task.schedule.date}T${task.schedule.startTime}`
      add(`schedule:${task.id}:${start}:${device.lead_minutes}`, minusMinutes(start, device.lead_minutes), 'Schema', `${task.title ?? 'Aktivitet'} börjar ${device.lead_minutes ? `om ${device.lead_minutes} min` : 'nu'}.`, '/?view=schedule')
    }
    if (device.tasks && task.deadline) {
      const due = `${task.deadline}T${task.deadlineTime || '09:00'}`
      add(`task:${task.id}:${due}:${device.lead_minutes}`, minusMinutes(due, device.lead_minutes), 'Planner', `${task.title ?? 'Uppgift'} har deadline ${device.lead_minutes ? `om ${device.lead_minutes} min` : 'nu'}.`, '/?view=planner')
    }
  }
  if (device.birthdays) for (const person of workspace.birthdays ?? []) {
    if (!person.birthDate || !Array.isArray(person.reminders)) continue
    for (const year of [Number(current.slice(0, 4)), Number(current.slice(0, 4)) + 1]) {
      const monthDay = person.birthDate.slice(5, 10)
      const [month, dayOfMonth] = monthDay.split('-').map(Number)
      const birthday = new Date(Date.UTC(year, month - 1, Math.min(dayOfMonth, new Date(Date.UTC(year, month, 0)).getUTCDate()), 12))
      if (Number.isNaN(birthday.getTime())) continue
      for (const kind of person.reminders) {
        const day = new Date(birthday)
        if (kind === 'day') { /* On the birthday itself. */ }
        else if (kind === 'week') day.setUTCDate(day.getUTCDate() - 7)
        else if (kind === 'two-weeks') day.setUTCDate(day.getUTCDate() - 14)
        else if (kind === 'month') day.setUTCDate(day.getUTCDate() - 30)
        else continue
        add(`birthday:${person.id}:${year}:${kind}`, `${day.toISOString().slice(0, 10)}T09:00`, 'Födelsedag', `${person.name ?? 'Någon'} fyller år ${kind === 'day' ? 'idag' : kind === 'week' ? 'om en vecka' : kind === 'two-weeks' ? 'om två veckor' : 'om 30 dagar'}.`, '/?view=home')
      }
    }
  }
  return found
}
