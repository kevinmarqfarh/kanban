import { useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, Plus, CalendarDays, Check, Pencil, Trash2, type LucideIcon,
  Folder, Leaf, Home, Compass, Sparkles, Target, Flag, Star, Lightbulb, Calendar, PiggyBank,
  Users, Baby, PawPrint, Hammer, Wrench, Sprout, ShoppingBag, Gift,
  HeartPulse, Dumbbell, Bike, Utensils, Coffee,
  Plane, MapPin, Car, Mountain, Tent, Sun, PartyPopper, Gamepad2,
  Briefcase, Rocket, Code, GraduationCap, BookOpen,
  Palette, PenLine, Camera, Music } from 'lucide-react'
import type { Project, ProjectTask, Workspace } from '../lib/types'
import { projectIconLabel, projectIconsByGroup, resolveProjectIcon, type ProjectIconKey } from '../lib/projectIcons'
import { dateLabel, newId, projectProgress } from '../lib/helpers'
import { Modal } from './Modal'

// `satisfies` makes the build fail if a key in lib/projectIcons.ts has no component here.
const projectIcons = {
  folder: Folder, leaf: Leaf, home: Home, compass: Compass, sparkles: Sparkles,
  target: Target, flag: Flag, star: Star, lightbulb: Lightbulb, calendar: Calendar, 'piggy-bank': PiggyBank,
  users: Users, baby: Baby, 'paw-print': PawPrint, hammer: Hammer, wrench: Wrench, sprout: Sprout, 'shopping-bag': ShoppingBag, gift: Gift,
  'heart-pulse': HeartPulse, dumbbell: Dumbbell, bike: Bike, utensils: Utensils, coffee: Coffee,
  plane: Plane, 'map-pin': MapPin, car: Car, mountain: Mountain, tent: Tent, sun: Sun, 'party-popper': PartyPopper, gamepad: Gamepad2,
  briefcase: Briefcase, rocket: Rocket, code: Code, 'graduation-cap': GraduationCap, book: BookOpen,
  palette: Palette, 'pen-line': PenLine, camera: Camera, music: Music,
} satisfies Record<ProjectIconKey, LucideIcon>
const iconGroups = projectIconsByGroup()
export function ProjectIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = projectIcons[resolveProjectIcon(name)]
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />
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

export function ProjectEditor({ project, onSave, onClose }: {
  project?: Project; onSave: (project: Project, initialTask?: ProjectTask) => string | null; onClose: () => void;
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
    const initialTask: ProjectTask | undefined = mainTask.trim() ? { id: initialTaskIdRef.current, title: mainTask.trim(), description: '', labels: [], checklist: subtasks.split('\n').map(title => title.trim()).filter(Boolean).map((title, index) => ({ id: subtaskIdsRef.current[index] ?? (subtaskIdsRef.current[index] = newId()), title, completed: false })), comments: [], deadline: draft.deadline, completed: false, createdAt: draft.createdAt } : undefined
    const failure = onSave({ ...draft, title: draft.title.trim(), description: draft.description.trim() }, initialTask)
    if (failure) setSaveError(failure)
  }
  return <Modal title={project ? 'Redigera projekt' : 'Nytt projekt'} error={saveError} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>Avbryt</button><button form="project-form" type="submit" className="button primary"><Check size={17} />{project ? 'Spara projekt' : 'Skapa projekt'}</button></>}>
    <form id="project-form" onSubmit={save}><label className="field">Projektnamn<input className="input title-input" required autoFocus maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><label className="field">Beskrivning<textarea className="textarea" rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="field" role="group" aria-labelledby="project-icon-label"><span id="project-icon-label">Projektikon <small className="icon-picker-current">{projectIconLabel(draft.icon)}</small></span><div className="icon-picker">{iconGroups.map(group => <div key={group.id} className="icon-picker-group" role="group" aria-label={group.label}><span className="icon-picker-heading" aria-hidden="true">{group.label}</span><div className="icon-picker-grid">{group.icons.map(({ key, label }) => <button key={key} type="button" className={`icon-button ${resolveProjectIcon(draft.icon) === key ? 'selected' : ''}`} aria-label={`Ikon ${label}`} title={label} aria-pressed={resolveProjectIcon(draft.icon) === key} onClick={() => setDraft({ ...draft, icon: key })}><ProjectIcon name={key} /></button>)}</div></div>)}</div></div>
      <label className="field">Deadline<input type="date" className="input" value={draft.deadline ?? ''} onChange={event => setDraft({ ...draft, deadline: event.target.value || null })} /></label>
      {!project && <><label className="field">Huvuduppgift<input className="input" value={mainTask} onChange={event => setMainTask(event.target.value)} /></label><label className="field">Deluppgifter<textarea className="textarea" rows={3} placeholder="En deluppgift per rad" value={subtasks} onChange={event => setSubtasks(event.target.value)} disabled={!mainTask.trim()} /></label></>}
    </form>
  </Modal>
}

