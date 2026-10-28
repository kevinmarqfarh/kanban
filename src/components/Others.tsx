import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Cake, CookingPot, Dumbbell, Utensils, FileText, Clock } from 'lucide-react'
import type { Cookbook, OvertimeEntry, Note, NoteLinkKind, NutritionHabit, Recipe, Workout, Workspace } from '../lib/types'
import { Workouts } from './WorkoutEditor'
import { Nutrition } from './Nutrition'
import { Cookbooks } from './Cookbooks'
import { RecipeTimersProvider } from './RecipeTimers'
import { Notes } from './Notes'
import { useLocalDay } from '../hooks/useLocalDay'
import { isNutritionComplete } from '../lib/others'
import { isValidBirthDate, nextBirthday } from '../lib/birthdays'
import { availableRecipes } from '../lib/recipeCatalog'

import { Overtime } from './Overtime'
import { formatOvertime, overtimeBalance } from '../lib/overtime'

type Section = 'overtime' | 'workouts' | 'nutrition' | 'recipes' | 'notes'
export function Others({ workspace, recipeTimerScope, initialSection, initialRecord, initialNoteId, onBirthdays, onSaveOvertime, onDeleteOvertime, onSaveWorkout, onDeleteWorkout, onRestoreWorkout, onSaveHabit, onToggleHabit, onDeleteHabit, onOrganizeCookbooks, onSaveCookbook, onDeleteCookbook, onSaveRecipe, onDeleteRecipe, onAddRecipeToShoppingList, onSaveNote, onDeleteNote, onRestoreNote, onPurgeNote, onEmptyNoteTrash, onOpenNoteLink }: {
  workspace: Workspace;
  recipeTimerScope: string;
  initialSection?: Section | null;
  initialRecord?: { kind: NoteLinkKind; id: string } | null;
  initialNoteId?: string;
  onBirthdays: () => void;
  onSaveOvertime: (edited: OvertimeEntry, original?: OvertimeEntry) => string | null;
  onDeleteOvertime: (id: string) => string | null;
  onSaveWorkout: (edited: Workout, original?: Workout) => string | null;
  onDeleteWorkout: (id: string) => string | null;
  onRestoreWorkout: (workout: Workout) => string | null;
  onSaveHabit: (edited: NutritionHabit, original?: NutritionHabit) => string | null;
  onToggleHabit: (habitId: string, date: string) => string | null;
  onDeleteHabit: (id: string) => string | null;
  onOrganizeCookbooks: () => string | null;
  onSaveCookbook: (edited: Cookbook, original?: Cookbook) => string | null;
  onDeleteCookbook: (id: string) => string | null;
  onSaveRecipe: (edited: Recipe, original?: Recipe, cookbookId?: string) => string | null;
  onDeleteRecipe: (id: string) => string | null;
  onAddRecipeToShoppingList: (recipeId: string, listId: string | null, newTitle?: string) => string | null;
  onSaveNote: (edited: Note, original?: Note) => string | null;
  onDeleteNote: (id: string) => string | null;
  onRestoreNote: (note: Note) => string | null;
  onPurgeNote: (id: string) => string | null;
  onEmptyNoteTrash: () => string | null;
  onOpenNoteLink: (kind: NoteLinkKind, id: string, noteId?: string) => string | null;
}) {
  const recipes = availableRecipes(workspace.recipes)
  const today = useLocalDay()
  const nextPerson = [...(workspace.birthdays ?? [])].filter(person => isValidBirthDate(person.birthDate)).sort((a, b) => nextBirthday(a.birthDate).date.localeCompare(nextBirthday(b.birthDate).date))[0]
  const latestWorkout = [...(workspace.workouts ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]
  const habits = workspace.nutritionHabits ?? []
  const completed = habits.filter(habit => isNutritionComplete(workspace, habit.id, today)).length
  const notes = workspace.notes?.filter(note => !note.deletedAt) ?? []
  const shoppingLists = workspace.shoppingLists ?? []
  const [section, setSection] = useState<Section | null>(initialSection ?? null)
  useEffect(() => { setSection(initialSection ?? null) }, [initialSection])
  if (!section) return <div className="others-module-list">
    <button className="others-module-row" type="button" onClick={() => setSection('overtime')}><span className="others-module-icon"><Clock size={21} strokeWidth={1.5} /></span><span className="others-module-copy"><strong>Övertid</strong><small>Saldo: {formatOvertime(overtimeBalance(workspace.overtime ?? []))}</small></span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('notes')}><span className="others-module-icon"><FileText size={21} strokeWidth={1.5} /></span><span className="others-module-copy"><strong>Anteckningar</strong><small>{notes.filter(note => note.pinned).length} {notes.filter(note => note.pinned).length === 1 ? 'fäst' : 'fästa'} · {notes.length} {notes.length === 1 ? 'anteckning' : 'anteckningar'}</small></span><span className="count-badge">{workspace.notes?.filter(note => !note.deletedAt).length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={onBirthdays}><span className="others-module-icon"><Cake size={21} strokeWidth={1.5} /></span><span className="others-module-copy"><strong>Födelsedagar</strong><small>{nextPerson ? `Nästa: ${nextPerson.name} · ${new Date(`${nextBirthday(nextPerson.birthDate).date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : 'Lägg till någon du vill komma ihåg'}</small></span><span className="count-badge">{workspace.birthdays?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('workouts')}><span className="others-module-icon"><Dumbbell size={21} strokeWidth={1.5} /></span><span className="others-module-copy"><strong>Träning</strong><small>{latestWorkout ? `Senaste pass: ${new Date(`${latestWorkout.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}` : 'Registrera ditt första pass'}</small></span><span className="count-badge">{workspace.workouts?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('nutrition')}><span className="others-module-icon"><Utensils size={21} strokeWidth={1.5} /></span><span className="others-module-copy"><strong>Kost</strong><small>{habits.length ? `Idag: ${completed}/${habits.length} klara` : 'Skapa en daglig vana'}</small></span><span className="count-badge">{workspace.nutritionHabits?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('recipes')}><span className="others-module-icon"><CookingPot size={21} strokeWidth={1.5} /></span><span className="others-module-copy"><strong>Recept</strong><small>{workspace.cookbooks?.length ?? 0} kokböcker · {recipes.filter(recipe => recipe.favorite).length} favoriter · {recipes.length} recept</small></span><span className="count-badge">{recipes.length}</span><ArrowRight size={17} /></button>
  </div>
  const title = section === 'overtime' ? 'Övertid' : section === 'workouts' ? 'Träning' : section === 'nutrition' ? 'Kost' : section === 'notes' ? 'Anteckningar' : 'Recept'
  return <section className="others-section" aria-label={title} data-others-section={section}><div className="others-section-heading"><button className="button ghost" type="button" onClick={() => setSection(null)}><ArrowLeft size={16} />Till Others</button><h2>{title}</h2></div>
    {section === 'overtime' && <Overtime entries={workspace.overtime ?? []} onSave={onSaveOvertime} onDelete={onDeleteOvertime} />}
    {section === 'workouts' && <Workouts workouts={workspace.workouts ?? []} initialId={initialRecord?.kind === 'workout' ? initialRecord.id : undefined} onSave={onSaveWorkout} onDelete={onDeleteWorkout} onRestore={onRestoreWorkout} />}
    {section === 'nutrition' && <Nutrition workspace={workspace} initialHabitId={initialRecord?.kind === 'nutrition' ? initialRecord.id : undefined} onSave={onSaveHabit} onDelete={onDeleteHabit} onToggle={onToggleHabit} />}
    {section === 'recipes' && <RecipeTimersProvider key={recipeTimerScope} scope={recipeTimerScope}><Cookbooks organized={!!workspace.cuisineCookbooksOrganized} onOrganize={onOrganizeCookbooks} books={workspace.cookbooks ?? []} onSaveBook={onSaveCookbook} onDeleteBook={onDeleteCookbook} recipes={recipes} shoppingLists={shoppingLists} onAddRecipeToShoppingList={onAddRecipeToShoppingList} initialId={initialRecord?.kind === 'recipe' ? initialRecord.id : undefined} onSave={onSaveRecipe} onDelete={onDeleteRecipe} /></RecipeTimersProvider>}
    {section === 'notes' && <Notes workspace={workspace} initialId={initialNoteId} onSave={onSaveNote} onDelete={onDeleteNote} onRestore={onRestoreNote} onPurge={onPurgeNote} onEmptyTrash={onEmptyNoteTrash} onOpenLink={onOpenNoteLink} />}
  </section>
}
