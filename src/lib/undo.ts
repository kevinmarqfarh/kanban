// Ångra: put back exactly what one change removed, even if other changes happened afterwards.
// Records are matched by `id`, in every collection of the workspace and one level down (a project's tasks).
// A soft delete (notes get `deletedAt`) is reversed by restoring the earlier `deletedAt`.

type Row = { id: string; [key: string]: unknown }
const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && typeof (value as Row).id === 'string'
const isRows = (value: unknown): value is Row[] => Array.isArray(value) && value.every(isRow)

function restoreList(before: Row[], removed: Row[], current: Row[], depth: number): Row[] {
  const afterIds = new Set(removed.map(row => row.id))
  const currentIds = new Set(current.map(row => row.id))
  let changed = false
  let result = current.map(row => {
    const old = before.find(entry => entry.id === row.id)
    const after = removed.find(entry => entry.id === row.id)
    const restored = old && after ? restoreRow(old, after, row, depth) : row
    if (restored !== row) changed = true
    return restored
  })
  // Rows that the change removed (present before, gone right after) and that are still missing now.
  before.forEach((row, index) => {
    if (afterIds.has(row.id) || currentIds.has(row.id)) return
    const next = [...result]
    next.splice(Math.min(index, next.length), 0, row)
    result = next
    changed = true
  })
  // Untouched lists keep their identity, so nothing else re-renders or re-syncs.
  return changed ? result : current
}

function restoreRow(before: Row, after: Row, current: Row, depth: number): Row {
  let row = current
  // Soft delete: the change set deletedAt; put back what it was.
  if ('deletedAt' in after && after.deletedAt && !before.deletedAt && current.deletedAt === after.deletedAt) {
    row = { ...row, deletedAt: before.deletedAt ?? null }
  }
  if (depth > 0) {
    for (const key of Object.keys(before)) {
      const oldList = before[key], afterList = after[key], nowList = row[key]
      if (isRows(oldList) && isRows(afterList) && isRows(nowList) && afterList.length < oldList.length) row = { ...row, [key]: restoreList(oldList, afterList, nowList, depth - 1) }
    }
  }
  return row
}

/**
 * `before` and `after` are the workspace just before and just after the change; `current` is the workspace now.
 * Returns `current` with the removed records (and soft deletes) of that change undone.
 */
export function restoreRemoved<T extends object>(before: T, after: T, current: T): T {
  const result: Record<string, unknown> = { ...(current as Record<string, unknown>) }
  const b = before as unknown as Record<string, unknown>, a = after as unknown as Record<string, unknown>, c = current as unknown as Record<string, unknown>
  for (const key of Object.keys(b)) {
    if (isRows(b[key]) && isRows(a[key]) && isRows(c[key] ?? [])) result[key] = restoreList(b[key] as Row[], a[key] as Row[], (c[key] ?? []) as Row[], 1)
  }
  return result as unknown as T
}

/** Did the change remove anything that can be put back? */
export function hasRemovals<T extends object>(before: T, after: T): boolean {
  const restored = restoreRemoved(before, after, after)
  return JSON.stringify(restored) !== JSON.stringify(after)
}

/** How long Ångra stays on screen after a deletion. */
export const UNDO_MS = 7000
