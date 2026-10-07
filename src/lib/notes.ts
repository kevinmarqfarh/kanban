import type { Note, NoteLinkKind, Workspace } from './types'

export const noteLinkKinds: NoteLinkKind[] = ['task', 'project', 'workout', 'nutrition', 'recipe', 'birthday']
export const noteLinkLabels: Record<NoteLinkKind, string> = {
  task: 'Planner', project: 'Projects', workout: 'Träning', nutrition: 'Kost', recipe: 'Recept', birthday: 'Födelsedagar',
}
export interface NoteLinkItem { kind: NoteLinkKind; id: string; title: string }
export function noteLinkItems(workspace: Workspace): NoteLinkItem[] {
  return [
    ...workspace.tasks.map(item => ({ kind: 'task' as const, id: item.id, title: item.title })),
    ...workspace.projects.map(item => ({ kind: 'project' as const, id: item.id, title: item.title })),
    ...(workspace.workouts ?? []).map(item => ({ kind: 'workout' as const, id: item.id, title: `${item.title || 'Träningspass'} · ${item.date}` })),
    ...(workspace.nutritionHabits ?? []).map(item => ({ kind: 'nutrition' as const, id: item.id, title: item.title })),
    ...(workspace.recipes ?? []).map(item => ({ kind: 'recipe' as const, id: item.id, title: item.title })),
    ...(workspace.birthdays ?? []).map(item => ({ kind: 'birthday' as const, id: item.id, title: item.name })),
  ]
}

const allowedTags = new Set(['DIV', 'P', 'BR', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BLOCKQUOTE', 'H1', 'H2', 'H3'])
const droppedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'LINK', 'META'])

/** Inert templates prevent pasted/stored markup from loading external resources. */
export function sanitizeNoteHtml(html: string): string {
  const input = document.createElement('template')
  input.innerHTML = html
  const output = document.createElement('div')
  const copy = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent ?? '')); return }
    if (!(node instanceof HTMLElement) || droppedTags.has(node.tagName)) return
    let target: HTMLElement | undefined
    if (allowedTags.has(node.tagName)) target = document.createElement(node.tagName.toLowerCase())
    else if (node.tagName === 'A') {
      const kind = node.dataset.noteKind as NoteLinkKind
      const id = node.dataset.noteTarget
      if (noteLinkKinds.includes(kind) && id && id.length <= 200 && id.trim()) {
        target = document.createElement('a')
        target.dataset.noteKind = kind; target.dataset.noteTarget = id
        target.setAttribute('href', `#forma/${kind}/${encodeURIComponent(id)}`)
        target.setAttribute('contenteditable', 'false')
      }
    }
    if (target) parent.appendChild(target)
    for (const child of Array.from(node.childNodes)) copy(child, target ?? parent)
  }
  for (const node of Array.from(input.content.childNodes)) copy(node, output)
  return output.innerHTML
}

export function notePlainText(html: string): string {
  const holder = document.createElement('div')
  holder.innerHTML = sanitizeNoteHtml(html)
  for (const br of holder.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'))
  for (const item of holder.querySelectorAll('div,p,li,h1,h2,h3,blockquote')) item.appendChild(document.createTextNode('\n'))
  return (holder.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

export const NOTE_TRASH_DAYS = 30
const DAY = 86_400_000

export const isTrashed = (note: Note) => !!note.deletedAt

/** Whole days left before a trashed note is removed for good (0 on its last day). */
export function trashDaysLeft(note: Note, now: Date = new Date()): number {
  if (!note.deletedAt) return NOTE_TRASH_DAYS
  const deleted = Date.parse(note.deletedAt)
  if (!Number.isFinite(deleted)) return 0
  return Math.max(0, Math.ceil((deleted + NOTE_TRASH_DAYS * DAY - now.getTime()) / DAY))
}
