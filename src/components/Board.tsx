import { useRef, useState } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable, closestCorners, pointerWithin, type DragEndEvent, type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, GripVertical, CalendarDays, ListChecks, MessageSquare, ArrowUpRight, Pencil, CircleCheck } from 'lucide-react'
import type { Column, Task, Workspace } from '../lib/types'
import { dateLabel, isTaskDone, overdue } from '../lib/helpers'

function CardContent({ task, workspace }: { task: Task; workspace: Workspace }) {
  const project = workspace.projects.find(project => project.id === task.projectId)
  const checklistDone = task.checklist.filter(item => item.completed).length
  return <>
    {task.labels.length > 0 && <div className="task-labels">{task.labels.slice(0, 3).map(label => <span className="label-chip" key={label}>{label}</span>)}</div>}
    <h3 className="task-title">{task.title}</h3>
    {task.description && <p className="task-description">{task.description}</p>}
    {(task.deadline || task.checklist.length > 0 || task.comments.length > 0) && <div className="task-meta">
      {task.deadline && <span className={`task-meta-item date-chip ${overdue(task, workspace) ? 'deadline-overdue' : ''}`}><CalendarDays size={13} />{dateLabel(task.deadline)}</span>}
      {task.checklist.length > 0 && <span className="task-meta-item"><ListChecks size={14} />{checklistDone}/{task.checklist.length}</span>}
      {task.comments.length > 0 && <span className="task-meta-item"><MessageSquare size={13} />{task.comments.length}</span>}
    </div>}
    {project && <div className="task-footer"><span className="task-project"><span className="project-mini-icon">▦</span>{project.title}</span><ArrowUpRight size={13} /></div>}
  </>
}

function TaskCard({ task, workspace, onOpen }: { task: Task; workspace: Workspace; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { columnId: task.columnId, type: 'task' } })
  return <article ref={setNodeRef} className={`task-card ${isTaskDone(task, workspace) ? 'task-complete' : ''} ${isDragging ? 'is-dragging' : ''}`} data-task-id={task.id} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}>
    <button className="task-open" onClick={() => onOpen(task)} aria-label={`Öppna ${task.title}`}><CardContent task={task} workspace={workspace} /></button>
    <button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners} aria-label={`Dra ${task.title}`} title="Dra för att flytta · mellanslag + piltangenter"><GripVertical size={16} /></button>
  </article>
}

