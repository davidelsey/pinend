import { useState } from 'react'
import { ArrowUpRight, CalendarDays, Flag, Plus, Sailboat } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { raceSection } from '../domain/raceEntry'
import { cyca } from '../data/seed'
import type { Mark } from '../domain/types'

const defaultScheduledStart = () => {
  const quarterHour = 15 * 60 * 1000
  const date = new Date(Math.round((Date.now() + 2 * 60 * 60 * 1000) / quarterHour) * quarterHour)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function RacesPage({ onOpen, onCreate }: { onOpen(): void; onCreate(): void }) {
  const { boat, races, sessions, canManage, saveMark, saveRace, selectRace } = useApp()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const open = async (id: string) => { setBusy(true); try { await selectRace(id); onOpen() } catch (reason) { setError(String(reason)) } finally { setBusy(false) } }
  return <main className="page races-page">
    <section className="hero races-hero"><div><span className="eyebrow"><Sailboat size={15} /> {boat.name}</span><h1>See you on the line.</h1><p>Your races, from the first signal to the replay.</p></div>{canManage && <button className="button button--orange" onClick={() => { setStart(defaultScheduledStart()); setCreating(true) }}><Plus size={18} /> New race</button>}</section>
    {(['In progress', 'Upcoming', 'Previous'] as const).map((section) => {
      const items = races.filter((race) => raceSection(race, sessions.find((item) => item.raceId === race.id)) === section).sort((a, b) => section === 'Previous' ? Date.parse(b.scheduledStart) - Date.parse(a.scheduledStart) : Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart))
      return <section className="race-list-section" key={section} aria-label={section}><div className="race-section-heading"><h2>{section}</h2><span>{items.length.toString().padStart(2, '0')}</span></div>{items.length ? <div className="race-card-grid">{items.map((race) => {
        const session = sessions.find((item) => item.raceId === race.id)
        const status = session?.phase === 'finished' ? 'Finished · View replay' : section === 'In progress' ? 'Resume race' : section === 'Previous' ? 'No finish recorded' : 'Prepare race'
        return <button className={`race-list-card ${section === 'In progress' ? 'race-list-card--live' : ''}`} key={race.id} disabled={busy} onClick={() => void open(race.id)}><span className="race-card-date"><CalendarDays size={18} />{new Date(race.scheduledStart).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}<small>{new Date(race.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span><strong>{race.name}</strong><span>{race.series} · {race.fleet}</span><span className="race-card-footer"><span><Flag size={14} /> {status}</span><ArrowUpRight size={20} /></span></button>
      })}</div> : <p className="race-empty">{section === 'Upcoming' ? canManage ? 'Nothing on the calendar yet. Add your next race.' : 'Your next race will appear here when an admin adds it.' : section === 'Previous' ? 'Your race history and replays will appear here.' : 'No race underway.'}</p>}</section>
    })}
    {error && <p role="alert" className="form-error">{error}</p>}
    {creating && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="New race"><form className="form-modal" onSubmit={(event) => { event.preventDefault(); setBusy(true); void (async () => {
      try {
        const id = crypto.randomUUID()
        const startMark: Mark = { id: `start-line-${id}`, name: 'Start line', shortName: 'START', position: { kind: 'gate', labels: ['Pin', 'Boat'] }, provenance: 'personal' }
        const finishMark: Mark = { id: `finish-line-${id}`, name: 'Finish line', shortName: 'FINISH', position: { kind: 'gate', labels: ['Pin', 'Boat'], linkedToMarkId: startMark.id }, provenance: 'personal' }
        await saveMark(startMark); await saveMark(finishMark)
        await saveRace({ id, boatId: boat.id, clubId: cyca.id, name: name.trim(), series: 'Club racing', fleet: 'Open fleet', scheduledStart: new Date(start).toISOString(), course: [{ id: crypto.randomUUID(), markId: startMark.id, role: 'start', rounding: 'either' }, { id: crypto.randomUUID(), markId: finishMark.id, role: 'finish', rounding: 'either' }] })
        setCreating(false); onCreate()
      } catch (reason) { setError(String(reason)) } finally { setBusy(false) }
    })() }}><span className="eyebrow">{boat.name}</span><h2>A new race</h2><label className="field"><span>Race name</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field"><span>Scheduled start</span><input type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="button button--primary button--wide" disabled={busy || !name.trim() || !start}>{busy ? 'Creating…' : 'Create race'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setCreating(false)}>Cancel</button></form></div>}
  </main>
}
