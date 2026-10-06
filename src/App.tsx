import { useEffect, useRef, useState } from 'react'
import { Columns3, Folder, UserRound, Plus, Search, Sun, Moon, CircleCheck, Sparkles, Cloud, HardDrive, X, Trash2, Check, NotebookText, Bell } from 'lucide-react'
import { useWorkspace } from './hooks/useWorkspace'
import { useDebriefs } from './hooks/useDebriefs'
import type { Birthday, Column, Task, Project, Workspace } from './lib/types'
import { newId, isTaskDone } from './lib/helpers'
import { mergeRecordChanges } from './lib/workspaceMerge'
import { isWorkspace } from './lib/workspaceValidation'
import { Board } from './components/Board'
import { TaskEditor } from './components/TaskEditor'
import { Projects, ProjectDetail, ProjectEditor } from './components/Projects'
import { Profile, type ThemePreference } from './components/Profile'
import { Modal } from './components/Modal'
import { Birthdays } from './components/Birthdays'
import { Summary, DebriefNotice } from './components/Summary'

type Page = 'summary' | 'kanban' | 'projects' | 'profile'
type Editor = { type: 'task'; task?: Task; columnId?: string; projectId?: string; backProjectId?: string }
  | { type: 'project'; project?: Project } | { type: 'project-detail'; projectId: string }
  | { type: 'column'; column?: Column } | { type: 'birthdays' } | null

function ColumnEditor({ column, count, onSave, onDelete, onClose }: { column?: Column; count: number; onSave: (column: Column) => string | null; onDelete?: () => string | null; onClose: () => void }) {
  const [title, setTitle] = useState(column?.title ?? '')
  const [id] = useState(() => column?.id ?? newId())
  const [error, setError] = useState<string | null>(null)
  return <Modal title={column ? 'Redigera kolumn' : 'Ny kolumn'} error={error} onClose={onClose} footer={<>
    {onDelete && <button className="icon-button danger" aria-label="Ta bort kolumn" disabled={count > 0} title={count ? 'Flytta uppgifterna först' : 'Ta bort tom kolumn'} onClick={() => setError(onDelete())}><Trash2 size={18} /></button>}
    <button className="button secondary" onClick={onClose}>Avbryt</button><button className="button primary" type="submit" form="column-form"><Check size={16} />{column ? 'Spara kolumn' : 'Lägg till kolumn'}</button>
  </>}><form id="column-form" onSubmit={event => { event.preventDefault(); if (title.trim()) setError(onSave({ id, title: title.trim(), color: column?.color ?? 'gray' })) }}><label className="field">Kolumnnamn<input className="input" autoFocus required maxLength={40} value={title} onChange={event => setTitle(event.target.value)} placeholder="T.ex. På vänt" /></label>{column && count > 0 && <p className="field-help">Flytta kolumnens {count} uppgifter innan du tar bort den.</p>}</form></Modal>
}

