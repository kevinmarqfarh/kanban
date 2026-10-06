import { useState, type KeyboardEvent } from 'react'
import { Check, Plus } from 'lucide-react'

/**
 * An inline "+ Lägg till tagg" chip that turns into a small text box.
 * Enter or leaving the box adds the tag; Escape cancels without closing the surrounding dialog.
 */
export function TagAdder({ label, placeholder = 'Ny tagg', maxLength = 40, onAdd }: {
  label: string;
  placeholder?: string;
  maxLength?: number;
  onAdd: (value: string) => void;
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  function commit() {
    const text = value.replace(/\s+/g, ' ').trim()
    if (text) onAdd(text)
    setValue('')
    setOpen(false)
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); commit() }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setValue(''); setOpen(false) }
  }
  if (!open) return <button className="tag-chip tag-chip-add" type="button" onClick={() => setOpen(true)}><Plus size={14} />{label}</button>
  return <span className="tag-adder">
    <input className="tag-adder-input" autoFocus aria-label={label} placeholder={placeholder} maxLength={maxLength} enterKeyHint="done" autoComplete="off"
      value={value} onChange={event => setValue(event.target.value)} onKeyDown={keyDown} onBlur={commit} />
    <button className="tag-adder-confirm" type="button" aria-label={`${label}: spara`} onMouseDown={event => event.preventDefault()} onClick={commit}><Check size={15} /></button>
  </span>
}
