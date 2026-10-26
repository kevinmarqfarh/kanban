import { filterPlannerTasks, type PlannerFilter } from './lib/plannerFilters'
import { doneColumnId, isTaskDone, newId } from './lib/helpers'
import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Columns3, Folder, House, LayoutList, Settings, Plus, Search, Sun, Moon, CircleCheck, Sparkles, Cloud, HardDrive, X, Trash2, Check, NotebookText, Bell, ChevronRight } from 'lucide-react'
import { organizeCuisineCookbooks } from './lib/cookbooks'
import { useWorkspace } from './hooks/useWorkspace'
import type { Birthday, Column, Task, Project, ProjectTask, Workspace, Cookbook, OvertimeEntry, Workout, NutritionHabit, Recipe, Note, NoteLinkKind } from './lib/types'
import { mergeRecordChanges } from './lib/workspaceMerge'
import { isWorkspace } from './lib/workspaceValidation'
import { DaySchedule } from './components/DaySchedule'
import { WeekPlanner } from './components/WeekPlanner'
import { ScheduleEditor, type ScheduleDraft } from './components/ScheduleEditor'
import { useDesktopLayout } from './hooks/useDesktopLayout'
import { validSchedule } from './lib/schedule'
import type { TaskSchedule } from './lib/types'
import { Board } from './components/Board'
import { TaskEditor } from './components/TaskEditor'
import { Projects, ProjectDetail, ProjectEditor, ProjectTaskEditor } from './components/Projects'
import { Profile, type ThemePreference } from './components/Profile'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { Modal } from './components/Modal'
import { Birthdays, type BirthdayOrderGroup } from './components/Birthdays'
import { Home } from './components/Home'
import { Others } from './components/Others'
import { useLocalDay } from './hooks/useLocalDay'
import { HOME_SCREEN_REFRESH_MS, IDLE_RETURN_MS, useHomeScreen } from './hooks/useHomeScreen'
import { useSunTheme } from './hooks/useSunTheme'
import { UNDO_MS, restoreRemoved } from './lib/undo'
import { unreadBirthdayNotifications } from './lib/birthdays'
import { nutritionCompletionId } from './lib/others'
import { intakeColumn, type GiftTaskDraft } from './lib/briefing'
import { availableRecipes, isCatalogRecipe } from './lib/recipeCatalog'
import { scrollToTop } from './lib/crashReport'

type Page = 'home' | 'schedule' | 'planner' | 'projects' | 'others'
const PAGE_LABELS: Record<Page, string> = { home: 'Home', schedule: 'Schema', planner: 'Planner', projects: 'Projects', others: 'Others' }
type OtherEntry = Cookbook | OvertimeEntry | Workout | NutritionHabit | Recipe | Note
type OtherCollection = 'cookbooks' | 'overtime' | 'workouts' | 'nutritionHabits' | 'recipes' | 'notes'
type Editor = { type: 'task'; task?: Task; columnId?: string }
  | { type: 'project-task'; task?: ProjectTask; projectId: string; focusSubtaskId?: string }
  | { type: 'project'; project?: Project }
  | { type: 'column'; column?: Column } | { type: 'birthdays' } | { type: 'profile' } | null

