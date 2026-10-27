import { createContext, useCallback, useContext, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, RotateCcw, X } from 'lucide-react'
import { useDesktopLayout } from '../hooks/useDesktopLayout'
import { HomeModuleResizeHandles } from './HomeModuleResizeHandles'

const modules = ['summary', 'schedule', 'focus', 'stats', 'tips', 'weather', 'agenda', 'nutrition', 'birthdays'] as const
export type HomeModuleId = typeof modules[number]
type Size = { width: number; height: number }
type Layout = { order: HomeModuleId[]; sizes: Record<HomeModuleId, Size> }
const KEY = 'forma-home-layout-v1'
const defaultWidths: Record<HomeModuleId, number> = { summary: 8, schedule: 4, focus: 8, stats: 4, tips: 8, weather: 4, agenda: 12, nutrition: 6, birthdays: 6 }
const defaults = (): Layout => ({ order: [...modules], sizes: Object.fromEntries(modules.map(id => [id, { width: defaultWidths[id], height: 0 }])) as Layout['sizes'] })
function read(): Layout {
  const fallback = defaults()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!saved || !Array.isArray(saved.order)) return fallback
    const order = [...new Set<HomeModuleId>(saved.order.filter((id: HomeModuleId) => modules.includes(id)))]
    fallback.order = [...order, ...modules.filter(id => !order.includes(id))]
    for (const id of modules) {
      const size = saved.sizes?.[id]
      if (size && Number.isInteger(size.width) && size.width >= 4 && size.width <= 12
        && Number.isInteger(size.height) && (size.height === 0 || (size.height >= 160 && size.height <= 960))) fallback.sizes[id] = size
    }
  } catch { /* A damaged preference must never block Home. */ }
  return fallback
}
const Context = createContext<{ enabled: boolean; editing: boolean; layout: Layout; helpId: string; resize: (id: HomeModuleId, size: Size) => void; move: (id: HomeModuleId, step: number) => void } | null>(null)
const collision: CollisionDetection = args => { const hits = pointerWithin(args); return hits.length ? hits : args.pointerCoordinates ? [] : closestCenter(args) }

export function HomeLayout({ children }: { children: ReactNode }) {
  const enabled = useDesktopLayout()
  const [saved, setSaved] = useState(read)
  const [draft, setDraft] = useState(saved)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState<{ id: string; label: string } | null>(null)
  const helpId = useId()
  const active = enabled && editing
  const layout = active ? draft : saved
  const layoutRef = useRef(layout); layoutRef.current = layout
  const keyboardTarget = useRef<HomeModuleId | null>(null)
  // Keyboard movement follows the visible module order, regardless of different widths/heights or preview size.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    if (!context.active || !['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) return
    event.preventDefault()
    const visible = layoutRef.current.order.filter(id => {
      const item = context.droppableContainers.get(id)
      return item && !item.disabled && item.node.current && context.droppableRects.has(id)
    })
    const current = keyboardTarget.current ?? String(context.over?.id ?? context.active.id) as HomeModuleId
    const index = visible.indexOf(current)
    const next = visible[index + (event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 1)]
    const rect = next && context.droppableRects.get(next)
    if (!rect) return
    keyboardTarget.current = next
    return { x: rect.left, y: rect.top }
  }
  const detectCollision = useCallback<CollisionDetection>(args => !args.pointerCoordinates && keyboardTarget.current ? [{ id: keyboardTarget.current }] : collision(args), [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }))
  function move(id: HomeModuleId, step: number) {
    setDraft(current => { const from = current.order.indexOf(id); const to = Math.max(0, Math.min(current.order.length - 1, from + step)); return { ...current, order: arrayMove(current.order, from, to) } })
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(draft)); setSaved(draft); setEditing(false); setError('') }
    catch { setError('Kunde inte spara layouten på enheten. Försök igen.') }
  }
  return <Context.Provider value={{ enabled, editing: active, layout, helpId, move, resize: (id, size) => setDraft(current => current.sizes[id].width === size.width && current.sizes[id].height === size.height ? current : { ...current, sizes: { ...current.sizes, [id]: size } }) }}>
    <DndContext sensors={sensors} collisionDetection={detectCollision} onDragStart={({ active, activatorEvent }) => { keyboardTarget.current = activatorEvent instanceof KeyboardEvent ? active.id as HomeModuleId : null; setDragging({ id: String(active.id), label: String(active.data.current?.label ?? active.id) }) }} onDragCancel={() => { keyboardTarget.current = null; setDragging(null) }} onDragEnd={({ active, over }) => {
      keyboardTarget.current = null
      setDragging(null)
      if (!over || active.id === over.id) return
      setDraft(current => {
        const from = current.order.indexOf(active.id as HomeModuleId), to = current.order.indexOf(over.id as HomeModuleId)
        return from < 0 || to < 0 ? current : { ...current, order: arrayMove(current.order, from, to) }
      })
    }} accessibility={{ screenReaderInstructions: { draggable: 'Tryck mellanslag för att lyfta modulen. Upp eller vänster väljer en tidigare plats; ner eller höger väljer en senare. Tryck mellanslag för att släppa eller Escape för att avbryta.' }, announcements: {
      onDragStart: ({ active }) => `${active.data.current?.label ?? active.id} lyft.`,
      onDragOver: ({ over }) => over ? `Släpp vid ${over.data.current?.label ?? over.id}.` : 'Flytta pekaren över en modul.',
      onDragEnd: ({ over }) => over ? 'Modulen är flyttad. Välj Spara layout för att behålla ändringen.' : 'Flytten avbröts.',
      onDragCancel: () => 'Flytten avbröts.',
    } }}>
      <SortableContext items={layout.order} strategy={rectSortingStrategy}>
        <div className={`home-page${enabled ? ' home-custom-grid' : ''}${active ? ' home-layout-editing' : ''}`} data-testid="home-overview">
          {enabled && <div className="home-layout-toolbar">
            <div><strong>{active ? 'Anpassa Home' : 'Din översikt'}</strong>{active && <p id={helpId}>Dra i modulens rubrik för att flytta. Dra i kanten eller hörnet för att ändra storlek. Piltangenter fungerar också när handtaget har fokus.</p>}</div>
            <div className="home-layout-actions">{active ? <>
              <button className="button ghost" onClick={() => setDraft(defaults())}><RotateCcw size={15} />Återställ</button>
              <button className="button secondary" onClick={() => { setEditing(false); setError('') }}><X size={15} />Avbryt</button>
              <button className="button primary" onClick={save}><Check size={15} />Spara layout</button>
            </> : <button className="button secondary" onClick={() => { setDraft(saved); setEditing(true) }}><Pencil size={15} />Edit Home</button>}</div>
            {error && <p role="alert">{error}</p>}
          </div>}
          {children}
        </div>
      </SortableContext>
      {createPortal(<DragOverlay dropAnimation={null}>{dragging && <div className="home-module-drag-preview" aria-hidden="true"><GripVertical size={20} /><div><strong>{dragging.label}</strong><span>Släpp på önskad plats</span></div></div>}</DragOverlay>, document.body)}
    </DndContext>
  </Context.Provider>
}

