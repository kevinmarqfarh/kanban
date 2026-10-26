import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, subtitle, children, onClose, footer, error, wide = false, phoneFullscreen = false, initialFocusRef, focusForm = true, dirty = false, className = '' }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; footer?: ReactNode | ((requestClose: () => void) => ReactNode); error?: string | null;
  focusForm?: boolean; dirty?: boolean; wide?: boolean; phoneFullscreen?: boolean; initialFocusRef?: RefObject<HTMLInputElement | null>; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [confirming, setConfirming] = useState(false)
  const continueRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  function requestClose() {
    if (confirming) { setConfirming(false); return }
    if (!dirty) { onClose(); return }
    returnFocusRef.current = document.activeElement as HTMLElement | null
    setConfirming(true)
  }
  useEffect(() => {
    if (confirming) continueRef.current?.focus()
    else if (returnFocusRef.current?.isConnected) { returnFocusRef.current.focus(); returnFocusRef.current = null }
  }, [confirming])
  const closeRef = useRef(requestClose)
  closeRef.current = requestClose
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
    const target = initialFocusRef?.current ?? dialog.querySelector<HTMLElement>(focusForm
      ? 'form input:not([disabled]), form textarea:not([disabled]), form select:not([disabled])'
      : '.modal-header button')
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
  // Only a press that both starts and ends on the backdrop closes the sheet. A drag or text
  // selection that is released outside the panel keeps it open.
  const outside = (event: { target: EventTarget; clientX: number; clientY: number }) => {
    if (event.target !== ref.current) return false
    const rect = ref.current.getBoundingClientRect()
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
  }
  const pressedOutside = useRef(false)
  return <dialog ref={ref} className={`modal-panel${wide ? ' modal-wide' : ''}${phoneFullscreen ? ' modal-phone-fullscreen' : ''} ${className}`} aria-labelledby="modal-title" onCancel={event => {
    event.preventDefault(); closeRef.current()
  }} onPointerDown={event => { pressedOutside.current = outside(event) }} onClick={event => {
    const started = pressedOutside.current
    pressedOutside.current = false
    if (started && outside(event)) requestClose()
  }}>
    <div className="modal-header"><div>{subtitle && <p className="eyebrow">{subtitle}</p>}<h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="Stäng" onClick={requestClose}><X size={20} /></button></div>
    {confirming && <div className="modal-discard" role="alert" aria-label="Osparade ändringar"><h3>Osparade ändringar</h3><p>Vill du fortsätta redigera eller kasta ändringarna?</p><div className="discard-actions"><button ref={continueRef} className="button primary" type="button" onClick={() => setConfirming(false)}>Fortsätt redigera</button><button className="button secondary" type="button" onClick={onClose}>Kasta ändringar</button></div></div>}
    <div className="modal-content" hidden={confirming}>{children}</div>
    {!confirming && error && <p className="modal-error" role="alert">{error}</p>}
    {footer && <div className="modal-footer" hidden={confirming}>{typeof footer === 'function' ? footer(requestClose) : footer}</div>}
  </dialog>
}
