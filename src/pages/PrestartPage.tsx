import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Clock3, Compass, Flag, Gauge, MapPinned, Navigation, Radio, Sailboat, Shield, TimerReset } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { DevSimulator } from '../components/DevSimulator'
import { Metric } from '../components/Metric'
import { isStartWaypoint } from '../domain/course'
import { formatCountdown, syncStartFromSignal } from '../domain/countdown'
import { intersectSightings, timeToLineSeconds } from '../domain/geo'
import type { LineObservation } from '../domain/types'

type Props = { now: number; onStartRace(): void; sensorStatus: string; onEnableSensors(): void; wakeLockStatus: string }

const resolveEndpoint = (observations: LineObservation[], endpoint: LineObservation['endpoint']) => {
  const endpointObservations = observations.filter((item) => item.endpoint === endpoint)
  if (endpointObservations.length < 2) return null
  return intersectSightings(endpointObservations.at(-2)!, endpointObservations.at(-1)!)
}

export function PrestartPage({ now, onStartRace, sensorStatus, onEnableSensors, wakeLockStatus }: Props) {
  const { marks, race, session, observations, latestReading, simulatorEnabled, stepSimulator, updateSession } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const remaining = session.syncedStartTime - now
  const startWaypoint = race.course.find(isStartWaypoint)
  const startMark = marks.find((mark) => mark.id === startWaypoint?.markId)
  const legacyPin = useMemo(() => resolveEndpoint(observations, 'pin'), [observations])
  const legacyCommittee = useMemo(() => resolveEndpoint(observations, 'committee'), [observations])
  const pin = startMark?.position.kind === 'gate' ? startMark.position.pointA ?? legacyPin : legacyPin
  const committee = startMark?.position.kind === 'gate' ? startMark.position.pointB ?? legacyCommittee : legacyCommittee
  const line = pin && committee ? { pin, committee } : null
  const firstRaceWaypointIndex = race.course.findIndex((waypoint) => !isStartWaypoint(waypoint))
  const firstRaceWaypoint = race.course[firstRaceWaypointIndex]
  const firstRaceMark = marks.find((mark) => mark.id === firstRaceWaypoint?.markId)
  const crossingSeconds = line && latestReading
    ? timeToLineSeconds(latestReading, latestReading.heading, latestReading.speedKnots, line.pin, line.committee)
    : null
  const lineTimingDelta = crossingSeconds == null ? null : crossingSeconds - Math.max(remaining / 1000, 0)
  const unavailableLineTiming = !line
    ? 'Set the start line'
    : !latestReading
      ? 'Waiting for GPS'
      : latestReading.speedKnots <= 0.1
        ? 'Build boat speed'
        : 'Not on a crossing course'
  const lineTiming = lineTimingDelta == null
    ? { label: unavailableLineTiming, tone: 'unknown' }
    : Math.abs(lineTimingDelta) <= 1
      ? { label: 'On time', tone: 'ontime' }
      : lineTimingDelta < 0
        ? { label: `${Math.round(Math.abs(lineTimingDelta))}s early`, tone: 'early' }
        : { label: `${Math.round(lineTimingDelta)}s late`, tone: 'late' }

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!simulatorEnabled) return
    const interval = window.setInterval(() => stepSimulator(1), 1000)
    return () => window.clearInterval(interval)
  }, [simulatorEnabled, stepSimulator])

  const sync = (minutes: 5 | 4 | 1 | 0) => {
    void updateSession({ syncedStartTime: syncStartFromSignal(Date.now(), minutes), autoStartArmed: true })
    setMessage(minutes === 0 ? 'Start gun synchronized' : `${minutes}-minute signal synchronized`)
  }

  return (
    <div className="race-view prestart-race-view">
      {message && <div className="toast"><Check size={16} /> {message}</div>}
      <header className="race-header">
        <div className="race-header__live"><span className="live-dot" /> PRE-START</div>
        <div className="race-header__title"><strong>{race.name}</strong><span>{race.fleet}</span></div>
        <div className="race-header__elapsed"><Clock3 size={14} /> {formatCountdown(remaining)}</div>
      </header>

      <main className="race-main" aria-label="Pre-start instruments">
        <section className="race-focus prestart-race-focus">
          <div className="race-focus__topline">
            <span>START SEQUENCE</span>
            <span className={`prestart-line-state ${line ? 'is-ready' : ''}`}><MapPinned size={14} /> {line ? 'Start line resolved' : 'Line position required'}</span>
          </div>
          <div className={`prestart-race-countdown ${remaining <= 60_000 ? 'is-urgent' : ''}`}>{formatCountdown(remaining)}</div>
          <div className="countdown-hero__time"><Clock3 size={16} /> Start {new Date(session.syncedStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          <div className={`prestart-crossing prestart-timing--${lineTiming.tone}`}><span>Estimated line crossing</span><strong>{lineTiming.label}</strong></div>
          <div className="signal-buttons prestart-race-signals" aria-label="Start sequence synchronization">
            {[5, 4, 1, 0].map((minute) => (
              <button key={minute} onClick={() => sync(minute as 5 | 4 | 1 | 0)}>
                <span>{minute === 0 ? 'START' : `${minute}:00`}</span><small>{minute === 5 ? 'Warning' : minute === 4 ? 'Preparatory' : minute === 1 ? 'One minute' : 'Gun'}</small>
              </button>
            ))}
          </div>
          <label className="specific-countdown">
            <TimerReset size={16} /> Exact start
            <input
              type="time"
              step="1"
              value={new Date(session.syncedStartTime - new Date().getTimezoneOffset() * 60_000).toISOString().slice(11, 19)}
              onChange={(event) => {
                const [hours, minutes, seconds] = event.target.value.split(':').map(Number)
                const next = new Date()
                next.setHours(hours, minutes, seconds || 0, 0)
                void updateSession({ syncedStartTime: next.getTime(), autoStartArmed: true })
              }}
            />
          </label>
        </section>

        <div className="race-metrics">
          <Metric label="GPS boat speed" value={latestReading?.speedKnots.toFixed(1) ?? '—'} unit="kn" icon={<Gauge size={15} />} />
          <Metric label="Estimated line crossing" value={lineTiming.label} icon={<Clock3 size={15} />} />
          <Metric label="Course" value={latestReading ? Math.round(latestReading.heading).toString().padStart(3, '0') : '—'} unit="°T" icon={<Compass size={15} />} />
          <Metric label="Accuracy" value={latestReading ? Math.round(latestReading.accuracy).toString() : '—'} unit="m" icon={<Radio size={15} />} />
        </div>

        <div className="race-layout">
          <section className="race-map-panel">
            <CoursePlot marks={marks} race={race} current={latestReading} activeMarkId={startMark?.id} line={line} />
            <div className="map-progress">
              {race.course.map((waypoint, index) => <span key={waypoint.id} className={index === 0 ? 'active' : ''} />)}
            </div>
          </section>

          <aside className="race-sidebar">
            <section className="race-info-card">
              <div><MapPinned size={18} /><span>Start line</span><strong>{line ? 'Resolved' : 'Awaiting position'}</strong></div>
              <div><Flag size={18} /><span>First mark</span><strong>{firstRaceMark?.name ?? 'Not set'} · {firstRaceWaypoint?.rounding ?? '—'}</strong></div>
              <small>Automatic rounding will ask for confirmation after the start.</small>
            </section>
            <section className="race-info-card system-status">
              <div><Shield size={18} /><span>Screen awake</span><strong>{wakeLockStatus}</strong></div>
              <div><Navigation size={18} /><span>Sensor source</span><strong>{latestReading?.source ?? sensorStatus}</strong></div>
              <div><Radio size={18} /><span>GPS accuracy</span><strong>{latestReading ? `±${Math.round(latestReading.accuracy)} m` : 'Waiting'}</strong></div>
              <button className="text-button prestart-enable-sensors" onClick={onEnableSensors}>Enable sensors</button>
            </section>
            <section className="race-info-card prestart-safety">
              <div><AlertTriangle size={18} /><span>Navigation aid only</span><strong>Keep a proper lookout</strong></div>
              <small>Race documents and safe navigation always take precedence.</small>
            </section>
            <DevSimulator target={pin ?? undefined} />
          </aside>
        </div>

        <div className="race-actions">
          <button className="button button--race-next" onClick={onStartRace}><Sailboat size={18} /> Start race mode</button>
        </div>
      </main>

      {wakeLockStatus === 'blocked' && <div className="race-warning"><AlertTriangle size={15} /> Screen lock was blocked by the device. Keep the display active manually.</div>}
    </div>
  )
}
