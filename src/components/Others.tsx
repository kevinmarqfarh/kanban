import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Cake, CookingPot, Dumbbell, Utensils, FileText } from 'lucide-react'
import type { Note, NoteLinkKind, NutritionHabit, Recipe, Workout, Workspace } from '../lib/types'
import { Workouts } from './WorkoutEditor'
import { Nutrition } from './Nutrition'
import { Recipes } from './Recipes'
import { Notes } from './Notes'

type Section = 'workouts' | 'nutrition' | 'recipes' | 'notes'
export function Others({ workspace, initialSection, initialRecord, initialNoteId, onBirthdays, onSaveWorkout, onDeleteWorkout, onSaveHabit, onToggleHabit, onDeleteHabit, onSaveRecipe, onDeleteRecipe, onSaveNote, onDeleteNote, onOpenNoteLink }: {
  workspace: Workspace;
  initialSection?: Section | null;
  initialRecord?: { kind: NoteLinkKind; id: string } | null;
  initialNoteId?: string;
  onBirthdays: () => void;
  onSaveWorkout: (edited: Workout, original?: Workout) => string | null;
  onDeleteWorkout: (id: string) => string | null;
  onSaveHabit: (edited: NutritionHabit, original?: NutritionHabit) => string | null;
  onToggleHabit: (habitId: string, date: string) => string | null;
  onDeleteHabit: (id: string) => string | null;
  onSaveRecipe: (edited: Recipe, original?: Recipe) => string | null;
  onDeleteRecipe: (id: string) => string | null;
  onSaveNote: (edited: Note, original?: Note) => string | null;
  onDeleteNote: (id: string) => string | null;
  onOpenNoteLink: (kind: NoteLinkKind, id: string, noteId?: string) => string | null;
}) {
  const [section, setSection] = useState<Section | null>(initialSection ?? null)
  useEffect(() => { setSection(initialSection ?? null) }, [initialSection])
  if (!section) return <div className="others-module-list">
    <button className="others-module-row" type="button" onClick={() => setSection('notes')}><span className="others-module-icon"><FileText size={21} strokeWidth={1.5} /></span><strong>Notes</strong><span className="count-badge">{workspace.notes?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={onBirthdays}><span className="others-module-icon"><Cake size={21} strokeWidth={1.5} /></span><strong>Födelsedagar</strong><span className="count-badge">{workspace.birthdays?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('workouts')}><span className="others-module-icon"><Dumbbell size={21} strokeWidth={1.5} /></span><strong>Träning</strong><span className="count-badge">{workspace.workouts?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('nutrition')}><span className="others-module-icon"><Utensils size={21} strokeWidth={1.5} /></span><strong>Kost</strong><span className="count-badge">{workspace.nutritionHabits?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('recipes')}><span className="others-module-icon"><CookingPot size={21} strokeWidth={1.5} /></span><strong>Recept</strong><span className="count-badge">{workspace.recipes?.length ?? 0}</span><ArrowRight size={17} /></button>
  </div>
  const title = section === 'workouts' ? 'Träning' : section === 'nutrition' ? 'Kost' : section === 'notes' ? 'Notes' : 'Recept'
  return <section className="others-section" aria-label={title} data-others-section={section}><div className="others-section-heading"><button className="button ghost" type="button" onClick={() => setSection(null)}><ArrowLeft size={16} />Till Others</button><h2>{title}</h2></div>
    {section === 'workouts' && <Workouts workouts={workspace.workouts ?? []} initialId={initialRecord?.kind === 'workout' ? initialRecord.id : undefined} onSave={onSaveWorkout} onDelete={onDeleteWorkout} />}
    {section === 'nutrition' && <Nutrition workspace={workspace} initialHabitId={initialRecord?.kind === 'nutrition' ? initialRecord.id : undefined} onSave={onSaveHabit} onDelete={onDeleteHabit} onToggle={onToggleHabit} />}
    {section === 'recipes' && <Recipes recipes={workspace.recipes ?? []} initialId={initialRecord?.kind === 'recipe' ? initialRecord.id : undefined} onSave={onSaveRecipe} onDelete={onDeleteRecipe} />}
    {section === 'notes' && <Notes workspace={workspace} initialId={initialNoteId} onSave={onSaveNote} onDelete={onDeleteNote} onOpenLink={onOpenNoteLink} />}
  </section>
}
