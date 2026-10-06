import { useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, Plus, CalendarDays, Check, Folder, Leaf, Home, Compass, Sparkles, Pencil, Trash2 } from 'lucide-react'
import type { Project, Task, Workspace } from '../lib/types'
import { dateLabel, newId, isTaskDone, projectProgress } from '../lib/helpers'
import { Modal } from './Modal'

const projectIcons = { folder: Folder, leaf: Leaf, home: Home, compass: Compass, sparkles: Sparkles }
export function ProjectIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = projectIcons[name as keyof typeof projectIcons] ?? Folder
  return <Icon size={size} strokeWidth={1.6} />
}

export function Projects({ workspace, onOpen, onAdd }: { workspace: Workspace; onOpen: (project: Project) => void; onAdd: () => void }) {
  return <div className="project-grid">{workspace.projects.map(project => {
    const { tasks, complete, percent } = projectProgress(project.id, workspace)
    return <button className="project-card" key={project.id} onClick={() => onOpen(project)} aria-label={`Öppna projekt ${project.title}`}>
      <div className="project-card-top"><span className="project-icon"><ProjectIcon name={project.icon} /></span><ArrowUpRight size={18} /></div>
      <h2>{project.title}</h2>{project.description && <p className="project-description">{project.description}</p>}
      <div className="project-progress"><div className="progress-caption"><span>{complete}/{tasks.length} klara</span><span>{percent}%</span></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div></div>
      <div className="project-card-footer"><span>{tasks.reduce((count, task) => count + task.checklist.length, 0)} deluppgifter</span>{project.deadline && <span><CalendarDays size={13} />{dateLabel(project.deadline)}</span>}</div>
    </button>
  })}<button className="project-card new-project-card" onClick={onAdd}><span className="project-icon"><Plus size={21} strokeWidth={1.5} /></span><h2>Nytt projekt</h2></button></div>
}

export function ProjectEditor({ project, workspace, onSave, onClose }: {
  project?: Project; workspace: Workspace; onSave: (project: Project, initialTask?: Task) => string | null; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Project>(() => project ? { ...project } : { id: newId(), title: '', description: '', icon: 'folder', color: 'gray', deadline: null, createdAt: new Date().toISOString() })
  const [mainTask, setMainTask] = useState('')
  const [subtasks, setSubtasks] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const initialTaskIdRef = useRef(newId())
  const subtaskIdsRef = useRef<string[]>([])
  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) { setSaveError('Ange ett projektnamn.'); return }
    const initialTask: Task | undefined = mainTask.trim() ? { id: initialTaskIdRef.current, title: mainTask.trim(), description: '', columnId: workspace.columns[0].id, labels: [], checklist: subtasks.split('\n').map(title => title.trim()).filter(Boolean).map((title, index) => ({ id: subtaskIdsRef.current[index] ?? (subtaskIdsRef.current[index] = newId()), title, completed: false })), comments: [], deadline: draft.deadline, projectId: draft.id, createdAt: draft.createdAt } : undefined
    const failure = onSave({ ...draft, title: draft.title.trim(), description: draft.description.trim() }, initialTask)
    if (failure) setSaveError(failure)
  }
  return <Modal title={project ? 'Redigera projekt' : 'Nytt projekt'} error={saveError} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>Avbryt</button><button form="project-form" type="submit" className="button primary"><Check size={17} />{project ? 'Spara projekt' : 'Skapa projekt'}</button></>}>
    <form id="project-form" onSubmit={save}><label className="field">Projektnamn<input className="input title-input" required autoFocus maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><label className="field">Beskrivning<textarea className="textarea" rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="field"><span>Projektikon</span><div className="icon-picker">{Object.keys(projectIcons).map(name => <button key={name} type="button" className={`icon-button ${draft.icon === name ? 'selected' : ''}`} aria-label={`Ikon ${name}`} aria-pressed={draft.icon === name} onClick={() => setDraft({ ...draft, icon: name })}><ProjectIcon name={name} /></button>)}</div></div>
      <label className="field">Deadline<input type="date" className="input" value={draft.deadline ?? ''} onChange={event => setDraft({ ...draft, deadline: event.target.value || null })} /></label>
      {!project && <><label className="field">Huvuduppgift<input className="input" value={mainTask} onChange={event => setMainTask(event.target.value)} /></label><label className="field">Deluppgifter<textarea className="textarea" rows={3} placeholder="En deluppgift per rad" value={subtasks} onChange={event => setSubtasks(event.target.value)} disabled={!mainTask.trim()} /></label></>}
    </form>
  </Modal>
}

export function ProjectDetail({ project, workspace, onClose, onEdit, onDelete, onAddTask, onOpenTask, onToggleSubtask }: {
  project: Project; workspace: Workspace; onClose: () => void; onEdit: () => void; onDelete: () => string | null;
  onAddTask: () => void; onOpenTask: (task: Task) => void; onToggleSubtask: (taskId: string, itemId: string) => string | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { tasks, complete, percent } = projectProgress(project.id, workspace)
  return <Modal title={project.title} error={saveError} onClose={onClose} footer={<><button className="icon-button danger" aria-label="Ta bort projekt" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button><button className="button secondary" onClick={onEdit}><Pencil size={15} /> Redigera</button><button className="button primary" onClick={onAddTask}><Plus size={17} /> Huvuduppgift</button></>}>
    {project.description && <div className="project-detail-intro"><span className="project-icon"><ProjectIcon name={project.icon} size={26} /></span><p>{project.description}</p></div>}
    {project.deadline && <span className="task-meta-item"><CalendarDays size={15} />Deadline {dateLabel(project.deadline)}</span>}
    <div className="project-progress"><div className="progress-caption"><span>{complete}/{tasks.length} klara</span><span>{percent}%</span></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div></div>
    {tasks.length > 0 && <div className="section-label"><span>Huvuduppgifter</span></div>}
    <div className="project-tasks">{tasks.map(task => <div className="project-task-group" key={task.id}><button className="project-task-row" onClick={() => onOpenTask(task)}><span className={`task-status-icon ${isTaskDone(task, workspace) ? 'complete' : ''}`}>{isTaskDone(task, workspace) ? <Check size={14} /> : <span />}</span><span className="project-task-body"><strong>{task.title}</strong><small>{workspace.columns.find(column => column.id === task.columnId)?.title}</small></span><ArrowUpRight size={16} /></button>
      {task.checklist.length > 0 && <div className="project-subtasks">{task.checklist.map(item => <label className="project-subtask" key={item.id}><input type="checkbox" checked={item.completed} onChange={() => { const failure = onToggleSubtask(task.id, item.id); setSaveError(failure) }} /><span className={item.completed ? 'completed' : ''}>{item.title}</span></label>)}</div>}
    </div>)}</div>
    {tasks.length === 0 && <div className="empty-state"><Folder size={26} strokeWidth={1.2} /><h3>Inga uppgifter ännu.</h3></div>}
    {confirmDelete && <div className="form-message delete-confirm"><p>Ta bort projektet? Uppgifterna finns kvar i kanban.</p><button className="button secondary" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" onClick={() => { const failure = onDelete(); if (failure) setSaveError(failure) }}>Ta bort projekt</button></div>}
  </Modal>
}
