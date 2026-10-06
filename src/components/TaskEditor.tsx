import { useState, type FormEvent } from 'react'
import { Plus, Trash2, Send, Check, MessageSquare } from 'lucide-react'
import type { Task, Workspace } from '../lib/types'
import { newId } from '../lib/helpers'
import { Modal } from './Modal'

export function TaskEditor({ task, columnId, projectId, workspace, onSave, onDelete, onClose }: {
  task?: Task; columnId?: string; projectId?: string; workspace: Workspace;
  onSave: (task: Task) => string | null; onDelete: (id: string) => string | null; onClose: () => void;
}) {
  const [draft, setDraft] = useState<Task>(() => task ? structuredClone(task) : {
    id: newId(), title: '', description: '', columnId: columnId ?? workspace.columns[0].id,
    labels: [], checklist: [], deadline: null, comments: [], projectId: projectId ?? null, createdAt: new Date().toISOString(),
  })
  const [labels, setLabels] = useState(draft.labels.join(', '))
  const [checklistTitle, setChecklistTitle] = useState('')
  const [comment, setComment] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const completed = draft.checklist.filter(item => item.completed).length
  function addItem() {
    if (!checklistTitle.trim()) return
    setDraft(current => ({ ...current, checklist: [...current.checklist, { id: newId(), title: checklistTitle.trim(), completed: false }] }))
    setChecklistTitle('')
  }
  function addComment() {
    if (!comment.trim()) return
    setDraft(current => ({ ...current, comments: [...current.comments, { id: newId(), text: comment.trim(), createdAt: new Date().toISOString() }] }))
    setComment('')
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) { setSaveError('Ange en titel.'); return }
    const checklist = checklistTitle.trim() ? [...draft.checklist, { id: newId(), title: checklistTitle.trim(), completed: false }] : draft.checklist
    const comments = comment.trim() ? [...draft.comments, { id: newId(), text: comment.trim(), createdAt: new Date().toISOString() }] : draft.comments
    const nextTask = { ...draft, title: draft.title.trim(), description: draft.description.trim(), checklist, comments, labels: [...new Set(labels.split(',').map(label => label.trim()).filter(Boolean))] }
    setDraft(nextTask)
    setChecklistTitle('')
    setComment('')
    const failure = onSave(nextTask)
    if (failure) setSaveError(failure)
  }
  return <Modal title={task ? 'Uppgift' : 'Ny uppgift'} error={saveError} onClose={onClose} footer={<>
    {task && <button className="icon-button danger" aria-label="Ta bort uppgift" onClick={() => setConfirmDelete(true)}><Trash2 size={19} /></button>}
    <button className="button secondary" onClick={onClose}>Avbryt</button><button className="button primary" form="task-form" type="submit"><Check size={17} />{task ? 'Spara ändringar' : 'Skapa uppgift'}</button>
  </>}>
    <form id="task-form" onSubmit={save}>
      <label className="field">Titel<input className="input title-input" autoFocus required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="field">Beskrivning<textarea className="textarea" rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="field-row"><label className="field">Status<select className="select" value={draft.columnId} onChange={event => setDraft({ ...draft, columnId: event.target.value })}>{workspace.columns.map(column => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label><label className="field">Deadline<input className="input" type="date" value={draft.deadline ?? ''} onChange={event => setDraft({ ...draft, deadline: event.target.value || null })} /></label></div>
      <div className="field-row"><label className="field">Projekt<select className="select" value={draft.projectId ?? ''} onChange={event => setDraft({ ...draft, projectId: event.target.value || null })}><option value="">Fristående</option>{workspace.projects.map(project => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label><label className="field">Etiketter<input className="input" placeholder="Privat, Idé" value={labels} onChange={event => setLabels(event.target.value)} /><span className="field-help">Separera med kommatecken</span></label></div>
      <div className="section-label"><span>Checklista</span><span>{completed}/{draft.checklist.length}</span></div>
      <div className="checklist">{draft.checklist.map(item => <div className="checklist-row" key={item.id}><label><input type="checkbox" checked={item.completed} onChange={() => setDraft({ ...draft, checklist: draft.checklist.map(current => current.id === item.id ? { ...current, completed: !current.completed } : current) })} /><span className={item.completed ? 'completed' : ''}>{item.title}</span></label><button className="icon-button" type="button" aria-label={`Ta bort ${item.title}`} onClick={() => setDraft({ ...draft, checklist: draft.checklist.filter(current => current.id !== item.id) })}><Trash2 size={15} /></button></div>)}</div>
      <div className="checklist-add"><input className="input" aria-label="Ny deluppgift" placeholder="Lägg till deluppgift" value={checklistTitle} onChange={event => setChecklistTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addItem() } }} /><button type="button" className="icon-button" aria-label="Lägg till deluppgift" onClick={addItem}><Plus size={19} /></button></div>
      <div className="section-label"><span><MessageSquare size={15} /> Kommentarer</span><span>{draft.comments.length}</span></div>
      <div className="comments">{draft.comments.map(entry => <div key={entry.id} className="comment"><div className="comment-meta"><span>Du</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</time></div><p>{entry.text}</p></div>)}</div>
      <div className="comment-compose"><input className="input" aria-label="Ny kommentar" placeholder="Skriv kommentar" value={comment} onChange={event => setComment(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addComment() } }} /><button type="button" className="icon-button" aria-label="Lägg till kommentar" onClick={addComment}><Send size={17} /></button></div>
      {confirmDelete && <div className="form-message delete-confirm"><p>Ta bort uppgiften?</p><button type="button" className="button secondary" onClick={() => setConfirmDelete(false)}>Behåll</button><button type="button" className="button primary danger" onClick={() => { const failure = onDelete(draft.id); if (failure) setSaveError(failure) }}>Ta bort</button></div>}
    </form>
  </Modal>
}
