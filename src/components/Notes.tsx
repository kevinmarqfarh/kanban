import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Bold, RotateCcw, Check, FileText, Italic, List, ListOrdered, Plus, Search, Trash2 } from 'lucide-react'
import type { Note, NoteFont, NoteLinkKind, Workspace } from '../lib/types'
import { newId } from '../lib/helpers'
import { NOTE_TRASH_DAYS, isTrashed, noteLinkItems, noteLinkLabels, notePlainText, sanitizeNoteHtml, trashDaysLeft, type NoteLinkItem } from '../lib/notes'
import { mergeRecordChanges } from '../lib/workspaceMerge'
import { Modal } from './Modal'
import { SwipeRow } from './SwipeRow'

function wordCount(html: string) {
  const text = notePlainText(html).trim()
  return text ? text.split(/\s+/).length : 0
}

function noteTitle(note: Note) {
  return note.title === 'Ny anteckning' ? notePlainText(note.content).split('\n')[0]?.slice(0, 70) || note.title : note.title
}

function NoteEditor({ note, workspace, onSave, onDelete, onOpenLink, onBack, initialError }: {
  note: Note; workspace: Workspace; onSave: (edited: Note, original?: Note) => string | null;
  onDelete: (id: string) => string | null; onOpenLink: (kind: NoteLinkKind, id: string) => string | null; onBack: () => void;
  initialError?: string | null;
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<Range | null>(null)
  const baseRef = useRef(note)
  const draftRef = useRef(structuredClone(note))
  const [title, setTitle] = useState(note.title === 'Ny anteckning' ? '' : note.title)
  const [font, setFont] = useState<NoteFont>(note.font)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState(!initialError)
  // Notes always open as a full-window writing surface; closing it returns to the list.
  const focusMode = true
  const backRef = useRef(onBack); backRef.current = onBack
  const [typing, setTyping] = useState(false)
  const [words, setWords] = useState(() => wordCount(note.content))
  const [marks, setMarks] = useState({ bold: false, italic: false })
  const [bubble, setBubble] = useState<{ x: number; top: number; bottom: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const enteredFullscreen = useRef(false)
  const saveRef = useRef(onSave); saveRef.current = onSave
  // Focus mode: a clean full-window writing surface. Where the browser allows it (Mac, iPad),
  // the page also goes truly fullscreen; on iPhone the overlay alone covers the app.
  useEffect(() => {
    if (!focusMode) return
    const root = document.documentElement
    root.classList.add('note-focus-open')
    enteredFullscreen.current = false
    if (document.fullscreenEnabled && !document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen({ navigationUI: 'hide' }).then(() => { enteredFullscreen.current = true }).catch(() => { /* The overlay still gives a clean surface. */ })
    }
    const leftFullscreen = () => { if (enteredFullscreen.current && !document.fullscreenElement) backRef.current() }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return
      event.preventDefault(); backRef.current()
    }
    const moved = (event: PointerEvent) => { if (event.pointerType === 'mouse' && (Math.abs(event.movementX) + Math.abs(event.movementY) > 3)) setTyping(false) }
    document.addEventListener('fullscreenchange', leftFullscreen)
    window.addEventListener('keydown', key)
    window.addEventListener('pointermove', moved)
    requestAnimationFrame(() => { restoreRange(); rootRef.current?.scrollTo({ top: 0 }) })
    return () => {
      root.classList.remove('note-focus-open')
      document.removeEventListener('fullscreenchange', leftFullscreen)
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointermove', moved)
      if (enteredFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      enteredFullscreen.current = false
      setTyping(false)
    }
  }, [focusMode])
  useEffect(() => {
    const editor = editorRef.current!
    editor.innerHTML = sanitizeNoteHtml(note.content)
    editor.focus()
    const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false)
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
    rangeRef.current = range
  }, [])
  useEffect(() => {
    if (JSON.stringify(note) === JSON.stringify(baseRef.current)) return
    const next = mergeRecordChanges(baseRef.current, draftRef.current, note)
    draftRef.current = next; baseRef.current = note
    setTitle(next.title === 'Ny anteckning' ? '' : next.title); setFont(next.font)
    const html = sanitizeNoteHtml(next.content)
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html; rangeRef.current = null
    }
  }, [note])
  function rememberRange() {
    const selection = window.getSelection()
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) rangeRef.current = selection.getRangeAt(0).cloneRange()
  }
  function restoreRange() {
    const editor = editorRef.current!
    editor.focus()
    const selection = window.getSelection()
    if (!selection) return
    let range = rangeRef.current
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange(); range.selectNodeContents(editor); range.collapse(false)
    }
    selection.removeAllRanges(); selection.addRange(range)
  }
  function persist(values: Partial<Note> = {}): string | null {
    const next = { ...draftRef.current, content: sanitizeNoteHtml(editorRef.current?.innerHTML ?? draftRef.current.content), ...values, updatedAt: new Date().toISOString() }
    next.title = next.title.trim() || 'Ny anteckning'
    draftRef.current = next
    const failure = saveRef.current(next, baseRef.current)
    setError(failure); setSaved(!failure); setWords(wordCount(next.content))
    if (!failure) baseRef.current = next
    return failure
  }
  function list(command: 'insertUnorderedList' | 'insertOrderedList') {
    restoreRange(); document.execCommand(command); rememberRange(); persist(); readSelection()
  }
  function format(command: 'bold' | 'italic') {
    restoreRange(); document.execCommand(command); rememberRange(); persist(); readSelection()
  }
  // Track bold/italic state at the caret and where a non-empty selection sits, for the pop-up format bar.
  function readSelection() {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) { setBubble(null); return }
    setMarks({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic') })
    const range = selection.getRangeAt(0)
    if (selection.isCollapsed || !range.toString().trim()) { setBubble(null); return }
    rangeRef.current = range.cloneRange()
    const rect = range.getBoundingClientRect()
    setBubble({ x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom })
  }
  useEffect(() => {
    const changed = () => readSelection()
    document.addEventListener('selectionchange', changed)
    window.addEventListener('scroll', changed, true)
    return () => { document.removeEventListener('selectionchange', changed); window.removeEventListener('scroll', changed, true) }
  }, [])
  function insertLink(item: NoteLinkItem) {
    setPicker(false)
    requestAnimationFrame(() => {
      restoreRange()
      const range = window.getSelection()?.getRangeAt(0)
      if (!range) return
      const anchor = document.createElement('a')
      anchor.dataset.noteKind = item.kind; anchor.dataset.noteTarget = item.id
      anchor.href = `#forma/${item.kind}/${encodeURIComponent(item.id)}`
      anchor.contentEditable = 'false'; anchor.textContent = `${noteLinkLabels[item.kind]} · ${item.title}`
      const space = document.createTextNode(' ')
      range.deleteContents(); range.insertNode(space); range.insertNode(anchor)
      range.setStartAfter(space); range.collapse(true)
      rangeRef.current = range.cloneRange(); restoreRange(); persist()
    })
  }
  const matches = noteLinkItems(workspace).filter(item => `${item.title} ${noteLinkLabels[item.kind]}`.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')))
  return <div ref={rootRef} className={`note-editor${focusMode ? ' is-focus' : ''}${focusMode && typing ? ' is-typing' : ''}`} data-note-id={note.id} data-focus-mode={focusMode || undefined}
    role={focusMode ? 'region' : undefined} aria-label={focusMode ? 'Helskärmsredigerare' : undefined}
    onPointerDown={event => { if (focusMode && event.pointerType !== 'mouse' && !editorRef.current?.contains(event.target as Node)) setTyping(false) }}
    onClick={event => { if (focusMode && (event.target === rootRef.current || (event.target as HTMLElement).classList.contains('note-focus-page'))) { editorRef.current?.focus(); rangeRef.current = null; restoreRange() } }}>
    <div className="note-focus-page">
    <div className="note-editor-heading note-chrome">
      <button className="button ghost note-focus-exit" onClick={onBack} title="Tillbaka till anteckningar (Esc)"><ArrowLeft size={16} /><span>Anteckningar</span></button>
      <span className="note-save-state" role="status">{saved ? <><Check size={13} />Sparat</> : 'Inte sparat'}</span>
      {focusMode && <span className="note-word-count" aria-live="off">{words === 1 ? '1 ord' : `${words} ord`}</span>}
      <button className="icon-button danger note-focus-delete" aria-label="Ta bort anteckning" title="Ta bort anteckning" onClick={() => setConfirmDelete(true)}><Trash2 size={17} /></button>
    </div>
    <input className="note-title-input" aria-label="Anteckningens titel" placeholder="Ny anteckning" maxLength={160} value={title} onChange={event => { setTitle(event.target.value); persist({ title: event.target.value }); if (focusMode) setTyping(true) }} />
    <div className="note-toolbar note-chrome" role="toolbar" aria-label="Textredigerare"><label><span className="sr-only">Typsnitt</span><select aria-label="Typsnitt" value={font} onChange={event => { const next = event.target.value as NoteFont; setFont(next); persist({ font: next }) }}><option value="system">Standard</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label><button className={`icon-button${marks.bold ? ' is-active' : ''}`} aria-label="Fet" title="Fet (⌘B)" aria-pressed={marks.bold} onMouseDown={event => event.preventDefault()} onClick={() => format('bold')}><Bold size={18} /></button><button className={`icon-button${marks.italic ? ' is-active' : ''}`} aria-label="Kursiv" title="Kursiv (⌘I)" aria-pressed={marks.italic} onMouseDown={event => event.preventDefault()} onClick={() => format('italic')}><Italic size={18} /></button><button className="icon-button" aria-label="Punktlista" title="Punktlista" onMouseDown={event => event.preventDefault()} onClick={() => list('insertUnorderedList')}><List size={19} /></button><button className="icon-button" aria-label="Numrerad lista" title="Numrerad lista" onMouseDown={event => event.preventDefault()} onClick={() => list('insertOrderedList')}><ListOrdered size={19} /></button><button className="icon-button note-insert" aria-label="Lägg till länk" title="Lägg till länk" onMouseDown={event => event.preventDefault()} onClick={() => { rememberRange(); setQuery(''); setPicker(true) }}><Plus size={20} /></button></div>
    {error && <div className="note-error" role="alert"><p>{error}</p><button className="button secondary" onClick={() => persist()}>Försök igen</button></div>}
    <div ref={editorRef} className="note-content" data-font={font} contentEditable suppressContentEditableWarning role="textbox" aria-label="Anteckningens text" aria-multiline="true" data-placeholder="Skriv en anteckning…" spellCheck onInput={() => { rememberRange(); persist(); if (focusMode) setTyping(true) }} onKeyUp={rememberRange} onMouseUp={rememberRange} onBlur={rememberRange} onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); rememberRange(); persist() }} onClick={event => { const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-note-kind]'); if (anchor) { event.preventDefault(); setError(onOpenLink(anchor.dataset.noteKind as NoteLinkKind, anchor.dataset.noteTarget!)) } }} />
    </div>
    {bubble && !picker && createPortal(<div className="note-format-bubble" role="toolbar" aria-label="Formatera markerad text"
      style={{ left: Math.min(Math.max(bubble.x, 110), window.innerWidth - 110), top: matchMedia('(pointer: coarse)').matches ? bubble.bottom + 12 : Math.max(bubble.top - 52, 8) }}
      onMouseDown={event => event.preventDefault()}>
      <button type="button" className={marks.bold ? 'is-active' : ''} aria-label="Fet markering" aria-pressed={marks.bold} onClick={() => format('bold')}><Bold size={17} /></button>
      <button type="button" className={marks.italic ? 'is-active' : ''} aria-label="Kursiv markering" aria-pressed={marks.italic} onClick={() => format('italic')}><Italic size={17} /></button>
      <span aria-hidden="true" />
      <button type="button" aria-label="Punktlista av markering" onClick={() => list('insertUnorderedList')}><List size={17} /></button>
      <button type="button" aria-label="Numrerad lista av markering" onClick={() => list('insertOrderedList')}><ListOrdered size={17} /></button>
    </div>, document.body)}
    {picker && <Modal title="Lägg till länk" onClose={() => setPicker(false)}><label className="field">Sök innehåll<input className="input" type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Titel eller funktion" /></label><div className="note-link-picker">{matches.slice(0, 100).map(item => <button key={`${item.kind}:${item.id}`} onClick={() => insertLink(item)}><span>{noteLinkLabels[item.kind]}</span><strong>{item.title}</strong><Plus size={16} /></button>)}{!matches.length && <p>Inget innehåll hittades.</p>}</div></Modal>}
    {confirmDelete && <Modal title="Ta bort anteckningen?" onClose={() => setConfirmDelete(false)} error={error} footer={<><button className="button secondary" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" onClick={() => { const failure = onDelete(note.id); if (failure) setError(failure); else onBack() }}>Ta bort</button></>}><p>Anteckningen flyttas till papperskorgen och kan återställas i {NOTE_TRASH_DAYS} dagar.</p></Modal>}
  </div>
}

export function Notes({ workspace, onSave, onDelete, onRestore, onPurge, onEmptyTrash, onOpenLink, initialId }: {
  workspace: Workspace; initialId?: string; onSave: (edited: Note, original?: Note) => string | null;
  onRestore: (note: Note) => string | null;
  onPurge: (id: string) => string | null;
  onEmptyTrash: () => string | null;
  onDelete: (id: string) => string | null; onOpenLink: (kind: NoteLinkKind, id: string, noteId?: string) => string | null;
}) {
  const [opened, setOpened] = useState<Note | null>(() => workspace.notes?.find(note => note.id === initialId && !note.deletedAt) ?? null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [swiped, setSwiped] = useState<string | null>(null)
  const [removed, setRemoved] = useState<Note | null>(null)
  const [view, setView] = useState<'list' | 'trash'>('list')
  const [confirmPurge, setConfirmPurge] = useState<string | 'all' | null>(null)
  useEffect(() => { if (!removed) return; const timer = setTimeout(() => setRemoved(null), 6000); return () => clearTimeout(timer) }, [removed])
  function removeFromList(note: Note) {
    const failure = onDelete(note.id)
    setSwiped(null); setError(failure)
    if (failure) return
    setRemoved(note)
    if (opened?.id === note.id) setOpened(null)
  }
  function undoRemove() {
    if (!removed) return
    const failure = onRestore(removed)
    setError(failure)
    if (!failure) setRemoved(null)
  }
  const all = workspace.notes ?? []
  const notes = all.filter(note => !isTrashed(note)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const trash = all.filter(isTrashed).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
  // A note moved to the trash (here or in another tab) closes.
  const active = opened && !trash.some(note => note.id === opened.id) ? notes.find(note => note.id === opened.id) ?? opened : null
  const matches = notes.filter(note => `${note.title} ${notePlainText(note.content)}`.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')))
  function create() {
    const now = new Date().toISOString()
    const note: Note = { id: newId(), title: 'Ny anteckning', content: '', font: 'system', createdAt: now, updatedAt: now }
    const failure = onSave(note)
    setOpened(note); setQuery(''); setError(failure); setView('list')
  }
  function restore(note: Note) { const failure = onRestore(note); setError(failure); setConfirmPurge(null) }
  function purge(id: string) { const failure = onPurge(id); setError(failure); setConfirmPurge(null) }
  function emptyTrash() { const failure = onEmptyTrash(); setError(failure); setConfirmPurge(null) }
  const preview = (note: Note) => notePlainText(note.content).replace(/\s+/g, ' ').slice(0, 100) || 'Tom anteckning'
  return <div className={`notes-layout ${active ? 'has-active-note' : ''}`}>
    {view === 'trash' ? <aside className="notes-sidebar notes-trash" aria-label="Papperskorg">
      <div className="notes-list-heading"><button className="button ghost small notes-trash-back" type="button" onClick={() => { setView('list'); setConfirmPurge(null) }}><ArrowLeft size={15} />Anteckningar</button>{trash.length > 0 && <button className="button ghost small danger" type="button" onClick={() => setConfirmPurge('all')}>Töm papperskorgen</button>}</div>
      <h3 className="notes-trash-title"><Trash2 size={16} />Papperskorg</h3>
      <p className="notes-trash-help">Borttagna anteckningar sparas i {NOTE_TRASH_DAYS} dagar och raderas sedan automatiskt.</p>
      {error && <p className="note-error" role="alert">{error}</p>}
      {confirmPurge === 'all' && <div className="form-message delete-confirm notes-trash-confirm"><p>Radera {trash.length === 1 ? 'anteckningen' : `alla ${trash.length} anteckningar`} för alltid?</p><button className="button secondary" type="button" onClick={() => setConfirmPurge(null)}>Behåll</button><button className="button primary danger" type="button" onClick={emptyTrash}>Radera</button></div>}
      <div className="notes-list">{trash.map(note => { const days = trashDaysLeft(note); return <article className="notes-trash-row" key={note.id} data-trash-note-id={note.id}>
        <div className="note-list-item"><strong>{noteTitle(note)}</strong><span>{preview(note)}</span><time dateTime={note.deletedAt ?? undefined}>{days <= 1 ? 'Raderas idag' : `${days} dagar kvar`}</time></div>
        {confirmPurge === note.id ? <div className="notes-trash-actions"><button className="button secondary small" type="button" onClick={() => setConfirmPurge(null)}>Behåll</button><button className="button primary small danger" type="button" aria-label={`Radera ${noteTitle(note)} för alltid`} onClick={() => purge(note.id)}>Radera för alltid</button></div>
          : <div className="notes-trash-actions"><button className="button secondary small" type="button" aria-label={`Återställ ${noteTitle(note)}`} onClick={() => restore(note)}><RotateCcw size={14} />Återställ</button><button className="icon-button danger" type="button" aria-label={`Radera ${noteTitle(note)}`} onClick={() => setConfirmPurge(note.id)}><Trash2 size={16} /></button></div>}
      </article> })}</div>
      {!trash.length && <p className="notes-empty">Papperskorgen är tom.</p>}
    </aside> : <aside className="notes-sidebar" aria-label="Anteckningar"><div className="notes-list-heading"><span>{notes.length} {notes.length === 1 ? 'anteckning' : 'anteckningar'}</span><button className="button primary" onClick={create}><Plus size={16} />Ny</button></div><label className="notes-search"><Search size={16} /><input type="search" aria-label="Sök anteckningar" placeholder="Sök anteckningar" value={query} onChange={event => setQuery(event.target.value)} /></label>{removed && <div className="notes-undo" role="status"><span>Flyttad till papperskorgen.</span><button className="button ghost small" type="button" onClick={undoRemove}>Ångra</button></div>}
      {error && !active && <p className="note-error" role="alert">{error}</p>}
      <div className="notes-list">{matches.map(note => <SwipeRow key={note.id} open={swiped === note.id} onOpenChange={open => setSwiped(open ? note.id : current => current === note.id ? null : current)} onDelete={() => removeFromList(note)} deleteLabel={`Ta bort anteckning ${noteTitle(note)}`}><button className={`note-list-item${active?.id === note.id ? ' active' : ''}`} data-note-list-id={note.id} aria-label={`Öppna anteckning ${noteTitle(note)}`} aria-pressed={active?.id === note.id} onClick={() => { setOpened(note); setError(null); setSwiped(null) }}><strong>{noteTitle(note)}</strong><span>{preview(note)}</span><time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</time></button></SwipeRow>)}</div>{!notes.length && <p className="notes-empty">Inga anteckningar ännu.</p>}{notes.length > 0 && !matches.length && <p className="notes-empty">Inga anteckningar hittades.</p>}
      <button className="notes-trash-open" type="button" onClick={() => { setView('trash'); setSwiped(null) }}><Trash2 size={15} /><span>Papperskorg</span><span className="count-badge">{trash.length}</span></button>
    </aside>}
    <section className="notes-writing-area">{active ? <NoteEditor key={active.id} note={active} initialError={error} workspace={workspace} onSave={onSave} onDelete={id => { const failure = onDelete(id); if (!failure) { setRemoved(active); setView('list') } return failure }} onOpenLink={(kind, id) => onOpenLink(kind, id, active.id)} onBack={() => { setOpened(null); setError(null) }} /> : <div className="notes-start"><FileText size={28} strokeWidth={1.3} /><p>En plats för dina anteckningar.</p><button className="button secondary" onClick={create}><Plus size={16} />Ny anteckning</button></div>}</section>
  </div>
}
