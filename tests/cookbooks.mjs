import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
async function load(path, deps = {}) {
 const source = await readFile(new URL(path, import.meta.url), 'utf8')
 const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
 const exports = {}; new Function('exports', 'require', outputText)(exports, name => { if (!(name in deps)) throw Error(name); return deps[name] }); return exports
}
const birthdays = await load('../src/lib/birthdays.ts')
const others = await load('../src/lib/others.ts', { './birthdays': birthdays })
const { isWorkspace } = await load('../src/lib/workspaceValidation.ts', { './birthdays': birthdays, './others': others })
const { mergeWorkspaceChanges } = await load('../src/lib/workspaceMerge.ts')
const { createEmptyWorkspace } = await load('../src/lib/seed.ts')
const book = { id: 'book1', title: 'Chile', recipeIds: ['recipe1'], createdAt: '2026-10-25T12:00:00Z' }
const base = { ...createEmptyWorkspace(), cookbooks: [book] }
assert.equal(isWorkspace(createEmptyWorkspace()), true)
assert.equal(isWorkspace(base), true)
assert.equal(isWorkspace({ ...base, cookbooks: [book, book] }), false)
for (const patch of [{ title: ' ' }, { title: 'a'.repeat(81) }, { image: 'https://example.org/image.jpg' }, { recipeIds: ['a', 'a'] }, { recipeIds: [1] }, { createdAt: 'bad' }]) assert.equal(isWorkspace({ ...base, cookbooks: [{ ...book, ...patch }] }), false)
const edited = { ...base, cookbooks: [{ ...book, title: 'Chile och mer', recipeIds: ['recipe1', 'recipe2'] }] }
const latest = { ...base, cookbooks: [{ ...book, recipeIds: ['recipe1', 'recipe3'] }] }
const merged = mergeWorkspaceChanges(base, edited, latest)
assert.equal(merged.cookbooks[0].title, 'Chile och mer')
assert.deepEqual(new Set(merged.cookbooks[0].recipeIds), new Set(['recipe1', 'recipe2', 'recipe3']))
assert.equal(mergeWorkspaceChanges(base, edited, { ...base, cookbooks: [] }).cookbooks.length, 0)
const second = { ...book, id: 'book2', title: 'Snacks' }
assert.equal(isWorkspace({ ...base, cookbooks: [book, second] }), true, 'A recipe can belong to several books')
const image = 'data:image/jpeg;base64,/9j/2Q=='
assert.equal(isWorkspace({ ...base, cookbooks: [{ ...book, image }] }), true)
console.log('PASS cookbook validation, legacy workspaces, images, multiple membership and concurrent edits/deletion')
