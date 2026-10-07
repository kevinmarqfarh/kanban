import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

const ACTION_WIDTH = 88
const OPEN_THRESHOLD = 44

/**
 * A list row that reveals a delete button when swiped from right to left (touch, pen or mouse drag).
 * Vertical scrolling is left to the browser; a tap on an open row closes it instead of opening it.
 */
export function SwipeRow({ open, onOpenChange, onDelete, deleteLabel, children, className = '' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  deleteLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const start = useRef<{ x: number; y: number; base: number; id: number } | null>(null)
  const mode = useRef<'idle' | 'swiping' | 'scrolling'>('idle')
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState<number | null>(null)
  const offset = drag ?? (open ? -ACTION_WIDTH : 0)
  useEffect(() => { if (!open) setDrag(null) }, [open])

  function down(event: PointerEvent<HTMLDivElement>) {
    // A swipe without a following click must not swallow the next real tap.
    suppressClick.current = false
    if (event.button !== 0 || (event.target as HTMLElement).closest('.swipe-row-action')) return
    start.current = { x: event.clientX, y: event.clientY, base: open ? -ACTION_WIDTH : 0, id: event.pointerId }
    mode.current = 'idle'
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current
    if (!origin || origin.id !== event.pointerId || mode.current === 'scrolling') return
    const dx = event.clientX - origin.x, dy = event.clientY - origin.y
    if (mode.current === 'idle') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dy) >= Math.abs(dx)) { mode.current = 'scrolling'; return }
      mode.current = 'swiping'
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    // Rubber-band slightly past the action so the gesture feels physical.
    const next = origin.base + dx
    setDrag(next > 0 ? next / 4 : next < -ACTION_WIDTH ? -ACTION_WIDTH + (next + ACTION_WIDTH) / 4 : next)
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current
    start.current = null
    if (!origin || origin.id !== event.pointerId) return
    if (mode.current === 'swiping') {
      suppressClick.current = true
      const current = drag ?? origin.base
      const shouldOpen = current < -OPEN_THRESHOLD
      setDrag(null)
      onOpenChange(shouldOpen)
    } else if (open && mode.current === 'idle') {
      // A tap on an open row closes it.
      suppressClick.current = true
      onOpenChange(false)
    }
    mode.current = 'idle'
  }
  function cancel() { start.current = null; mode.current = 'idle'; setDrag(null) }

  return <div className={`swipe-row${className ? ` ${className}` : ''}${offset < 0 ? ' is-revealed' : ''}${drag !== null ? ' is-dragging' : ''}`}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation() } }}
    onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); onOpenChange(false) } }}>
    <div className="swipe-row-action" aria-hidden={!open}>
      <button type="button" tabIndex={open ? 0 : -1} aria-label={deleteLabel} onClick={onDelete}><Trash2 size={18} /><span>Ta bort</span></button>
    </div>
    <div className="swipe-row-content" style={{ transform: offset ? `translateX(${offset}px)` : undefined }}>{children}</div>
  </div>
}
