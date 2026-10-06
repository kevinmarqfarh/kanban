import type { Task, Workspace } from './types'

function relativeDate(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A fresh copy prevents edits from mutating the example workspace. */
export function createSeedWorkspace(): Workspace {
  const createdAt = '2026-10-01T09:00:00.000Z'
  const task = (id: string, title: string, columnId: string, values: Partial<Task> = {}): Task => ({
    id, title, columnId, description: '', labels: [], checklist: [], deadline: null,
    comments: [], projectId: null, createdAt, ...values,
  })

  return {
    birthdays: [],
    birthdayNotifications: [],
    workouts: [],
    nutritionHabits: [],
    nutritionCompletions: [],
    recipes: [],
    columns: [
      { id: 'todo', title: 'Att göra', color: 'gray' },
      { id: 'doing', title: 'Pågår', color: 'blue' },
      { id: 'done', title: 'Klart', color: 'green' },
      { id: 'finalized', title: 'Finalized', color: 'green' },
    ],
    projects: [
      { id: 'home', title: 'Ett lugnare hem', description: 'Små förändringar som gör vardagen lite finare.', icon: 'home', color: 'sage', deadline: relativeDate(21), createdAt },
      { id: 'weekend', title: 'En helg i Köpenhamn', description: 'Något att se fram emot. God mat, design och långa promenader.', icon: 'compass', color: 'sand', deadline: relativeDate(30), createdAt },
      { id: 'personal', title: 'Tid för mig', description: 'Mer plats för det som ger energi.', icon: 'sparkles', color: 'lavender', deadline: null, createdAt },
    ],
    tasks: [
      task('task-light', 'Hitta en lampa till läshörnan', 'todo', {
        description: 'Varmt ljus och en enkel form. Något som gör kvällarna lite mysigare.',
        labels: ['Hem', 'Inspiration'], projectId: 'home', deadline: relativeDate(5),
        checklist: [
          { id: 'light-1', title: 'Mät platsen bredvid fåtöljen', completed: true },
          { id: 'light-2', title: 'Spara tre favoriter', completed: false },
          { id: 'light-3', title: 'Välj och beställ', completed: false },
        ],
      }),
      task('task-trip', 'Spara platser i Köpenhamn', 'todo', {
        description: 'En liten lista med caféer, butiker och restauranger att upptäcka.',
        labels: ['Resa'], projectId: 'weekend',
        checklist: [
          { id: 'trip-1', title: 'Hitta ett bra frukostställe', completed: false },
          { id: 'trip-2', title: 'Spara en designbutik', completed: false },
          { id: 'trip-3', title: 'Boka en middag', completed: false },
        ],
      }),
      task('task-read', 'Välj nästa bok', 'todo', {
        description: 'En bok som jag längtar efter att öppna.', labels: ['Personligt'], projectId: 'personal',
      }),
      task('task-week', 'Planera en mjuk start på veckan', 'todo', {
        description: 'Tre saker som är viktiga. Resten får ta sin tid.', labels: ['Vardag'], deadline: relativeDate(1),
      }),
      task('task-desk', 'Gör plats på skrivbordet', 'doing', {
        description: 'Lite färre saker. Lite mer fokus.', labels: ['Hem'], projectId: 'home', deadline: relativeDate(0),
        checklist: [
          { id: 'desk-1', title: 'Sortera papper', completed: true },
          { id: 'desk-2', title: 'Samla sladdarna', completed: true },
          { id: 'desk-3', title: 'Ge allt en egen plats', completed: false },
        ],
        comments: [{ id: 'desk-comment', text: 'Behåll bara det jag använder varje dag.', createdAt: '2026-10-02T17:30:00.000Z' }],
      }),
      task('task-routine', 'Skapa en enkel kvällsrutin', 'doing', {
        description: 'Lägg undan mobilen, gör en kopp te och läs några sidor.',
        labels: ['Personligt', 'Välmående'], projectId: 'personal',
        checklist: [
          { id: 'routine-1', title: 'Bestäm en lugn tid', completed: true },
          { id: 'routine-2', title: 'Prova i en vecka', completed: false },
        ],
      }),
      task('task-train', 'Jämför tågtider', 'doing', {
        description: 'En tidig avresa så att vi hinner med en lång lunch.', labels: ['Resa'], projectId: 'weekend', deadline: relativeDate(3),
      }),
      task('task-plants', 'Plantera om växterna', 'done', {
        description: 'Ny jord och lite mer plats att växa.', labels: ['Hem'], projectId: 'home',
        checklist: [{ id: 'plant-1', title: 'Köp jord', completed: true }, { id: 'plant-2', title: 'Plantera om', completed: true }],
      }),
      task('task-walk', 'Ta en promenad utan mobilen', 'done', {
        description: 'En timme ute. Bara för mig.', labels: ['Välmående'], projectId: 'personal',
      }),
    ],
  }
}

export function createEmptyWorkspace(): Workspace {
  return { columns: createSeedWorkspace().columns, tasks: [], projects: [], birthdays: [], birthdayNotifications: [], workouts: [], nutritionHabits: [], nutritionCompletions: [], recipes: [] }
}
