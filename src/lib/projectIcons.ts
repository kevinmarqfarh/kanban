// Catalogue of icons a project can use. Keys are persisted in workspace data
// (`project.icon`), so existing keys must never be renamed or removed — only added.
// The React components for each key live in `components/Projects.tsx`, where the
// compiler enforces that every key below has a matching icon.

export const projectIconGroups = [
  { id: 'general', label: 'Allmänt' },
  { id: 'home', label: 'Hem och familj' },
  { id: 'health', label: 'Hälsa och mat' },
  { id: 'leisure', label: 'Resor och fritid' },
  { id: 'work', label: 'Arbete och lärande' },
  { id: 'creative', label: 'Kreativt' },
] as const

export type ProjectIconGroup = typeof projectIconGroups[number]['id']

export const projectIconCatalog = [
  // The first five are the original icons and stay first so older data looks unchanged.
  { key: 'folder', label: 'Mapp', group: 'general' },
  { key: 'leaf', label: 'Löv', group: 'home' },
  { key: 'home', label: 'Hem', group: 'home' },
  { key: 'compass', label: 'Kompass', group: 'leisure' },
  { key: 'sparkles', label: 'Gnistor', group: 'general' },

  { key: 'target', label: 'Mål', group: 'general' },
  { key: 'flag', label: 'Milstolpe', group: 'general' },
  { key: 'star', label: 'Stjärna', group: 'general' },
  { key: 'lightbulb', label: 'Idé', group: 'general' },
  { key: 'calendar', label: 'Kalender', group: 'general' },
  { key: 'piggy-bank', label: 'Sparande', group: 'general' },

  { key: 'users', label: 'Familj', group: 'home' },
  { key: 'baby', label: 'Barn', group: 'home' },
  { key: 'paw-print', label: 'Husdjur', group: 'home' },
  { key: 'hammer', label: 'Bygge', group: 'home' },
  { key: 'wrench', label: 'Reparation', group: 'home' },
  { key: 'sprout', label: 'Odling', group: 'home' },
  { key: 'shopping-bag', label: 'Inköp', group: 'home' },
  { key: 'gift', label: 'Present', group: 'home' },

  { key: 'heart-pulse', label: 'Hälsa', group: 'health' },
  { key: 'dumbbell', label: 'Träning', group: 'health' },
  { key: 'bike', label: 'Cykel', group: 'health' },
  { key: 'utensils', label: 'Mat', group: 'health' },
  { key: 'coffee', label: 'Kaffe', group: 'health' },

  { key: 'plane', label: 'Flyg', group: 'leisure' },
  { key: 'map-pin', label: 'Plats', group: 'leisure' },
  { key: 'car', label: 'Bil', group: 'leisure' },
  { key: 'mountain', label: 'Äventyr', group: 'leisure' },
  { key: 'tent', label: 'Camping', group: 'leisure' },
  { key: 'sun', label: 'Semester', group: 'leisure' },
  { key: 'party-popper', label: 'Fest', group: 'leisure' },
  { key: 'gamepad', label: 'Spel', group: 'leisure' },

  { key: 'briefcase', label: 'Arbete', group: 'work' },
  { key: 'rocket', label: 'Lansering', group: 'work' },
  { key: 'code', label: 'Kod', group: 'work' },
  { key: 'graduation-cap', label: 'Studier', group: 'work' },
  { key: 'book', label: 'Läsning', group: 'work' },

  { key: 'palette', label: 'Konst', group: 'creative' },
  { key: 'pen-line', label: 'Skrivande', group: 'creative' },
  { key: 'camera', label: 'Foto', group: 'creative' },
  { key: 'music', label: 'Musik', group: 'creative' },
] as const satisfies readonly { key: string; label: string; group: ProjectIconGroup }[]

export type ProjectIconKey = typeof projectIconCatalog[number]['key']

export const defaultProjectIcon: ProjectIconKey = 'folder'

export function isProjectIconKey(value: string): value is ProjectIconKey {
  return projectIconCatalog.some(icon => icon.key === value)
}

/** Unknown keys (e.g. from a newer client or hand-edited data) fall back to the default icon. */
export function resolveProjectIcon(value: string): ProjectIconKey {
  return isProjectIconKey(value) ? value : defaultProjectIcon
}

export function projectIconLabel(value: string): string {
  const key = resolveProjectIcon(value)
  return projectIconCatalog.find(icon => icon.key === key)!.label
}

export function projectIconsByGroup() {
  return projectIconGroups.map(group => ({ ...group, icons: projectIconCatalog.filter(icon => icon.group === group.id) }))
}
