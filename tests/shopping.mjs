import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function module(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  })
  return exports
}
const content = await module('../src/lib/recipeContent.ts')
const { shoppingIngredients } = await module('../src/lib/shoppingLists.ts', { './recipeContent': content })
const { mergeWorkspaceChanges } = await module('../src/lib/workspaceMerge.ts')
const recipe = { id: 'recipe', title: 'Soppa', ingredients: '2 burkar tomat (à 400 g), 1 lök\n1 dl grädde', steps: '', notes: '', labels: [], url: '', createdAt: '2026-10-28T09:00:00.000Z' }
assert.deepEqual(shoppingIngredients(recipe), ['2 burkar tomat (à 400 g)', '1 lök', '1 dl grädde'])
const list = { id: 'list', title: 'Handla', items: [], createdAt: recipe.createdAt, updatedAt: recipe.createdAt }
const base = { columns: [{ id: 'todo', title: 'Att göra', color: 'gray' }], tasks: [], projects: [], shoppingLists: [list] }
const local = { ...base, shoppingLists: [{ ...list, items: [{ id: 'milk', title: 'Mjölk', checked: false }] }] }
const remote = { ...base, shoppingLists: [{ ...list, items: [{ id: 'bread', title: 'Bröd', checked: false }] }] }
assert.deepEqual(mergeWorkspaceChanges(base, local, remote).shoppingLists[0].items.map(item => item.id), ['bread', 'milk'])
console.log('PASS shopping ingredients and concurrent list merge')