function BoardColumn({ column, tasks, workspace, onOpen, onAdd, onEdit }: {
  column: Column; tasks: Task[]; workspace: Workspace; onOpen: (task: Task) => void; onAdd: () => void; onEdit: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column' } })
  return <section ref={setNodeRef} className={`column ${isOver ? 'column-over' : ''}`} data-column-id={column.id} aria-label={column.title}>
    <div className="column-header"><div className="column-title"><span className="status-dot" data-status={column.id} /><h2>{column.title}</h2><span className="count-badge">{tasks.length}</span></div><div className="column-actions"><button className="icon-button" aria-label={`Redigera kolumn ${column.title}`} onClick={onEdit}><Pencil size={14} /></button></div></div>
    <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
      <div className="task-list">{tasks.map(task => <TaskCard key={task.id} task={task} workspace={workspace} onOpen={onOpen} />)}
        {tasks.length === 0 && <div className="column-empty"><CircleCheck size={22} strokeWidth={1.25} /><p>Inga uppgifter.</p></div>}
      </div>
    </SortableContext>
    <button className="add-task" onClick={onAdd}><Plus size={16} /> Lägg till uppgift</button>
  </section>
}

export function Board({ workspace, tasks, onOpen, onAdd, onEditColumn, onAddColumn, onMove }: {
  workspace: Workspace; tasks: Task[]; onOpen: (task: Task) => void; onAdd: (columnId: string) => void;
  onEditColumn: (column: Column) => void; onAddColumn: () => void; onMove: (taskId: string, columnId: string, beforeId?: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [visibleColumn, setVisibleColumn] = useState(workspace.columns[0].id)
  const currentVisibleId = workspace.columns.some(column => column.id === visibleColumn) ? visibleColumn : workspace.columns[0].id
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return sortableKeyboardCoordinates(event, args)
    const { active, over, collisionRect } = args.context
    if (!active || !collisionRect) return undefined
    event.preventDefault()
    const overId = String(over?.id ?? '')
    const currentColumn = workspace.tasks.find(task => task.id === overId)?.columnId ?? workspace.columns.find(column => column.id === overId)?.id ?? active.data.current?.columnId
    const index = workspace.columns.findIndex(column => column.id === currentColumn)
    const next = workspace.columns[index + (event.code === 'ArrowRight' ? 1 : -1)]
    if (!next) return undefined
    const element = boardRef.current?.querySelector<HTMLElement>(`[data-column-id="${next.id}"]`)
    if (!element) return undefined
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const target = element.getBoundingClientRect()
    return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 68 }
  }
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }))
  const activeTask = workspace.tasks.find(task => task.id === activeId)
  function endDrag(event: DragEndEvent) {
    setActiveId(null)
    if (!event.over) return
    const targetId = String(event.over.id)
    const targetTask = workspace.tasks.find(task => task.id === targetId)
    const columnId = targetTask?.columnId ?? workspace.columns.find(column => column.id === targetId)?.id
    if (columnId) onMove(String(event.active.id), columnId, targetTask?.id)
  }
  return <>
    <div className="mobile-column-tabs" aria-label="Visa kolumn">{workspace.columns.map(column => <button className={`column-tab ${currentVisibleId === column.id ? 'active' : ''}`} aria-pressed={currentVisibleId === column.id} key={column.id} onClick={() => {
      setVisibleColumn(column.id)
      const element = boardRef.current?.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`)
      if (element && boardRef.current) boardRef.current.scrollTo({ left: element.offsetLeft - boardRef.current.offsetLeft, behavior: 'smooth' })
    }}>{column.title}<span>{tasks.filter(task => task.columnId === column.id).length}</span></button>)}</div>
    <DndContext sensors={sensors} collisionDetection={args => { const hits = pointerWithin(args); return hits.length ? hits : closestCorners(args) }} onDragStart={event => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={endDrag} accessibility={{ screenReaderInstructions: { draggable: 'Tryck mellanslag för att börja dra. Använd höger och vänster pil för att byta kolumn, upp och ner för ordning. Tryck mellanslag för att släppa eller Escape för att avbryta.' }, announcements: {
      onDragStart: ({ active }) => `Du lyfte ${workspace.tasks.find(task => task.id === active.id)?.title ?? 'uppgiften'}.`,
      onDragOver: ({ over }) => over ? `Över ${workspace.columns.find(column => column.id === over.id)?.title ?? workspace.columns.find(column => column.id === workspace.tasks.find(task => task.id === over.id)?.columnId)?.title ?? 'uppgiften'}.` : undefined,
      onDragEnd: ({ over }) => over ? 'Uppgiften är flyttad.' : 'Uppgiften behöll sin plats.',
      onDragCancel: () => 'Flytten avbröts.',
    } }}>
      <div className={`board ${workspace.columns.length > 3 ? 'board-many' : ''}`} ref={boardRef} onScroll={() => {
        const board = boardRef.current
        if (!board) return
        const cols = Array.from(board.querySelectorAll<HTMLElement>('[data-column-id]'))
        const nearest = cols.reduce<HTMLElement | null>((best, current) => !best || Math.abs(current.offsetLeft - board.offsetLeft - board.scrollLeft) < Math.abs(best.offsetLeft - board.offsetLeft - board.scrollLeft) ? current : best, null)
        if (nearest) setVisibleColumn(nearest.dataset.columnId!)
      }}>
        {workspace.columns.map(column => <BoardColumn key={column.id} column={column} tasks={tasks.filter(task => task.columnId === column.id)} workspace={workspace} onOpen={onOpen} onAdd={() => onAdd(column.id)} onEdit={() => onEditColumn(column)} />)}
        <button className="add-column" onClick={onAddColumn}><Plus size={20} /><span>Ny kolumn</span></button>
      </div>
      <DragOverlay>{activeTask && <div className="task-card drag-overlay"><CardContent task={activeTask} workspace={workspace} /></div>}</DragOverlay>
    </DndContext>
    <p className="board-hint"><GripVertical size={13} />Dra kort mellan kolumner.</p>
  </>
}
