export interface Column {
  id: string
  title: string
  color: string
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

export interface Task {
  id: string
  title: string
  description: string
  columnId: string
  labels: string[]
  checklist: ChecklistItem[]
  deadline: string | null
  comments: Comment[]
  projectId: string | null
  createdAt: string
}

export interface Project {
  id: string
  title: string
  description: string
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
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'

export interface AuthResult {
  error: string | null
  message?: string
}
