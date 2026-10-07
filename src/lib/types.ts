export interface Column {
  id: string
  title: string
  color: string
  collapsed?: boolean
}

export interface ChecklistItem {
  id: string
  title: string
  completed: boolean
}

export interface Comment {
  id: string
  text: string
  createdAt: string
}

export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  description: string
  columnId: string
  labels: string[]
  checklist: ChecklistItem[]
  deadline: string | null
  deadlineTime?: string | null
  // High (red), medium (yellow) or low (green). Missing on cards saved before priorities existed.
  priority?: TaskPriority | null
  comments: Comment[]
  projectId: string | null
  createdAt: string
}

export type ProjectTask = Omit<Task, 'columnId' | 'projectId'> & { completed: boolean }

export interface Project {
  id: string
  title: string
  description: string
  tasks?: ProjectTask[]
  icon: string
  color: string
  deadline: string | null
  createdAt: string
}

export type BirthdayReminder = 'month' | 'two-weeks' | 'week' | 'day'

export interface Birthday {
  id: string
  name: string
  birthDate: string
  reminders: BirthdayReminder[]
  createdAt: string
  generatedReminders: string[]
  // Group such as Familj or Vänner. Missing on records saved before tags existed.
  tag?: string | null
}

export interface BirthdayNotification {
  id: string
  birthdayId: string
  date: string
  reminder: BirthdayReminder
  name: string
  age: number
  createdAt: string
  readAt: string | null
  dismissedAt: string | null
}

export interface WorkoutRow {
  id: string
  title: string
  amount: string
  amountUnit: 'sets' | 'min'
  load: string
  loadUnit: 'time' | 'kg' | 'level'
  bpm: string
}

export interface Workout {
  id: string
  date: string
  title?: string
  rows: WorkoutRow[]
  createdAt: string
}

export type NutritionUnit = 'st' | 'ml' | 'l' | 'g' | 'portion'

export interface NutritionHabit {
  id: string
  title: string
  amount: string
  unit: NutritionUnit
  createdAt: string
}

export interface NutritionCompletion {
  id: string
  habitId: string
  date: string
  completed: boolean
}

export interface Recipe {
  id: string
  title: string
  url: string
  steps: string
  labels: string[]
  createdAt: string
  // Compressed JPEG data URL shown on the recipe card. Optional.
  image?: string
}

export type NoteFont = 'system' | 'serif' | 'mono'
export type NoteLinkKind = 'task' | 'project' | 'workout' | 'nutrition' | 'recipe' | 'birthday'
export interface Note {
  id: string
  title: string
  content: string
  font: NoteFont
  createdAt: string
  updatedAt: string
}

export interface DailyDebrief {
  id: string
  date: string
  title: string
  summary: string
  body: string
  createdAt: string
  readAt: string | null
  dismissedAt: string | null
}

export interface DebriefPayload {
  date: string
  title: string
  summary: string
  body: string
  createdAt?: string
}

export interface Workspace {
  columns: Column[]
  tasks: Task[]
  projects: Project[]
  // Optional when loading workspaces created before birthdays were introduced.
  birthdays?: Birthday[]
  birthdayNotifications?: BirthdayNotification[]
  workouts?: Workout[]
  nutritionHabits?: NutritionHabit[]
  nutritionCompletions?: NutritionCompletion[]
  recipes?: Recipe[]
  notes?: Note[]
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'

export interface AuthResult {
  error: string | null
  message?: string
}
