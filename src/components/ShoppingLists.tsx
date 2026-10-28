import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ShoppingItem, ShoppingList } from '../lib/types'
import { newId } from '../lib/helpers'

function ShoppingItemRow({ item, onToggle, onRename, onRemove }: { item: ShoppingItem; onToggle: () => void; onRename: (title: string) => string | null; onRemove: () => void }) {
  const [draft, setDraft] = useState(item.title)
  useEffect(() => setDraft(item.title), [item.title])
  return <li className={item.checked ? 'is-checked' : ''}><input type="checkbox" aria-label={item.title} checked={item.checked} onChange={onToggle} /><input className="shopping-item-name" type="text" aria-label={`Redigera ${item.title}`} maxLength={500} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { const title = draft.trim(); if (title && title !== item.title) onRename(title); else if (!title) setDraft(item.title) }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /><button className="icon-button" type="button" aria-label={`Ta bort ${item.title}`} onClick={onRemove}><Trash2 size={16} /></button></li>
}

export function ShoppingLists({ lists, onSave, onDelete }: {
  lists: ShoppingList[]
  onSave: (list: ShoppingList, original?: ShoppingList) => string | null
  onDelete: (id: string) => string | null
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newItem, setNewItem] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = lists.find(entry => entry.id === openId)
  const stamp = () => new Date().toISOString()
  function create(event: FormEvent) {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const now = stamp()
    const next: ShoppingList = { id: newId(), title, items: [], createdAt: now, updatedAt: now }
    const failure = onSave(next)
    setError(failure)
    if (!failure) { setNewTitle(''); setOpenId(next.id) }
  }
  function update(next: ShoppingList) { setError(onSave({ ...next, updatedAt: stamp() }, list)) }
  function addItem(event: FormEvent) {
    event.preventDefault()
    if (!list || !newItem.trim()) return
    const title = newItem.trim()
    if (list.items.length >= 1000) { setError('Listan är full. Skapa en ny lista.'); return }
    const failure = onSave({ ...list, items: [...list.items, { id: newId(), title, checked: false }], updatedAt: stamp() }, list)
    setError(failure)
    if (!failure) setNewItem('')
  }
  function rename(event: FormEvent) {
    event.preventDefault()
    if (!list || !renameTitle.trim()) return
    const failure = onSave({ ...list, title: renameTitle.trim(), updatedAt: stamp() }, list)
    setError(failure)
    if (!failure) setRenaming(false)
  }
  const openCount = (entry: ShoppingList) => entry.items.filter(item => !item.checked).length
  return <div className="others-content shopping-lists">
    {error && <p className="others-error" role="alert">{error}</p>}
    {!list ? <>
      <form className="shopping-add" onSubmit={create}><label className="sr-only" htmlFor="shopping-list-title">Ny inköpslista</label><input id="shopping-list-title" className="input" value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={80} placeholder="Ny inköpslista" /><button className="button primary" type="submit" disabled={!newTitle.trim()}><Plus size={17} />Skapa lista</button></form>
      {lists.length ? <div className="shopping-list-overview">{lists.map(entry => <button className="shopping-list-card" type="button" key={entry.id} onClick={() => { setOpenId(entry.id); setError(null); setNewItem('') }}><span><strong>{entry.title}</strong><small>{openCount(entry)} kvar · {entry.items.length} totalt</small></span><ArrowRight size={18} /></button>)}</div> : <p className="others-empty">Skapa en lista och lägg till det du behöver handla. Du kan också lägga till ingredienser direkt från ett recept.</p>}
    </> : <>
      <button className="button ghost shopping-back" type="button" onClick={() => { setOpenId(null); setRenaming(false); setConfirmDelete(false); setError(null) }}><ArrowLeft size={16} />Alla inköpslistor</button>
      <div className="shopping-detail-heading"><div><p className="eyebrow">Inköpslista</p><h3>{list.title}</h3><p className="others-help">{openCount(list)} av {list.items.length} kvar</p></div><button className="icon-button" type="button" aria-label={`Byt namn på ${list.title}`} onClick={() => { setRenameTitle(list.title); setRenaming(true); setConfirmDelete(false) }}><Pencil size={17} /></button></div>
      {renaming && <form className="shopping-rename" onSubmit={rename}><label className="sr-only" htmlFor="shopping-rename-input">Listnamn</label><input id="shopping-rename-input" className="input" autoFocus value={renameTitle} maxLength={80} onChange={event => setRenameTitle(event.target.value)} /><button className="button primary" type="submit" disabled={!renameTitle.trim()}><Check size={16} />Spara</button><button className="button ghost" type="button" onClick={() => setRenaming(false)}>Avbryt</button></form>}
      <form className="shopping-add" onSubmit={addItem}><label className="sr-only" htmlFor="shopping-item-title">Lägg till vara</label><input id="shopping-item-title" className="input" value={newItem} onChange={event => setNewItem(event.target.value)} maxLength={500} placeholder="Lägg till vara" /><button className="button primary" type="submit" disabled={!newItem.trim()}><Plus size={17} />Lägg till</button></form>
      {list.items.length ? <ul className="shopping-items">{list.items.map(item => <ShoppingItemRow key={item.id} item={item} onToggle={() => update({ ...list, items: list.items.map(entry => entry.id === item.id ? { ...entry, checked: !entry.checked } : entry) })} onRename={title => { const failure = onSave({ ...list, items: list.items.map(entry => entry.id === item.id ? { ...entry, title } : entry), updatedAt: stamp() }, list); setError(failure); return failure }} onRemove={() => update({ ...list, items: list.items.filter(entry => entry.id !== item.id) })} />)}</ul> : <p className="others-empty">Listan är tom. Lägg till en vara ovan eller välj ingredienser från Recept.</p>}
      {list.items.some(item => item.checked) && <button className="button ghost shopping-clear" type="button" onClick={() => update({ ...list, items: list.items.filter(item => !item.checked) })}>Ta bort avbockade</button>}
      <div className="shopping-delete">{confirmDelete ? <div role="group" aria-label="Ta bort inköpslista"><span>Ta bort {list.title} och alla varor?</span><button className="button secondary" type="button" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button secondary danger" type="button" onClick={() => { const failure = onDelete(list.id); setError(failure); if (!failure) { setOpenId(null); setConfirmDelete(false) } }}>Ta bort lista</button></div> : <button className="button ghost danger" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Ta bort lista</button>}</div>
    </>}
  </div>
}
