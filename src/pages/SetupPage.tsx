import { useEffect, useState } from 'react'
import {
  Anchor,
  BatteryCharging,
  Check,
  ChevronRight,
  CloudSun,
  Download,
  Plus,
  Radio,
  Sailboat,
  UserRound,
  UserRoundPlus,
  Wind,
} from 'lucide-react'
import { useApp } from '../app/AppContext'
import { DevSimulator } from '../components/DevSimulator'
import { cyca } from '../data/seed'
import { CREW_POSITIONS, type CrewPosition, type Mark } from '../domain/types'
import { fetchForecast, type ForecastSnapshot } from '../services/weather'

type Props = { onConfirmCourse(): void; sensorStatus: string; onEnableSensors(): void }

const toLocalInput = (iso: string) => {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function SetupPage({ onConfirmCourse, sensorStatus, onEnableSensors }: Props) {
  const { marks, boat, sails, crew, races, race, session, saveMark, saveRace, selectRace, saveSail, saveCrewMember, updateSession, online } = useApp()
  const [forecast, setForecast] = useState<ForecastSnapshot | null>(null)
  const [crewEntry, setCrewEntry] = useState('')
  const [showNewRace, setShowNewRace] = useState(false)
  const [newRace, setNewRace] = useState({ series: '', name: '', fleet: race.fleet, scheduledStart: toLocalInput(new Date(Date.now() + 86_400_000).toISOString()) })
  const courseReady = race.course.length > 0 && race.course.every((waypoint) => marks.some((item) => item.id === waypoint.markId))

  useEffect(() => {
    void fetchForecast(cyca.coordinate).then(setForecast)
  }, [])

  const updateRaceField = (field: 'series' | 'name' | 'fleet', value: string) =>
    void saveRace({ ...race, [field]: value })

  const createRace = async () => {
    if (!newRace.name.trim()) return
    const raceId = crypto.randomUUID()
    const startId = `start-line-${raceId}`
    const finishId = `finish-line-${raceId}`
    const start: Mark = { id: startId, name: 'Start line', shortName: 'START', position: { kind: 'gate', labels: ['Pin', 'Boat'] }, provenance: 'personal' }
    const finish: Mark = { id: finishId, name: 'Finish line', shortName: 'FINISH', position: { kind: 'gate', labels: ['Pin', 'Boat'], linkedToMarkId: startId }, provenance: 'personal' }
    const created = {
      id: raceId,
      clubId: cyca.id,
      series: newRace.series.trim() || 'Club racing',
      name: newRace.name.trim(),
      fleet: newRace.fleet.trim() || 'Open fleet',
      scheduledStart: new Date(newRace.scheduledStart).toISOString(),
      course: [
        { id: crypto.randomUUID(), markId: startId, rounding: 'either' as const, role: 'start' as const },
        { id: crypto.randomUUID(), markId: finishId, rounding: 'either' as const, role: 'finish' as const },
      ],
    }
    await saveMark(start)
    await saveMark(finish)
    await saveRace(created)
    await updateSession({ id: crypto.randomUUID(), raceId: created.id, phase: 'setup', autoStartArmed: true, syncedStartTime: Date.parse(created.scheduledStart), activeWaypointIndex: 0, telemetry: [], roundedAt: {} })
    setShowNewRace(false)
    setNewRace({ series: '', name: '', fleet: created.fleet, scheduledStart: toLocalInput(new Date(Date.now() + 86_400_000).toISOString()) })
  }

  const chooseRace = (raceId: string) => {
    if (session.phase === 'racing' && !window.confirm('Switch races and leave the current race screen? Your recorded progress will remain saved.')) return
    void selectRace(raceId)
  }

  const toggleSail = (sailId: string) => {
    const selected = session.selectedSailIds.includes(sailId)
    void updateSession({
      selectedSailIds: selected
        ? session.selectedSailIds.filter((id) => id !== sailId)
        : [...session.selectedSailIds, sailId],
    })
  }

  const crewAssignments = session.crewAssignments ?? []
  const addCrewMember = async () => {
    const name = crewEntry.trim()
    if (!name) return
    const existing = crew.find((member) => member.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)
    const member = existing ?? { id: crypto.randomUUID(), name }
    if (!existing) await saveCrewMember(member)
    if (!crewAssignments.some((item) => item.crewId === member.id)) {
      await updateSession({ crewAssignments: [...crewAssignments, { crewId: member.id, position: 'Crew' }] })
    }
    setCrewEntry('')
  }

  const toggleCrew = (crewId: string) => {
    const assigned = crewAssignments.some((item) => item.crewId === crewId)
    void updateSession({ crewAssignments: assigned ? crewAssignments.filter((item) => item.crewId !== crewId) : [...crewAssignments, { crewId, position: 'Crew' }] })
  }

  const setCrewPosition = (crewId: string, position: CrewPosition) => {
    void updateSession({ crewAssignments: crewAssignments.map((item) => item.crewId === crewId ? { ...item, position } : item) })
  }

  return (
    <div className="page setup-page">
      <section className="hero hero--setup">
        <div>
          <span className="eyebrow"><Anchor size={14} /> Race setup</span>
          <h1>Make shore time count.</h1>
          <p>Everything here is packed onto this phone before you leave coverage.</p>
        </div>
        <div className="hero__boat"><Sailboat size={72} strokeWidth={1.2} /></div>
      </section>

      <div className="content-grid">
        <div className="content-stack">
          <section className="panel">
            <div className="panel__heading">
              <div><span className="step-number">01</span><h2>Race details</h2></div>
              <button className="button button--secondary button--compact" onClick={() => setShowNewRace((visible) => !visible)}><Plus size={14} /> New race</button>
            </div>
            <div className="race-picker" role="list" aria-label="Races">
              {races.map((item) => <div role="listitem" key={item.id}><button className={item.id === race.id ? 'is-selected' : ''} onClick={() => chooseRace(item.id)}><strong>{item.name}</strong><span>{item.series} · {item.fleet}</span><small>{new Date(item.scheduledStart).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small></button></div>)}
            </div>
            {showNewRace && <div className="new-race-form" role="group" aria-label="New race details">
              <div className="form-grid"><label className="field"><span>Series</span><input value={newRace.series} onChange={(event) => setNewRace({ ...newRace, series: event.target.value })} /></label><label className="field"><span>Race name</span><input autoFocus value={newRace.name} onChange={(event) => setNewRace({ ...newRace, name: event.target.value })} /></label><label className="field"><span>Fleet</span><input value={newRace.fleet} onChange={(event) => setNewRace({ ...newRace, fleet: event.target.value })} /></label><label className="field"><span>Scheduled start</span><input type="datetime-local" value={newRace.scheduledStart} onChange={(event) => setNewRace({ ...newRace, scheduledStart: event.target.value })} /></label></div>
              <div className="new-race-form__actions"><button className="button button--secondary" onClick={() => setShowNewRace(false)}>Cancel</button><button className="button button--primary" disabled={!newRace.name.trim() || !newRace.scheduledStart} onClick={() => void createRace()}><Plus size={15} /> Create race</button></div>
            </div>}
            <label className="field">
              <span>Club</span>
              <div className="select-like"><strong>{cyca.shortName}</strong><span>{cyca.name}</span><ChevronRight size={16} /></div>
            </label>
            <div className="form-grid">
              <label className="field"><span>Series</span><input value={race.series} onChange={(e) => updateRaceField('series', e.target.value)} /></label>
              <label className="field"><span>Race</span><input value={race.name} onChange={(e) => updateRaceField('name', e.target.value)} /></label>
              <label className="field"><span>Fleet</span><input value={race.fleet} onChange={(e) => updateRaceField('fleet', e.target.value)} /></label>
              <label className="field">
                <span>Scheduled start</span>
                <input
                  type="datetime-local"
                  value={toLocalInput(race.scheduledStart)}
                  onChange={(e) => void saveRace({ ...race, scheduledStart: new Date(e.target.value).toISOString() })}
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel__heading">
              <div><span className="step-number">02</span><h2>Crew</h2></div>
              <span className="chip"><UserRound size={13} /> {crewAssignments.length} racing</span>
            </div>
            <section className="crew-planner" aria-label="Crew">
              <div className="crew-list">
                {crew.map((member) => {
                  const assignment = crewAssignments.find((item) => item.crewId === member.id)
                  return (
                    <div className={`crew-row ${assignment ? 'crew-row--selected' : ''}`} key={member.id}>
                      <label className="crew-row__person">
                        <input type="checkbox" aria-label={`${member.name} racing`} checked={Boolean(assignment)} onChange={() => toggleCrew(member.id)} />
                        <strong>{member.name}</strong>
                      </label>
                      <select aria-label={`Position for ${member.name}`} disabled={!assignment} value={assignment?.position ?? 'Crew'} onChange={(event) => setCrewPosition(member.id, event.target.value as CrewPosition)}>
                        {CREW_POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
              <div className="add-row">
                <label className="field"><span>Choose or add crew</span><input role="combobox" aria-label="Crew member" aria-autocomplete="list" aria-controls="crew-member-options" list="crew-member-options" value={crewEntry} onChange={(event) => setCrewEntry(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addCrewMember() }} /></label>
                <datalist id="crew-member-options">{crew.map((member) => <option key={member.id} value={member.name} />)}</datalist>
                <button className="button button--secondary" disabled={!crewEntry.trim()} onClick={() => void addCrewMember()}><UserRoundPlus size={16} /> Add crew member</button>
              </div>
            </section>
          </section>

          <section className="panel">
            <div className="panel__heading">
              <div><span className="step-number">03</span><h2>Sails aboard</h2></div>
              <span className="chip"><Sailboat size={13} /> {boat.name}</span>
            </div>
            <div className="sail-checklist">
              {sails.map((sail) => {
                const selected = session.selectedSailIds.includes(sail.id)
                return (
                  <div className={`sail-check ${selected ? 'sail-check--selected' : ''}`} key={sail.id}>
                    <button className="check-control" onClick={() => toggleSail(sail.id)} aria-label={`Select ${sail.name}`}>
                      {selected && <Check size={15} />}
                    </button>
                    <div><strong>{sail.name}</strong><small>{sail.type} · {sail.condition}</small></div>
                    <select value={sail.location} onChange={(event) => void saveSail({ ...sail, location: event.target.value as typeof sail.location })}>
                      <option value="rigged">Rigged</option><option value="wardrobe">Wardrobe</option><option value="locker">Locker</option>
                    </select>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="sidebar-stack">
          <section className="panel weather-panel">
            <div className="panel__heading"><div><CloudSun size={18} /><h2>Forecast</h2></div><span className="chip">{forecast?.stale ? 'Cached' : 'Latest'}</span></div>
            {forecast?.hours.slice(0, 3).map((hour, index) => (
              <div className="forecast-row" key={hour.time}>
                <span>{index === 0 ? 'Now' : new Date(hour.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <Wind size={18} style={{ transform: `rotate(${hour.windDirection}deg)` }} />
                <strong>{Math.round(hour.windSpeed)} kn</strong>
                <small>gust {Math.round(hour.gust)}</small>
              </div>
            ))}
            <p className="microcopy">{forecast ? `${forecast.source}${forecast.stale ? ' · cached' : ''}` : 'Forecast unavailable'} · advisory only</p>
          </section>

          <section className="panel readiness-panel">
            <div className="panel__heading"><div><Download size={18} /><h2>Offline readiness</h2></div></div>
            <div className="readiness-item readiness-item--good"><Check size={16} /><span>App & race data</span><strong>Ready</strong></div>
            <div className="readiness-item readiness-item--good"><Check size={16} /><span>Course plot</span><strong>Ready</strong></div>
            <div className="readiness-item"><Radio size={16} /><span>Device sensors</span><strong>{sensorStatus}</strong></div>
            <div className="readiness-item"><BatteryCharging size={16} /><span>Screen awake</span><strong>On in race</strong></div>
            <div className="readiness-item"><CloudSun size={16} /><span>Forecast</span><strong>{online ? 'Updated' : 'Cached'}</strong></div>
            <button className="button button--secondary button--wide" onClick={onEnableSensors}>Prepare device sensors</button>
          </section>
          <DevSimulator />
        </aside>
      </div>

      <div className="sticky-action">
        <div><strong>{courseReady ? 'Race pack ready' : 'Add at least one course mark'}</strong><span>{race.course.length} marks · {session.selectedSailIds.length} sails · saved on device</span></div>
        <button className="button button--primary" disabled={!courseReady} onClick={onConfirmCourse}>Confirm course <ChevronRight size={18} /></button>
      </div>
    </div>
  )
}
