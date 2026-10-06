import { useEffect, useRef, useState } from 'react'
import { Columns3, Folder, House, LayoutList, Settings, Plus, Search, Sun, Moon, CircleCheck, Sparkles, Cloud, HardDrive, X, Trash2, Check, NotebookText, Bell } from 'lucide-react'
import { useWorkspace } from './hooks/useWorkspace'
import { useDebriefs } from './hooks/useDebriefs'
import type { Birthday, Column, Task, Project, ProjectTask, Workspace, Workout, NutritionHabit, Recipe, Note, NoteLinkKind } from './lib/types'
import { newId, isTaskDone } from './lib/helpers'
import { mergeRecordChanges } from './lib/workspaceMerge'
import { isWorkspace } from './lib/workspaceValidation'
import { Board } from './components/Board'
import { TaskEditor } from './components/TaskEditor'
import { Projects, ProjectDetail, ProjectEditor, ProjectTaskEditor } from './components/Projects'
import { Profile, type ThemePreference } from './components/Profile'
import { Modal } from './components/Modal'
import { Birthdays, type BirthdayOrderGroup } from './components/Birthdays'
import { DebriefNotice } from './components/Summary'
import { Home } from './components/Home'
import { Others } from './components/Others'
import { useLocalDay } from './hooks/useLocalDay'
import { unreadBirthdayNotifications } from './lib/birthdays'
import { nutritionCompletionId } from './lib/others'

