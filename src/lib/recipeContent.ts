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

/** Extract only explicitly stated summary values; leave all original notes available. */
export function recipeSummary(notes: string): string[] {
  const portions = notes.match(/(?:Cirka\s+)?\d+(?:[–-]\d+)?\s+(?:vuxenportioner|portioner)/iu)?.[0]
  const time = notes.match(/\d+(?:[–-]\d+)?\s+min(?:uter)?\b/iu)?.[0]
  const price = notes.match(/(?:budget:?\s+)?(?:cirka\s+)?\d+(?:[–-]\d+)?\s+kr\/portion/iu)?.[0]
  return [portions, time, price].filter((value): value is string => !!value)
}

export function recipeIngredientLines(text: string): string[] {
  // A comma inside a decimal quantity must stay intact.
  return text.split(/\n+|,\s+/u).map(line => line.trim()).filter(Boolean)
}

export function recipeMethodSteps(text: string): string[] {
  // Respect authored line breaks. Split prose only at an unambiguous sentence boundary.
  if (text.includes('\n')) return text.split(/\n+/u).map(line => line.trim()).filter(Boolean)
  return text.replace(/([.!?])\s+([A-ZÅÄÖ])/gu, '$1\n$2').split(/\n+/u).map(line => line.trim()).filter(Boolean)
}
