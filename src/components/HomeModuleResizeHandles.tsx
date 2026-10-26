import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { MoveDiagonal2 } from 'lucide-react'

type Size = { width: number; height: number }
type Axis = 'width' | 'height' | 'both'
interface ResizeGesture {
  pointerId: number
  handle: HTMLButtonElement
  axis: Axis
  x: number
  y: number
  moduleWidth: number
  contentHeight: number
  columnStep: number
  gap: number
  before: Size
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function HomeModuleResizeHandles({ label, size, moduleRef, helpId, onResize, onActiveChange }: {
  label: string
  size: Size
  moduleRef: RefObject<HTMLElement | null>
  helpId: string
  onResize: (size: Size) => void
  onActiveChange: (active: boolean) => void
}) {
  const gesture = useRef<ResizeGesture | null>(null)
  function release(current: ResizeGesture) {
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId)
  }
  function finish(cancelled: boolean) {
    const current = gesture.current
    gesture.current = null
    if (!current) return
    if (cancelled) onResize(current.before)
    onActiveChange(false)
    release(current)
  }
  useEffect(() => {
    const blur = () => finish(true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('blur', blur)
      const current = gesture.current
      gesture.current = null
      if (current) { release(current); onActiveChange(false) }
    }
  }, [])
  function start(event: PointerEvent<HTMLButtonElement>, axis: Axis) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return
    const module = moduleRef.current
    const grid = module?.closest<HTMLElement>('.home-custom-grid')
    const content = module?.querySelector<HTMLElement>('.home-module-content')
    if (!module || !grid || !content) return
    event.preventDefault(); event.stopPropagation()
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const handle = event.currentTarget
    gesture.current = {
      pointerId: event.pointerId, handle, axis, x: event.clientX, y: event.clientY,
      moduleWidth: module.getBoundingClientRect().width, contentHeight: content.getBoundingClientRect().height,
      columnStep: (grid.clientWidth + gap) / 12, gap, before: { ...size },
    }
    handle.focus({ preventScroll: true })
    try { handle.setPointerCapture(event.pointerId) } catch { gesture.current = null; return }
    onActiveChange(true)
  }
  function update(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current
    if (!current || event.pointerId !== current.pointerId) return
    event.preventDefault(); event.stopPropagation()
    const dx = event.clientX - current.x, dy = event.clientY - current.y
    const width = current.axis !== 'height'
      ? clamp(Math.round((current.moduleWidth + dx + current.gap) / current.columnStep), 4, 12)
      : current.before.width
    // Horizontal-only movement keeps an automatic height automatic.
    const height = current.axis !== 'width' && Math.abs(dy) >= 6
      ? clamp(Math.round((current.contentHeight + dy) / 20) * 20, 160, 960)
      : current.before.height
    onResize({ width, height })
  }
  function up(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return
    update(event)
    finish(false)
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, axis: Axis) {
    if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); finish(true); return }
    if (gesture.current || event.ctrlKey || event.altKey || event.metaKey) return
    const widthStep = axis !== 'height' && (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0)
    const heightStep = axis !== 'width' && (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0)
    if (!widthStep && !heightStep) return
    event.preventDefault(); event.stopPropagation()
    const currentHeight = size.height || moduleRef.current?.querySelector('.home-module-content')?.getBoundingClientRect().height || 240
    onResize({
      width: clamp(size.width + (widthStep || 0), 4, 12),
      height: heightStep ? clamp(Math.round((currentHeight + heightStep) / 20) * 20, 160, 960) : size.height,
    })
  }
  const handle = (axis: Axis, name: string) => <button key={axis} type="button" className={`home-module-resize home-module-resize-${axis}`} aria-label={name} aria-describedby={helpId} title={name}
    onPointerDown={event => start(event, axis)} onPointerMove={update} onPointerUp={up} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onKeyDown={event => key(event, axis)}>
    {axis === 'both' ? <MoveDiagonal2 size={17} aria-hidden="true" /> : <span aria-hidden="true" />}
  </button>
  return <>{handle('width', `Ändra bredd för ${label}`)}{handle('height', `Ändra höjd för ${label}`)}{handle('both', `Ändra storlek på ${label}`)}</>
}
