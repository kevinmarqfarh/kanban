import { useRef, useState, type FormEvent } from 'react'
import { Bell, Cake, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Birthday, BirthdayReminder } from '../lib/types'
import { REMINDER_OPTIONS, isValidBirthDate, localDateString, nextBirthday } from '../lib/birthdays'
import { newId } from '../lib/helpers'
import { Modal } from './Modal'

function reminderLabel(value: BirthdayReminder) {
  const label = REMINDER_OPTIONS.find(option => option.value === value)?.label ?? ''
  return value === 'day' ? label : `${label} före`
}

function occasionLabel(date: string, today: string) {
  if (date === today) return 'Idag'
  return new Date(`${date}T12:00:00`).toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long',
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  })
}

export function Birthdays({ birthdays, onSave, onDelete, onClose }: {
  birthdays: Birthday[];
  onSave: (birthday: Birthday, original?: Birthday) => string | null;
  onDelete: (id: string) => string | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Birthday | null>(null)
  const [remindersEnabled, setRemindersEnabled] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const originalRef = useRef<Birthday | undefined>(undefined)
  const today = localDateString(new Date())
  const preview = draft && isValidBirthDate(draft.birthDate) && draft.birthDate <= today
    ? nextBirthday(draft.birthDate) : null
  const ordered = birthdays.map(birthday => ({
    birthday,
    occasion: isValidBirthDate(birthday.birthDate) ? nextBirthday(birthday.birthDate) : null,
  })).sort((a, b) => (a.occasion?.date ?? '9999').localeCompare(b.occasion?.date ?? '9999')
    || a.birthday.name.localeCompare(b.birthday.name, 'sv'))

  function openForm(birthday?: Birthday) {
    originalRef.current = birthday ? structuredClone(birthday) : undefined
    setDraft(birthday ? { ...birthday, reminders: [...birthday.reminders], generatedReminders: [...birthday.generatedReminders] } : {
      id: newId(), name: '', birthDate: '', reminders: [], createdAt: new Date().toISOString(), generatedReminders: [],
    })
    setRemindersEnabled(!!birthday?.reminders.length)
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
      ? REMINDER_OPTIONS.filter(option => draft.reminders.includes(option.value)).map(option => option.value) : []
    if (remindersEnabled && !reminders.length) {
      setError('Välj minst en påminnelse.')
      return
    }
    const failure = onSave({ ...draft, name: draft.name.trim(), reminders }, originalRef.current)
    if (failure) { setError(failure); return }
    returnToList()
  }

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
        {preview && <span className="field-help" id="birthday-date-help">{occasionLabel(preview.date, today)} · fyller {preview.age} år</span>}
      </label>
      {draft.birthDate.endsWith('-02-29') && <p className="birthday-help">År utan skottdag används 28 februari.</p>}
      <label className="birthday-reminder-toggle"><input type="checkbox" aria-label="Skapa påminnelser" aria-describedby="birthday-reminder-help" checked={remindersEnabled} onChange={event => {
        setRemindersEnabled(event.target.checked)
        if (event.target.checked && !draft.reminders.length) setDraft({ ...draft, reminders: ['week'] })
        setError('')
      }} /><span><strong>Skapa påminnelser</strong></span><Bell size={17} /></label>
      {remindersEnabled && <fieldset className="birthday-reminders"><legend>Påminn mig</legend><div className="birthday-reminder-options">{REMINDER_OPTIONS.map(option => <label className="birthday-reminder-option" key={option.value}><input type="checkbox" checked={draft.reminders.includes(option.value)} onChange={() => toggleReminder(option.value)} /><span>{reminderLabel(option.value)}</span></label>)}</div></fieldset>}
      <p className="birthday-help" id="birthday-reminder-help">Påminnelser skapas som kanbanuppgifter när appen är öppen.</p>
    </form> : <div className="birthday-manager">
      {ordered.length === 0 ? <div className="birthday-empty"><span className="birthday-empty-icon"><Cake size={24} strokeWidth={1.4} /></span><h3>Inga födelsedagar ännu.</h3></div> : <>
        <div className="birthday-list">{ordered.map(({ birthday, occasion }) => <article className="birthday-row" key={birthday.id} data-birthday-id={birthday.id}>
          <div className="birthday-row-header"><span className="birthday-person-icon"><Cake size={19} strokeWidth={1.5} /></span><div className="birthday-person"><h3>{birthday.name}</h3><p>{occasion ? <><time dateTime={occasion.date}>{occasionLabel(occasion.date, today)}</time><span>·</span>fyller {occasion.age} år</> : 'Kontrollera födelsedatumet'}</p></div><div className="birthday-row-actions"><button className="icon-button" type="button" aria-label={`Redigera födelsedag för ${birthday.name}`} onClick={() => openForm(birthday)}><Pencil size={16} /></button><button className="icon-button" type="button" aria-label={`Ta bort födelsedag för ${birthday.name}`} onClick={() => setConfirmDelete(confirmDelete === birthday.id ? null : birthday.id)}><Trash2 size={16} /></button></div></div>
          <div className="birthday-reminder-chips">{birthday.reminders.length ? REMINDER_OPTIONS.filter(option => birthday.reminders.includes(option.value)).map(option => <span className="birthday-reminder-chip" key={option.value}><Bell size={10} />{reminderLabel(option.value)}</span>) : <span className="birthday-no-reminders">Utan påminnelser</span>}</div>
          {confirmDelete === birthday.id && <div className="birthday-delete-confirm"><p>Ta bort {birthday.name}?</p><div><button className="button secondary" type="button" onClick={() => { setConfirmDelete(null); setError('') }}>Behåll</button><button className="button primary danger" type="button" onClick={() => { const failure = onDelete(birthday.id); if (failure) setError(failure); else { setConfirmDelete(null); setError('') } }}>Ta bort</button></div></div>}
        </article>)}</div>
        <p className="birthday-help">Befintliga uppgifter finns kvar om du tar bort en födelsedag.</p>
      </>}
    </div>}
  </Modal>
}
