import { useState } from 'react'
import { House, Columns3, CalendarDays, Folder, LayoutList, NotebookText, BookOpen, Utensils, Dumbbell, Cake, Pencil } from 'lucide-react'

export const menuOptions = [
  { id: 'home', label: 'Home', Icon: House }, { id: 'planner', label: 'Planner', Icon: Columns3 },
  { id: 'schedule', label: 'Schema', Icon: CalendarDays }, { id: 'projects', label: 'Projects', Icon: Folder },
  { id: 'others', label: 'Others', Icon: LayoutList }, { id: 'notes', label: 'Anteckningar', Icon: NotebookText },
  { id: 'recipes', label: 'Recept', Icon: BookOpen }, { id: 'nutrition', label: 'Kost', Icon: Utensils },
  { id: 'workouts', label: 'Träning', Icon: Dumbbell }, { id: 'birthdays', label: 'Födelsedagar', Icon: Cake },
] as const
export type MenuId = typeof menuOptions[number]['id']
export const defaultMenu: MenuId[] = ['home', 'planner', 'schedule', 'projects', 'others']
const key = 'forma-desktop-menu-v1'
export function readDesktopMenu(): MenuId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || 'null')
    if (Array.isArray(value)) return ['home', ...menuOptions.filter(x => x.id !== 'home' && value.includes(x.id)).map(x => x.id)]
  } catch { /* Use the standard menu when a preference cannot be read. */ }
  return defaultMenu
}
export function DesktopMenuSettings({ selected, onChange }: { selected: MenuId[]; onChange: (value: MenuId[]) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(selected)
  const [error, setError] = useState('')
  function save() {
    try { localStorage.setItem(key, JSON.stringify(draft)) }
    catch { setError('Menyn kunde inte sparas. Försök igen.'); return }
    onChange(draft); setEditing(false); setError('')
  }
  return <section className="profile-card" aria-labelledby="menu-settings-title">
    <div className="profile-section-heading"><LayoutList size={18} /><h2 id="menu-settings-title">Meny</h2></div>
    <p className="profile-description">Välj vilka funktioner som visas i sidomenyn på den här datorn. Innehållet finns kvar när du döljer en funktion.</p>
    {!editing ? <button className="button secondary" onClick={() => { setDraft(selected); setError(''); setEditing(true) }}><Pencil size={16} />Redigera meny</button> : <>
      <fieldset style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}><legend className="sr-only">Synliga funktioner</legend>
        {menuOptions.map(({ id, label }) => <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}><input type="checkbox" checked={draft.includes(id)} disabled={id === 'home'} onChange={e => setDraft(current => e.target.checked ? [...current, id] : current.filter(x => x !== id))} />{label}{id === 'home' && <small>Visas alltid</small>}</label>)}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="home-layout-actions" style={{ marginTop: 16 }}><button className="button primary" onClick={save}>Spara meny</button><button className="button secondary" onClick={() => setEditing(false)}>Avbryt</button><button className="button ghost" onClick={() => setDraft(defaultMenu)}>Standardmeny</button></div>
    </>}
  </section>
}
