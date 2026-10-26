import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, RotateCcw, X } from 'lucide-react'
import { useDesktopLayout } from '../hooks/useDesktopLayout'

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
      if (size && [4, 6, 8, 12].includes(size.width) && [0, 240, 360, 520].includes(size.height)) fallback.sizes[id] = size
    }
  } catch { /* A damaged preference must never block Home. */ }
  return fallback
}
const Context = createContext<{ enabled: boolean; editing: boolean; layout: Layout; resize: (id: HomeModuleId, size: Size) => void; move: (id: HomeModuleId, step: number) => void } | null>(null)

export function HomeLayout({ children }: { children: ReactNode }) {
  const enabled = useDesktopLayout()
  const [saved, setSaved] = useState(read)
  const [draft, setDraft] = useState(saved)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const active = enabled && editing
  const layout = active ? draft : saved
  function move(id: HomeModuleId, step: number) {
    setDraft(current => { const from = current.order.indexOf(id); const to = Math.max(0, Math.min(current.order.length - 1, from + step)); return { ...current, order: arrayMove(current.order, from, to) } })
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(draft)); setSaved(draft); setEditing(false); setError('') }
    catch { setError('Kunde inte spara layouten på enheten. Försök igen.') }
  }
  return <Context.Provider value={{ enabled, editing: active, layout, move, resize: (id, size) => setDraft(current => ({ ...current, sizes: { ...current.sizes, [id]: size } })) }}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
      if (!over || active.id === over.id) return
      setDraft(current => ({ ...current, order: arrayMove(current.order, current.order.indexOf(active.id as HomeModuleId), current.order.indexOf(over.id as HomeModuleId)) }))
    }}>
      <SortableContext items={layout.order} strategy={rectSortingStrategy}>
        <div className={`home-page${enabled ? ' home-custom-grid' : ''}${active ? ' home-layout-editing' : ''}`} data-testid="home-overview">
          {enabled && <div className="home-layout-toolbar">
            <div><strong>{active ? 'Anpassa Home' : 'Din översikt'}</strong>{active && <p>Dra i handtaget för att flytta. Välj bredd och höjd för varje modul.</p>}</div>
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
    </DndContext>
  </Context.Provider>
}

export function HomeModule({ id, label, children }: { id: HomeModuleId; label: string; children: ReactNode }) {
  const context = useContext(Context)
  const sortable = useSortable({ id, disabled: !context?.editing })
  if (!context?.enabled) return <>{children}</>
  const { layout, editing, resize, move } = context
  const size = layout.sizes[id]
  return <section ref={sortable.setNodeRef} className={`home-module${sortable.isDragging ? ' is-dragging' : ''}`} aria-label={label} data-module={id} data-height={size.height || 'auto'} style={{ order: layout.order.indexOf(id), '--module-columns': size.width, '--module-height': `${size.height}px`, transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition } as CSSProperties}>
    {editing && <div className="home-module-editor">
      <div className="home-module-title"><button className="icon-button home-module-grip" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} aria-label={`Flytta ${label}`}><GripVertical size={18} /></button><strong>{label}</strong>
        <button className="icon-button" aria-label={`Flytta ${label} tidigare`} onClick={() => move(id, -1)}><ArrowUp size={14} /></button>
        <button className="icon-button" aria-label={`Flytta ${label} senare`} onClick={() => move(id, 1)}><ArrowDown size={14} /></button>
      </div>
      <div className="home-module-sizes"><label>Bredd<select aria-label={`Bredd för ${label}`} value={size.width} onChange={event => resize(id, { ...size, width: Number(event.target.value) })}><option value={4}>⅓ · 4 kolumner</option><option value={6}>½ · 6 kolumner</option><option value={8}>⅔ · 8 kolumner</option><option value={12}>Hel · 12 kolumner</option></select></label>
        <label>Höjd<select aria-label={`Höjd för ${label}`} value={size.height} onChange={event => resize(id, { ...size, height: Number(event.target.value) })}><option value={0}>Automatisk</option><option value={240}>Liten</option><option value={360}>Mellan</option><option value={520}>Stor</option></select></label></div>
    </div>}
    <div className="home-module-content">{children}</div>
  </section>
}
