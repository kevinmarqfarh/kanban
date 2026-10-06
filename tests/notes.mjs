import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function module(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, name => {
    if (!dependencies[name]) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  })
  return exports
}
const birthdays = await module('../src/lib/birthdays.ts')
const others = await module('../src/lib/others.ts', { './birthdays': birthdays })
const { isWorkspace } = await module('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })
const { mergeRecordChanges, mergeWorkspaceChanges } = await module('../src/lib/workspaceMerge.ts')
const workspace = { columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }], tasks: [], projects: [] }
const note = { id: 'note-one', title: 'Min idé', content: '<p>En tanke.</p>', font: 'system', createdAt: '2026-10-06T12:00:00.000Z', updatedAt: '2026-10-06T12:00:00.000Z' }
assert.ok(isWorkspace(workspace), 'Workspaces saved before Notes remain valid.')
assert.ok(isWorkspace({ ...workspace, notes: [note] }))
for (const changes of [{ id: ' ' }, { title: '' }, { content: null }, { font: 'unknown' }, { updatedAt: '2026-02-30T12:00:00Z' }]) assert.equal(isWorkspace({ ...workspace, notes: [{ ...note, ...changes }] }), false)
assert.equal(isWorkspace({ ...workspace, notes: [note, note] }), false)
const edited = { ...note, title: 'Min nya rubrik' }
const latest = { ...note, content: '<ol><li>En annan fliks text.</li></ol>', font: 'serif' }
const merged = mergeRecordChanges(note, edited, latest)
assert.equal(merged.title, edited.title)
assert.equal(merged.content, latest.content)
assert.equal(merged.font, latest.font)
const base = { ...workspace, notes: [note] }
const local = { ...base, notes: [edited, { ...note, id: 'note-local' }] }
const remote = { ...base, notes: [latest, { ...note, id: 'note-remote' }] }
const combined = mergeWorkspaceChanges(base, local, remote)
assert.equal(combined.notes.length, 3)
assert.equal(combined.notes.find(item => item.id === note.id).content, latest.content)
assert.deepEqual(combined.tasks, workspace.tasks)
assert.equal(mergeWorkspaceChanges(base, { ...base, notes: [edited] }, { ...workspace, notes: [] }).notes.length, 0, 'An old editor must not resurrect a deleted note.')
console.log('Notes data passed: old workspace compatibility, validation, independent field edits, new notes in both tabs and deleted-note protection.')