export function ProjectDetail({ project, workspace, onClose, onEdit, onDelete, onAddTask, onOpenTask, onToggleSubtask }: {
  project: Project; workspace: Workspace; onClose: () => void; onEdit: () => void; onDelete: () => string | null;
  onAddTask: () => void; onOpenTask: (task: ProjectTask, subtaskId?: string) => void; onToggleSubtask: (taskId: string, itemId: string) => string | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { tasks, complete, percent } = projectProgress(project.id, workspace)
  return <Modal wide title={project.title} error={saveError} onClose={onClose} footer={<><button className="icon-button danger" aria-label="Ta bort projekt" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button><button className="button secondary" onClick={onEdit}><Pencil size={15} /> Redigera projekt</button><button className="button primary" onClick={onAddTask}><Plus size={17} /> Huvuduppgift</button></>}>
    <div className="project-detail-layout">
      <aside className="project-overview">
        <div className="project-detail-intro"><span className="project-icon"><ProjectIcon name={project.icon} size={26} /></span><p>{project.description || 'Samla projektets huvuduppgifter och deluppgifter här.'}</p></div>
        {project.deadline && <span className="task-meta-item"><CalendarDays size={15} />Deadline {dateLabel(project.deadline)}</span>}
        <div className="project-progress"><div className="progress-caption"><span>{complete}/{tasks.length} klara</span><span>{percent}%</span></div><div className="progress-track"><span style={{ width: `${percent}%` }} /></div></div>
      </aside>
      <section className="project-work" aria-label="Projektets uppgifter">
        <div className="section-label"><span>Huvuduppgifter</span><span>{tasks.length} uppgifter</span></div>
        <p className="field-hint">Redigera en huvuduppgift eller tryck på pennan vid en deluppgift.</p>
        <div className="project-tasks">{tasks.map(task => <div className="project-task-group" key={task.id}>
          <button className="project-task-row" aria-label={`Redigera huvuduppgift ${task.title}`} onClick={() => onOpenTask(task)}><span className={`task-status-icon ${task.completed ? 'complete' : ''}`}>{task.completed ? <Check size={14} /> : <span />}</span><span className="project-task-body"><strong>{task.title}</strong><small>{task.completed ? 'Klar' : 'Pågår'}</small></span><span className="project-edit-label"><Pencil size={15} />Redigera</span></button>
          {task.checklist.length > 0 && <div className="project-subtasks">{task.checklist.map(item => <div className="project-subtask-row" key={item.id}><label className="project-subtask"><input type="checkbox" checked={item.completed} onChange={() => setSaveError(onToggleSubtask(task.id, item.id))} /><span className={item.completed ? 'completed' : ''}>{item.title}</span></label><button className="icon-button" aria-label={`Redigera deluppgift ${item.title}`} onClick={() => onOpenTask(task, item.id)}><Pencil size={15} /></button></div>)}</div>}
        </div>)}</div>
        {tasks.length === 0 && <div className="empty-state"><Folder size={26} strokeWidth={1.2} /><h3>Inga uppgifter ännu.</h3><button className="button secondary" onClick={onAddTask}><Plus size={16} />Lägg till huvuduppgift</button></div>}
      </section>
    </div>
    {confirmDelete && <div className="form-message delete-confirm"><p>Ta bort projektet och dess uppgifter?</p><button className="button secondary" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" onClick={() => { const failure = onDelete(); if (failure) setSaveError(failure) }}>Ta bort projekt</button></div>}
  </Modal>
}

export function ProjectTaskEditor({ task, focusSubtaskId, onSave, onDelete, onClose }: {
  task?: ProjectTask; focusSubtaskId?: string; onSave: (task: ProjectTask) => string | null; onDelete: (id: string) => string | null; onClose: () => void;
}) {
  const [draft, setDraft] = useState<ProjectTask>(() => task ? structuredClone(task) : {
    id: newId(), title: '', description: '', completed: false, labels: [], checklist: [], deadline: null, comments: [], createdAt: new Date().toISOString(),
  })
  const subtaskFocusRef = useRef<HTMLInputElement>(null)
  const [itemTitle, setItemTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  function addItem() {
    if (!itemTitle.trim()) return
    setDraft(current => ({ ...current, checklist: [...current.checklist, { id: newId(), title: itemTitle.trim(), completed: false }] }))
    setItemTitle('')
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) { setError('Ange en titel.'); return }
    if (draft.checklist.some(item => !item.title.trim())) { setError('Ange en titel för varje deluppgift.'); return }
    const checklist = draft.checklist.map(item => ({ ...item, title: item.title.trim() }))
    if (itemTitle.trim()) checklist.push({ id: newId(), title: itemTitle.trim(), completed: false })
    const next = { ...draft, title: draft.title.trim(), description: draft.description.trim(), checklist }
    setDraft(next); setItemTitle(''); setError(onSave(next))
  }
  return <Modal wide initialFocusRef={subtaskFocusRef} title={task ? 'Projektuppgift' : 'Ny projektuppgift'} error={error} onClose={onClose} footer={<>
    {task && <button className="icon-button danger" aria-label="Ta bort projektuppgift" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button>}
    <button className="button secondary" onClick={onClose}>Avbryt</button><button className="button primary" type="submit" form="project-task-form"><Check size={17} />Spara uppgift</button>
  </>}>
    <form id="project-task-form" className="project-task-form" onSubmit={save}>
      <div className="project-task-details">
      <label className="field">Titel<input className="input title-input" autoFocus required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="field">Beskrivning<textarea className="textarea" rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="field-row"><label className="field">Status<select className="select" value={draft.completed ? 'done' : 'active'} onChange={event => setDraft({ ...draft, completed: event.target.value === 'done' })}><option value="active">Pågår</option><option value="done">Klar</option></select></label><label className="field">Deadline<input className="input" type="date" value={draft.deadline ?? ''} onChange={event => setDraft({ ...draft, deadline: event.target.value || null })} /></label></div>
      </div>
      <div className="project-task-checklist"><div className="section-label"><span>Deluppgifter</span><span>{draft.checklist.filter(item => item.completed).length}/{draft.checklist.length} klara</span></div>
      <p className="field-hint">Ändra texten direkt, lägg till fler eller ta bort deluppgifter.</p>
      <div className="checklist">{draft.checklist.map((item, index) => <div className="checklist-row project-checklist-row" key={item.id}><input type="checkbox" aria-label={`Markera ${item.title || `deluppgift ${index + 1}`} som klar`} checked={item.completed} onChange={() => setDraft({ ...draft, checklist: draft.checklist.map(existing => existing.id === item.id ? { ...existing, completed: !existing.completed } : existing) })} /><input ref={item.id === focusSubtaskId ? subtaskFocusRef : undefined} className="input" aria-label={`Deluppgift ${index + 1}`} required maxLength={160} value={item.title} onChange={event => setDraft({ ...draft, checklist: draft.checklist.map(existing => existing.id === item.id ? { ...existing, title: event.target.value } : existing) })} /><button className="icon-button" type="button" aria-label={`Ta bort ${item.title}`} onClick={() => setDraft({ ...draft, checklist: draft.checklist.filter(existing => existing.id !== item.id) })}><Trash2 size={15} /></button></div>)}</div>
      <div className="checklist-add"><input className="input" aria-label="Ny deluppgift" placeholder="Lägg till deluppgift" value={itemTitle} onChange={event => setItemTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addItem() } }} /><button className="icon-button" type="button" aria-label="Lägg till deluppgift" onClick={addItem}><Plus size={19} /></button></div>
      </div>
    </form>
    {confirmDelete && <div className="form-message delete-confirm"><p>Ta bort projektuppgiften?</p><button className="button secondary" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" onClick={() => setError(onDelete(draft.id))}>Ta bort uppgift</button></div>}
  </Modal>
}