export default function App() {
  const data = useWorkspace()
  const { workspace, setWorkspace } = data
  const debriefs = useDebriefs(data.user?.id ?? null, !data.loading)
  const [page, setPage] = useState<Page>('summary')
  const [summaryInitialId, setSummaryInitialId] = useState<string | undefined>()
  const [summaryVisit, setSummaryVisit] = useState(0)
  const [editor, setEditor] = useState<Editor>(null)
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [toast, setToast] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const creationSnapshots = useRef({ tasks: new Map<string, Task>(), columns: new Map<string, Column>(), projects: new Map<string, Project>(), birthdays: new Map<string, Birthday>(), initialTasks: new Map<string, Task>() })
  useEffect(() => { for (const records of Object.values(creationSnapshots.current)) records.clear() }, [editor])
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
  useEffect(() => { setEditor(null); setProjectFilter('all'); setQuery(''); setSummaryInitialId(undefined); setSummaryVisit(value => value + 1) }, [data.user?.id])
  const done = workspace.tasks.filter(task => isTaskDone(task, workspace)).length
  const ongoing = workspace.tasks.filter(task => task.columnId === 'doing').length
  const active = workspace.tasks.length - done
  const visibleTasks = workspace.tasks.filter(task => (projectFilter === 'all' || (projectFilter === 'none' ? !task.projectId : task.projectId === projectFilter)) && (!query.trim() || `${task.title} ${task.description} ${task.labels.join(' ')}`.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv'))))
  const project = editor?.type === 'project-detail' ? workspace.projects.find(project => project.id === editor.projectId) : undefined
  const statusText = { local: 'Sparas på enheten', synced: 'Allt är synkat', syncing: 'Synkar…', offline: 'Offline · sparat lokalt', error: 'Sparandet behöver hjälp', conflict: 'Välj version' }[data.syncStatus]
  function switchPage(next: Page) {
    setPage(next); setEditor(null)
    if (next === 'summary') { setSummaryInitialId(undefined); setSummaryVisit(value => value + 1) }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function openDebrief(id?: string) {
    setPage('summary'); setEditor(null); setSummaryInitialId(id); setSummaryVisit(value => value + 1)
    if (id) debriefs.markRead(id)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function closeTask() {
    if (editor?.type === 'task' && editor.backProjectId) setEditor({ type: 'project-detail', projectId: editor.backProjectId })
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
      if (merged.projectId && !current.projects.some(project => project.id === merged.projectId)) throw new Error('Projektet har tagits bort. Välj ett annat projekt eller Fristående.')
      return { ...current, tasks: latest ? current.tasks.map(existing => existing.id === task.id ? merged : existing) : [...current.tasks, merged] }
    }, editor?.type === 'task' && editor.task ? 'Uppgiften är uppdaterad' : 'Uppgiften är skapad', closeTask, next => {
      if (!original) creationSnapshots.current.tasks.set(task.id, structuredClone(next.tasks.find(existing => existing.id === task.id)!))
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
  function saveProject(project: Project, initialTask?: Task): string | null {
    const original = (editor?.type === 'project' ? editor.project : undefined) ?? creationSnapshots.current.projects.get(project.id)
    const originalTask = creationSnapshots.current.initialTasks.get(project.id)
    return persistChange(current => {
      const latest = current.projects.find(existing => existing.id === project.id)
      if (original && !latest) throw new Error('Projektet har tagits bort i en annan flik. Stäng redigeringen för att fortsätta.')
      const merged = original && latest ? mergeRecordChanges(original, project, latest) : project
      const latestTask = initialTask ? current.tasks.find(task => task.id === initialTask.id) : undefined
      if (initialTask && originalTask && !latestTask) throw new Error('Huvuduppgiften har tagits bort i en annan flik. Töm huvuduppgiften för att spara projektet utan den.')
      const mergedTask = initialTask && originalTask && latestTask ? mergeRecordChanges(originalTask, initialTask, latestTask) : initialTask
      if (mergedTask && !current.columns.some(column => column.id === mergedTask.columnId)) throw new Error('Kolumnen för huvuduppgiften har tagits bort. Stäng och öppna ett nytt projekt.')
      return {
        ...current,
        projects: latest ? current.projects.map(existing => existing.id === project.id ? merged : existing) : [...current.projects, merged],
        tasks: mergedTask ? latestTask ? current.tasks.map(task => task.id === mergedTask.id ? mergedTask : task) : [...current.tasks, mergedTask] : originalTask ? current.tasks.filter(task => task.id !== originalTask.id) : current.tasks,
      }
    }, 'Projektet är sparat', () => setEditor({ type: 'project-detail', projectId: project.id }), next => {
      if (!original) creationSnapshots.current.projects.set(project.id, structuredClone(next.projects.find(existing => existing.id === project.id)!))
      if (!originalTask && initialTask) creationSnapshots.current.initialTasks.set(project.id, structuredClone(next.tasks.find(task => task.id === initialTask.id)!))
      if (!initialTask) creationSnapshots.current.initialTasks.delete(project.id)
    })
  }
  function exportWorkspace() {
    const blob = new Blob([JSON.stringify({ ...workspace, debriefs: debriefs.debriefs }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `forma-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url)
    setToast('Din säkerhetskopia är nedladdad')
  }
  return <>
    <div className="app-shell" aria-busy={data.loading}>
      <header className="topbar"><button className="brand" onClick={() => switchPage('kanban')} aria-label="Forma — till kanban"><span className="brand-mark"><i /><i /><i /><i /></span>forma<span className="brand-period">.</span></button><div className="topbar-right"><button className="sync-indicator" data-status={data.syncStatus} onClick={() => switchPage('profile')} aria-label={statusText}>{data.user ? <Cloud size={13} /> : <HardDrive size={13} />}<span>{statusText}</span></button><button className="icon-button debrief-bell" aria-label="Öppna debriefingar" aria-describedby="debrief-unread-count" disabled={data.loading} onClick={() => openDebrief(debriefs.unread[0]?.id)}><Bell size={18} />{debriefs.unread.length > 0 && <span className="debrief-bell-dot" aria-hidden="true" />}</button><span id="debrief-unread-count" className="sr-only" role="status">{debriefs.unread.length ? `${debriefs.unread.length} nya debriefingar` : 'Inga nya debriefingar'}</span><button className="icon-button" aria-label={resolvedTheme === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema'} onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div></header>
      {data.loading && <div className="loading-notice" role="status">Laddar din tavla…</div>}
      <main className="main-content" inert={data.loading}>
        <div className="page-heading"><h1>{({ summary: 'Summary', kanban: 'Kanban', projects: 'Projects', profile: 'Profile' })[page]}</h1>{(page === 'kanban' || page === 'projects') && <div className="page-actions"><button className="button primary" aria-label={page === 'kanban' ? 'Ny uppgift' : 'Nytt projekt'} onClick={() => setEditor(page === 'kanban' ? { type: 'task' } : { type: 'project' })}><Plus size={18} /><span>{page === 'kanban' ? 'Ny uppgift' : 'Nytt projekt'}</span></button></div>}</div>
        {actionError && actionError !== data.syncError && <div className="sync-banner" role="alert"><HardDrive size={18} /><p>{actionError}</p><button className="icon-button" aria-label="Stäng meddelande" onClick={() => setActionError(null)}><X size={18} /></button></div>}
        {data.syncError && <div className="sync-banner" role="status">{data.user ? <Cloud size={18} /> : <HardDrive size={18} />}<p>{data.syncError}</p>{data.syncStatus === 'conflict' ? <><button className="button secondary small" onClick={() => data.resolveConflict('remote')}>Behåll molnets</button><button className="button primary small" onClick={() => data.resolveConflict('local')}>Behåll min</button></> : <button className="button secondary small" onClick={data.retrySync}>Försök igen</button>}</div>}
        {page === 'summary' && <Summary key={summaryVisit} debriefs={debriefs.debriefs} initialId={summaryInitialId} onRead={debriefs.markRead} onDismiss={debriefs.dismiss} onImport={debriefs.importDebrief} error={debriefs.error} onRetry={debriefs.retry} localOnly={!data.user} />}
        {page === 'kanban' && <>
          {debriefs.error && <div className="sync-banner" role="status"><NotebookText size={18} /><p>{debriefs.error}</p><button className="button secondary small" onClick={debriefs.retry}>Försök igen</button></div>}
          {debriefs.unread[0] && <DebriefNotice debrief={debriefs.unread[0]} onRead={() => openDebrief(debriefs.unread[0].id)} onDismiss={() => debriefs.dismiss(debriefs.unread[0].id)} />}
          <div className="summary-grid"><div className="summary-card feature"><span className="stat-icon"><Sparkles size={19} /></span><div><p className="stat-label">Pågår</p><p className="stat-value">{ongoing}</p></div></div><div className="summary-card"><span className="stat-icon"><Columns3 size={19} /></span><div><p className="stat-label">Aktiva</p><p className="stat-value">{active}</p></div></div><div className="summary-card"><span className="stat-icon"><CircleCheck size={19} /></span><div><p className="stat-label">Klara</p><p className="stat-value">{done}</p></div></div></div>
          <div className="workspace-toolbar"><div className="toolbar-left"><span className="view-label"><Columns3 size={15} />Min kanban</span></div><div className="toolbar-right"><label className="search-field"><Search size={16} /><input type="search" aria-label="Sök uppgifter" placeholder="Sök uppgifter" value={query} onChange={event => setQuery(event.target.value)} /></label><select className="filter-select" aria-label="Filtrera projekt" value={projectFilter} onChange={event => setProjectFilter(event.target.value)}><option value="all">Alla projekt</option><option value="none">Fristående</option>{workspace.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></div></div>
          {(query || projectFilter !== 'all') && <p className="filter-caption">{visibleTasks.length} uppgifter visas<button className="button ghost small" onClick={() => { setQuery(''); setProjectFilter('all') }}>Rensa filter<X size={13} /></button></p>}
          <Board workspace={workspace} tasks={visibleTasks} onOpen={task => setEditor({ type: 'task', task })} onAdd={columnId => setEditor({ type: 'task', columnId })} onAddColumn={() => setEditor({ type: 'column' })} onEditColumn={column => setEditor({ type: 'column', column })} onMove={moveTask} />
        </>}
        {page === 'projects' && <Projects workspace={workspace} onOpen={project => setEditor({ type: 'project-detail', projectId: project.id })} onAdd={() => setEditor({ type: 'project' })} />}
        {page === 'profile' && <Profile data={data} theme={theme} onTheme={setTheme} onExport={exportWorkspace} onBirthdays={() => setEditor({ type: 'birthdays' })} />}
      </main>
      <nav className="bottom-nav" aria-label="Huvudnavigation">{([{ id: 'summary', label: 'Summary', Icon: NotebookText }, { id: 'kanban', label: 'Kanban', Icon: Columns3 }, { id: 'projects', label: 'Projects', Icon: Folder }, { id: 'profile', label: 'Profile', Icon: UserRound }] as const).map(({ id, label, Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-label={label} aria-current={page === id ? 'page' : undefined} onClick={() => switchPage(id)}><Icon className="nav-icon" size={18} /><span className="nav-label">{label}</span>{id === 'summary' && debriefs.unread.length > 0 && <span className="nav-unread" aria-hidden="true">{debriefs.unread.length > 9 ? '9+' : debriefs.unread.length}</span>}</button>)}</nav>
    </div>
    {editor?.type === 'birthdays' && <Birthdays birthdays={workspace.birthdays ?? []} onClose={() => setEditor(null)} onSave={saveBirthday} onDelete={id => persistChange(current => ({ ...current, birthdays: (current.birthdays ?? []).filter(person => person.id !== id) }), 'Födelsedagen är borttagen. Uppgifterna finns kvar.')} />}
    {editor?.type === 'task' && <TaskEditor key={editor.task?.id ?? 'new-task'} task={editor.task} columnId={editor.columnId} projectId={editor.projectId} workspace={workspace} onClose={closeTask} onSave={saveTask} onDelete={id => persistChange(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) }), 'Uppgiften är borttagen', closeTask)} />}
    {editor?.type === 'column' && <ColumnEditor column={editor.column} count={workspace.tasks.filter(task => task.columnId === editor.column?.id).length} onClose={() => setEditor(null)} onDelete={editor.column && editor.column.id !== 'done' && workspace.columns.length > 2 ? () => persistChange(current => {
      if (current.columns.length <= 2) throw new Error('Behåll minst två kolumner.')
      if (current.tasks.some(task => task.columnId === editor.column?.id)) throw new Error('Kolumnen innehåller uppgifter. Flytta dem först.')
      return { ...current, columns: current.columns.filter(column => column.id !== editor.column?.id) }
    }, 'Kolumnen är borttagen', () => setEditor(null)) : undefined} onSave={saveColumn} />}
    {editor?.type === 'project' && <ProjectEditor project={editor.project} workspace={workspace} onClose={() => setEditor(null)} onSave={saveProject} />}
    {project && <ProjectDetail project={project} workspace={workspace} onClose={() => setEditor(null)} onEdit={() => setEditor({ type: 'project', project })} onAddTask={() => setEditor({ type: 'task', projectId: project.id, backProjectId: project.id })} onOpenTask={task => setEditor({ type: 'task', task, backProjectId: project.id })} onToggleSubtask={(taskId, itemId) => persistChange(current => {
      const task = current.tasks.find(task => task.id === taskId)
      if (!task?.checklist.some(item => item.id === itemId)) throw new Error('Deluppgiften har tagits bort i en annan flik.')
      return { ...current, tasks: current.tasks.map(task => task.id === taskId ? { ...task, checklist: task.checklist.map(item => item.id === itemId ? { ...item, completed: !item.completed } : item) } : task) }
    })} onDelete={() => persistChange(current => ({ ...current, projects: current.projects.filter(existing => existing.id !== project.id), tasks: current.tasks.map(task => task.projectId === project.id ? { ...task, projectId: null } : task) }), 'Projektet är borttaget. Uppgifterna finns kvar.', () => { if (projectFilter === project.id) setProjectFilter('all'); setEditor(null) })} /> }
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </>
}
