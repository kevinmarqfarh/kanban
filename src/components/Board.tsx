import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, MeasuringStrategy, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable, closestCorners, pointerWithin, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent,
  type DropAnimation, type KeyboardCoordinateGetter, type UniqueIdentifier, defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import { SortableContext, defaultAnimateLayoutChanges, useSortable, sortableKeyboardCoordinates, type AnimateLayoutChanges, type SortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, GripVertical, CalendarDays, ListChecks, MessageSquare, Pencil, CircleCheck } from 'lucide-react'
import type { Column, Task, Workspace } from '../lib/types'
import { dateLabel, isTaskDone, overdue, priorityLabel } from '../lib/helpers'

type Layout = Record<string, string[]>

// Cards are reordered in the live layout itself, so siblings need no extra sorting offsets; instead every
// position change glides into place.
const liveLayoutStrategy: SortingStrategy = () => null
const animateLayoutChanges: AnimateLayoutChanges = args => defaultAnimateLayoutChanges({ ...args, wasDragging: true })

const dropAnimation: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.35' } } }),
}

function CardContent({ task, workspace }: { task: Task; workspace: Workspace }) {
  const checklistDone = task.checklist.filter(item => item.completed).length
  return <>
    {(task.priority || task.labels.length > 0) && <div className="task-labels">{task.priority && <span className="priority-chip" data-priority={task.priority} aria-label={`Prioritet ${priorityLabel(task.priority)}`}>{priorityLabel(task.priority)}</span>}{task.labels.slice(0, 3).map(label => <span className="label-chip" key={label}>{label}</span>)}</div>}
    <h3 className="task-title">{task.title}</h3>
    {task.description && <p className="task-description">{task.description}</p>}
    {(task.deadline || task.checklist.length > 0 || task.comments.length > 0) && <div className="task-meta">
      {task.deadline && <span className={`task-meta-item date-chip ${overdue(task, workspace) ? 'deadline-overdue' : ''}`}><CalendarDays size={13} />{dateLabel(task.deadline, task.deadlineTime)}</span>}
      {task.checklist.length > 0 && <span className="task-meta-item"><ListChecks size={14} />{checklistDone}/{task.checklist.length}</span>}
      {task.comments.length > 0 && <span className="task-meta-item"><MessageSquare size={13} />{task.comments.length}</span>}
    </div>}
  </>
}