type Page = 'home' | 'planner' | 'projects' | 'others'
type OtherEntry = Workout | NutritionHabit | Recipe | Note
type OtherCollection = 'workouts' | 'nutritionHabits' | 'recipes' | 'notes'
type Editor = { type: 'task'; task?: Task; columnId?: string }
  | { type: 'project-task'; task?: ProjectTask; projectId: string; focusSubtaskId?: string }
  | { type: 'project'; project?: Project } | { type: 'project-detail'; projectId: string }
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
  const debriefs = useDebriefs(data.user?.id ?? null, !data.loading)
  const today = useLocalDay()
  const [othersSection, setOthersSection] = useState<'workouts' | 'nutrition' | 'recipes' | 'notes' | null>(null)
  const [othersVisit, setOthersVisit] = useState(0)
  const [noteTarget, setNoteTarget] = useState<{ kind: NoteLinkKind; id: string } | null>(null)
  const [noteReturn, setNoteReturn] = useState<string | null>(null)
  const [initialNoteId, setInitialNoteId] = useState<string | undefined>()
  const [page, setPage] = useState<Page>('home')
  const [summaryInitialId, setSummaryInitialId] = useState<string | undefined>()
  const [summaryVisit, setSummaryVisit] = useState(0)
  const [editor, setEditor] = useState<Editor>(null)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const creationSnapshots = useRef({ tasks: new Map<string, Task>(), columns: new Map<string, Column>(), projects: new Map<string, Project>(), birthdays: new Map<string, Birthday>(), initialTasks: new Map<string, ProjectTask>(), projectTasks: new Map<string, ProjectTask>(), otherEntries: new Map<string, OtherEntry>() })
  useEffect(() => { for (const records of Object.values(creationSnapshots.current)) records.clear() }, [editor, page, othersVisit])
  const [theme, setTheme] = useState<ThemePreference>(() => {
    try { const saved = localStorage.getItem('forma-theme'); return saved === 'light' || saved === 'dark' ? saved : 'system' } catch { return 'system' }
  })
  const [resolvedTheme, setResolvedTheme] = useState('light')
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? media.matches ? 'dark' : 'light' : theme
      document.documentElement.dataset.theme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#191919' : '#f6f6f6')
      setResolvedTheme(resolved)
    }
    apply()
    try { localStorage.setItem('forma-theme', theme) } catch { /* Settings remain active for this visit. */ }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { setEditor(null); setQuery(''); setSummaryInitialId(undefined); setSummaryVisit(value => value + 1); setOthersSection(null); setOthersVisit(value => value + 1); setNoteTarget(null); setNoteReturn(null); setInitialNoteId(undefined); setPage('home'); setActionError(null) }, [data.user?.id])
  const done = workspace.tasks.filter(task => isTaskDone(task, workspace)).length
  useEffect(() => {
    if (data.loading || workspace.columns.some(column => column.id === 'finalized')) return
    data.setWorkspace(current => current.columns.some(column => column.id === 'finalized') ? current : { ...current, columns: [...current.columns, { id: 'finalized', title: 'Finalized', color: 'green' }] })
  }, [data.loading, data.setWorkspace, workspace.columns])
  const ongoing = workspace.tasks.filter(task => task.columnId === 'doing').length
  const active = workspace.tasks.length - done
  const visibleTasks = workspace.tasks.filter(task => (!query.trim() || `${task.title} ${task.description} ${task.labels.join(' ')}`.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv'))))
  const project = editor?.type === 'project-detail' ? workspace.projects.find(project => project.id === editor.projectId) : undefined
  const birthdayUnread = unreadBirthdayNotifications(workspace)
  const unreadCount = birthdayUnread.length + debriefs.unread.length
  const statusText = { local: 'Sparas på enheten', synced: 'Allt är synkat', syncing: 'Synkar…', offline: 'Offline · sparat lokalt', error: 'Sparandet behöver hjälp', conflict: 'Välj version' }[data.syncStatus]
  function switchPage(next: Page) {
    setPage(next); setEditor(null); setNoteTarget(null); setNoteReturn(null); setInitialNoteId(undefined)
    if (next === 'others') { setOthersSection(null); setOthersVisit(value => value + 1) }
    if (next === 'home') { setSummaryInitialId(undefined); setSummaryVisit(value => value + 1) }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function openDebrief(id?: string) {
    setPage('home'); setEditor(null); setSummaryInitialId(id); setSummaryVisit(value => value + 1)
    if (id) debriefs.markRead(id)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function openOthers(section: 'workouts' | 'nutrition' | 'recipes' | 'notes' | null = null) {
    setPage('others'); setEditor(null); setNoteTarget(null); setInitialNoteId(undefined); setOthersSection(section); setOthersVisit(value => value + 1)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function openBirthdays() {
    setEditor({ type: 'birthdays' })
  }
  function openNotifications() {
    if (!birthdayUnread.length && debriefs.unread.length) openDebrief(debriefs.unread[0].id)
    else switchPage('home')
  }
  function closeTask() {
    if (editor?.type === 'project-task') setEditor({ type: 'project-detail', projectId: editor.projectId })
    else setEditor(null)
  }
  function persistChange(update: (current: Workspace) => Workspace, message?: string, after?: () => void, onApplied?: (next: Workspace) => void): string | null {
    try {
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
    }, 'Projektet är sparat', () => setEditor({ type: 'project-detail', projectId: project.id }), next => {
      if (!original) creationSnapshots.current.projects.set(project.id, structuredClone(next.projects.find(existing => existing.id === project.id)!))
      if (!originalTask && initialTask) creationSnapshots.current.initialTasks.set(project.id, structuredClone(next.projects.find(existing => existing.id === project.id)!.tasks!.find(task => task.id === initialTask.id)!))
      if (!initialTask) creationSnapshots.current.initialTasks.delete(project.id)
    })
  }
  function saveOther(kind: OtherCollection, entry: OtherEntry, base?: OtherEntry, quiet = false): string | null {
    const key = `${kind}:${entry.id}`
    const original = base ?? creationSnapshots.current.otherEntries.get(key)
    return persistChange(current => {
      const entries: OtherEntry[] = current[kind] ?? []
      const latest = entries.find(existing => existing.id === entry.id)
      if (original && !latest) throw new Error('Posten har tagits bort i en annan flik. Stäng redigeringen för att fortsätta.')
      const merged = original && latest ? mergeRecordChanges(original, entry, latest) : entry
      return { ...current, [kind]: latest ? entries.map(existing => existing.id === entry.id ? merged : existing) : [...entries, merged] }
    }, quiet ? undefined : 'Sparat', undefined, next => {
      if (!original) creationSnapshots.current.otherEntries.set(key, structuredClone(next[kind]!.find(existing => existing.id === entry.id)!))
    })
  }
  function deleteOther(kind: OtherCollection, id: string): string | null {
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
    else if (kind === 'project') { setPage('projects'); setEditor({ type: 'project-detail', projectId: id }) }
    else if (kind === 'birthday') setEditor({ type: 'birthdays' })
    else {
      openOthers(kind === 'workout' ? 'workouts' : kind === 'recipe' ? 'recipes' : 'nutrition')
      setNoteTarget({ kind, id })
    }
    setNoteReturn(kind === 'birthday' ? null : noteId ?? null)
    window.scrollTo({ top: 0, behavior: 'instant' })
    return null
  }
  function returnToNote() {
    const id = noteReturn
    openOthers('notes'); setInitialNoteId(id ?? undefined); setNoteReturn(null)
  }
  function exportWorkspace() {
    const blob = new Blob([JSON.stringify({ ...workspace, debriefs: debriefs.debriefs }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `forma-${today}.json`; link.click(); URL.revokeObjectURL(url)
    setToast('Din säkerhetskopia är nedladdad')
  }
  return <>
    <div className="app-shell" aria-busy={data.loading}>
      <header className="topbar"><div className="topbar-left"><button className="brand" onClick={() => switchPage('home')} aria-label="Forma — till Home"><span className="brand-mark"><i /><i /><i /><i /></span>forma<span className="brand-period">.</span></button></div><div className="topbar-right"><span className="sr-only" role="status" data-sync-status={data.syncStatus}>{statusText}</span><button className="icon-button debrief-bell" aria-label="Öppna notiser" aria-describedby="notification-unread-count" disabled={data.loading} onClick={openNotifications}><Bell size={18} />{unreadCount > 0 && <span className="debrief-bell-dot" aria-hidden="true" />}</button><span id="notification-unread-count" className="sr-only" role="status">{unreadCount ? `${unreadCount} nya notiser` : 'Inga nya notiser'}</span><button className="icon-button settings-button" aria-label="Öppna inställningar" onClick={() => setEditor({ type: 'profile' })}><Settings size={19} /></button></div></header>
      {data.loading && <div className="loading-notice" role="status">Laddar Forma…</div>}
      <main className="main-content" inert={data.loading}>
        {noteReturn && <button className="button ghost note-return-link" onClick={returnToNote}>Till anteckningen</button>}
        <div className="page-heading"><h1>{({ home: 'Home', planner: 'Planner', projects: 'Projects', others: 'Others' })[page]}</h1>{(page === 'planner' || page === 'projects') && <div className="page-actions"><button className="button primary" aria-label={page === 'planner' ? 'Ny uppgift' : 'Nytt projekt'} onClick={() => setEditor(page === 'planner' ? { type: 'task' } : { type: 'project' })}><Plus size={18} /><span>{page === 'planner' ? 'Ny uppgift' : 'Nytt projekt'}</span></button></div>}</div>
        {actionError && actionError !== data.syncError && <div className="sync-banner" role="alert"><HardDrive size={18} /><p>{actionError}</p><button className="icon-button" aria-label="Stäng meddelande" onClick={() => setActionError(null)}><X size={18} /></button></div>}
        {data.syncError && <div className="sync-banner" role="status">{data.user ? <Cloud size={18} /> : <HardDrive size={18} />}<p>{data.syncError}</p>{data.syncStatus === 'conflict' ? <><button className="button secondary small" onClick={() => data.resolveConflict('remote')}>Behåll molnets</button><button className="button primary small" onClick={() => data.resolveConflict('local')}>Behåll min</button></> : <button className="button secondary small" onClick={data.retrySync}>Försök igen</button>}</div>}
        {page === 'home' && <Home key={summaryVisit} workspace={workspace} today={today} reports={debriefs} initialId={summaryInitialId} localOnly={!data.user} onBirthdays={openBirthdays} onNutrition={() => openOthers('nutrition')} onToggleHabit={toggleHabit} onReadNotification={id => updateNotification(id, 'read')} onDismissNotification={id => updateNotification(id, 'dismiss')} />}
        {page === 'planner' && <>
          {debriefs.error && <div className="sync-banner" role="status"><NotebookText size={18} /><p>{debriefs.error}</p><button className="button secondary small" onClick={debriefs.retry}>Försök igen</button></div>}
          {debriefs.unread[0] && <DebriefNotice debrief={debriefs.unread[0]} onRead={() => openDebrief(debriefs.unread[0].id)} onDismiss={() => debriefs.dismiss(debriefs.unread[0].id)} />}
          <div className="summary-grid"><div className="summary-card feature"><span className="stat-icon"><Sparkles size={19} /></span><div><p className="stat-label">Pågår</p><p className="stat-value">{ongoing}</p></div></div><div className="summary-card"><span className="stat-icon"><Columns3 size={19} /></span><div><p className="stat-label">Aktiva</p><p className="stat-value">{active}</p></div></div><div className="summary-card"><span className="stat-icon"><CircleCheck size={19} /></span><div><p className="stat-label">Klara</p><p className="stat-value">{done}</p></div></div></div>
          <div className="workspace-toolbar"><div className="toolbar-left"><span className="view-label"><Columns3 size={15} />Min tavla</span></div><div className="toolbar-right"><label className="search-field"><Search size={16} /><input type="search" aria-label="Sök uppgifter" placeholder="Sök uppgifter" value={query} onChange={event => setQuery(event.target.value)} /></label></div></div>
          {query && <p className="filter-caption">{visibleTasks.length} uppgifter visas<button className="button ghost small" onClick={() => { setQuery('') }}>Rensa filter<X size={13} /></button></p>}
          <Board workspace={workspace} tasks={visibleTasks} onOpen={task => setEditor({ type: 'task', task })} onAdd={columnId => setEditor({ type: 'task', columnId })} onAddColumn={() => setEditor({ type: 'column' })} onEditColumn={column => setEditor({ type: 'column', column })} onMove={moveTask} onToggleHide={columnId => persistChange(current => ({ ...current, columns: current.columns.map(column => column.id === columnId ? { ...column, collapsed: !column.collapsed } : column) }))} />
        </>}
        {page === 'projects' && <Projects workspace={workspace} onOpen={project => setEditor({ type: 'project-detail', projectId: project.id })} onAdd={() => setEditor({ type: 'project' })} />}
        {page === 'others' && <Others key={othersVisit} workspace={workspace} initialSection={othersSection} initialRecord={noteTarget} initialNoteId={initialNoteId} onBirthdays={openBirthdays} onSaveWorkout={(entry, base) => saveOther('workouts', entry, base)} onDeleteWorkout={id => deleteOther('workouts', id)} onSaveHabit={(entry, base) => saveOther('nutritionHabits', entry, base)} onToggleHabit={toggleHabit} onDeleteHabit={id => deleteOther('nutritionHabits', id)} onSaveRecipe={(entry, base) => saveOther('recipes', entry, base)} onDeleteRecipe={id => deleteOther('recipes', id)} onSaveNote={(entry, base) => saveOther('notes', entry, base, true)} onDeleteNote={id => deleteOther('notes', id)} onRestoreNote={note => persistChange(current => ({ ...current, notes: [...(current.notes ?? []).filter(entry => entry.id !== note.id), note] }), 'Anteckningen är återställd')} onOpenNoteLink={openNoteLink} />}
      </main>
      <nav className="bottom-nav" aria-label="Huvudnavigation">{([{ id: 'home', label: 'Home', Icon: House }, { id: 'planner', label: 'Planner', Icon: Columns3 }, { id: 'projects', label: 'Projects', Icon: Folder }, { id: 'others', label: 'Others', Icon: LayoutList }] as const).map(({ id, label, Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-label={label} aria-current={page === id ? 'page' : undefined} onClick={() => switchPage(id)}><Icon className="nav-icon" size={18} /><span className="nav-label">{label}</span>{id === 'home' && unreadCount > 0 && <span className="nav-unread" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>)}</nav>
    </div>
    {editor?.type === 'profile' && <Modal title="Inställningar" onClose={() => setEditor(null)} footer={<button className="button secondary" onClick={() => setEditor(null)}>Stäng</button>}><div className="settings-content"><Profile data={data} theme={theme} onTheme={setTheme} onExport={exportWorkspace} syncText={statusText} /></div></Modal>}
    {editor?.type === 'birthdays' && <Birthdays birthdays={workspace.birthdays ?? []} onClose={() => setEditor(null)} onSave={saveBirthday} onReorder={reorderBirthdays} onDelete={id => persistChange(current => ({ ...current, birthdays: (current.birthdays ?? []).filter(person => person.id !== id), birthdayNotifications: (current.birthdayNotifications ?? []).filter(note => note.birthdayId !== id) }), 'Födelsedagen är borttagen. Uppgifterna finns kvar.')} />}
    {editor?.type === 'task' && <TaskEditor key={editor.task?.id ?? 'new-task'} task={editor.task} columnId={editor.columnId} workspace={workspace} onClose={closeTask} onSave={saveTask} onDelete={id => persistChange(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) }), 'Uppgiften är borttagen', closeTask)} />}
    {editor?.type === 'project-task' && <ProjectTaskEditor key={editor.task?.id ?? 'new-project-task'} task={editor.task} focusSubtaskId={editor.focusSubtaskId} onClose={closeTask} onSave={saveProjectTask} onDelete={id => persistChange(current => {
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
    {project && <ProjectDetail project={project} workspace={workspace} onClose={() => setEditor(null)} onEdit={() => setEditor({ type: 'project', project })} onAddTask={() => setEditor({ type: 'project-task', projectId: project.id })} onOpenTask={(task, focusSubtaskId) => setEditor({ type: 'project-task', task, projectId: project.id, focusSubtaskId })} onToggleSubtask={(taskId, itemId) => persistChange(current => {
      const task = current.projects.find(existing => existing.id === project.id)?.tasks?.find(task => task.id === taskId)
      if (!task?.checklist.some(item => item.id === itemId)) throw new Error('Deluppgiften har tagits bort i en annan flik.')
      return { ...current, projects: current.projects.map(existing => existing.id === project.id ? { ...existing, tasks: existing.tasks?.map(task => task.id === taskId ? { ...task, checklist: task.checklist.map(item => item.id === itemId ? { ...item, completed: !item.completed } : item) } : task) } : existing) }
    })} onDelete={() => persistChange(current => ({ ...current, projects: current.projects.filter(existing => existing.id !== project.id) }), 'Projektet är borttaget.', () => { setEditor(null) })} /> }
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </>
}
