import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, Heart, ImagePlus, Library, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Cookbook, Recipe } from '../lib/types'
import { newId } from '../lib/helpers'
import { isRecipeImage } from '../lib/others'
import { prepareImageAssets } from '../lib/imageStorage'
import { prepareRecipeImage } from '../lib/recipeImage'
import { Modal } from './Modal'
import { Recipes } from './Recipes'

type SaveBook = (book: Cookbook, original?: Cookbook) => string | null

function BookEditor({ book, onSave, onDelete, onClose }: { book?: Cookbook; onSave: SaveBook; onDelete: (id: string) => string | null; onClose: () => void }) {
  const [original] = useState(() => book ? structuredClone(book) : undefined)
  const [draft, setDraft] = useState<Cookbook>(() => book ? structuredClone(book) : { id: newId(), title: '', recipeIds: [], createdAt: new Date().toISOString() })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  async function image(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setBusy(true); setError(null)
    try { const image = await prepareRecipeImage(file); setDraft(current => ({ ...current, image })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Bilden kunde inte läsas.') }
    finally { setBusy(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!draft.title.trim()) { setError('Ge kokboken ett namn.'); return }
    setBusy(true)
    try { await prepareImageAssets(draft) } catch { /* Inline cache fallback remains available. */ }
    setBusy(false)
    const failure = onSave({ ...draft, title: draft.title.trim() }, original)
    if (failure) setError(failure); else onClose()
  }
  const dirty = original ? JSON.stringify(original) !== JSON.stringify(draft) : !!(draft.title || draft.image)
  return <Modal title={book ? 'Redigera kokbok' : 'Ny kokbok'} dirty={dirty} onClose={onClose} error={error} footer={close => <>
    {book && <button className="icon-button danger" type="button" aria-label="Ta bort kokbok" onClick={() => { const failure = onDelete(book.id); if (failure) setError(failure); else onClose() }}><Trash2 size={18} /></button>}
    <button className="button secondary" type="button" onClick={close}>Avbryt</button><button className="button primary" type="submit" form="cookbook-form" disabled={busy}><Check size={16} />Spara kokbok</button>
  </>}>
    <form id="cookbook-form" onSubmit={save}>
      <label className="field">Namn<input className="input" required maxLength={80} placeholder="T.ex. Chile, Snacks eller Morgon" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <div className="field"><span>Omslagsbild</span><input ref={fileRef} className="sr-only" type="file" accept="image/*" tabIndex={-1} aria-label="Välj omslagsbild" onChange={event => { void image(event) }} />
        {draft.image && isRecipeImage(draft.image) ? <div className="recipe-image-preview"><img src={draft.image} alt="Kokbokens omslag" /><div className="recipe-image-actions"><button className="button secondary small" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>Byt bild</button><button className="button secondary small" type="button" disabled={busy} onClick={() => setDraft(current => { const { image: _image, ...rest } = current; return rest })}>Ta bort bild</button></div></div> : <button className="recipe-image-add" type="button" disabled={busy} onClick={() => fileRef.current?.click()}><ImagePlus size={26} /><span>{busy ? 'Förbereder bilden…' : 'Lägg till omslagsbild'}</span><small>Välj från kamerarullen eller ta en bild</small></button>}
        {busy && <p className="others-help" role="status">Förbereder bilden…</p>}
      </div>
      <p className="others-help">Samla dina recept efter land, måltid eller inspiration. Du kan lägga samma recept i flera böcker.{book ? ' Om du tar bort boken finns recepten kvar i Alla recept.' : ''}</p>
    </form>
  </Modal>
}

function RecipePicker({ book, recipes, onSave, onClose }: { book: Cookbook; recipes: Recipe[]; onSave: SaveBook; onClose: () => void }) {
  const [original] = useState(() => structuredClone(book))
  const [ids, setIds] = useState(() => [...book.recipeIds])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ordered = recipes.filter(recipe => `${recipe.title} ${recipe.labels.join(' ')}`.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')))
  return <Modal title={`Välj recept till ${book.title}`} onClose={onClose} dirty={JSON.stringify(ids) !== JSON.stringify(original.recipeIds)} error={error} footer={close => <><button className="button secondary" type="button" onClick={close}>Avbryt</button><button className="button primary" type="button" onClick={() => { const failure = onSave({ ...original, recipeIds: ids }, original); if (failure) setError(failure); else onClose() }}><Check size={16} />Spara urval</button></>}>
    <label className="field">Sök bland alla recept<input className="input" type="search" placeholder="Sök namn eller etikett" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <p className="others-help" aria-live="polite">{ids.filter(id => recipes.some(recipe => recipe.id === id)).length} valda · Avmarkera för att ta bort från boken.</p>
    <div className="cookbook-picker">{ordered.map(recipe => <label key={recipe.id} className="cookbook-picker-row"><input type="checkbox" checked={ids.includes(recipe.id)} onChange={event => setIds(current => event.target.checked ? [...current, recipe.id] : current.filter(id => id !== recipe.id))} />{recipe.image && isRecipeImage(recipe.image) && <img src={recipe.image} alt="" loading="lazy" />}<span>{recipe.title}</span></label>)}</div>
    {!ordered.length && <p className="others-empty">Inga recept matchar sökningen.</p>}
  </Modal>
}

export function Cookbooks({ organized, onOrganize, books, recipes, initialId, onSaveBook, onDeleteBook, onSave, onDelete }: {
  organized: boolean; onOrganize: () => string | null;
  books: Cookbook[]; recipes: Recipe[]; initialId?: string; onSaveBook: SaveBook; onDeleteBook: (id: string) => string | null;
  onSave: (recipe: Recipe, original?: Recipe, cookbookId?: string) => string | null; onDelete: (id: string) => string | null;
}) {
  const [organizeError, setOrganizeError] = useState<string | null>(null)
  useEffect(() => { if (!organized) setOrganizeError(onOrganize()) }, [organized])
  const [scope, setScope] = useState<string | null>(() => initialId ? 'all' : null)
  const [editing, setEditing] = useState<Cookbook | null | undefined>(undefined)
  const [picking, setPicking] = useState<Cookbook | null>(null)
  const [query, setQuery] = useState('')
  const book = books.find(entry => entry.id === scope)
  const active = scope === 'all' || scope === 'favorites' || !!book
  const favorites = recipes.filter(recipe => recipe.favorite)
  const filtered = book ? recipes.filter(recipe => book.recipeIds.includes(recipe.id)) : scope === 'favorites' ? favorites : recipes
  const title = book?.title ?? (scope === 'favorites' ? 'Favoriter' : 'Alla recept')
  const visibleBooks = books.filter(entry => entry.title.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')))
  function cover(entry: Cookbook) {
    if (entry.image && isRecipeImage(entry.image)) return <img src={entry.image} alt="" loading="lazy" decoding="async" />
    return <span className="cookbook-cover-placeholder"><BookOpen size={38} strokeWidth={1.2} /><span>{entry.title.slice(0, 1).toLocaleUpperCase('sv')}</span></span>
  }
  return <div className={`others-content cookbooks${active ? ' is-open' : ''}${book ? ' has-book' : ''}`}>
    {organizeError && <p className="others-error" role="alert">{organizeError}</p>}
    {!active ? <>
      <header className="cookbooks-heading"><div><p className="eyebrow">Din receptsamling</p><h3>Mina kokböcker</h3><p className="others-help">Smaker, stunder och egna favoriter. Samla dem i en bok.</p></div><button className="button primary" type="button" onClick={() => setEditing(null)}><Plus size={17} />Ny kokbok</button></header>
      <div className="cookbook-library-links"><button type="button" onClick={() => setScope('all')}><Library size={22} /><span><strong>Alla recept</strong><small>{recipes.length} recept · dina egna och Receptbanken</small></span><ArrowRight size={17} /></button><button type="button" onClick={() => setScope('favorites')}><Heart size={22} /><span><strong>Favoriter</strong><small>{favorites.length} sparade recept</small></span><ArrowRight size={17} /></button></div>
      {books.length > 3 && <label className="field">Sök kokbok<input className="input" type="search" placeholder="Hitta en kokbok" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      <div className="cookbook-grid">{visibleBooks.map((entry, index) => <article className="cookbook-card" key={entry.id} data-cookbook-id={entry.id}><button className="cookbook-open" type="button" aria-label={`Öppna kokbok ${entry.title}`} onClick={() => setScope(entry.id)}><span className={`cookbook-cover tone-${index % 4}`}>{cover(entry)}</span><span className="cookbook-card-copy"><strong>{entry.title}</strong><small>{recipes.filter(recipe => entry.recipeIds.includes(recipe.id)).length} recept</small></span></button><button className="icon-button cookbook-edit" type="button" aria-label={`Redigera kokbok ${entry.title}`} onClick={() => setEditing(entry)}><Pencil size={16} /></button></article>)}
        <button className="cookbook-create" type="button" onClick={() => setEditing(null)}><Plus size={26} strokeWidth={1.4} /><strong>Skapa en kokbok</strong><small>Chile, Snacks, Morgon…</small></button>
      </div>
      {query.trim() && visibleBooks.length === 0 && <p className="others-empty">Ingen kokbok matchar sökningen.</p>}
    </> : <>
      <button className="button ghost cookbook-back" type="button" onClick={() => setScope(null)}><ArrowLeft size={16} />Alla kokböcker</button>
      <header className="cookbook-heading">{book && <div className="cookbook-mini-cover">{cover(book)}</div>}<div><p className="eyebrow">{book ? 'Min kokbok' : 'Receptbibliotek'}</p><h3>{title}</h3><p className="others-help">{filtered.length} recept</p></div>{book && <button className="icon-button" type="button" aria-label={`Redigera kokbok ${book.title}`} onClick={() => setEditing(book)}><Pencil size={18} /></button>}</header>
      <Recipes key={scope} headerAction={book ? <button className="button secondary cookbook-add-existing" type="button" aria-label="Välj från befintliga recept" onClick={() => setPicking(book)}><Plus size={16} /><span>Välj recept</span></button> : undefined} recipes={filtered} libraryHelp={scope === 'all'} initialId={initialId} onSave={(recipe, original) => onSave(scope === 'favorites' && !original ? { ...recipe, favorite: true } : recipe, original, book?.id)} onDelete={onDelete} />
    </>}
    {editing !== undefined && <BookEditor key={editing?.id ?? 'new-book'} book={editing ?? undefined} onSave={onSaveBook} onDelete={onDeleteBook} onClose={() => setEditing(undefined)} />}
    {picking && <RecipePicker key={picking.id} book={picking} recipes={recipes} onSave={onSaveBook} onClose={() => setPicking(null)} />}
  </div>
}
