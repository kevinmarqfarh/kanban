import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Cake, CloudSun, CookingPot, Dumbbell, Utensils, FileText } from 'lucide-react'
import type { Note, NoteLinkKind, NutritionHabit, Recipe, Workout, Workspace } from '../lib/types'
import { Workouts } from './WorkoutEditor'
import { Nutrition } from './Nutrition'
import { Recipes } from './Recipes'
import { Notes } from './Notes'
import { WeatherPage } from './WeatherPage'
import { useWeather } from '../hooks/useWeather'
import { currentStep } from '../lib/forecast'
import { localDateString } from '../lib/birthdays'

export type OthersSection = 'workouts' | 'nutrition' | 'recipes' | 'notes' | 'weather'
type Section = OthersSection
export function Others({ workspace, today = localDateString(new Date()), initialWeatherDate, initialSection, initialRecord, initialNoteId, onBirthdays, onSaveWorkout, onDeleteWorkout, onRestoreWorkout, onSaveHabit, onToggleHabit, onDeleteHabit, onSaveRecipe, onDeleteRecipe, onSaveNote, onDeleteNote, onRestoreNote, onPurgeNote, onEmptyNoteTrash, onOpenNoteLink }: {
  workspace: Workspace;
  today?: string;
  /** Open the weather page on this day's hourly forecast (from a tap in the week strip). */
  initialWeatherDate?: string | null;
  initialSection?: Section | null;
  initialRecord?: { kind: NoteLinkKind; id: string } | null;
  initialNoteId?: string;
  onBirthdays: () => void;
  onSaveWorkout: (edited: Workout, original?: Workout) => string | null;
  onDeleteWorkout: (id: string) => string | null;
  onRestoreWorkout: (workout: Workout) => string | null;
  onSaveHabit: (edited: NutritionHabit, original?: NutritionHabit) => string | null;
  onToggleHabit: (habitId: string, date: string) => string | null;
  onDeleteHabit: (id: string) => string | null;
  onSaveRecipe: (edited: Recipe, original?: Recipe) => string | null;
  onDeleteRecipe: (id: string) => string | null;
  onSaveNote: (edited: Note, original?: Note) => string | null;
  onDeleteNote: (id: string) => string | null;
  onRestoreNote: (note: Note) => string | null;
  onPurgeNote: (id: string) => string | null;
  onEmptyNoteTrash: () => string | null;
  onOpenNoteLink: (kind: NoteLinkKind, id: string, noteId?: string) => string | null;
}) {
  const [section, setSection] = useState<Section | null>(initialSection ?? null)
  useEffect(() => { setSection(initialSection ?? null) }, [initialSection])
  // The menu shows the temperature from the saved forecast; only the weather page itself fetches.
  const { forecast } = useWeather(today, false)
  const now = forecast ? currentStep(forecast) : null
  if (!section) return <div className="others-module-list">
    <button className="others-module-row" type="button" onClick={() => setSection('notes')}><span className="others-module-icon"><FileText size={21} strokeWidth={1.5} /></span><strong>Notes</strong><span className="count-badge">{workspace.notes?.filter(note => !note.deletedAt).length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={onBirthdays}><span className="others-module-icon"><Cake size={21} strokeWidth={1.5} /></span><strong>Födelsedagar</strong><span className="count-badge">{workspace.birthdays?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('workouts')}><span className="others-module-icon"><Dumbbell size={21} strokeWidth={1.5} /></span><strong>Träning</strong><span className="count-badge">{workspace.workouts?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('nutrition')}><span className="others-module-icon"><Utensils size={21} strokeWidth={1.5} /></span><strong>Kost</strong><span className="count-badge">{workspace.nutritionHabits?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('recipes')}><span className="others-module-icon"><CookingPot size={21} strokeWidth={1.5} /></span><strong>Recept</strong><span className="count-badge">{workspace.recipes?.length ?? 0}</span><ArrowRight size={17} /></button>
    <button className="others-module-row" type="button" onClick={() => setSection('weather')}><span className="others-module-icon"><CloudSun size={21} strokeWidth={1.5} /></span><strong>Väder</strong>{now && <span className="count-badge others-weather-badge" aria-label={`${Math.round(now.temp)} grader i ${forecast!.place.name}`}>{Math.round(now.temp)}°</span>}<ArrowRight size={17} /></button>
  </div>
  const title = section === 'workouts' ? 'Träning' : section === 'nutrition' ? 'Kost' : section === 'notes' ? 'Notes' : section === 'weather' ? 'Väder' : 'Recept'
  return <section className="others-section" aria-label={title} data-others-section={section}><div className="others-section-heading"><button className="button ghost" type="button" onClick={() => setSection(null)}><ArrowLeft size={16} />Till Others</button><h2>{title}</h2></div>
    {section === 'workouts' && <Workouts workouts={workspace.workouts ?? []} initialId={initialRecord?.kind === 'workout' ? initialRecord.id : undefined} onSave={onSaveWorkout} onDelete={onDeleteWorkout} onRestore={onRestoreWorkout} />}
    {section === 'nutrition' && <Nutrition workspace={workspace} initialHabitId={initialRecord?.kind === 'nutrition' ? initialRecord.id : undefined} onSave={onSaveHabit} onDelete={onDeleteHabit} onToggle={onToggleHabit} />}
    {section === 'recipes' && <Recipes recipes={workspace.recipes ?? []} initialId={initialRecord?.kind === 'recipe' ? initialRecord.id : undefined} onSave={onSaveRecipe} onDelete={onDeleteRecipe} />}
    {section === 'weather' && <WeatherPage today={today} initialDate={initialWeatherDate} />}
    {section === 'notes' && <Notes workspace={workspace} initialId={initialNoteId} onSave={onSaveNote} onDelete={onDeleteNote} onRestore={onRestoreNote} onPurge={onPurgeNote} onEmptyTrash={onEmptyNoteTrash} onOpenLink={onOpenNoteLink} />}
  </section>
}
