import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, FileText, List, ListOrdered, Maximize2, Minimize2, Plus, Search, Trash2 } from 'lucide-react'
import type { Note, NoteFont, NoteLinkKind, Workspace } from '../lib/types'
import { newId } from '../lib/helpers'
import { noteLinkItems, noteLinkLabels, notePlainText, sanitizeNoteHtml, type NoteLinkItem } from '../lib/notes'
import { mergeRecordChanges } from '../lib/workspaceMerge'
import { Modal } from './Modal'

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
  const [focusMode, setFocusMode] = useState(false)
  const [typing, setTyping] = useState(false)
  const [words, setWords] = useState(() => wordCount(note.content))
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
    const leftFullscreen = () => { if (enteredFullscreen.current && !document.fullscreenElement) setFocusMode(false) }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return
      event.preventDefault(); setFocusMode(false)
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
    restoreRange(); document.execCommand(command); rememberRange(); persist()
  }
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
      {focusMode ? <button className="button ghost note-focus-exit" onClick={() => setFocusMode(false)} aria-label="Avsluta helskärm" title="Avsluta helskärm (Esc)"><Minimize2 size={16} /><span>Avsluta</span></button>
        : <button className="button ghost notes-back" onClick={onBack}><ArrowLeft size={16} />Anteckningar</button>}
      <span className="note-save-state" role="status">{saved ? <><Check size={13} />Sparat</> : 'Inte sparat'}</span>
      {focusMode && <span className="note-word-count" aria-live="off">{words === 1 ? '1 ord' : `${words} ord`}</span>}
      {!focusMode && <button className="icon-button note-focus-toggle" aria-label="Skriv i helskärm" title="Skriv i helskärm" onClick={() => setFocusMode(true)}><Maximize2 size={17} /></button>}
      {!focusMode && <button className="icon-button danger" aria-label="Ta bort anteckning" onClick={() => setConfirmDelete(true)}><Trash2 size={17} /></button>}
    </div>
    <input className="note-title-input" aria-label="Anteckningens titel" placeholder="Ny anteckning" maxLength={160} value={title} onChange={event => { setTitle(event.target.value); persist({ title: event.target.value }); if (focusMode) setTyping(true) }} />
    <div className="note-toolbar note-chrome" role="toolbar" aria-label="Textredigerare"><label><span className="sr-only">Typsnitt</span><select aria-label="Typsnitt" value={font} onChange={event => { const next = event.target.value as NoteFont; setFont(next); persist({ font: next }) }}><option value="system">Standard</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label><button className="icon-button" aria-label="Punktlista" title="Punktlista" onMouseDown={event => event.preventDefault()} onClick={() => list('insertUnorderedList')}><List size={19} /></button><button className="icon-button" aria-label="Numrerad lista" title="Numrerad lista" onMouseDown={event => event.preventDefault()} onClick={() => list('insertOrderedList')}><ListOrdered size={19} /></button><button className="icon-button note-insert" aria-label="Lägg till länk" title="Lägg till länk" onMouseDown={event => event.preventDefault()} onClick={() => { rememberRange(); setQuery(''); setPicker(true) }}><Plus size={20} /></button></div>
    {error && <div className="note-error" role="alert"><p>{error}</p><button className="button secondary" onClick={() => persist()}>Försök igen</button></div>}
    <div ref={editorRef} className="note-content" data-font={font} contentEditable suppressContentEditableWarning role="textbox" aria-label="Anteckningens text" aria-multiline="true" data-placeholder="Skriv en anteckning…" spellCheck onInput={() => { rememberRange(); persist(); if (focusMode) setTyping(true) }} onKeyUp={rememberRange} onMouseUp={rememberRange} onBlur={rememberRange} onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); rememberRange(); persist() }} onClick={event => { const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-note-kind]'); if (anchor) { event.preventDefault(); setError(onOpenLink(anchor.dataset.noteKind as NoteLinkKind, anchor.dataset.noteTarget!)) } }} />
    </div>
    {picker && <Modal title="Lägg till länk" onClose={() => setPicker(false)}><label className="field">Sök innehåll<input className="input" type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Titel eller funktion" /></label><div className="note-link-picker">{matches.slice(0, 100).map(item => <button key={`${item.kind}:${item.id}`} onClick={() => insertLink(item)}><span>{noteLinkLabels[item.kind]}</span><strong>{item.title}</strong><Plus size={16} /></button>)}{!matches.length && <p>Inget innehåll hittades.</p>}</div></Modal>}
    {confirmDelete && <Modal title="Ta bort anteckningen?" onClose={() => setConfirmDelete(false)} error={error} footer={<><button className="button secondary" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" onClick={() => { const failure = onDelete(note.id); if (failure) setError(failure); else onBack() }}>Ta bort</button></>}><p>Anteckningen tas bort från Notes.</p></Modal>}
  </div>
}

export function Notes({ workspace, onSave, onDelete, onOpenLink, initialId }: {
  workspace: Workspace; initialId?: string; onSave: (edited: Note, original?: Note) => string | null;
  onDelete: (id: string) => string | null; onOpenLink: (kind: NoteLinkKind, id: string, noteId?: string) => string | null;
}) {
  const [opened, setOpened] = useState<Note | null>(() => workspace.notes?.find(note => note.id === initialId) ?? null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const notes = [...(workspace.notes ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const active = opened ? notes.find(note => note.id === opened.id) ?? opened : null
  const matches = notes.filter(note => `${note.title} ${notePlainText(note.content)}`.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')))
  function create() {
    const now = new Date().toISOString()
    const note: Note = { id: newId(), title: 'Ny anteckning', content: '', font: 'system', createdAt: now, updatedAt: now }
    const failure = onSave(note)
    setOpened(note); setQuery(''); setError(failure)
  }
  return <div className={`notes-layout ${active ? 'has-active-note' : ''}`}>
    <aside className="notes-sidebar" aria-label="Anteckningar"><div className="notes-list-heading"><span>{notes.length} {notes.length === 1 ? 'anteckning' : 'anteckningar'}</span><button className="button primary" onClick={create}><Plus size={16} />Ny</button></div><label className="notes-search"><Search size={16} /><input type="search" aria-label="Sök anteckningar" placeholder="Sök anteckningar" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="notes-list">{matches.map(note => <button key={note.id} className={active?.id === note.id ? 'active' : ''} aria-label={`Öppna anteckning ${noteTitle(note)}`} aria-pressed={active?.id === note.id} onClick={() => { setOpened(note); setError(null) }}><strong>{noteTitle(note)}</strong><span>{notePlainText(note.content).replace(/\s+/g, ' ').slice(0, 100) || 'Tom anteckning'}</span><time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</time></button>)}</div>{!notes.length && <p className="notes-empty">Inga anteckningar ännu.</p>}{notes.length > 0 && !matches.length && <p className="notes-empty">Inga anteckningar hittades.</p>}</aside>
    <section className="notes-writing-area">{error && !active && <p className="note-error" role="alert">{error}</p>}{active ? <NoteEditor key={active.id} note={active} initialError={error} workspace={workspace} onSave={onSave} onDelete={onDelete} onOpenLink={(kind, id) => onOpenLink(kind, id, active.id)} onBack={() => { setOpened(null); setError(null) }} /> : <div className="notes-start"><FileText size={28} strokeWidth={1.3} /><p>En plats för dina anteckningar.</p><button className="button secondary" onClick={create}><Plus size={16} />Ny anteckning</button></div>}</section>
  </div>
}
