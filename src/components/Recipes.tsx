import { useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, CookingPot, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Recipe } from '../lib/types'
import { newId } from '../lib/helpers'
import { predefinedRecipeLabels, recipeLabelKey, recipeLabelOptions, safeRecipeUrl, validateRecipeUrl } from '../lib/others'
import { Modal } from './Modal'
import { TagAdder } from './TagAdder'

const displayLabel = (label: string) => predefinedRecipeLabels.includes(recipeLabelKey(label)) ? `${label[0].toLocaleUpperCase('sv')}${label.slice(1)}` : label

function RecipeEditor({ recipe, recipes, onSave, onClose }: {
  recipe?: Recipe;
  recipes: Recipe[];
  onSave: (edited: Recipe, original?: Recipe) => string | null;
  onClose: () => void;
}) {
  const [original] = useState(() => recipe ? structuredClone(recipe) : undefined)
  const [draft, setDraft] = useState<Recipe>(() => recipe ? structuredClone(recipe) : {
    id: newId(), title: '', url: '', steps: '', labels: [], createdAt: new Date().toISOString(),
  })
  const [error, setError] = useState<string | null>(null)
  const options = recipeLabelOptions(recipes, draft.labels)
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
    if (!draft.title.trim()) { setError('Ange en titel.'); return }
    if (!validateRecipeUrl(draft.url)) { setError('Ange en giltig http- eller https-länk.'); return }
    const chosen = predefinedRecipeLabels.filter(label => selected(label))
    const own = draft.labels.filter(label => !predefinedRecipeLabels.includes(recipeLabelKey(label))).map(label => label.trim()).filter(Boolean)
    const labels = [...chosen, ...own.filter((label, index) => own.findIndex(other => recipeLabelKey(other) === recipeLabelKey(label)) === index)]
    const next = { ...draft, title: draft.title.trim(), url: draft.url.trim(), steps: draft.steps.trim(), labels }
    setDraft(next)
    const failure = onSave(next, original)
    if (failure) setError(failure)
    else onClose()
  }
  return <Modal title={recipe ? 'Redigera recept' : 'Nytt recept'} onClose={onClose} error={error} footer={<><button className="button secondary" type="button" onClick={onClose}>Avbryt</button><button className="button primary" type="submit" form="recipe-form"><Check size={16} />Spara recept</button></>}>
    <form id="recipe-form" onSubmit={save}><label className="field">Titel<input className="input" required autoFocus maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><label className="field">Länk <span className="field-help">Valfri</span><input className="input" type="url" inputMode="url" aria-label="Länk" placeholder="https://" value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} /></label><label className="field">Steg<textarea className="textarea" rows={6} value={draft.steps} onChange={event => setDraft({ ...draft, steps: event.target.value })} /></label>
      <fieldset className="tag-field"><legend>Etiketter</legend><div className="tag-options">{options.map(label => <button className={`tag-chip${selected(label) ? ' active' : ''}`} type="button" aria-pressed={selected(label)} key={recipeLabelKey(label)} onClick={() => toggleLabel(label)}>{displayLabel(label)}</button>)}<TagAdder label="Lägg till etikett" placeholder="Ny etikett" onAdd={addLabel} /></div></fieldset>
    </form>
  </Modal>
}