const TaskCard = memo(function TaskCard({ task, workspace, onOpen }: { task: Task; workspace: Workspace; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { columnId: task.columnId, type: 'task' }, animateLayoutChanges, transition: { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' } })
  return <article ref={setNodeRef} className={`task-card ${isTaskDone(task, workspace) ? 'task-complete' : ''} ${isDragging ? 'is-dragging' : ''}`} data-task-id={task.id} data-priority={task.priority ?? undefined} style={{ transform: CSS.Translate.toString(transform), transition }}>
    <button className="task-open" onClick={() => onOpen(task)} aria-label={`Öppna ${task.title}`}><CardContent task={task} workspace={workspace} /></button>
    <button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners} aria-label={`Dra ${task.title}`} title="Dra för att flytta · mellanslag + piltangenter"><GripVertical size={16} /></button>
  </article>
})

function BoardColumn({ column, tasks, workspace, onOpen, onAdd, onEdit, onToggleHide }: {
  column: Column; tasks: Task[]; workspace: Workspace; onOpen: (task: Task) => void; onAdd: () => void; onEdit: () => void; onToggleHide: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column' } })
  return <section ref={setNodeRef} className={`column ${isOver ? 'column-over' : ''}`} data-column-id={column.id} aria-label={column.title}>
    <div className="column-header"><div className="column-title"><span className="status-dot" data-status={column.id} /><h2>{column.title}</h2><span className="count-badge">{tasks.length}</span></div><div className="column-actions">{column.id === 'finalized' && <button className="button ghost small" aria-label={column.collapsed ? 'Show Finalized' : 'Hide Finalized'} aria-expanded={!column.collapsed} onClick={onToggleHide}>{column.collapsed ? 'Show' : 'Hide'}</button>}<button className="icon-button" aria-label={`Redigera kolumn ${column.title}`} onClick={onEdit}><Pencil size={14} /></button></div></div>
    {column.collapsed ? <div className="column-empty"><CircleCheck size={22} strokeWidth={1.25} /><p>{tasks.length} kort dolda.</p><p>Dra kort hit för att avsluta.</p></div> : <><SortableContext items={tasks.map(task => task.id)} strategy={liveLayoutStrategy}>
      <div className="task-list">{tasks.map(task => <TaskCard key={task.id} task={task} workspace={workspace} onOpen={onOpen} />)}
        {tasks.length === 0 && <div className="column-empty"><CircleCheck size={22} strokeWidth={1.25} /><p>Inga uppgifter.</p></div>}
      </div>
    </SortableContext>
    <button className="add-task" onClick={onAdd}><Plus size={16} /> Lägg till uppgift</button>
    </>}
  </section>
}

export function Board({ workspace, tasks, onOpen, onAdd, onEditColumn, onAddColumn, onMove, onToggleHide }: {
  workspace: Workspace; tasks: Task[]; onOpen: (task: Task) => void; onAdd: (columnId: string) => void;
  onEditColumn: (column: Column) => void; onAddColumn: () => void; onMove: (taskId: string, columnId: string, beforeId?: string) => void;
  onToggleHide: (columnId: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const keyboardColumn = useRef<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  // While dragging, cards move between columns live in this local layout; it is saved once on drop.
  const [layout, setLayout] = useState<Layout | null>(null)
  const layoutRef = useRef<Layout | null>(null)
  const startColumn = useRef<string | null>(null)
  const [visibleColumn, setVisibleColumn] = useState(workspace.columns[0].id)
  const scrollFrame = useRef(0)
  const currentVisibleId = workspace.columns.some(column => column.id === visibleColumn) ? visibleColumn : workspace.columns[0].id
  const byId = new Map(tasks.map(task => [task.id, task]))
  const baseLayout = (): Layout => Object.fromEntries(workspace.columns.map(column => [column.id, tasks.filter(task => task.columnId === column.id).map(task => task.id)]))
  const view = layout ?? baseLayout()
  const columnOf = (id: UniqueIdentifier, source: Layout = layoutRef.current ?? view) => {
    const key = String(id)
    if (key in source) return key
    return Object.keys(source).find(columnId => source[columnId].includes(key))
  }
  function setDragLayout(next: Layout | null) { layoutRef.current = next; setLayout(next) }

  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') {
      keyboardColumn.current = null
      return sortableKeyboardCoordinates(event, args)
    }
    const { active, over, collisionRect } = args.context
    if (!active || !collisionRect) return undefined
    event.preventDefault()
    const currentColumn = columnOf(over?.id ?? active.id) ?? active.data.current?.columnId
    const index = workspace.columns.findIndex(column => column.id === currentColumn)
    const next = workspace.columns[index + (event.code === 'ArrowRight' ? 1 : -1)]
    if (!next) return undefined
    const element = boardRef.current?.querySelector<HTMLElement>(`[data-column-id="${next.id}"]`)
    if (!element) return undefined
    keyboardColumn.current = next.id
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const target = element.getBoundingClientRect()
    return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 68 }
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short hold on the handle starts the drag; small finger jitter is tolerated.
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  )
  // Hit-testing uses what is actually under the finger/cursor (elementsFromPoint). dnd-kit's cached rectangles
  // go stale while the board scrolls sideways, which made cards land in the wrong column on phones.
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const collision: CollisionDetection = useCallback(args => {
    if (!args.pointerCoordinates && keyboardColumn.current) return [{ id: keyboardColumn.current }]
    if (!args.pointerCoordinates) return closestCorners(args)
    const { x, y } = args.pointerCoordinates
    pointer.current = { x, y }
    const active = String(args.active.id)
    let column: string | undefined
    for (const element of document.elementsFromPoint(x, y)) {
      if (element.closest('.drag-overlay')) continue
      const card = element.closest<HTMLElement>('[data-task-id]')
      if (card && card.dataset.taskId !== active && card.closest('.board')) return [{ id: card.dataset.taskId! }]
      column ??= element.closest<HTMLElement>('[data-column-id]')?.dataset.columnId
    }
    if (column) return [{ id: column }]
    const hits = pointerWithin(args)
    return hits.length ? hits : []
  }, [])

  function startDrag({ active }: DragStartEvent) {
    keyboardColumn.current = null
    pointer.current = null
    const start = baseLayout()
    startColumn.current = columnOf(active.id, start) ?? null
    setDragLayout(start)
    setActiveId(String(active.id))
    if (typeof navigator.vibrate === 'function') navigator.vibrate(8)
  }
  /**
   * Place the dragged card in the column under the finger/cursor. For pointer drags the slot is the number of
   * other cards whose middle lies above the pointer, so moving above or below a card is decided by its midpoint
   * and re-checked on every movement (not only when the hovered card changes). Keyboard drags step card by card.
   */
  function reposition(activeKey: UniqueIdentifier, overKey: UniqueIdentifier | undefined) {
    const current = layoutRef.current
    if (!current || overKey === undefined) return
    const id = String(activeKey)
    if (String(overKey) === id) return // Over its own slot: nothing to do (and never loop).
    const from = columnOf(id, current), to = columnOf(overKey, current)
    if (!from || !to) return
    const without = current[to].filter(item => item !== id)
    let index: number
    if (pointer.current) {
      const cards = Array.from(boardRef.current?.querySelectorAll<HTMLElement>(`[data-column-id="${to}"] [data-task-id]`) ?? []).filter(card => card.dataset.taskId !== id)
      index = cards.filter(card => { const box = card.getBoundingClientRect(); return box.top + box.height / 2 < pointer.current!.y }).length
    } else {
      const overIndex = without.indexOf(String(overKey))
      const activeIndex = current[to].indexOf(id)
      index = overIndex < 0 ? without.length : from === to && activeIndex >= 0 && activeIndex <= overIndex ? overIndex + 1 : overIndex
    }
    const nextTo = [...without.slice(0, index), id, ...without.slice(index)]
    if (from === to && nextTo.join() === current[to].join()) return
    setDragLayout({ ...current, ...(from === to ? {} : { [from]: current[from].filter(item => item !== id) }), [to]: nextTo })
  }
  function dragOver({ active, over }: DragOverEvent) { reposition(active.id, over?.id) }
  function endDrag({ active, over }: DragEndEvent) {
    keyboardColumn.current = null
    stopEdge()
    const current = layoutRef.current
    const original = startColumn.current
    setActiveId(null); setDragLayout(null); startColumn.current = null
    if (!current || !over) return
    const id = String(active.id)
    const column = columnOf(id, current)
    if (!column) return
    // The live layout is exactly what is shown, for pointer and keyboard drags alike.
    const list = current[column]
    const position = list.indexOf(id)
    const before = list[position + 1]
    const unchanged = column === original && (byId.get(id) && baseLayout()[column].join() === list.join())
    if (!unchanged) onMove(id, column, before)
  }
  function cancelDrag() { stopEdge(); keyboardColumn.current = null; setActiveId(null); setDragLayout(null); startColumn.current = null }

  // Edge paging: holding a card near the board's left/right edge glides exactly one column, then waits,
  // instead of continuous auto-scroll that races past the column you aimed for.
  const edge = useRef<{ side: -1 | 0 | 1; timer: number }>({ side: 0, timer: 0 })
  function stopEdge() { window.clearTimeout(edge.current.timer); edge.current = { side: 0, timer: 0 } }
  function pageColumn(side: -1 | 1) {
    const board = boardRef.current
    if (!board) return
    const columns = Array.from(board.querySelectorAll<HTMLElement>('[data-column-id]'))
    const left = board.scrollLeft
    const offsets = columns.map(column => column.offsetLeft - board.offsetLeft - parseFloat(getComputedStyle(board).paddingLeft || '0'))
    const current = offsets.reduce((best, offset, index) => Math.abs(offset - left) < Math.abs(offsets[best] - left) ? index : best, 0)
    const target = offsets[Math.max(0, Math.min(offsets.length - 1, current + side))]
    if (target === undefined || Math.abs(target - left) < 2) return
    board.scrollTo({ left: target, behavior: 'smooth' })
    setVisibleColumn(columns[Math.max(0, Math.min(columns.length - 1, current + side))].dataset.columnId!)
  }
  function dragMove({ active, over }: DragMoveEvent) {
    if (pointer.current && over) reposition(active.id, over.id)
    const board = boardRef.current
    // Raw finger position from hit-testing; dnd-kit's delta also counts the board's own scroll.
    if (!board || !pointer.current || board.scrollWidth <= board.clientWidth + 4) return
    const x = pointer.current.x
    const box = board.getBoundingClientRect()
    const zone = Math.min(56, box.width * 0.14)
    const side: -1 | 0 | 1 = x > box.right - zone ? 1 : x < box.left + zone ? -1 : 0
    if (side === edge.current.side) return
    stopEdge()
    if (!side) return
    const repeat = (delay: number) => { edge.current = { side, timer: window.setTimeout(() => { pageColumn(side); repeat(900) }, delay) } }
    repeat(450)
  }
  useEffect(() => stopEdge, [])
  // Track which column is in view for the phone tabs, at most once per frame and never while dragging.
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [])
  function boardScrolled() {
    if (activeId || scrollFrame.current) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0
      const board = boardRef.current
      if (!board) return
      const cols = Array.from(board.querySelectorAll<HTMLElement>('[data-column-id]'))
      const nearest = cols.reduce<HTMLElement | null>((best, current) => !best || Math.abs(current.offsetLeft - board.offsetLeft - board.scrollLeft) < Math.abs(best.offsetLeft - board.offsetLeft - board.scrollLeft) ? current : best, null)
      if (nearest && nearest.dataset.columnId !== visibleColumn) setVisibleColumn(nearest.dataset.columnId!)
    })
  }
  const activeTask = activeId ? byId.get(activeId) : undefined
  return <>
    <div className="mobile-column-tabs" aria-label="Visa kolumn">{workspace.columns.map(column => <button className={`column-tab ${currentVisibleId === column.id ? 'active' : ''}`} aria-pressed={currentVisibleId === column.id} key={column.id} onClick={() => {
      setVisibleColumn(column.id)
      const element = boardRef.current?.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`)
      if (element && boardRef.current) boardRef.current.scrollTo({ left: element.offsetLeft - boardRef.current.offsetLeft, behavior: 'smooth' })
    }}>{column.title}<span>{(view[column.id] ?? []).length}</span></button>)}</div>
    <DndContext sensors={sensors} collisionDetection={collision} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ threshold: { x: 0.16, y: 0.12 }, acceleration: 7, canScroll: element => element !== boardRef.current }}
      onDragStart={startDrag} onDragMove={dragMove} onDragOver={dragOver} onDragCancel={cancelDrag} onDragEnd={endDrag} accessibility={{ screenReaderInstructions: { draggable: 'Tryck mellanslag för att börja dra. Använd höger och vänster pil för att byta kolumn, upp och ner för ordning. Tryck mellanslag för att släppa eller Escape för att avbryta.' }, announcements: {
      onDragStart: ({ active }) => `Du lyfte ${byId.get(String(active.id))?.title ?? 'uppgiften'}.`,
      onDragOver: ({ over }) => { const column = over ? workspace.columns.find(item => item.id === columnOf(over.id)) : undefined; return column ? `Över ${column.title}.` : undefined },
      onDragEnd: ({ over }) => over ? 'Uppgiften är flyttad.' : 'Uppgiften behöll sin plats.',
      onDragCancel: () => 'Flytten avbröts.',
    } }}>
      <div className={`board ${workspace.columns.length > 3 ? 'board-many' : ''} ${activeId ? 'board-dragging' : ''}`} ref={boardRef} onScroll={boardScrolled}>
        {workspace.columns.map(column => <BoardColumn key={column.id} column={column} tasks={(view[column.id] ?? []).map(id => byId.get(id)).filter((task): task is Task => !!task)} workspace={workspace} onOpen={onOpen} onAdd={() => onAdd(column.id)} onEdit={() => onEditColumn(column)} onToggleHide={() => onToggleHide(column.id)} />)}
        <button className="add-column" onClick={onAddColumn}><Plus size={20} /><span>Ny kolumn</span></button>
      </div>
      <DragOverlay dropAnimation={dropAnimation}>{activeTask && <div className="task-card drag-overlay" data-priority={activeTask.priority ?? undefined}><CardContent task={activeTask} workspace={workspace} /></div>}</DragOverlay>
    </DndContext>
    <p className="board-hint"><GripVertical size={13} />Dra kort mellan kolumner.</p>
  </>
}
