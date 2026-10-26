import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
async function load(path, deps = {}) {
 const source = await readFile(new URL(path, import.meta.url), 'utf8')
 const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
 const exports = {}; new Function('exports', 'require', outputText)(exports, name => { if (!(name in deps)) throw Error(name); return deps[name] }); return exports
}
const { overtimeMinutes, overtimeBalance, formatOvertime } = await load('../src/lib/overtime.ts')
const birthdays = await load('../src/lib/birthdays.ts')
const others = await load('../src/lib/others.ts', { './birthdays': birthdays })
const { isWorkspace } = await load('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others, './schedule': await load('../src/lib/schedule.ts', { './birthdays': birthdays, './others': others }) })
const { mergeWorkspaceChanges } = await load('../src/lib/workspaceMerge.ts')
const { createEmptyWorkspace } = await load('../src/lib/seed.ts')
assert.equal(overtimeMinutes('17:15', '19:00'), 105)
assert.equal(overtimeMinutes('23:30', '01:15'), 105)
assert.equal(overtimeMinutes('00:00', '00:01'), 1)
assert.equal(overtimeMinutes('12:00', '12:00'), 0)
assert.equal(overtimeMinutes('25:00', '12:00'), 0)
assert.equal(formatOvertime(125), '2 h 5 min')
const entry = { id: 'o1', date: '2026-10-21', startTime: '23:30', endTime: '01:15', comment: 'Jour', taken: false, createdAt: '2026-10-21T12:00:00Z' }
const base = { ...createEmptyWorkspace(), overtime: [entry] }
assert.equal(isWorkspace(base), true)
assert.equal(isWorkspace(createEmptyWorkspace()), true)
assert.equal(overtimeBalance([entry, { ...entry, id: 'o2', taken: true }]), 105)
for (const patch of [{ date: '2026-02-30' }, { startTime: '24:00' }, { endTime: '23:30' }, { taken: 'yes' }]) assert.equal(isWorkspace({ ...base, overtime: [{ ...entry, ...patch }] }), false)
assert.equal(isWorkspace({ ...base, overtime: [entry, entry] }), false)
const merged = mergeWorkspaceChanges(base, { ...base, overtime: [{ ...entry, taken: true }] }, { ...base, overtime: [{ ...entry, comment: 'Uppdaterad i annan flik' }, { ...entry, id: 'o2' }] })
assert.equal(merged.overtime[0].taken, true)
assert.equal(merged.overtime[0].comment, 'Uppdaterad i annan flik')
assert.equal(merged.overtime.length, 2)
assert.equal(overtimeBalance(merged.overtime), 105)
assert.equal(mergeWorkspaceChanges(base, { ...base, overtime: [{ ...entry, taken: true }] }, { ...base, overtime: [] }).overtime.length, 0)
console.log('PASS overtime calculations, validation, legacy workspaces and concurrent changes')