function ColumnEditor({ column, count, columns, onSave, onDelete, onClose }: {
  column?: Column; count: number; columns: Column[]; onSave: (column: Column) => string | null;
  onDelete?: (moveTo: string | null) => string | null; onClose: () => void;
}) {
  const [title, setTitle] = useState(column?.title ?? '')
  const [id] = useState(() => column?.id ?? newId())
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const targets = columns.filter(item => item.id !== column?.id && item.id !== 'finalized')
  const [moveTo, setMoveTo] = useState(() => targets[0]?.id ?? '')
  const blocked = column?.id === 'finalized' ? 'Finalized är en fast kolumn för avslutade kort och kan inte tas bort.'
    : column && columns.length <= 2 ? 'Tavlan behöver minst två kolumner.' : null
  return <Modal title={column ? 'Redigera kolumn' : 'Ny kolumn'} error={error} onClose={onClose} footer={<>
    {column && onDelete && !confirming && <button className="button secondary danger column-delete" type="button" onClick={() => { setConfirming(true); setError(null) }}><Trash2 size={16} />Ta bort kolumn</button>}
    <button className="button secondary" type="button" onClick={onClose}>Avbryt</button><button className="button primary" type="submit" form="column-form"><Check size={16} />{column ? 'Spara kolumn' : 'Lägg till kolumn'}</button>
  </>}><form id="column-form" onSubmit={event => { event.preventDefault(); if (title.trim()) setError(onSave({ ...column, id, title: title.trim(), color: column?.color ?? 'gray' })) }}>
    <label className="field">Kolumnnamn<input className="input" autoFocus required maxLength={40} value={title} onChange={event => setTitle(event.target.value)} placeholder="T.ex. På vänt" /></label>
    {column && blocked && <p className="field-help">{blocked}</p>}
    {column && onDelete && confirming && <div className="form-message delete-confirm column-delete-confirm" role="group" aria-label="Ta bort kolumnen">
      <p>{count ? `Kolumnen har ${count} ${count === 1 ? 'kort' : 'kort'}. Välj vart de ska flyttas innan kolumnen tas bort.` : `Ta bort kolumnen ${column.title}?`}</p>
      {count > 0 && <label className="field">Flytta korten till<select className="select" value={moveTo} onChange={event => setMoveTo(event.target.value)}>{targets.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      <div className="column-delete-actions"><button className="button secondary" type="button" onClick={() => setConfirming(false)}>Behåll</button><button className="button primary danger" type="button" onClick={() => setError(onDelete(count ? moveTo : null))}>{count ? 'Flytta och ta bort' : 'Ta bort'}</button></div>
    </div>}
  </form></Modal>
}

export default function App() {
  const data = useWorkspace()
  const { workspace, setWorkspace } = data
  const today = useLocalDay()
  const homeScreen = useHomeScreen()
  const desktop = useDesktopLayout() && !homeScreen.active
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null)
  const [plannerView, setPlannerView] = useState<'board' | 'week'>(() => {
    try { return localStorage.getItem('forma-planner-view') === 'week' ? 'week' : 'board' } catch { return 'board' }
  })
  function changePlannerView(view: 'board' | 'week') {
    setPlannerView(view)
    try { localStorage.setItem('forma-planner-view', view) } catch { /* Applies for this visit. */ }
  }
  const weekView = desktop && plannerView === 'week'
  const [othersSection, setOthersSection] = useState<'workouts' | 'nutrition' | 'recipes' | 'notes' | null>(null)
  const [othersVisit, setOthersVisit] = useState(0)
  const [noteTarget, setNoteTarget] = useState<{ kind: NoteLinkKind; id: string } | null>(null)
  const [noteReturn, setNoteReturn] = useState<string | null>(null)
  const [initialNoteId, setInitialNoteId] = useState<string | undefined>()
  const [page, setPage] = useState<Page>('home')
  const [homeVisit, setHomeVisit] = useState(0)
  const [editor, setEditor] = useState<Editor>(null)
  // An open project is a page of its own (with Back), not a dialog, so task editors can sit on top of it.
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [focusSearch, setFocusSearch] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  useEffect(() => {
    if (page === 'planner' && focusSearch && !data.loading) { searchRef.current?.focus(); setFocusSearch(false) }
  }, [page, focusSearch, data.loading])
  useEffect(() => {
    if (!desktop || data.loading) return
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open], .home-layout-editing') || document.documentElement.classList.contains('note-focus-open')) return
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); setEditor({ type: 'task' }) }
      if (event.key === '/') { event.preventDefault(); if (page !== 'planner') switchPage('planner'); setFocusSearch(true) }
      if (event.key === '?') { event.preventDefault(); setShowShortcuts(true) }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [desktop, data.loading, page])
  const [plannerFilter, setPlannerFilter] = useState<PlannerFilter>('all')
  const [statusUndo, setStatusUndo] = useState<{ id: string; projectId?: string; before: string | boolean; after: string | boolean } | null>(null)
  useEffect(() => { if (!statusUndo) return; const timer = setTimeout(() => setStatusUndo(null), UNDO_MS); return () => clearTimeout(timer) }, [statusUndo])
  const [toast, setToast] = useState('')
  // Deleting is immediate; a toast offers Ångra for a few seconds instead of asking first.
  const [undo, setUndo] = useState<{ text: string; before: Workspace; after: Workspace } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const creationSnapshots = useRef({ tasks: new Map<string, Task>(), columns: new Map<string, Column>(), projects: new Map<string, Project>(), birthdays: new Map<string, Birthday>(), initialTasks: new Map<string, ProjectTask>(), projectTasks: new Map<string, ProjectTask>(), otherEntries: new Map<string, OtherEntry>() })
  useEffect(() => { for (const records of Object.values(creationSnapshots.current)) records.clear() }, [editor, page, othersVisit])
  const [theme, setTheme] = useState<ThemePreference>(() => {
    try { const saved = localStorage.getItem('forma-theme'); return saved === 'light' || saved === 'dark' || saved === 'bento' || saved === 'bento-aurora' || saved === 'bento-space-gray' ? saved : 'system' } catch { return 'system' }
  })
  const [resolvedTheme, setResolvedTheme] = useState('light')
  // On the docked home screen, System means: follow the sun (dark after sunset).
  const sunTheme = useSunTheme(homeScreen.active && theme === 'system')
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? sunTheme ?? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved === 'bento-aurora' || resolved === 'bento-space-gray' ? 'bento' : resolved
      document.documentElement.dataset.bentoVariant = resolved === 'bento-aurora' ? 'aurora' : resolved === 'bento-space-gray' ? 'space-gray' : ''
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'bento-space-gray' ? '#303238' : resolved === 'bento-aurora' ? '#142a34' : resolved === 'bento' ? '#7c9eac' : resolved === 'dark' ? '#191919' : '#f6f6f6')
      setResolvedTheme(resolved)
    }
    apply()
    try { localStorage.setItem('forma-theme', theme) } catch { /* Settings remain active for this visit. */ }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, sunTheme])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), UNDO_MS); return () => clearTimeout(timer) }, [undo])
  useEffect(() => { setEditor(null); setScheduleDraft(null); setQuery(''); setHomeVisit(value => value + 1); setOthersSection(null); setOthersVisit(value => value + 1); setNoteTarget(null); setNoteReturn(null); setInitialNoteId(undefined); setPage('home'); setOpenProjectId(null); setActionError(null) }, [data.user?.id])
  const done = workspace.tasks.filter(task => isTaskDone(task, workspace)).length
  useEffect(() => {
    if (data.loading || workspace.columns.some(column => column.id === 'finalized')) return
    data.setWorkspace(current => current.columns.some(column => column.id === 'finalized') ? current : { ...current, columns: [...current.columns, { id: 'finalized', title: 'Finalized', color: 'green' }] })
  }, [data.loading, data.setWorkspace, workspace.columns])
  const ongoing = workspace.tasks.filter(task => task.columnId === 'doing').length
  const active = workspace.tasks.length - done
  const visibleTasks = filterPlannerTasks(workspace, query, plannerFilter, today)
  const project = page === 'projects' && openProjectId ? workspace.projects.find(project => project.id === openProjectId) : undefined
  const birthdayUnread = unreadBirthdayNotifications(workspace)
  const unreadCount = birthdayUnread.length
  const statusText = { local: 'Sparas på enheten', synced: 'Allt är synkat', syncing: 'Synkar…', offline: 'Offline · sparat lokalt', error: 'Sparandet behöver hjälp', conflict: 'Välj version' }[data.syncStatus]
  // Docked tablet: drift back to Home after a few untouched minutes, but never close an open form.
  const pageRef = useRef(page); pageRef.current = page
  const editorRef = useRef(editor); editorRef.current = editor
  useEffect(() => {
    if (!homeScreen.active) return
    let timer = 0
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (pageRef.current !== 'home' && !editorRef.current && !document.querySelector('dialog[open]')) { setPage('home'); setHomeVisit(value => value + 1); scrollToTop() }
        else arm()
      }, IDLE_RETURN_MS)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    for (const name of events) window.addEventListener(name, arm, { passive: true })
    arm()
    return () => { window.clearTimeout(timer); for (const name of events) window.removeEventListener(name, arm) }
  }, [homeScreen.active])
  // Docked tablet: pull changes from other devices (a phone ticking off supplements) every minute.
  const retrySyncRef = useRef(data.retrySync); retrySyncRef.current = data.retrySync
  const syncStatusRef = useRef(data.syncStatus); syncStatusRef.current = data.syncStatus
  useEffect(() => {
    if (!homeScreen.active || !data.user) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine && syncStatusRef.current !== 'syncing' && syncStatusRef.current !== 'conflict') retrySyncRef.current()
    }, HOME_SCREEN_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [homeScreen.active, data.user])
  function openProject(id: string) {
    setOpenProjectId(id)
    // Browser Back and Safari's swipe-back return to the project list.
    try { if (window.history.state?.formaProject !== id) window.history.pushState({ ...(window.history.state ?? {}), formaProject: id }, '') } catch { /* Navigation still works with the Back button. */ }
  }
  function closeProject() {
    const id = openProjectId
    setOpenProjectId(null)
    try { if (window.history.state?.formaProject) window.history.back() } catch { /* Already closed above. */ }
    window.setTimeout(() => document.querySelector<HTMLElement>(`.project-card[data-project-id="${id}"]`)?.focus({ preventScroll: false }), 0)
  }
  useEffect(() => {
    const popped = (event: PopStateEvent) => { if (!event.state?.formaProject) setOpenProjectId(null); else setOpenProjectId(event.state.formaProject) }
    window.addEventListener('popstate', popped)
    return () => window.removeEventListener('popstate', popped)
  }, [])
  // A project deleted on another device or tab closes its page instead of leaving it blank.
  useEffect(() => { if (openProjectId && !data.loading && !workspace.projects.some(item => item.id === openProjectId)) setOpenProjectId(null) }, [openProjectId, workspace.projects, data.loading])
  function switchPage(next: Page) {
    setPage(next); setEditor(null); setOpenProjectId(null); setNoteTarget(null); setNoteReturn(null); setInitialNoteId(undefined)
    if (next === 'others') { setOthersSection(null); setOthersVisit(value => value + 1) }
    if (next === 'home') { setHomeVisit(value => value + 1) }
    scrollToTop()
  }
  function openOthers(section: 'workouts' | 'nutrition' | 'recipes' | 'notes' | null = null) {
    setPage('others'); setEditor(null); setNoteTarget(null); setInitialNoteId(undefined); setOthersSection(section); setOthersVisit(value => value + 1)
    scrollToTop()
  }
  function openBirthdays() {
    setEditor({ type: 'birthdays' })
  }
  function openNotifications() {
    switchPage('home')
  }
  function openTaskFromHome(taskId: string) {
    const task = workspace.tasks.find(item => item.id === taskId)
    if (!task) { setActionError('Uppgiften har tagits bort.'); return }
    setPage('planner'); setEditor({ type: 'task', task })
    scrollToTop()
  }
  function createGiftTask(draft: GiftTaskDraft): string | null {
    return persistChange(current => {
      if (current.tasks.some(task => task.id === draft.id)) return current
      const column = intakeColumn(current)
      if (!column) throw new Error('Planner saknar en kolumn för nya uppgifter.')
      const task: Task = { id: draft.id, title: draft.title, description: draft.description, columnId: column.id, labels: ['Födelsedag'], checklist: [], deadline: draft.deadline, deadlineTime: null, priority: 'medium', comments: [], projectId: null, createdAt: new Date().toISOString() }
      return { ...current, tasks: [...current.tasks, task] }
    })
  }
  function quickAddTask(title: string, deadline: string | null, deadlineTime: string | null): string | null {
    return persistChange(current => {
      const column = intakeColumn(current)
      if (!column) throw new Error('Planner saknar en kolumn för nya uppgifter.')
      const task: Task = { id: newId(), title, description: '', columnId: column.id, labels: [], checklist: [], deadline, deadlineTime: deadline ? deadlineTime : null, comments: [], projectId: null, createdAt: new Date().toISOString() }
      return { ...current, tasks: [...current.tasks, task] }
    })
  }
  function planTask(title: string, schedule: TaskSchedule | null, taskId?: string): string | null {
    return persistChange(current => {
      if (!validSchedule(schedule)) throw new Error('Kontrollera planeringens datum och tider.')
      if (taskId) {
        const target = current.tasks.find(task => task.id === taskId)
        if (!target || isTaskDone(target, current)) throw new Error('Uppgiften har tagits bort eller är redan klar.')
        return { ...current, tasks: current.tasks.map(task => task.id === taskId ? { ...task, schedule } : task) }
      }
      if (!schedule || !title.trim()) throw new Error('Skriv en titel och ange en planering.')
      if (!current.columns.length) throw new Error('Planner saknar en kolumn för nya uppgifter.')
      const doneId = doneColumnId(current)
      const existingColumn = current.columns.find(column => column.id !== doneId && column.id !== 'finalized' && /^denna veckan?$/i.test(column.title.trim().replace(/\s+/g, ' ')))
      const column: Column = existingColumn ?? { id: newId(), title: 'Denna veckan', color: 'gray' }
      const columns = [...current.columns]
      if (!existingColumn) {
        const index = columns.findIndex(item => item.id === 'doing' || item.id === doneId || item.id === 'finalized')
        columns.splice(index < 0 ? columns.length : index, 0, column)
      }
      const task: Task = { id: newId(), title, schedule, description: '', columnId: column.id, labels: [], checklist: [], deadline: null, comments: [], projectId: null, createdAt: new Date().toISOString() }
      return { ...current, columns, tasks: [...current.tasks, task] }
    })
  }
  function closeTask() {
    if (editor?.type === 'project-task') setEditor(null)
    else setEditor(null)
  }
  function persistChange(update: (current: Workspace) => Workspace, message?: string, after?: () => void, onApplied?: (next: Workspace) => void): string | null {
    try {
      setStatusUndo(null)
      const failure = setWorkspace(current => {
        const next = update(current)
        if (isWorkspace(next)) onApplied?.(next)
        return next
      })
      if (failure) { setToast(''); return failure }
      setActionError(null)
      after?.()
      if (message) setToast(message)
      return null
    } catch (failure) {
      setToast('')
      return failure instanceof Error ? failure.message : 'Ändringen kunde inte sparas. Försök igen.'
    }
  }
  /** Delete now and offer Ångra: the toast puts back exactly what was removed, even after other changes. */
  function removeWithUndo(update: (current: Workspace) => Workspace, text: string, after?: () => void): string | null {
    let before: Workspace | null = null
    let next: Workspace | null = null
    const failure = persistChange(current => { before = current; next = update(current); return next }, undefined, after)
    if (!failure && before && next) { setToast(''); setUndo({ text, before, after: next }) }
    return failure
  }
  function undoRemoval() {
    if (!undo) return
    const { before, after } = undo
    setUndo(null)
    const failure = persistChange(current => restoreRemoved(before, after, current), 'Återställt')
    if (failure) setActionError(failure)
  }
  function saveTask(task: Task): string | null {
    const original = (editor?.type === 'task' ? editor.task : undefined) ?? creationSnapshots.current.tasks.get(task.id)
    return persistChange(current => {
      const latest = current.tasks.find(existing => existing.id === task.id)
      if (original && !latest) throw new Error('Uppgiften har tagits bort i en annan flik. Stäng redigeringen för att fortsätta.')
      const merged = original && latest ? mergeRecordChanges(original, task, latest) : task
      if (!current.columns.some(column => column.id === merged.columnId)) throw new Error('Kolumnen har tagits bort. Välj en annan status.')
      return { ...current, tasks: latest ? current.tasks.map(existing => existing.id === task.id ? merged : existing) : [...current.tasks, merged] }
    }, editor?.type === 'task' && editor.task ? 'Uppgiften är uppdaterad' : 'Uppgiften är skapad', closeTask, next => {
      if (!original) creationSnapshots.current.tasks.set(task.id, structuredClone(next.tasks.find(existing => existing.id === task.id)!))
    })
  }
  function saveProjectTask(task: ProjectTask): string | null {
    if (editor?.type !== 'project-task') return 'Öppna projektuppgiften igen.'
    const projectId = editor.projectId
    const original = editor.task ?? creationSnapshots.current.projectTasks.get(task.id)
    return persistChange(current => {
      const project = current.projects.find(project => project.id === projectId)
      if (!project) throw new Error('Projektet har tagits bort i en annan flik.')
      const tasks = project.tasks ?? []
      const latest = tasks.find(existing => existing.id === task.id)
      if (original && !latest) throw new Error('Uppgiften har tagits bort i en annan flik.')
      const merged = original && latest ? mergeRecordChanges(original, task, latest) : task
      return { ...current, projects: current.projects.map(existing => existing.id === projectId ? { ...existing, tasks: latest ? tasks.map(item => item.id === task.id ? merged : item) : [...tasks, merged] } : existing) }
    }, 'Projektuppgiften är sparad', closeTask, next => {
      if (!original) creationSnapshots.current.projectTasks.set(task.id, structuredClone(next.projects.find(project => project.id === projectId)!.tasks!.find(item => item.id === task.id)!))
    })
  }
  function toggleTaskStatus(task: Task): string | null {
    let applied: { id: string; before: string; after: string } | null = null
    const failure = persistChange(current => {
      const latest = current.tasks.find(entry => entry.id === task.id)
      if (!latest) throw new Error('Uppgiften finns inte längre.')
      const target = isTaskDone(latest, current) ? current.columns.find(column => column.id !== 'done' && column.id !== 'finalized')?.id : doneColumnId(current)
      if (!target || target === latest.columnId) return current
      applied = { id: latest.id, before: latest.columnId, after: target }
      return { ...current, tasks: current.tasks.map(entry => entry.id === task.id ? { ...entry, columnId: target } : entry) }
    })
    if (failure) setActionError(failure)
    else if (applied) { setToast(''); setUndo(null); setStatusUndo(applied) }
    return failure
  }
  function toggleProjectTaskStatus(projectId: string, task: ProjectTask): string | null {
    const failure = persistChange(current => {
      if (!current.projects.find(project => project.id === projectId)?.tasks?.some(entry => entry.id === task.id)) throw new Error('Uppgiften finns inte längre.')
      return { ...current, projects: current.projects.map(project => project.id === projectId ? { ...project, tasks: project.tasks?.map(entry => entry.id === task.id ? { ...entry, completed: !task.completed } : entry) } : project) }
    })
    if (!failure) { setToast(''); setUndo(null); setStatusUndo({ projectId, id: task.id, before: task.completed, after: !task.completed }) }
    return failure
  }
  function undoStatus() {
    if (!statusUndo) return
    const change = statusUndo
    persistChange(current => change.projectId ? { ...current, projects: current.projects.map(project => project.id === change.projectId ? { ...project, tasks: project.tasks?.map(task => task.id === change.id && task.completed === change.after ? { ...task, completed: change.before as boolean } : task) } : project) } : { ...current, tasks: current.tasks.map(task => task.id === change.id && task.columnId === change.after ? { ...task, columnId: change.before as string } : task) }, 'Status återställd')
    setStatusUndo(null)
  }
  function moveTask(taskId: string, columnId: string, beforeId?: string) {
    const existing = workspace.tasks.find(task => task.id === taskId)
    if (!existing || taskId === beforeId) return
    const failure = persistChange(current => {
      const task = current.tasks.find(task => task.id === taskId)
      if (!task) throw new Error('Uppgiften har tagits bort i en annan flik.')
      if (!current.columns.some(column => column.id === columnId)) throw new Error('Kolumnen har tagits bort i en annan flik.')
      const tasks = current.tasks.filter(task => task.id !== taskId)
      const index = beforeId ? tasks.findIndex(task => task.id === beforeId) : -1
      tasks.splice(index >= 0 ? index : tasks.length, 0, { ...task, columnId })
      return { ...current, tasks }
    }, existing.columnId !== columnId ? `Flyttad till ${workspace.columns.find(column => column.id === columnId)?.title}` : undefined)
    if (failure) setActionError(failure)
  }
  function saveBirthday(birthday: Birthday, original?: Birthday): string | null {
    original ??= creationSnapshots.current.birthdays.get(birthday.id)
    return persistChange(current => {
      const latest = current.birthdays?.find(person => person.id === birthday.id)
      if (original && !latest) throw new Error('Födelsedagen har tagits bort i en annan flik. Stäng redigeringen för att fortsätta.')
      const merged = original && latest ? mergeRecordChanges(original, birthday, latest) : birthday
      merged.generatedReminders = [...new Set([...(latest?.generatedReminders ?? []), ...merged.generatedReminders])]
      return { ...current, birthdays: latest ? current.birthdays!.map(person => person.id === birthday.id ? merged : person) : [...(current.birthdays ?? []), merged] }
    }, 'Födelsedagen är sparad', undefined, next => {
      if (!original) creationSnapshots.current.birthdays.set(birthday.id, structuredClone(next.birthdays!.find(person => person.id === birthday.id)!))
    })
  }
  /** Persist the manual order shown in the birthday overview; a group's tag is applied to everyone in it. */
  function reorderBirthdays(groups: BirthdayOrderGroup[], message?: string): string | null {
    return persistChange(current => {
      const people = current.birthdays ?? []
      const byId = new Map(people.map(person => [person.id, person]))
      const placed = new Set<string>()
      const ordered: Birthday[] = []
      for (const group of groups) for (const id of group.ids) {
        const person = byId.get(id)
        if (!person || placed.has(id)) continue // Removed in another tab meanwhile.
        placed.add(id)
        ordered.push((person.tag ?? null) === group.tag ? person : { ...person, tag: group.tag })
      }
      // People added in another tab while dragging keep their place at the end.
      return { ...current, birthdays: [...ordered, ...people.filter(person => !placed.has(person.id))] }
    }, message)
  }
  function saveColumn(column: Column): string | null {
    const original = (editor?.type === 'column' ? editor.column : undefined) ?? creationSnapshots.current.columns.get(column.id)
    return persistChange(current => {
      const latest = current.columns.find(existing => existing.id === column.id)
      if (original && !latest) throw new Error('Kolumnen har tagits bort i en annan flik. Stäng redigeringen för att fortsätta.')
      const merged = original && latest ? mergeRecordChanges(original, column, latest) : column
      if (latest) return { ...current, columns: current.columns.map(existing => existing.id === column.id ? merged : existing) }
      const columns = [...current.columns]
      const doneIndex = columns.findIndex(existing => existing.id === 'done')
      columns.splice(doneIndex < 0 ? columns.length : doneIndex, 0, merged)
      return { ...current, columns }
    }, 'Kolumnen är sparad', () => setEditor(null), next => {
      if (!original) creationSnapshots.current.columns.set(column.id, structuredClone(next.columns.find(existing => existing.id === column.id)!))
    })
  }
  function saveProject(project: Project, initialTask?: ProjectTask): string | null {
    const original = (editor?.type === 'project' ? editor.project : undefined) ?? creationSnapshots.current.projects.get(project.id)
    const originalTask = creationSnapshots.current.initialTasks.get(project.id)
    return persistChange(current => {
      const latest = current.projects.find(existing => existing.id === project.id)
      if (original && !latest) throw new Error('Projektet har tagits bort i en annan flik. Stäng redigeringen för att fortsätta.')
      const merged = original && latest ? mergeRecordChanges(original, project, latest) : project
      const latestTask = initialTask ? latest?.tasks?.find(task => task.id === initialTask.id) : undefined
      if (initialTask && originalTask && !latestTask) throw new Error('Huvuduppgiften har tagits bort i en annan flik. Töm huvuduppgiften för att spara projektet utan den.')
      const mergedTask = initialTask && originalTask && latestTask ? mergeRecordChanges(originalTask, initialTask, latestTask) : initialTask
      const tasks = latest?.tasks ?? []
      const nextProject = { ...merged, tasks: mergedTask ? latestTask ? tasks.map(task => task.id === mergedTask.id ? mergedTask : task) : [...tasks, mergedTask] : originalTask ? tasks.filter(task => task.id !== originalTask.id) : tasks }
      return {
        ...current,
        projects: latest ? current.projects.map(existing => existing.id === project.id ? nextProject : existing) : [...current.projects, nextProject],
      }
    }, 'Projektet är sparat', () => { setEditor(null); openProject(project.id) }, next => {
      if (!original) creationSnapshots.current.projects.set(project.id, structuredClone(next.projects.find(existing => existing.id === project.id)!))
      if (!originalTask && initialTask) creationSnapshots.current.initialTasks.set(project.id, structuredClone(next.projects.find(existing => existing.id === project.id)!.tasks!.find(task => task.id === initialTask.id)!))
      if (!initialTask) creationSnapshots.current.initialTasks.delete(project.id)
    })
  }
  function saveOther(kind: OtherCollection, entry: OtherEntry, base?: OtherEntry, quiet = false, cookbookId?: string): string | null {
    const key = `${kind}:${entry.id}`
    const original = base ?? creationSnapshots.current.otherEntries.get(key)
    return persistChange(current => {
      if (cookbookId && !current.cookbooks?.some(book => book.id === cookbookId)) throw new Error('Kokboken har tagits bort. Öppna kokböcker igen för att fortsätta.')
      const entries: OtherEntry[] = current[kind] ?? []
      const latest = entries.find(existing => existing.id === entry.id)
      const target = kind === 'recipes' && isCatalogRecipe(entry.id)
        ? availableRecipes(current.recipes).find(recipe => recipe.id === entry.id) : latest
      if (original && !target) throw new Error('Posten har tagits bort i en annan flik. Stäng redigeringen för att fortsätta.')
      const merged = original && target ? mergeRecordChanges(original, entry, target) : entry
      return { ...current, [kind]: latest ? entries.map(existing => existing.id === entry.id ? merged : existing) : [...entries, merged],
        ...(cookbookId ? { cookbooks: current.cookbooks!.map(book => book.id === cookbookId ? { ...book, recipeIds: [...new Set([...book.recipeIds, entry.id])] } : book) } : {}),
      }
    }, quiet ? undefined : 'Sparat', undefined, next => {
      if (!original) creationSnapshots.current.otherEntries.set(key, structuredClone(next[kind]!.find(existing => existing.id === entry.id)!))
    })
  }
  function deleteOther(kind: OtherCollection, id: string, undoText?: string): string | null {
    // Kost and Recept offer Ångra here; Träning and Notes have their own Ångra in the list.
    if (undoText) return removeWithUndo(current => ({
      ...current,
      [kind]: current[kind]?.filter(entry => entry.id !== id) ?? [],
      ...(kind === 'nutritionHabits' ? { nutritionCompletions: current.nutritionCompletions?.filter(entry => entry.habitId !== id) ?? [] } : {}),
    }), undoText)
    return persistChange(current => ({
      ...current,
      [kind]: current[kind]?.filter(entry => entry.id !== id) ?? [],
      ...(kind === 'nutritionHabits' ? { nutritionCompletions: current.nutritionCompletions?.filter(entry => entry.habitId !== id) ?? [] } : {}),
    }), 'Borttaget')
  }
  function toggleHabit(habitId: string, date: string): string | null {
    return persistChange(current => {
      if (!current.nutritionHabits?.some(habit => habit.id === habitId)) throw new Error('Vanan har tagits bort i en annan flik.')
      const id = nutritionCompletionId(habitId, date)
      const entries = current.nutritionCompletions ?? []
      const latest = entries.find(entry => entry.id === id)
      const updated = { id, habitId, date, completed: !latest?.completed }
      return { ...current, nutritionCompletions: latest ? entries.map(entry => entry.id === id ? updated : entry) : [...entries, updated] }
    })
  }
  function updateNotification(id: string, action: 'read' | 'dismiss'): string | null {
    return persistChange(current => ({ ...current, birthdayNotifications: (current.birthdayNotifications ?? []).map(note => note.id === id ? { ...note, ...(action === 'read' ? { readAt: note.readAt ?? new Date().toISOString() } : { dismissedAt: note.dismissedAt ?? new Date().toISOString() }) } : note) }))
  }
  function openNoteLink(kind: NoteLinkKind, id: string, noteId?: string): string | null {
    const record = kind === 'task' ? workspace.tasks.find(item => item.id === id)
      : kind === 'project' ? workspace.projects.find(item => item.id === id)
      : kind === 'workout' ? workspace.workouts?.find(item => item.id === id)
      : kind === 'recipe' ? workspace.recipes?.find(item => item.id === id)
      : kind === 'nutrition' ? workspace.nutritionHabits?.find(item => item.id === id)
      : workspace.birthdays?.find(item => item.id === id)
    if (!record) return 'Innehållet har tagits bort. Länktexten finns kvar i anteckningen.'
    if (kind === 'task') { setPage('planner'); setEditor({ type: 'task', task: record as Task }) }
    else if (kind === 'project') { setPage('projects'); setEditor(null); openProject(id) }
    else if (kind === 'birthday') setEditor({ type: 'birthdays' })
    else {
      openOthers(kind === 'workout' ? 'workouts' : kind === 'recipe' ? 'recipes' : 'nutrition')
      setNoteTarget({ kind, id })
    }
    setNoteReturn(kind === 'birthday' ? null : noteId ?? null)
    scrollToTop()
    return null
  }
  function returnToNote() {
    const id = noteReturn
    openOthers('notes'); setInitialNoteId(id ?? undefined); setNoteReturn(null)
  }
  function exportWorkspace() {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `forma-${today}.json`; link.click(); URL.revokeObjectURL(url)
    setToast('Din säkerhetskopia är nedladdad')
  }
  return <>
    <div className={`app-shell${desktop ? ' is-desktop' : ''}${desktop && page === 'planner' ? ' desktop-planner' : ''}${weekView && page === 'planner' ? ' desktop-week' : ''}${desktop && page === 'projects' ? ' desktop-projects' : ''}${homeScreen.active ? ' is-homescreen' : ''}${homeScreen.active && page === 'home' ? ' is-homescreen-home' : ''}`} aria-busy={data.loading}>
      <header className="topbar"><div className="topbar-left"><span className="desktop-context">Min arbetsyta<ChevronRight size={13} /><strong>{PAGE_LABELS[page]}</strong></span><button className="brand" onClick={() => switchPage('home')} aria-label="Forma — till Home"><span className="brand-mark"><i /><i /><i /><i /></span>forma<span className="brand-period">.</span></button></div><div className="topbar-right"><span className="sr-only" role="status" data-sync-status={data.syncStatus}>{statusText}</span><button className="icon-button debrief-bell" aria-label="Öppna notiser" aria-describedby="notification-unread-count" disabled={data.loading} onClick={openNotifications}><Bell size={18} />{unreadCount > 0 && <span className="debrief-bell-dot" aria-hidden="true" />}</button><span id="notification-unread-count" className="sr-only" role="status">{unreadCount ? `${unreadCount} nya notiser` : 'Inga nya notiser'}</span><button className="icon-button settings-button" aria-label="Öppna inställningar" onClick={() => setEditor({ type: 'profile' })}><Settings size={19} /></button></div></header>
      {data.loading && <div className="loading-notice" role="status">Laddar Forma…</div>}
      <main className="main-content" inert={data.loading}>
        {noteReturn && <button className="button ghost note-return-link" onClick={returnToNote}>Till anteckningen</button>}
        {!(homeScreen.active && page === 'home') && !project && <div className="page-heading"><h1>{({ home: 'Home', schedule: 'Schema', planner: 'Planner', projects: 'Projects', others: 'Others' })[page]}</h1>{((page === 'planner' && !weekView) || page === 'projects') && <div className="page-actions"><button className="button primary" aria-label={page === 'planner' ? 'Ny uppgift' : 'Nytt projekt'} onClick={() => setEditor(page === 'planner' ? { type: 'task' } : { type: 'project' })}><Plus size={18} /><span>{page === 'planner' ? 'Ny uppgift' : 'Nytt projekt'}</span></button></div>}{desktop && page === 'schedule' && <div className="page-actions"><button className="button secondary" type="button" onClick={() => { changePlannerView('week'); switchPage('planner') }}><Columns3 size={16} />Visa veckoplanering</button></div>}</div>}
        {actionError && actionError !== data.syncError && <div className="sync-banner" role="alert"><HardDrive size={18} /><p>{actionError}</p><button className="icon-button" aria-label="Stäng meddelande" onClick={() => setActionError(null)}><X size={18} /></button></div>}
        {data.syncError && <div className="sync-banner" role="status">{data.user ? <Cloud size={18} /> : <HardDrive size={18} />}<p>{data.syncError}</p>{data.syncStatus === 'conflict' ? <><button className="button secondary small" onClick={() => data.resolveConflict('remote')}>Behåll molnets</button><button className="button primary small" onClick={() => data.resolveConflict('local')}>Behåll min</button></> : <button className="button secondary small" onClick={data.retrySync}>Försök igen</button>}</div>}
        {page === 'home' && <Home key={homeVisit} workspace={workspace} today={today} localOnly={!data.user} homeScreen={homeScreen.active} syncStatus={data.syncStatus} onQuickAdd={quickAddTask} onBirthdays={openBirthdays} onNutrition={() => openOthers('nutrition')} onOpenTask={openTaskFromHome} onOpenPlanner={() => switchPage('planner')} onOpenSchedule={() => switchPage('schedule')} onCreateGiftTask={createGiftTask} onToggleHabit={toggleHabit} onReadNotification={id => updateNotification(id, 'read')} onDismissNotification={id => updateNotification(id, 'dismiss')} />}
        {page === 'schedule' && <div className="schedule-page"><DaySchedule workspace={workspace} today={today} onSave={planTask} onOpen={id => { const task = workspace.tasks.find(item => item.id === id); if (task) setEditor({ type: 'task', task }); else setActionError('Uppgiften har tagits bort.') }} /><button type="button" className="button ghost small" onClick={() => switchPage('planner')}>Öppna Planner →</button></div>}
        {page === 'planner' && <>
          {!weekView && <div className="summary-grid"><div className="summary-card feature"><span className="stat-icon"><Sparkles size={19} /></span><div><p className="stat-label">Pågår</p><p className="stat-value">{ongoing}</p></div></div><div className="summary-card"><span className="stat-icon"><Columns3 size={19} /></span><div><p className="stat-label">Aktiva</p><p className="stat-value">{active}</p></div></div><div className="summary-card"><span className="stat-icon"><CircleCheck size={19} /></span><div><p className="stat-label">Klara</p><p className="stat-value">{done}</p></div></div></div>}
          <div className="planner-controls"><div className="workspace-toolbar"><div className="toolbar-left">{desktop ? <div className="planner-view-switch" role="group" aria-label="Planeringsvy"><button type="button" aria-pressed={!weekView} onClick={() => changePlannerView('board')}><Columns3 size={15} />Tavla</button><button type="button" aria-pressed={weekView} onClick={() => changePlannerView('week')}>Veckoplanering</button></div> : <span className="view-label"><Columns3 size={15} />Min tavla</span>}</div><div className="toolbar-right"><label className="search-field"><Search size={16} /><input ref={searchRef} type="search" aria-label="Sök uppgifter" placeholder="Sök uppgifter" value={query} onChange={event => setQuery(event.target.value)} /></label></div></div>
          <div className="filter-chips" role="group" aria-label="Filtrera uppgifter">{([['all', 'Alla'], ['today', 'Idag'], ['overdue', 'Försenat'], ['high', 'Hög prioritet']] as const).map(([value, label]) => <button className={`filter-chip${plannerFilter === value ? ' active' : ''}`} type="button" key={value} aria-pressed={plannerFilter === value} onClick={() => setPlannerFilter(value)}>{label}</button>)}</div>
          </div>
          {!weekView && <p className="others-help planner-help">Klart = färdig uppgift. Avslutat = avslutad och undanlagd.</p>}
          {(query || plannerFilter !== 'all') && <p className="filter-caption">{visibleTasks.length} uppgifter visas<button className="button ghost small" onClick={() => { setQuery(''); setPlannerFilter('all') }}>Rensa filter<X size={13} /></button></p>}
          {weekView ? <WeekPlanner onToggleTask={toggleTaskStatus} workspace={workspace} tasks={visibleTasks} today={today} onPlan={(schedule, task) => setScheduleDraft({ schedule: task?.schedule ?? schedule, taskId: task?.id })} onOpen={openTaskFromHome} /> : <Board onToggle={toggleTaskStatus} workspace={workspace} tasks={visibleTasks} onOpen={task => setEditor({ type: 'task', task })} onAdd={columnId => setEditor({ type: 'task', columnId })} onAddColumn={() => setEditor({ type: 'column' })} onEditColumn={column => setEditor({ type: 'column', column })} onMove={moveTask} onToggleHide={columnId => persistChange(current => ({ ...current, columns: current.columns.map(column => column.id === columnId ? { ...column, collapsed: !column.collapsed } : column) }))} />}
        </>}
        {page === 'projects' && (project ? null : <Projects workspace={workspace} onOpen={project => openProject(project.id)} onAdd={() => setEditor({ type: 'project' })} />)}
        {project && <ProjectDetail onToggleTask={task => toggleProjectTaskStatus(project.id, task)} project={project} workspace={workspace} onClose={closeProject} onEdit={() => setEditor({ type: 'project', project })} onAddTask={() => setEditor({ type: 'project-task', projectId: project.id })} onOpenTask={(task, focusSubtaskId) => setEditor({ type: 'project-task', task, projectId: project.id, focusSubtaskId })} onToggleSubtask={(taskId, itemId) => persistChange(current => {
      const task = current.projects.find(existing => existing.id === project.id)?.tasks?.find(task => task.id === taskId)
      if (!task?.checklist.some(item => item.id === itemId)) throw new Error('Deluppgiften har tagits bort i en annan flik.')
      return { ...current, projects: current.projects.map(existing => existing.id === project.id ? { ...existing, tasks: existing.tasks?.map(task => task.id === taskId ? { ...task, checklist: task.checklist.map(item => item.id === itemId ? { ...item, completed: !item.completed } : item) } : task) } : existing) }
    })} onDelete={() => removeWithUndo(current => ({ ...current, projects: current.projects.filter(existing => existing.id !== project.id) }), 'Projektet är borttaget', () => { setEditor(null); closeProject() })} />}
        {page === 'others' && <Others key={othersVisit} recipeTimerScope={data.user?.id ?? 'guest'} workspace={workspace} initialSection={othersSection} initialRecord={noteTarget} initialNoteId={initialNoteId} onBirthdays={openBirthdays} onSaveOvertime={(entry, base) => saveOther('overtime', entry, base)} onDeleteOvertime={id => deleteOther('overtime', id, 'Övertiden är borttagen')} onSaveWorkout={(entry, base) => saveOther('workouts', entry, base)} onDeleteWorkout={id => deleteOther('workouts', id)} onRestoreWorkout={entry => persistChange(current => ({ ...current, workouts: [...(current.workouts ?? []).filter(item => item.id !== entry.id), entry] }), 'Passet är återställt')} onSaveHabit={(entry, base) => saveOther('nutritionHabits', entry, base)} onToggleHabit={toggleHabit} onDeleteHabit={id => deleteOther('nutritionHabits', id, 'Kostvanan är borttagen')} onOrganizeCookbooks={() => persistChange(organizeCuisineCookbooks)} onSaveCookbook={(entry, base) => saveOther('cookbooks', entry, base)} onDeleteCookbook={id => deleteOther('cookbooks', id, 'Kokboken är borttagen')} onSaveRecipe={(entry, base, cookbookId) => saveOther('recipes', entry, base, false, cookbookId)} onDeleteRecipe={id => deleteOther('recipes', id, 'Receptet är borttaget')} onSaveNote={(entry, base) => saveOther('notes', entry, base, true)} onDeleteNote={id => persistChange(current => { const stamp = new Date().toISOString(); return { ...current, notes: (current.notes ?? []).map(note => note.id === id ? { ...note, deletedAt: stamp } : note) } })} onPurgeNote={id => persistChange(current => ({ ...current, notes: (current.notes ?? []).filter(note => note.id !== id) }), 'Anteckningen är raderad')} onEmptyNoteTrash={() => persistChange(current => ({ ...current, notes: (current.notes ?? []).filter(note => !note.deletedAt) }), 'Papperskorgen är tömd')} onRestoreNote={note => persistChange(current => { const existing = current.notes?.find(entry => entry.id === note.id); const { deletedAt: _deleted, ...restored } = existing ?? note; return { ...current, notes: existing ? current.notes!.map(entry => entry.id === note.id ? { ...restored, deletedAt: null } : entry) : [...(current.notes ?? []), { ...restored, deletedAt: null }] } }, 'Anteckningen är återställd')} onOpenNoteLink={openNoteLink} />}
      </main>
      <nav className="bottom-nav" aria-label="Huvudnavigation"><div className="desktop-nav-header"><button className="brand" onClick={() => switchPage('home')} aria-label="Forma — till Home"><span className="brand-mark"><i /><i /><i /><i /></span>forma<span className="brand-period">.</span></button></div>{([{ id: 'home', label: 'Home', Icon: House }, { id: 'planner', label: 'Planner', Icon: Columns3 }, { id: 'schedule', label: 'Schema', Icon: CalendarDays }, { id: 'projects', label: 'Projects', Icon: Folder }, { id: 'others', label: 'Others', Icon: LayoutList }] as const).map(({ id, label, Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-label={label} aria-current={page === id ? 'page' : undefined} onClick={() => switchPage(id)}><Icon className="nav-icon" size={18} /><span className="nav-label">{label}</span>{id === 'home' && unreadCount > 0 && <span className="nav-unread" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>)}</nav>
    </div>
    {showShortcuts && <Modal title="Kortkommandon" focusForm={false} onClose={() => setShowShortcuts(false)} footer={<button className="button secondary" onClick={() => setShowShortcuts(false)}>Stäng</button>}><KeyboardShortcuts /></Modal>}
    {scheduleDraft && <ScheduleEditor initial={scheduleDraft} workspace={workspace} onSave={planTask} onClose={() => setScheduleDraft(null)} />}
    {editor?.type === 'profile' && <Modal title="Inställningar" focusForm={false} onClose={() => setEditor(null)} footer={<button className="button secondary" onClick={() => setEditor(null)}>Stäng</button>}><div className="settings-content"><Profile desktop={desktop} data={data} theme={theme} onTheme={setTheme} onExport={exportWorkspace} syncText={statusText} homeScreen={homeScreen} /></div></Modal>}
    {editor?.type === 'birthdays' && <Birthdays birthdays={workspace.birthdays ?? []} undo={undo ? { text: undo.text, onUndo: undoRemoval } : null} onClose={() => setEditor(null)} onSave={saveBirthday} onReorder={reorderBirthdays} onDelete={id => removeWithUndo(current => ({ ...current, birthdays: (current.birthdays ?? []).filter(person => person.id !== id), birthdayNotifications: (current.birthdayNotifications ?? []).filter(note => note.birthdayId !== id) }), 'Födelsedagen är borttagen')} />}
    {editor?.type === 'task' && <TaskEditor key={editor.task?.id ?? 'new-task'} task={editor.task} columnId={editor.columnId} workspace={workspace} onClose={closeTask} onSave={saveTask} onDelete={id => removeWithUndo(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) }), 'Uppgiften är borttagen', closeTask)} />}
    {editor?.type === 'project-task' && <ProjectTaskEditor key={editor.task?.id ?? 'new-project-task'} task={editor.task} focusSubtaskId={editor.focusSubtaskId} onClose={closeTask} onSave={saveProjectTask} onDelete={id => removeWithUndo(current => {
      if (!current.projects.some(project => project.id === editor.projectId)) throw new Error('Projektet har tagits bort i en annan flik.')
      return { ...current, projects: current.projects.map(project => project.id === editor.projectId ? { ...project, tasks: project.tasks?.filter(task => task.id !== id) } : project) }
    }, 'Projektuppgiften är borttagen', closeTask)} />}
    {editor?.type === 'column' && <ColumnEditor column={editor.column} columns={workspace.columns} count={workspace.tasks.filter(task => task.columnId === editor.column?.id).length} onClose={() => setEditor(null)} onDelete={editor.column && editor.column.id !== 'finalized' && workspace.columns.length > 2 ? moveTo => persistChange(current => {
      const removed = editor.column!.id
      if (current.columns.length <= 2) throw new Error('Tavlan behöver minst två kolumner.')
      const cards = current.tasks.filter(task => task.columnId === removed)
      if (cards.length && (!moveTo || moveTo === removed || !current.columns.some(column => column.id === moveTo))) throw new Error('Välj en kolumn att flytta korten till.')
      return { ...current, columns: current.columns.filter(column => column.id !== removed), tasks: cards.length ? current.tasks.map(task => task.columnId === removed ? { ...task, columnId: moveTo! } : task) : current.tasks }
    }, moveTo ? `Kolumnen är borttagen. Korten flyttades till ${workspace.columns.find(column => column.id === moveTo)?.title}.` : 'Kolumnen är borttagen', () => setEditor(null)) : undefined} onSave={saveColumn} />}
    {editor?.type === 'project' && <ProjectEditor project={editor.project} onClose={() => setEditor(null)} onSave={saveProject} />}
    {statusUndo && <div className="toast toast-undo" role="status"><span>Status ändrad.</span><button className="button ghost small" type="button" onClick={undoStatus}>Ångra</button></div>}
    {undo && editor?.type !== 'birthdays' ? <div className="toast toast-undo" role="status" data-testid="undo-toast"><span>{undo.text}</span><button className="button ghost small" type="button" onClick={undoRemoval}>Ångra</button></div>
      : toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </>
}
