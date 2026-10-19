import type { Recipe } from './types'

export const cuisineLabels = ['Chilenskt', 'Persiskt', 'Nordiskt', 'Indiskt', 'Italienskt', 'Grekiskt', 'Mexikanskt', 'Mellanöstern', 'Marockanskt', 'Nordafrikanskt', 'Etiopiskt', 'Västafrikanskt', 'Asiatiskt', 'Thailändskt', 'Vietnamesiskt', 'Koreanskt', 'Kinesiskt', 'Japanskt', 'Turkiskt', 'Franskt', 'Östeuropeiskt', 'Medelhavsinspirerat', 'Vardagsmat']
export const isCuisineLabel = (label: string): boolean => cuisineLabels.some(cuisine => cuisine.toLocaleLowerCase('sv') === label.trim().toLocaleLowerCase('sv'))

/** Old personal recipes remain readable; structured fields take precedence. */
export function recipeContent(recipe: Recipe): { ingredients: string; method: string; notes: string } {
  if (recipe.ingredients !== undefined) return { ingredients: recipe.ingredients, method: recipe.steps, notes: recipe.notes ?? '' }
  const ingredients = /^(?:Ingredienser|Mängder):\s*/mu.exec(recipe.steps)
  const method = /^(?:Gör så här|Gör|Tillagning):\s*/mu.exec(recipe.steps)
  if (!ingredients || !method || method.index < ingredients.index) return { ingredients: '', method: recipe.steps, notes: recipe.notes ?? '' }
  const rest = recipe.steps.slice(method.index + method[0].length)
  const note = /\n+(?=(?:Frys|Inspiration[^:\n]*):)/u.exec(rest)
  return {
    ingredients: recipe.steps.slice(ingredients.index + ingredients[0].length, method.index).trim(),
    method: (note ? rest.slice(0, note.index) : rest).trim(),
    notes: [recipe.steps.slice(0, ingredients.index).trim(), note ? rest.slice(note.index).trim() : '', recipe.notes ?? ''].filter(Boolean).join('\n\n'),
  }
}
