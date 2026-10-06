import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
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

const icons = await module('../src/lib/projectIcons.ts')
const { projectIconCatalog, projectIconGroups, projectIconsByGroup, isProjectIconKey, resolveProjectIcon, projectIconLabel, defaultProjectIcon } = icons
const keys = projectIconCatalog.map(icon => icon.key)

// Persisted keys from before the expansion must keep working, in their original order.
assert.deepEqual(keys.slice(0, 5), ['folder', 'leaf', 'home', 'compass', 'sparkles'])
assert.ok(keys.length >= 40, `Expected a broad icon set, got ${keys.length}`)
assert.equal(new Set(keys).size, keys.length, 'Icon keys are unique.')
assert.equal(new Set(projectIconCatalog.map(icon => icon.label)).size, keys.length, 'Icon labels are unique, so accessible names are unambiguous.')
for (const icon of projectIconCatalog) {
  assert.match(icon.key, /^[a-z]+(-[a-z]+)*$/, `Key ${icon.key} is lowercase kebab-case.`)
  assert.ok(icon.label.trim().length > 0, `Key ${icon.key} has a label.`)
  assert.ok(projectIconGroups.some(group => group.id === icon.group), `Key ${icon.key} belongs to a known group.`)
}

// Grouping covers every icon exactly once and leaves no group empty.
const grouped = projectIconsByGroup()
assert.deepEqual(grouped.flatMap(group => group.icons.map(icon => icon.key)).sort(), [...keys].sort())
assert.ok(grouped.every(group => group.icons.length > 0), 'No empty icon groups.')

// Lookup and fallback behaviour.
assert.equal(defaultProjectIcon, 'folder')
assert.equal(isProjectIconKey('rocket'), true)
assert.equal(isProjectIconKey('not-an-icon'), false)
assert.equal(resolveProjectIcon('graduation-cap'), 'graduation-cap')
assert.equal(resolveProjectIcon('not-an-icon'), 'folder')
assert.equal(resolveProjectIcon(''), 'folder')
assert.equal(projectIconLabel('home'), 'Hem')
assert.equal(projectIconLabel('unknown'), 'Mapp')

// Seeded projects only use catalogue icons.
const { createEmptyWorkspace } = await module('../src/lib/seed.ts')
const seedSource = await readFile(new URL('../src/lib/seed.ts', import.meta.url), 'utf8')
for (const [, key] of seedSource.matchAll(/icon: '([^']+)'/g)) assert.ok(isProjectIconKey(key), `Seed icon ${key} is in the catalogue.`)
assert.ok(createEmptyWorkspace().projects.every(project => isProjectIconKey(project.icon)))

// Every key is mapped to a component in Projects.tsx, and that component exists in lucide-react.
const require = createRequire(import.meta.url)
const lucide = require('lucide-react')
const component = await readFile(new URL('../src/components/Projects.tsx', import.meta.url), 'utf8')
const mapSource = component.match(/const projectIcons = \{([\s\S]*?)\} satisfies/)?.[1]
assert.ok(mapSource, 'Projects.tsx defines the icon map.')
const mapped = Object.fromEntries([...mapSource.matchAll(/'?([a-z-]+)'?:\s*([A-Za-z0-9]+)/g)].map(([, key, name]) => [key, name]))
assert.deepEqual(Object.keys(mapped).sort(), [...keys].sort(), 'The component map and catalogue list the same keys.')
for (const [key, name] of Object.entries(mapped)) assert.ok(lucide[name], `lucide-react exports ${name} for ${key}.`)
assert.equal(new Set(Object.values(mapped)).size, keys.length, 'No two keys share the same glyph.')

console.log(`Project icon tests passed (${keys.length} icons in ${projectIconGroups.length} groups).`)
