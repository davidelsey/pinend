import { useEffect, useMemo, useState } from 'react'
import {
  Anchor,
  BatteryCharging,
  Check,
  ChevronRight,
  CloudSun,
  Download,
  GripVertical,
  MapPinned,
  Plus,
  Radio,
  Sailboat,
  ShieldCheck,
  Trash2,
  Wind,
} from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { DevSimulator } from '../components/DevSimulator'
import { cyca } from '../data/seed'
import { fetchForecast, type ForecastSnapshot } from '../services/weather'

type Props = { onEnterPrestart(): void; sensorStatus: string; onEnableSensors(): void }

const toLocalInput = (iso: string) => {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function SetupPage({ onEnterPrestart, sensorStatus, onEnableSensors }: Props) {
  const { marks, boat, sails, race, session, saveRace, saveSail, updateSession, online } = useApp()
  const [forecast, setForecast] = useState<ForecastSnapshot | null>(null)
  const [newMarkId, setNewMarkId] = useState(marks[0]?.id ?? '')
  const availableMarks = useMemo(
    () => marks.filter((mark) => !race.course.some((waypoint) => waypoint.markId === mark.id)),
    [marks, race.course],
  )
  const courseReady = race.course.length > 0 && race.course.every((waypoint) => marks.some((item) => item.id === waypoint.markId))

  useEffect(() => {
    void fetchForecast(cyca.coordinate).then(setForecast)
  }, [])

  const updateRaceField = (field: 'series' | 'name' | 'fleet', value: string) =>
    void saveRace({ ...race, [field]: value })

  const toggleSail = (sailId: string) => {
    const selected = session.selectedSailIds.includes(sailId)
    void updateSession({
      selectedSailIds: selected
        ? session.selectedSailIds.filter((id) => id !== sailId)
        : [...session.selectedSailIds, sailId],
    })
  }

  const enterPrestart = async () => {
    await updateSession({ phase: 'prestart', syncedStartTime: Date.parse(race.scheduledStart) })
    onEnterPrestart()
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
              <span className="chip chip--verified"><ShieldCheck size={13} /> Community</span>
            </div>
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
              <div><span className="step-number">02</span><h2>Course</h2></div>
              <span className="chip">{race.course.length} marks</span>
            </div>
            <CoursePlot marks={marks} race={race} compact />
            <div className="course-list">
              {race.course.map((waypoint, index) => {
                const mark = marks.find((item) => item.id === waypoint.markId)
                return (
                  <div className="course-row" key={waypoint.id}>
                    <GripVertical size={16} className="muted" />
                    <span className="course-row__number">{index + 1}</span>
                    <div><strong>{mark?.name ?? 'Unknown mark'}</strong><small>{mark?.position.kind} position</small></div>
                    <select
                      value={waypoint.rounding}
                      aria-label={`Rounding for ${mark?.name}`}
                      onChange={(event) => void saveRace({
                        ...race,
                        course: race.course.map((item) => item.id === waypoint.id ? { ...item, rounding: event.target.value as typeof item.rounding } : item),
                      })}
                    >
                      <option value="port">Port</option><option value="starboard">Starboard</option><option value="either">Either</option>
                    </select>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${mark?.name}`}
                      onClick={() => void saveRace({ ...race, course: race.course.filter((item) => item.id !== waypoint.id) })}
                    ><Trash2 size={16} /></button>
                  </div>
                )
              })}
            </div>
            <div className="add-row">
              <select value={newMarkId} onChange={(event) => setNewMarkId(event.target.value)}>
                {[...availableMarks, ...marks.filter((mark) => mark.id === newMarkId)].map((mark) => <option key={mark.id} value={mark.id}>{mark.name}</option>)}
              </select>
              <button className="button button--secondary" onClick={() => {
                if (!newMarkId) return
                void saveRace({ ...race, course: [...race.course, { id: crypto.randomUUID(), markId: newMarkId, rounding: 'port' }] })
                setNewMarkId(availableMarks.find((mark) => mark.id !== newMarkId)?.id ?? marks[0]?.id ?? '')
              }}><Plus size={16} /> Add mark</button>
            </div>
            <p className="microcopy"><MapPinned size={13} /> Add another copy of a mark to represent another lap. Delete remaining marks to shorten course.</p>
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
        <button className="button button--primary" disabled={!courseReady} onClick={() => void enterPrestart()}>Enter pre-start <ChevronRight size={18} /></button>
      </div>
    </div>
  )
}
