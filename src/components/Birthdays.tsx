import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDownUp, Bell, Cake, Check, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Birthday, BirthdayReminder } from '../lib/types'
import {
  BIRTHDAY_TAG_MAX_LENGTH, REMINDER_OPTIONS, birthdayCountdownLabel, birthdayUrgency, birthdayGroupKey, birthdayTagOptions, currentBirthdayAge,
  daysUntilBirthday, groupBirthdays, isValidBirthDate, localDateString, nextBirthday, resolveBirthdayTag, sortBirthdaysByUpcoming,
} from '../lib/birthdays'
import { newId } from '../lib/helpers'
import { Modal } from './Modal'
import { TagAdder } from './TagAdder'

export interface BirthdayOrderGroup { tag: string | null; ids: string[] }
interface DragGroup extends BirthdayOrderGroup { key: string; label: string }

function reminderLabel(value: BirthdayReminder) {
  if (value === 'day') return 'På födelsedagen'
  const label = REMINDER_OPTIONS.find(option => option.value === value)?.label ?? ''
  return `${label} före`
}

function occasionLabel(date: string, today: string) {
  if (date === today) return 'Idag'
  return new Date(`${date}T12:00:00`).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long',
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  })
}

const groupId = (key: string) => `group:${key}`
const isGroupId = (id: UniqueIdentifier) => String(id).startsWith('group:')

function Countdown({ days }: { days: number }) {
  const label = days === 0 ? 'Födelsedag idag' : days === 1 ? 'Födelsedag i morgon' : `${days} dagar kvar till födelsedagen`
  return <span className={`birthday-countdown${days === 0 ? ' is-today' : days <= 7 ? ' is-soon' : ''}`} role="img" aria-label={label} title={birthdayCountdownLabel(days)}>
    {days === 0 ? <Cake size={17} strokeWidth={1.6} aria-hidden="true" /> : <strong aria-hidden="true">{days}</strong>}
    <span aria-hidden="true">{days === 0 ? 'Idag' : days === 1 ? 'dag' : 'dagar'}</span>
  </span>
}

function BirthdayRow({ birthday, today, confirming, onEdit, onAskDelete, onCancelDelete, onDelete }: {
  birthday: Birthday; today: string; confirming: boolean;
  onEdit: () => void; onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: birthday.id, data: { type: 'birthday' } })
  const valid = isValidBirthDate(birthday.birthDate)
  const occasion = valid ? nextBirthday(birthday.birthDate) : null
  const days = valid ? daysUntilBirthday(birthday.birthDate) : null
  return <article ref={setNodeRef} className={`birthday-row${isDragging ? ' is-dragging' : ''}`} data-birthday-id={birthday.id} data-countdown={days ?? undefined} data-urgency={days !== null ? birthdayUrgency(days) ?? undefined : undefined}
    style={{ transform: CSS.Translate.toString(transform), transition }}>
    <div className="birthday-row-header">
      <button ref={setActivatorNodeRef} className="birthday-drag-handle" type="button" {...attributes} {...listeners} aria-label={`Flytta ${birthday.name}`} title="Dra för att flytta · mellanslag + piltangenter"><GripVertical size={16} /></button>
      {days !== null ? <Countdown days={days} /> : <span className="birthday-countdown is-unknown" aria-hidden="true"><Cake size={17} strokeWidth={1.5} /></span>}
      <div className="birthday-person"><h4>{birthday.name}</h4><p>{occasion ? <><span>{currentBirthdayAge(birthday.birthDate)} år</span><span>·</span><time dateTime={occasion.date}>{occasionLabel(occasion.date, today)}</time><span>·</span>fyller {occasion.age} år</> : 'Kontrollera födelsedatumet'}</p></div>
      <div className="birthday-row-actions"><button className="icon-button" type="button" aria-label={`Redigera födelsedag för ${birthday.name}`} onClick={onEdit}><Pencil size={16} /></button><button className="icon-button" type="button" aria-label={`Ta bort födelsedag för ${birthday.name}`} onClick={onAskDelete}><Trash2 size={16} /></button></div>
    </div>
    <div className="birthday-reminder-chips">{birthday.reminders.length ? birthday.reminders.map(reminder => <span className="birthday-reminder-chip" key={reminder}><Bell size={10} />{reminderLabel(reminder)}</span>) : <span className="birthday-no-reminders">Utan påminnelser</span>}</div>
    {confirming && <div className="birthday-delete-confirm"><p>Ta bort {birthday.name}?</p><div><button className="button secondary" type="button" onClick={onCancelDelete}>Behåll</button><button className="button primary danger" type="button" onClick={onDelete}>Ta bort</button></div></div>}
  </article>
}

