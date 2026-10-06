import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// These pure modules have only type imports; compile them with the project's TypeScript.
async function readModule(relativePath, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, name => {
    if (!(name in dependencies)) throw new Error(`Unexpected test dependency: ${name}`)
    return dependencies[name]
  })
  return exports
}

const { createSeedWorkspace, createEmptyWorkspace } = await readModule('../src/lib/seed.ts')
const birthdays = await readModule('../src/lib/birthdays.ts')
const others = await readModule('../src/lib/others.ts', { './birthdays': birthdays })
const { isWorkspace, separateProjectTasks } = await readModule('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })

const seed = createSeedWorkspace()
assert.ok(isWorkspace(seed), 'The example board must be valid and every task must reference an existing column/project.')
assert.ok(isWorkspace(createEmptyWorkspace()), 'A new account has a valid empty board.')
assert.equal(seed.tasks.length, 9)
const legacy = createSeedWorkspace()
delete legacy.birthdays
assert.ok(isWorkspace(legacy), 'Saved boards from before birthdays stay compatible.')
const person = { id: 'anna', name: 'Anna', birthDate: '1995-11-04', reminders: ['week'], createdAt: '2026-10-04T10:00:00Z', generatedReminders: [] }
assert.ok(isWorkspace({ ...seed, birthdays: [person] }))
seed.tasks[0].checklist[0].completed = false
assert.equal(createSeedWorkspace().tasks[0].checklist[0].completed, true, 'Each example board is an independent copy.')

const invalidCases = [
  null,
  { columns: [], tasks: [], projects: [] },
  { ...createSeedWorkspace(), columns: [{ id: '', title: 'Tom', color: 'gray' }] },
  { ...createSeedWorkspace(), columns: [{ id: 'todo', title: ' ', color: 'gray' }] },
  { ...createSeedWorkspace(), columns: createSeedWorkspace().columns.slice(1) },
  { ...createSeedWorkspace(), projects: [] },
  { ...createSeedWorkspace(), tasks: [...seed.tasks, seed.tasks[0]] },
  { ...createSeedWorkspace(), tasks: [{ ...seed.tasks[0], checklist: [{ id: '1', title: 'Rad', completed: 'true' }] }] },
  { ...createSeedWorkspace(), tasks: [{ ...seed.tasks[0], comments: [{ id: '1', text: null, createdAt: '2026-10-04' }] }] },
  { ...createSeedWorkspace(), birthdays: null },
  { ...createSeedWorkspace(), birthdays: [person, person] },
  { ...createSeedWorkspace(), birthdays: [{ ...person, birthDate: '1995-02-29' }] },
  { ...createSeedWorkspace(), birthdays: [{ ...person, reminders: ['invalid'] }] },
  { ...createSeedWorkspace(), birthdays: [{ ...person, reminders: ['week', 'week'] }] },
  { ...createSeedWorkspace(), birthdays: [{ ...person, generatedReminders: null }] },
  { ...createSeedWorkspace(), tasks: [{ ...seed.tasks[0], id: ' ' }] },
  { ...createSeedWorkspace(), tasks: [{ ...seed.tasks[0], title: '' }] },
  { ...createSeedWorkspace(), tasks: [{ ...seed.tasks[0], deadline: '2026-02-30' }] },
  { ...createSeedWorkspace(), projects: [{ ...seed.projects[0], title: ' ' }] },
  { ...createSeedWorkspace(), projects: [{ ...seed.projects[0], createdAt: '2026-02-30T10:00:00Z' }] },
  { ...createSeedWorkspace(), tasks: [{ ...seed.tasks[0], comments: [{ id: '1', text: 'Kommentar', createdAt: '2026-10-04T24:00:00Z' }] }] },
  { ...createSeedWorkspace(), birthdays: [{ ...person, createdAt: 'not a date' }] },
]
for (const value of invalidCases) assert.equal(isWorkspace(value), false, 'Malformed data must never reach the editor.')
console.log('Data integrity passed: independent seed, empty account, references, duplicate IDs and malformed nested data.')

const separated = separateProjectTasks(createSeedWorkspace())
assert.ok(isWorkspace(separated))
assert.equal(separated.tasks.length, seed.tasks.length, 'Migration preserves every board card.')
assert.ok(separated.tasks.every(task => task.projectId === null))
const legacyProjectCard = createSeedWorkspace().tasks.find(task => task.projectId)
const independent = separated.projects.find(project => project.id === legacyProjectCard.projectId).tasks.find(task => task.id === legacyProjectCard.id)
assert.ok(independent)
assert.equal(independent.columnId, undefined)
assert.equal(independent.projectId, undefined)
assert.equal(independent.completed, legacyProjectCard.columnId === 'done')
assert.deepEqual(independent.checklist, legacyProjectCard.checklist)
assert.equal(separateProjectTasks(separated), separated, 'Migration is idempotent.')
independent.title = 'Changed only in Projects'
assert.equal(separated.tasks.find(task => task.id === legacyProjectCard.id).title, legacyProjectCard.title)
assert.equal(isWorkspace({ ...separated, projects: [{ ...separated.projects[0], tasks: [{ ...independent, completed: 'yes' }] }] }), false)
assert.equal(isWorkspace({ ...separated, projects: [{ ...separated.projects[0], tasks: [independent, independent] }] }), false)
console.log('Project separation passed: lossless/idempotent migration, independent records, and nested validation.')
