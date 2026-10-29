import { useState } from 'react'
import { House, Columns3, CalendarDays, Folder, LayoutList, NotebookText, BookOpen, Utensils, Dumbbell, Cake, Pencil, ArrowUp, ArrowDown, ShoppingBasket, BookHeart } from 'lucide-react'

export const menuOptions = [
  { id: 'home', label: 'Home', Icon: House }, { id: 'planner', label: 'Planner', Icon: Columns3 },
  { id: 'schedule', label: 'Schema', Icon: CalendarDays }, { id: 'projects', label: 'Projects', Icon: Folder },
  { id: 'shopping', label: 'Inköp', Icon: ShoppingBasket }, { id: 'diary', label: 'Dagbok', Icon: BookHeart },
  { id: 'others', label: 'Others', Icon: LayoutList }, { id: 'notes', label: 'Anteckningar', Icon: NotebookText },
  { id: 'recipes', label: 'Recept', Icon: BookOpen }, { id: 'nutrition', label: 'Kost', Icon: Utensils },
  { id: 'workouts', label: 'Träning', Icon: Dumbbell }, { id: 'birthdays', label: 'Födelsedagar', Icon: Cake },
] as const
export type MenuId = typeof menuOptions[number]['id']
export const defaultMenu: MenuId[] = ['home', 'planner', 'schedule', 'projects', 'shopping', 'diary', 'others']
const key = 'forma-desktop-menu-v2'
const mobileKey = 'forma-mobile-menu-v1'
export function readDesktopMenu(): MenuId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || localStorage.getItem('forma-desktop-menu-v1') || 'null')
    if (Array.isArray(value)) {
      const valid = [...new Set(value.filter((id): id is MenuId => menuOptions.some(item => item.id === id)))]
      const migrated = localStorage.getItem(key) ? valid : [...valid, 'shopping', 'diary'] as MenuId[]
      return migrated.includes('home') ? migrated : ['home', ...migrated]
    }
  } catch { /* Use the standard menu when a preference cannot be read. */ }
  return defaultMenu
}
export function readMobileMenu(): MenuId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(mobileKey) || 'null')
    if (Array.isArray(value)) {
      const valid = [...new Set(value.filter((id): id is MenuId => menuOptions.some(item => item.id === id)))]
      return valid.includes('home') ? valid : ['home', ...valid]
    }
  } catch { /* Use the standard menu when a preference cannot be read. */ }
  return defaultMenu
}
export function MenuSettings({ selected, onChange, mobile = false }: { selected: MenuId[]; onChange: (value: MenuId[]) => void; mobile?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(selected)
  const [error, setError] = useState('')
  function move(id: MenuId, step: number) {
    setDraft(current => {
      const next = [...current], index = next.indexOf(id), target = index + step
      if (index < 0 || target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }
  const orderedOptions = [...draft.map(id => menuOptions.find(item => item.id === id)!), ...menuOptions.filter(item => !draft.includes(item.id))]
  function save() {
    try { localStorage.setItem(mobile ? mobileKey : key, JSON.stringify(draft)) }
    catch { setError('Menyn kunde inte sparas. Försök igen.'); return }
    onChange(draft); setEditing(false); setError('')
  }
  return <section className="profile-card menu-settings" aria-labelledby="menu-settings-title">
    <div className="profile-section-heading"><LayoutList size={18} /><h2 id="menu-settings-title">Meny</h2></div>
    <p className="profile-description">Välj funktioner och ändra ordningen med pilarna. {mobile ? 'Valet gäller menyraden på den här enheten.' : 'Valet gäller sidomenyn på den här datorn.'} Innehållet finns kvar när du döljer en funktion.</p>
    {!editing ? <button className="button secondary" onClick={() => { setDraft(selected); setError(''); setEditing(true) }}><Pencil size={16} />Redigera meny</button> : <>
      <fieldset className="menu-settings-options"><legend className="sr-only">Synliga funktioner</legend>
        {orderedOptions.map(({ id, label }) => <div key={id} className="menu-settings-option">
          <label><input type="checkbox" checked={draft.includes(id)} disabled={id === 'home'} onChange={e => setDraft(current => e.target.checked ? [...current, id] : current.filter(x => x !== id))} />{label}{id === 'home' && <small>Visas alltid</small>}</label>
          {draft.includes(id) && <><button className="icon-button" type="button" aria-label={`Flytta ${label} uppåt`} disabled={draft.indexOf(id) === 0} onClick={() => move(id, -1)}><ArrowUp size={16} /></button><button className="icon-button" type="button" aria-label={`Flytta ${label} nedåt`} disabled={draft.indexOf(id) === draft.length - 1} onClick={() => move(id, 1)}><ArrowDown size={16} /></button></>}
        </div>)}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="home-layout-actions menu-settings-actions"><button className="button primary" onClick={save}>Spara meny</button><button className="button secondary" onClick={() => setEditing(false)}>Avbryt</button><button className="button ghost" onClick={() => setDraft(defaultMenu)}>Standardmeny</button></div>
    </>}
  </section>
}
