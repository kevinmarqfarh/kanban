import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { newId } from '../lib/helpers'
import type { DiaryEntry, DiaryMood, DiaryQuestion } from '../lib/types'

export const starterQuestions: DiaryQuestion[] = [
  { id: 'diary-good', prompt: 'Vad var bra idag?' },
  { id: 'diary-remember', prompt: 'Vad vill du komma ihåg?' },
  { id: 'diary-tomorrow', prompt: 'Vad behöver du i morgon?' },
]

const moods: { id: DiaryMood; label: string; icon: string }[] = [
  { id: 'great', label: 'Toppen', icon: '✦' }, { id: 'good', label: 'Bra', icon: '☀' },
  { id: 'okay', label: 'Okej', icon: '◐' }, { id: 'low', label: 'Låg', icon: '☁' },
  { id: 'hard', label: 'Tung', icon: '☂' },
]

function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`)
  next.setDate(next.getDate() + days)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function emptyEntry(date: string, template: DiaryQuestion[]): DiaryEntry {
  const now = new Date().toISOString()
  return { id: newId(), date, mood: null, answers: template.map(question => ({ ...question, answer: '' })), createdAt: now, updatedAt: now }
}

export function Diary({ today, entries, template, onSave, onDelete, onSaveTemplate }: {
  today: string
  entries: DiaryEntry[]
  template: DiaryQuestion[]
  onSave: (entry: DiaryEntry, base?: DiaryEntry) => string | null
  onDelete: (id: string) => string | null
  onSaveTemplate: (questions: DiaryQuestion[]) => string | null
}) {
  const [date, setDate] = useState(today)
  const entry = entries.find(item => item.date === date)
  const [draft, setDraft] = useState<DiaryEntry | null>(null)
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [questions, setQuestions] = useState<DiaryQuestion[]>(template)
  const [newQuestion, setNewQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setDraft(entry ?? null); setSaved(false); setError(null) }, [date, entry?.id])
  useEffect(() => { if (!editingTemplate) setQuestions(template) }, [template, editingTemplate])
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(entry)
  function save() {
    if (!draft) return true
    const next = { ...draft, updatedAt: new Date().toISOString() }
    const failure = onSave(next, entry)
    setError(failure)
    setSaved(!failure)
    if (!failure) setDraft(next)
    return !failure
  }
  function change(next: DiaryEntry) {
    setDraft(next)
    const failure = onSave({ ...next, updatedAt: new Date().toISOString() }, entry)
    setError(failure)
    setSaved(!failure)
  }
  function go(next: string) {
    if (dirty && !save()) return
    setDate(next)
  }
  function saveQuestions() {
    const clean = questions.map(item => ({ ...item, prompt: item.prompt.trim() })).filter(item => item.prompt)
    const failure = onSaveTemplate(clean)
    setError(failure)
    if (!failure) setEditingTemplate(false)
  }
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  return <div className="diary-page">
    <div className="diary-datebar"><button className="icon-button" type="button" aria-label="Föregående dag" onClick={() => go(shiftDate(date, -1))}><ArrowLeft size={18} /></button><label>Datum<input type="date" value={date} max={today} onChange={event => event.target.value && go(event.target.value)} /></label><button className="icon-button" type="button" aria-label="Nästa dag" disabled={date >= today} onClick={() => go(shiftDate(date, 1))}><ArrowRight size={18} /></button>{date !== today && <button className="button ghost small" type="button" onClick={() => go(today)}>Idag</button>}</div>
    {error && <p className="others-error" role="alert">{error}</p>}
    {!draft ? <div className="diary-empty"><p>{date === today ? 'En stund för dagen som gått.' : 'Inget inlägg den här dagen.'}</p><button className="button primary" type="button" onClick={() => { const next = emptyEntry(date, template); setDraft(next); const failure = onSave(next); setError(failure); setSaved(!failure) }}><Plus size={17} />Skriv inlägg</button></div> : <section className="diary-editor" aria-label="Dagens inlägg">
      <div className="diary-section-head"><div><p className="eyebrow">Ett inlägg per dag</p><h2>{new Date(`${date}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div>{saved && !dirty && <span className="diary-saved"><Check size={15} />Sparat</span>}</div>
      <fieldset className="diary-moods"><legend>Hur kändes dagen?</legend><div>{moods.map(mood => <button key={mood.id} type="button" className={draft.mood === mood.id ? 'active' : ''} aria-pressed={draft.mood === mood.id} onClick={() => change({ ...draft, mood: draft.mood === mood.id ? null : mood.id })}><span aria-hidden="true">{mood.icon}</span>{mood.label}</button>)}</div></fieldset>
      <div className="diary-answers">{draft.answers.map((answer, index) => <label key={answer.id}>{answer.prompt}<textarea rows={3} maxLength={5000} value={answer.answer} placeholder="Skriv några ord…" onChange={event => change({ ...draft, answers: draft.answers.map((item, i) => i === index ? { ...item, answer: event.target.value } : item) })} /></label>)}</div>
      <div className="diary-actions"><span className="diary-auto-save"><Check size={15} />Sparas automatiskt</span>{dirty && <button className="button secondary small" type="button" onClick={save}>Försök spara igen</button>}{entry && <button className="button ghost danger" type="button" onClick={() => { if (window.confirm('Ta bort dagens inlägg?')) { const failure = onDelete(entry.id); setError(failure); if (!failure) setDraft(null) } }}><Trash2 size={15} />Ta bort</button>}</div>
    </section>}
    <section className="diary-template"><div className="diary-section-head"><div><p className="eyebrow">För nya inlägg</p><h2>Min frågemall</h2></div><button className="button secondary small" type="button" onClick={() => { setQuestions(template); setEditingTemplate(!editingTemplate) }}><Pencil size={15} />{editingTemplate ? 'Avbryt' : 'Redigera mall'}</button></div>
      {editingTemplate ? <div className="diary-template-edit">{questions.map((question, index) => <div key={question.id}><input className="input" aria-label={`Fråga ${index + 1}`} maxLength={200} value={question.prompt} onChange={event => setQuestions(current => current.map(item => item.id === question.id ? { ...item, prompt: event.target.value } : item))} /><button className="icon-button" aria-label={`Ta bort fråga ${index + 1}`} onClick={() => setQuestions(current => current.filter(item => item.id !== question.id))}><Trash2 size={16} /></button></div>)}<form onSubmit={event => { event.preventDefault(); if (newQuestion.trim() && questions.length < 20) { setQuestions(current => [...current, { id: newId(), prompt: newQuestion.trim() }]); setNewQuestion('') } }}><input className="input" aria-label="Ny fråga" maxLength={200} value={newQuestion} onChange={event => setNewQuestion(event.target.value)} placeholder="Ny kort fråga" /><button className="button secondary" type="submit" disabled={!newQuestion.trim() || questions.length >= 20}><Plus size={16} />Lägg till</button></form><button className="button primary" type="button" onClick={saveQuestions}>Spara mall</button></div> : <p>{template.length ? `${template.length} frågor. Ändringar gäller nya inlägg.` : 'Ingen mall ännu. Lägg till frågor för nya inlägg.'}</p>}
    </section>
    {sorted.length > 0 && <section className="diary-history"><h2>Tidigare inlägg</h2><div>{sorted.slice(0, 30).map(item => <button key={item.id} type="button" className={date === item.date ? 'active' : ''} onClick={() => go(item.date)}><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>{moods.find(mood => mood.id === item.mood)?.icon ?? '—'}</span></button>)}</div></section>}
  </div>
}
