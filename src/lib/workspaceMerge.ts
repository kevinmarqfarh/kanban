import type { Workspace } from './types'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const records = (value: unknown): value is { id: string }[] => Array.isArray(value)
  && value.every(item => !!item && typeof item === 'object' && typeof item.id === 'string')
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')

function mergeList<T extends { id: string }>(base: T[], edited: T[], latest: T[]): T[] {
  const originals = new Map(base.map(item => [item.id, item]))
  const changes = new Map(edited.map(item => [item.id, item]))
  const result = latest.filter(item => !originals.has(item.id) || changes.has(item.id))
    .map(item => {
      const original = originals.get(item.id)
      const changed = changes.get(item.id)
      return original && changed ? mergeRecordChanges(original, changed, item) : item
    })
  // A record removed elsewhere is never resurrected by an old editor/cache.
  for (let index = 0; index < edited.length; index++) {
    const item = edited[index]
    if (originals.has(item.id) || result.some(existing => existing.id === item.id)) continue
    const nextId = edited.slice(index + 1).find(next => result.some(existing => existing.id === next.id))?.id
    const position = nextId ? result.findIndex(existing => existing.id === nextId) : result.length
    result.splice(position, 0, item)
  }
  const common = new Set(base.filter(item => changes.has(item.id)).map(item => item.id))
  if (!same(base.filter(item => common.has(item.id)).map(item => item.id), edited.filter(item => common.has(item.id)).map(item => item.id))) {
    const order = edited.map(item => item.id)
    return [...order.flatMap(id => result.filter(item => item.id === id)), ...result.filter(item => !changes.has(item.id))]
  }
  return result
}

/** Apply only fields changed since the editor's original snapshot. */
export function mergeRecordChanges<T extends { id: string }>(base: T, edited: T, latest: T): T {
  const result = { ...latest }
  for (const key of new Set([...Object.keys(base), ...Object.keys(edited)]) as Set<keyof T>) {
    const before = base[key]
    const change = edited[key]
    const current = latest[key]
    if (same(before, change)) continue
    if (records(before) && records(change) && records(current)) result[key] = mergeList(before, change, current) as T[keyof T]
    else if (strings(before) && strings(change) && strings(current)) {
      result[key] = [...new Set([...current.filter(item => !before.includes(item) || change.includes(item)), ...change.filter(item => !before.includes(item))])] as T[keyof T]
    } else result[key] = change
  }
  return result
}

/** Merge unsaved local changes into the newest cache written by another tab. */
export function mergeWorkspaceChanges(base: Workspace, edited: Workspace, latest: Workspace): Workspace {
  return {
    ...latest,
    columns: mergeList(base.columns, edited.columns, latest.columns),
    tasks: mergeList(base.tasks, edited.tasks, latest.tasks),
    projects: mergeList(base.projects, edited.projects, latest.projects),
    ...((base.birthdays || edited.birthdays || latest.birthdays) ? { birthdays: mergeList(base.birthdays ?? [], edited.birthdays ?? [], latest.birthdays ?? []) } : {}),
  }
}