export function HomeModule({ id, label, children }: { id: HomeModuleId; label: string; children: ReactNode }) {
  const context = useContext(Context)
  const moduleRef = useRef<HTMLElement | null>(null)
  const [resizing, setResizing] = useState(false)
  const sortable = useSortable({ id, data: { label }, disabled: !context?.editing })
  const setNodeRef = useCallback((node: HTMLElement | null) => { moduleRef.current = node; sortable.setNodeRef(node) }, [sortable.setNodeRef])
  if (!context?.enabled) return <>{children}</>
  const { layout, editing, helpId, resize, move } = context
  const size = layout.sizes[id]
  return <section ref={setNodeRef} className={`home-module${sortable.isDragging ? ' is-dragging' : ''}${sortable.isOver && !sortable.isDragging ? ' is-drop-target' : ''}${resizing ? ' is-resizing' : ''}`} aria-label={label} data-module={id} data-height={size.height || 'auto'} style={{ order: layout.order.indexOf(id), '--module-columns': size.width, '--module-height': `${size.height}px`, transform: sortable.isDragging ? undefined : CSS.Transform.toString(sortable.transform), transition: resizing ? undefined : sortable.transition } as CSSProperties}>
    {editing && <div className="home-module-editor">
      <div className="home-module-title"><button className="home-module-grip" type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} aria-label={`Flytta ${label}`} aria-describedby={`${sortable.attributes['aria-describedby']} ${helpId}`}><GripVertical size={18} /><strong>{label}</strong></button>
        <button className="icon-button" aria-label={`Flytta ${label} tidigare`} onClick={() => move(id, -1)}><ArrowUp size={14} /></button>
        <button className="icon-button" aria-label={`Flytta ${label} senare`} onClick={() => move(id, 1)}><ArrowDown size={14} /></button>
      </div>
      <div className="home-module-sizes"><label>Bredd<select aria-label={`Bredd för ${label}`} value={size.width} onChange={event => resize(id, { ...size, width: Number(event.target.value) })}>{Array.from({ length: 9 }, (_, index) => index + 4).map(width => <option key={width} value={width}>{width === 12 ? 'Hel bredd' : `${width} av 12 kolumner`}</option>)}</select></label>
        <label>Höjd<select aria-label={`Höjd för ${label}`} value={size.height} onChange={event => resize(id, { ...size, height: Number(event.target.value) })}><option value={0}>Automatisk</option><option value={240}>Liten · 240 px</option><option value={360}>Mellan · 360 px</option><option value={520}>Stor · 520 px</option>{![0, 240, 360, 520].includes(size.height) && <option value={size.height}>{size.height} px</option>}</select></label></div>
    </div>}
    <div className="home-module-content" inert={editing}>{children}</div>
    {editing && <><span className="home-module-size-readout" aria-hidden="true">{size.width}/12 · {size.height ? `${size.height} px` : 'Auto'}</span><HomeModuleResizeHandles label={label} size={size} moduleRef={moduleRef} helpId={helpId} onResize={next => resize(id, next)} onActiveChange={setResizing} /></>}
  </section>
}
