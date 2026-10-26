import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ArrowUpRight, Check, CookingPot, Heart, ImagePlus, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { Recipe } from '../lib/types'
import { newId } from '../lib/helpers'
import { isRecipeImage, predefinedRecipeLabels, recipeLabelKey, recipeLabelOptions, validateRecipeUrl } from '../lib/others'
import { prepareRecipeImage } from '../lib/recipeImage'
import { Modal } from './Modal'
import { TagAdder } from './TagAdder'
import { isCatalogRecipe } from '../lib/recipeCatalog'
import { cuisineLabels, isCuisineLabel, recipeContent } from '../lib/recipeContent'
import { RecipeReader } from './RecipeReader'

const displayLabel = (label: string) => predefinedRecipeLabels.includes(recipeLabelKey(label)) ? `${label[0].toLocaleUpperCase('sv')}${label.slice(1)}` : label

function RecipeEditor({ recipe, recipes, onSave, onClose }: {
  recipe?: Recipe;
  recipes: Recipe[];
  onSave: (edited: Recipe, original?: Recipe) => string | null;
  onClose: () => void;
}) {
  const [original] = useState(() => recipe && recipes.some(entry => entry.id === recipe.id) ? structuredClone(recipe) : undefined)
  const [draft, setDraft] = useState<Recipe>(() => recipe ? { ...structuredClone(recipe), ingredients: recipeContent(recipe).ingredients, steps: recipeContent(recipe).method, notes: recipeContent(recipe).notes } : {
    id: newId(), title: '', url: '', ingredients: '', steps: '', notes: '', labels: [], createdAt: new Date().toISOString(),
  })
  const initialDraft = useRef(JSON.stringify(draft))
  const [error, setError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const options = recipeLabelOptions(recipes, draft.labels)
  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImageBusy(true); setError(null)
    try { const image = await prepareRecipeImage(file); setDraft(current => ({ ...current, image })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Bilden kunde inte läsas.') }
    finally { setImageBusy(false) }
  }
  function removeImage() { setDraft(current => { const { image: _image, ...rest } = current; return rest }) }
  const selected = (label: string) => draft.labels.some(value => recipeLabelKey(value) === recipeLabelKey(label))
  function toggleLabel(label: string) {
    setDraft({ ...draft, labels: selected(label) ? draft.labels.filter(value => recipeLabelKey(value) !== recipeLabelKey(label)) : [...draft.labels, label] })
  }
  function addLabel(value: string) {
    const existing = options.find(label => recipeLabelKey(label) === recipeLabelKey(value)) ?? value.slice(0, 40)
    if (!selected(existing)) setDraft({ ...draft, labels: [...draft.labels, existing] })
  }
  function save(event: FormEvent) {
    event.preventDefault()
    if (imageBusy) { setError('Vänta tills bilden är färdig.'); return }
    if (!draft.title.trim()) { setError('Ange en titel.'); return }
    if (!validateRecipeUrl(draft.url)) { setError('Ange en giltig http- eller https-länk.'); return }
    const chosen = predefinedRecipeLabels.filter(label => selected(label))
    const own = draft.labels.filter(label => !predefinedRecipeLabels.includes(recipeLabelKey(label))).map(label => label.trim()).filter(Boolean)
    const labels = [...chosen, ...own.filter((label, index) => own.findIndex(other => recipeLabelKey(other) === recipeLabelKey(label)) === index)]
    const next = { ...draft, ...(isCatalogRecipe(draft.id) ? { catalogEdited: true } : {}), title: draft.title.trim(), url: draft.url.trim(), ingredients: draft.ingredients?.trim() ?? '', steps: draft.steps.trim(), notes: draft.notes?.trim() ?? '', labels }
    setDraft(next)
    const failure = onSave(next, original)
    if (failure) setError(failure)
    else onClose()
  }
  return <Modal dirty={imageBusy || JSON.stringify(draft) !== initialDraft.current} title={recipe ? 'Redigera recept' : 'Nytt recept'} onClose={onClose} error={error} footer={requestClose => <><button className="button secondary" type="button" onClick={requestClose}>Avbryt</button><button className="button primary" type="submit" disabled={imageBusy} form="recipe-form"><Check size={16} />Spara recept</button></>}>
    <form id="recipe-form" onSubmit={save}><label className="field">Titel<input className="input" required autoFocus maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <div className="field recipe-image-field"><span className="field-label">Bild <span className="field-help">Valfri · visas på receptkortet</span></span>
        <input ref={fileRef} className="sr-only" type="file" accept="image/*" aria-label="Välj bild till receptet" tabIndex={-1} onChange={event => { void chooseImage(event) }} />
        {draft.image && isRecipeImage(draft.image) ? <div className="recipe-image-preview"><img src={draft.image} alt="Vald bild för receptet" /><div className="recipe-image-actions"><button className="button secondary small" type="button" disabled={imageBusy} onClick={() => fileRef.current?.click()}><RefreshCw size={14} />Byt bild</button><button className="button secondary small danger" type="button" onClick={removeImage}><Trash2 size={14} />Ta bort bild</button></div></div>
          : <button className="recipe-image-add" type="button" disabled={imageBusy} onClick={() => fileRef.current?.click()}><ImagePlus size={22} strokeWidth={1.5} /><span>{imageBusy ? 'Förbereder bilden…' : 'Lägg till bild'}</span><small>Från kamerarullen eller kameran</small></button>}
      </div><label className="field">Inspiration <span className="field-help">Valfri · originalsida</span><input className="input" type="url" inputMode="url" aria-label="Inspiration" placeholder="https://" value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} /></label><label className="field">Ingredienser<textarea aria-label="Ingredienser" className="textarea" rows={5} placeholder="Mängder och råvaror, gärna en per rad" value={draft.ingredients ?? ''} onChange={event => setDraft({ ...draft, ingredients: event.target.value })} /></label><label className="field">Gör så här<textarea aria-label="Gör så här" className="textarea" rows={6} value={draft.steps} onChange={event => setDraft({ ...draft, steps: event.target.value })} /></label><label className="field">Övrigt <span className="field-help">Valfritt · tid, portioner och förvaring</span><textarea aria-label="Övrigt" className="textarea" rows={3} value={draft.notes ?? ''} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
      <fieldset className="tag-field"><legend>Etiketter</legend><div className="tag-options">{options.map(label => <button className={`tag-chip${selected(label) ? ' active' : ''}`} type="button" aria-pressed={selected(label)} key={recipeLabelKey(label)} onClick={() => toggleLabel(label)}>{displayLabel(label)}</button>)}<TagAdder label="Lägg till etikett" placeholder="Ny etikett" onAdd={addLabel} /></div></fieldset>
    </form>
  </Modal>
}

export function Recipes({ recipes, onSave, onDelete, initialId, libraryHelp = true, headerAction }: {
  recipes: Recipe[];
  libraryHelp?: boolean;
  initialId?: string;
  onSave: (edited: Recipe, original?: Recipe) => string | null;
  headerAction?: ReactNode;
  onDelete: (id: string) => string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null)
  const selected = recipes.find(recipe => recipe.id === selectedId) ?? null
  const setSelected = (recipe: Recipe | null) => setSelectedId(recipe?.id ?? null)
  const [editing, setEditing] = useState<Recipe | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [query, setQuery] = useState('')
  const searchTerms = query.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean)
  const favoriteCount = recipes.filter(recipe => recipe.favorite).length
  const used = recipeLabelOptions(recipes).filter(label => recipes.some(recipe => recipe.labels.some(value => recipeLabelKey(value) === recipeLabelKey(label))) && !recipes.every(recipe => recipe.labels.some(value => recipeLabelKey(value) === recipeLabelKey(label))))
  used.sort((a, b) => { const ai = cuisineLabels.indexOf(a); const bi = cuisineLabels.indexOf(b); return (ai < 0 ? cuisineLabels.length : ai) - (bi < 0 ? cuisineLabels.length : bi) })
  const activeFilter = filter && used.some(label => recipeLabelKey(label) === filter) ? filter : null
  const ordered = [...recipes].filter(recipe => searchTerms.every(term => `${recipe.title} ${recipeContent(recipe).ingredients} ${recipe.labels.join(' ')}`.toLocaleLowerCase('sv').includes(term)) && (!favoritesOnly || recipe.favorite) && (!activeFilter || recipe.labels.some(label => recipeLabelKey(label) === activeFilter))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  function open(recipe: Recipe) {
    setSelected(recipe); setError(null)
  }
  function toggleFavorite(recipe: Recipe) {
    const current = recipes.find(item => item.id === recipe.id)
    if (!current) return
    const failure = onSave({ ...current, favorite: !current.favorite }, current)
    setError(failure)
  }
  function favoriteButton(recipe: Recipe) {
    return <button className={`icon-button recipe-favorite${recipe.favorite ? ' is-favorite' : ''}`} type="button" aria-pressed={!!recipe.favorite} aria-label={`${recipe.favorite ? 'Ta bort' : 'Lägg till'} ${recipe.title} ${recipe.favorite ? 'från' : 'bland'} favoriter`} title={recipe.favorite ? 'Ta bort favorit' : 'Lägg till favorit'} onClick={() => toggleFavorite(recipe)}><Heart size={18} fill={recipe.favorite ? 'currentColor' : 'none'} /></button>
  }
  return <div className="others-content recipe-browser"><div className="others-list-toolbar">{headerAction}<span>{activeFilter || favoritesOnly || query.trim() ? `${ordered.length} av ${recipes.length} recept` : `${recipes.length} recept`}</span><button className="button primary" type="button" onClick={() => setEditing(null)}><Plus size={16} />Nytt recept</button></div>
    {(libraryHelp || recipes.length > 6) && <label className="field recipe-search">Sök recept<input className="input" type="search" placeholder="Namn eller råvara, t.ex. kyckling" value={query} onChange={event => setQuery(event.target.value)} /></label>}
    {libraryHelp && <p className="others-help">100 recept i Receptbanken för middag och matlådor, cirka 4 vuxenportioner. Tryck på hjärtat för att spara favoriter. Kostnaderna är uppskattningar; recepten är inte provlagade eller exakt näringsberäknade.</p>}
    {(libraryHelp || recipes.length > 6) && <div className="filter-chips" role="group" aria-label="Visa recept"><button className={`filter-chip${favoritesOnly ? '' : ' active'}`} type="button" aria-pressed={!favoritesOnly} onClick={() => setFavoritesOnly(false)}>Alla recept<span className="filter-count">{recipes.length}</span></button><button className={`filter-chip${favoritesOnly ? ' active' : ''}`} type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(true)}><Heart size={15} fill={favoritesOnly ? 'currentColor' : 'none'} />Favoriter<span className="filter-count">{favoriteCount}</span></button></div>}
    {error && !selected && <p className="others-error" role="alert">{error}</p>}
    {(libraryHelp || recipes.length > 6) && used.length > 0 && <p className="others-help recipe-filter-help">Filtrera efter kök och etiketter. Kök anger smak och inspiration.</p>}
    {(libraryHelp || recipes.length > 6) && used.length > 0 && <label className="field">Kök och etiketter<select className="select" aria-label="Kök och etiketter" value={activeFilter ?? ''} onChange={event => setFilter(event.target.value || null)}><option value="">Alla kök och etiketter</option>{used.map(label => <option key={recipeLabelKey(label)} value={recipeLabelKey(label)}>{displayLabel(label)} ({recipes.filter(recipe => recipe.labels.some(value => recipeLabelKey(value) === recipeLabelKey(label))).length})</option>)}</select></label>}
    <div className="others-record-list">{ordered.map(recipe => <article className="others-record-row recipe-list-row" key={recipe.id} data-recipe-id={recipe.id}><button className="others-record-open" type="button" aria-label={`Öppna recept ${recipe.title}`} onClick={() => open(recipe)}>{recipe.image && isRecipeImage(recipe.image) ? <img className="recipe-thumb" src={recipe.image} alt="" loading="lazy" decoding="async" /> : <span className="others-record-icon"><CookingPot size={19} strokeWidth={1.5} /></span>}<span className="others-record-copy"><strong>{recipe.title}</strong>{recipe.labels.length > 0 && <span className="recipe-list-labels">{recipe.labels.filter(label => isCuisineLabel(label) || !['middag', 'receptbanken'].includes(recipeLabelKey(label))).map(label => <span className={`label-chip${isCuisineLabel(label) ? ' recipe-cuisine-chip' : ''}`} key={label}>{displayLabel(label)}</span>)}</span>}</span><ArrowUpRight size={16} /></button>{favoriteButton(recipe)}</article>)}</div>
    {recipes.length === 0 && <p className="others-empty">Inga recept ännu.</p>}
    {recipes.length > 0 && ordered.length === 0 && <p className="others-empty">{query.trim() ? 'Inga recept matchar sökningen. Prova en annan råvara eller ändra filtren.' : favoritesOnly ? (activeFilter ? 'Inga favoriter med den etiketten.' : 'Inga favoriter ännu. Tryck på hjärtat vid ett recept för att spara det här.') : 'Inga recept med den etiketten.'}</p>}
    {selected && editing === undefined && <RecipeReader key={selected.id} recipe={selected} onClose={() => setSelected(null)} error={error} footer={<>{favoriteButton(selected)}{!isCatalogRecipe(selected.id) && <button className="icon-button danger" type="button" aria-label="Ta bort recept" onClick={() => { const failure = onDelete(selected.id); if (failure) setError(failure); else setSelected(null) }}><Trash2 size={18} /></button>}<button className="button secondary" type="button" onClick={() => setSelected(null)}>Stäng</button><button className="button primary" type="button" onClick={() => { setEditing(selected); setSelected(null) }}><Pencil size={15} />Redigera</button></>} />}
    {editing !== undefined && <RecipeEditor key={editing?.id ?? 'new-recipe'} recipe={editing ?? undefined} recipes={recipes} onSave={onSave} onClose={() => setEditing(undefined)} />}
  </div>
}
