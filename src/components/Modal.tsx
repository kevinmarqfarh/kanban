import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, subtitle, children, onClose, footer, error, wide = false, initialFocusRef }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; error?: string | null;
  wide?: boolean; initialFocusRef?: RefObject<HTMLInputElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    dialog.showModal()
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const viewport = window.visualViewport
    let frame = 0
    const keepFocusedFieldVisible = () => {
      const content = dialog.querySelector<HTMLElement>('.modal-content')
      const active = document.activeElement as HTMLElement | null
      if (!content || !active || !content.contains(active)) return
      const field = active.getBoundingClientRect()
      const area = content.getBoundingClientRect()
      if (field.bottom > area.bottom - 8) content.scrollTop += field.bottom - area.bottom + 8
      else if (field.top < area.top + 8) content.scrollTop -= area.top - field.top + 8
    }
    const updateViewport = () => {
      // Keep manual pinch zoom available; resizing the sheet while zooming fights it.
      if (viewport && viewport.scale > 1.02) return
      const height = viewport?.height ?? window.innerHeight
      const bottomInset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0))
      dialog.style.setProperty('--modal-visible-height', `${height}px`)
      dialog.style.setProperty('--modal-bottom-inset', `${bottomInset}px`)
    }
    const resized = () => {
      updateViewport()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(keepFocusedFieldVisible)
    }
    updateViewport()
    viewport?.addEventListener('resize', resized)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', resized)
    dialog.addEventListener('focusin', resized)
    const target = initialFocusRef?.current ?? dialog.querySelector<HTMLElement>('form input:not([disabled]), form textarea:not([disabled]), form select:not([disabled])')
    target?.focus({ preventScroll: true })
    return () => {
      cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', resized)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', resized)
      dialog.removeEventListener('focusin', resized)
      dialog.close()
      document.body.style.overflow = originalOverflow
      previous?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} className={`modal-panel${wide ? ' modal-wide' : ''}`} aria-labelledby="modal-title" onCancel={event => {
    event.preventDefault(); closeRef.current()
  }} onClick={event => {
    if (event.target !== ref.current) return
    const rect = ref.current.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
  }}>
    <div className="modal-header"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="Stäng" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-content">{children}</div>
    {error && <p className="modal-error" role="alert">{error}</p>}
    {footer && <div className="modal-footer">{footer}</div>}
  </dialog>
}
