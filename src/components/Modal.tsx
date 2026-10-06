import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, subtitle, children, onClose, footer, error }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; error?: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current!
    dialog.showModal()
    dialog.querySelector<HTMLElement>('form input:not([disabled]), form textarea:not([disabled]), form select:not([disabled])')?.focus()
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = originalOverflow
      previous?.focus()
    }
  }, [])
  return <dialog ref={ref} className="modal-panel" aria-labelledby="modal-title" onCancel={event => {
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
