import type { Recipe } from './types'
import { recipeContent, recipeIngredientLines } from './recipeContent'

/** Keep the recipe's own quantities and wording; shopping items can be edited later. */
export function shoppingIngredients(recipe: Recipe): string[] {
  return recipeIngredientLines(recipeContent(recipe).ingredients)
    .map(line => line.replace(/^\s*[-•]\s*/u, '').trim())
    .filter(Boolean)
}