export function Recipes({ recipes, onSave, onDelete, initialId }: {
  recipes: Recipe[];
  initialId?: string;
  onSave: (edited: Recipe, original?: Recipe) => string | null;
  onDelete: (id: string) => string | null;
}) {
  const [selected, setSelected] = useState<Recipe | null>(() => recipes.find(recipe => recipe.id === initialId) ?? null)
  const [editing, setEditing] = useState<Recipe | null | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const used = recipeLabelOptions(recipes).filter(label => recipes.some(recipe => recipe.labels.some(value => recipeLabelKey(value) === recipeLabelKey(label))))
  const activeFilter = filter && used.some(label => recipeLabelKey(label) === filter) ? filter : null
  const ordered = [...recipes].filter(recipe => !activeFilter || recipe.labels.some(label => recipeLabelKey(label) === activeFilter)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const link = selected ? safeRecipeUrl(selected.url) : null
  function open(recipe: Recipe) {
    setSelected(recipe); setConfirmDelete(false); setError(null)
  }
  return <div className="others-content"><div className="others-list-toolbar"><span>{activeFilter ? `${ordered.length} av ${recipes.length} recept` : `${recipes.length} recept`}</span><button className="button primary" type="button" onClick={() => setEditing(null)}><Plus size={16} />Nytt recept</button></div>
    {used.length > 0 && <div className="filter-chips" role="group" aria-label="Filtrera recept efter etikett"><button className={`filter-chip${activeFilter ? '' : ' active'}`} type="button" aria-pressed={!activeFilter} onClick={() => setFilter(null)}>Alla<span className="filter-count">{recipes.length}</span></button>{used.map(label => { const count = recipes.filter(recipe => recipe.labels.some(value => recipeLabelKey(value) === recipeLabelKey(label))).length; return <button className={`filter-chip${activeFilter === recipeLabelKey(label) ? ' active' : ''}`} type="button" key={recipeLabelKey(label)} aria-pressed={activeFilter === recipeLabelKey(label)} onClick={() => setFilter(activeFilter === recipeLabelKey(label) ? null : recipeLabelKey(label))}>{displayLabel(label)}<span className="filter-count">{count}</span></button> })}</div>}
    <div className="others-record-list">{ordered.map(recipe => <button className="others-record-row recipe-list-row" type="button" key={recipe.id} data-recipe-id={recipe.id} aria-label={`Öppna recept ${recipe.title}`} onClick={() => open(recipe)}><span className="others-record-icon"><CookingPot size={19} strokeWidth={1.5} /></span><span className="others-record-copy"><strong>{recipe.title}</strong>{recipe.labels.length > 0 && <span className="recipe-list-labels">{recipe.labels.map(label => <span className="label-chip" key={label}>{displayLabel(label)}</span>)}</span>}</span><ArrowUpRight size={16} /></button>)}</div>
    {recipes.length === 0 && <p className="others-empty">Inga recept ännu.</p>}
    {recipes.length > 0 && ordered.length === 0 && <p className="others-empty">Inga recept med den etiketten.</p>}
    {selected && editing === undefined && <Modal title={selected.title} onClose={() => setSelected(null)} error={error} footer={<><button className="icon-button danger" type="button" aria-label="Ta bort recept" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button><button className="button secondary" type="button" onClick={() => setSelected(null)}>Stäng</button><button className="button primary" type="button" onClick={() => { setEditing(selected); setSelected(null) }}><Pencil size={15} />Redigera</button></>}>
      {selected.labels.length > 0 && <div className="recipe-detail-labels">{selected.labels.map(label => <span className="label-chip" key={label}>{displayLabel(label)}</span>)}</div>}
      {link && <a className="button secondary recipe-link" href={link} target="_blank" rel="noopener noreferrer">Öppna länk<ArrowUpRight size={16} /></a>}
      {selected.steps ? <div className="recipe-steps">{selected.steps}</div> : <p className="others-help">Inga steg tillagda.</p>}
      {confirmDelete && <div className="form-message delete-confirm"><p>Ta bort receptet?</p><button className="button secondary" type="button" onClick={() => setConfirmDelete(false)}>Behåll</button><button className="button primary danger" type="button" onClick={() => { const failure = onDelete(selected.id); if (failure) setError(failure); else setSelected(null) }}>Ta bort</button></div>}
    </Modal>}
    {editing !== undefined && <RecipeEditor key={editing?.id ?? 'new-recipe'} recipe={editing ?? undefined} recipes={recipes} onSave={onSave} onClose={() => setEditing(undefined)} />}
  </div>
}