function GroupSection({ group, showHeading, dragging, children }: { group: DragGroup; showHeading: boolean; dragging: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId(group.key), data: { type: 'group' } })
  return <section className={`birthday-group${isOver ? ' is-over' : ''}${group.ids.length ? '' : ' is-empty'}`} data-birthday-group={group.tag ?? ''} aria-label={group.label}>
    {showHeading && <div className="birthday-group-heading"><h3>{group.label}</h3><span className="count-badge">{group.ids.length}</span></div>}
    <SortableContext items={group.ids} strategy={verticalListSortingStrategy}>
      <div className="birthday-list" ref={setNodeRef}>{children}{!group.ids.length && dragging && <p className="birthday-drop-hint">Släpp här för {group.tag ? `taggen ${group.label}` : 'att ta bort taggen'}</p>}</div>
    </SortableContext>
  </section>
}

export function Birthdays({ birthdays, onSave, onDelete, onReorder, onClose }: {
  birthdays: Birthday[];
  onSave: (birthday: Birthday, original?: Birthday) => string | null;
  onDelete: (id: string) => string | null;
  onReorder: (groups: BirthdayOrderGroup[], message?: string) => string | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Birthday | null>(null)
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [remindersChanged, setRemindersChanged] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dragGroups, setDragGroups] = useState<DragGroup[] | null>(null)
  const dragRef = useRef<DragGroup[] | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const originalRef = useRef<Birthday | undefined>(undefined)
  const today = localDateString(new Date())
  const preview = draft && isValidBirthDate(draft.birthDate) && draft.birthDate <= today
    ? nextBirthday(draft.birthDate) : null
  const byId = new Map(birthdays.map(birthday => [birthday.id, birthday]))
  const baseGroups: DragGroup[] = groupBirthdays(birthdays).map(group => ({ key: group.key, tag: group.tag, label: group.label, ids: group.birthdays.map(birthday => birthday.id) }))
  const groups = dragGroups ?? baseGroups
  const grouped = groups.some(group => group.tag)
  const tagOptions = birthdayTagOptions(birthdays, [draft?.tag])
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const managerRef = useRef<HTMLDivElement>(null)
  function setGroups(next: DragGroup[] | null) {
    // The sheet is anchored to the bottom on phones (centred on larger screens). Lock its height while
    // dragging so the extra drop zones scroll inside it instead of moving every row under the finger.
    const panel = managerRef.current?.closest<HTMLElement>('.modal-panel')
    if (panel && next && !dragRef.current) panel.style.height = `${panel.getBoundingClientRect().height}px`
    if (panel && !next) panel.style.removeProperty('height')
    dragRef.current = next
    setDragGroups(next)
  }
  const findGroup = (list: DragGroup[], id: UniqueIdentifier) => isGroupId(id) ? list.find(group => groupId(group.key) === String(id)) : list.find(group => group.ids.includes(String(id)))

  // Prefer the person under the pointer, then the group; keyboard moves only target people and empty groups.
  const collision: CollisionDetection = args => {
    const empty = new Set((dragRef.current ?? []).filter(group => !group.ids.length || (group.ids.length === 1 && group.ids[0] === String(args.active.id))).map(group => groupId(group.key)))
    if (args.pointerCoordinates) {
      const hits = pointerWithin(args)
      const person = hits.find(hit => !isGroupId(hit.id))
      if (person) return [person]
      if (hits.length) return hits
      // Between rows the nearest person wins; outside the list nothing does, so the drop is cancelled.
      const area = managerRef.current?.querySelector('.birthday-groups')?.getBoundingClientRect()
      const { x, y } = args.pointerCoordinates
      if (!area || x < area.left || x > area.right || y < area.top - 24 || y > area.bottom + 24) return []
    }
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => !isGroupId(container.id) || empty.has(String(container.id))) })
  }

  // While dragging, Escape cancels the drag only; it must not also close the sheet.
  useEffect(() => {
    if (!dragGroups) return
    const keep = (event: KeyboardEvent) => { if (event.key === 'Escape') event.preventDefault() }
    window.addEventListener('keydown', keep, true)
    return () => window.removeEventListener('keydown', keep, true)
  }, [!!dragGroups])

  function startDrag() {
    setConfirmDelete(null); setError('')
    const present = new Set(baseGroups.map(group => group.key))
    // Empty presets are appended below the list so nothing above the dragged person shifts.
    const empties = groupBirthdays([], true).filter(group => !present.has(group.key)).map(group => ({ key: group.key, tag: group.tag, label: group.label, ids: [] }))
    const untagged = present.has(birthdayGroupKey(null)) ? [] : [{ key: birthdayGroupKey(null), tag: null, label: 'Utan tagg', ids: [] }]
    setGroups([...baseGroups.map(group => ({ ...group, ids: [...group.ids] })), ...empties, ...(grouped ? untagged : [])])
  }

  function dragOver({ active, over }: DragOverEvent) {
    const current = dragRef.current
    if (!current || !over) return
    const from = findGroup(current, active.id)
    const to = findGroup(current, over.id)
    if (!from || !to || from.key === to.key) return
    const activeId = String(active.id)
    const overIndex = to.ids.indexOf(String(over.id))
    const translated = active.rect.current.translated
    const below = overIndex >= 0 && translated && translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2
    const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : to.ids.length
    setGroups(current.map(group => group.key === from.key ? { ...group, ids: group.ids.filter(id => id !== activeId) }
      : group.key === to.key ? { ...group, ids: [...group.ids.slice(0, index), activeId, ...group.ids.slice(index)] } : group))
  }

  function finishDrag({ active, over }: DragEndEvent) {
    let current = dragRef.current
    setGroups(null)
    if (!current || !over) return
    const group = findGroup(current, active.id)
    if (group && !isGroupId(over.id) && group.ids.includes(String(over.id))) {
      const moved = arrayMove(group.ids, group.ids.indexOf(String(active.id)), group.ids.indexOf(String(over.id)))
      current = current.map(item => item.key === group.key ? { ...item, ids: moved } : item)
    }
    const before = baseGroups.flatMap(item => item.ids.map(id => `${id}:${item.key}`)).join('|')
    const after = current.flatMap(item => item.ids.map(id => `${id}:${item.key}`)).join('|')
    if (before === after) return
    const person = byId.get(String(active.id))
    const target = findGroup(current, active.id)
    const changedTag = person && target && birthdayGroupKey(person.tag) !== target.key
    const failure = onReorder(current.map(item => ({ tag: item.tag, ids: item.ids })), changedTag ? (target.tag ? `${person.name} är taggad som ${target.label}` : `Taggen är borttagen från ${person.name}`) : undefined)
    setError(failure ?? '')
  }

  function sortByDate() {
    const failure = onReorder(baseGroups.map(group => ({ tag: group.tag, ids: sortBirthdaysByUpcoming(group.ids.map(id => byId.get(id)!)).map(birthday => birthday.id) })), 'Sorterat efter nästa födelsedag')
    setError(failure ?? '')
  }

  function openForm(birthday?: Birthday) {
    originalRef.current = birthday ? structuredClone(birthday) : undefined
    setDraft(birthday ? { ...birthday, tag: birthday.tag ?? null, reminders: [...birthday.reminders], generatedReminders: [...birthday.generatedReminders] } : {
      id: newId(), name: '', birthDate: '', reminders: [], createdAt: new Date().toISOString(), generatedReminders: [], tag: null,
    })
    setRemindersEnabled(!!birthday?.reminders.length)
    setRemindersChanged(false)
    setConfirmDelete(null)
    setError('')
  }

  function returnToList() {
    setDraft(null)
    originalRef.current = undefined
    setError('')
  }

  function toggleReminder(value: BirthdayReminder) {
    if (!draft) return
    setDraft({ ...draft, reminders: draft.reminders.includes(value)
      ? draft.reminders.filter(reminder => reminder !== value) : [...draft.reminders, value] })
    setRemindersChanged(true)
    setError('')
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    if (!draft.name.trim()) {
      setError('Skriv ett namn.')
      nameRef.current?.focus()
      return
    }
    if (!isValidBirthDate(draft.birthDate)) {
      setError('Ange ett giltigt födelsedatum med år, månad och dag.')
      return
    }
    if (draft.birthDate > today) {
      setError('Födelsedatumet kan inte ligga i framtiden.')
      return
    }
    const reminders = remindersEnabled
      ? !remindersChanged && originalRef.current ? [...draft.reminders]
        : REMINDER_OPTIONS.filter(option => draft.reminders.includes(option.value)).map(option => option.value) : []
    if (remindersEnabled && !reminders.length) {
      setError('Välj minst en påminnelse.')
      return
    }
    const tag = resolveBirthdayTag(draft.tag, birthdays.map(birthday => birthday.tag))
    const failure = onSave({ ...draft, name: draft.name.trim(), reminders, tag }, originalRef.current)
    if (failure) { setError(failure); return }
    returnToList()
  }

  const selectedTag = resolveBirthdayTag(draft?.tag)
  return <Modal title="Födelsedagar" error={error} onClose={onClose} footer={draft ? <>
    <button className="button secondary" type="button" onClick={returnToList}>Avbryt</button>
    <button className="button primary" type="submit" form="birthday-form"><Check size={17} />Spara födelsedag</button>
  </> : <>
    <button className="button secondary" type="button" onClick={onClose}>Stäng</button>
    <button className="button primary" type="button" onClick={() => openForm()}><Plus size={17} />Lägg till födelsedag</button>
  </>}>
    {draft ? <form id="birthday-form" className="birthday-form" onSubmit={save}>
      <label className="field" htmlFor="birthday-name">Namn<input ref={nameRef} id="birthday-name" name="birthday-name" className="input" required autoFocus maxLength={120} autoComplete="off" value={draft.name} onChange={event => { setDraft({ ...draft, name: event.target.value }); setError('') }} /></label>
      <label className="field" htmlFor="birthday-date">Födelsedatum<input id="birthday-date" name="birthday-date" aria-label="Födelsedatum" aria-describedby={preview ? 'birthday-date-help' : undefined} className="input birthday-date-input" type="date" required min="0001-01-01" max={today} value={draft.birthDate} onChange={event => { setDraft({ ...draft, birthDate: event.target.value }); setError('') }} />
        {preview && <span className="field-help" id="birthday-date-help">{currentBirthdayAge(draft.birthDate)} år nu · {occasionLabel(preview.date, today)} · fyller {preview.age} år · {birthdayCountdownLabel(daysUntilBirthday(draft.birthDate)).toLocaleLowerCase('sv')}</span>}
      </label>
      {draft.birthDate.endsWith('-02-29') && <p className="birthday-help">År utan skottdag används 28 februari.</p>}
      <fieldset className="tag-field"><legend>Tagg</legend><div className="tag-options">
        <button className={`tag-chip${selectedTag ? '' : ' active'}`} type="button" aria-pressed={!selectedTag} onClick={() => setDraft({ ...draft, tag: null })}>Ingen</button>
        {tagOptions.map(tag => <button className={`tag-chip${selectedTag && birthdayGroupKey(selectedTag) === birthdayGroupKey(tag) ? ' active' : ''}`} type="button" key={tag} aria-pressed={!!selectedTag && birthdayGroupKey(selectedTag) === birthdayGroupKey(tag)} onClick={() => setDraft({ ...draft, tag })}>{tag}</button>)}
        <TagAdder label="Lägg till tagg" maxLength={BIRTHDAY_TAG_MAX_LENGTH} onAdd={value => { setDraft({ ...draft, tag: resolveBirthdayTag(value, tagOptions) }); setError('') }} />
      </div><p className="birthday-help">Taggen grupperar födelsedagen i översikten.</p></fieldset>
      <label className="birthday-reminder-toggle"><input type="checkbox" aria-label="Skapa påminnelser" aria-describedby="birthday-reminder-help" checked={remindersEnabled} onChange={event => {
        setRemindersEnabled(event.target.checked)
        setRemindersChanged(true)
        if (event.target.checked && !draft.reminders.length) setDraft({ ...draft, reminders: ['week'] })
        setError('')
      }} /><span><strong>Skapa påminnelser</strong></span><Bell size={17} /></label>
      {remindersEnabled && <fieldset className="birthday-reminders"><legend>Påminn mig</legend><div className="birthday-reminder-options">{REMINDER_OPTIONS.map(option => <label className="birthday-reminder-option" key={option.value}><input type="checkbox" checked={draft.reminders.includes(option.value)} onChange={() => toggleReminder(option.value)} /><span>{reminderLabel(option.value)}</span></label>)}</div>{draft.reminders.includes('day') && !draft.reminders.some(reminder => REMINDER_OPTIONS.some(option => option.value === reminder)) && <p className="birthday-help">Välj 7, 14 eller 30 dagar för att uppdatera påminnelsen.</p>}</fieldset>}
      <p className="birthday-help" id="birthday-reminder-help">Påminnelser visas i Home och i notiser när appen är öppen.</p>
    </form> : <div className="birthday-manager" ref={managerRef}>
      {birthdays.length === 0 ? <div className="birthday-empty"><span className="birthday-empty-icon"><Cake size={24} strokeWidth={1.4} /></span><h3>Inga födelsedagar ännu.</h3></div> : <>
        <div className="birthday-toolbar"><p><span>{birthdays.length === 1 ? '1 födelsedag' : `${birthdays.length} födelsedagar`}</span>{birthdays.length > 1 && <span className="birthday-drag-tip">Dra i <GripVertical size={12} aria-label="handtaget" /> för att ändra ordning eller tagg</span>}</p>{birthdays.length > 1 && <button className="button ghost small" type="button" onClick={sortByDate}><ArrowDownUp size={14} />Sortera efter datum</button>}</div>
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={startDrag} onDragOver={dragOver} onDragEnd={finishDrag} onDragCancel={() => setGroups(null)} accessibility={{
          screenReaderInstructions: { draggable: 'Tryck mellanslag för att lyfta. Använd upp- och nedpilarna för att flytta, även till en annan tagg. Tryck mellanslag för att släppa eller Escape för att avbryta.' },
          announcements: {
            onDragStart: ({ active }) => `Du lyfte ${byId.get(String(active.id))?.name ?? 'födelsedagen'}.`,
            onDragOver: ({ over }) => { const group = over && dragRef.current ? findGroup(dragRef.current, over.id) : undefined; return group ? `I gruppen ${group.label}.` : undefined },
            onDragEnd: ({ over }) => over ? 'Födelsedagen är flyttad.' : 'Födelsedagen behöll sin plats.',
            onDragCancel: () => 'Flytten avbröts.',
          },
        }}>
          <div className={`birthday-groups${dragGroups ? ' is-dragging' : ''}`}>{groups.map(group => (group.ids.length > 0 || dragGroups) && <GroupSection key={group.key} group={group} showHeading={grouped || !!dragGroups} dragging={!!dragGroups}>
            {group.ids.map(id => byId.get(id)).filter((birthday): birthday is Birthday => !!birthday).map(birthday => <BirthdayRow key={birthday.id} birthday={birthday} today={today}
              confirming={confirmDelete === birthday.id} onEdit={() => openForm(birthday)} onAskDelete={() => setConfirmDelete(confirmDelete === birthday.id ? null : birthday.id)}
              onCancelDelete={() => { setConfirmDelete(null); setError('') }} onDelete={() => { const failure = onDelete(birthday.id); if (failure) setError(failure); else { setConfirmDelete(null); setError('') } }} />)}
          </GroupSection>)}</div>
        </DndContext>
      </>}
    </div>}
  </Modal>
}
