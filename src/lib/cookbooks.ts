import type { Cookbook, Workspace } from './types'
import { availableRecipes } from './recipeCatalog'

/** One-time organization; preserve existing books, covers and later manual removals. */
export function organizeCuisineCookbooks(workspace: Workspace): Workspace {
  if (workspace.cuisineCookbooksOrganized) return workspace
  const recipes = availableRecipes(workspace.recipes)
  const books = [...(workspace.cookbooks ?? [])]
  const key = (text: string) => text.trim().toLocaleLowerCase('sv')
  const groups = [
    { id: 'forma-cookbook-chile', title: 'Chile', names: ['chile', 'chilenskt', 'chilenska'], labels: ['chilenskt'] },
    { id: 'forma-cookbook-iran', title: 'Iran', names: ['iran', 'iranskt', 'iranska', 'persiskt', 'persiska'], labels: ['persiskt', 'iranskt', 'iranska'] },
  ]
  for (const group of groups) {
    const recipeIds = recipes.filter(recipe => recipe.labels.some(label => group.labels.includes(key(label)))).map(recipe => recipe.id)
    const index = books.findIndex(book => book.id === group.id || group.names.includes(key(book.title)))
    if (index >= 0) books[index] = { ...books[index], recipeIds: [...new Set([...books[index].recipeIds, ...recipeIds])] }
    else {
      const book: Cookbook = { id: group.id, title: group.title, recipeIds, createdAt: new Date().toISOString() }
      books.push(book)
    }
  }
  return { ...workspace, cookbooks: books, cuisineCookbooksOrganized: true }
}
