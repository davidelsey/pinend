import { useEffect, useMemo, useState } from 'react'
import { Anchor, Check, Clock3, Crosshair, Radio, Sailboat, TimerReset } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { DevSimulator } from '../components/DevSimulator'
import { SightMarksDialog } from '../components/SightMarksDialog'
import { formatCountdown, syncStartFromSignal } from '../domain/countdown'
import { intersectSightings, timeToLineSeconds } from '../domain/geo'
import type { LineObservation } from '../domain/types'

type Props = { now: number; onStartRace(): void; sensorStatus: string; onEnableSensors(): void }

const resolveEndpoint = (observations: LineObservation[], endpoint: LineObservation['endpoint']) => {
  const endpointObservations = observations.filter((item) => item.endpoint === endpoint)
  if (endpointObservations.length < 2) return null
  const first = endpointObservations.at(-2)!
  const second = endpointObservations.at(-1)!
  return intersectSightings(first, second)
}

export function PrestartPage({ now, onStartRace, sensorStatus, onEnableSensors }: Props) {
  const { marks, race, session, observations, latestReading, updateSession } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const [showSightMarks, setShowSightMarks] = useState(false)
  const remaining = session.syncedStartTime - now
  const pin = useMemo(() => resolveEndpoint(observations, 'pin'), [observations])
  const committee = useMemo(() => resolveEndpoint(observations, 'committee'), [observations])
  const line = pin && committee ? { pin, committee } : null
  const raceMarks = race.course.reduce<typeof marks>((unique, waypoint) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    return mark && !unique.some((item) => item.id === mark.id) ? [...unique, mark] : unique
  }, [])
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

  const sync = (minutes: 5 | 4 | 1 | 0) => {
    void updateSession({ syncedStartTime: syncStartFromSignal(Date.now(), minutes) })
    setMessage(minutes === 0 ? 'Start gun synchronized' : `${minutes}-minute signal synchronized`)
  }

  return (
    <div className="page prestart-page">
      {message && <div className="toast"><Check size={16} /> {message}</div>}
      <section className="countdown-hero">
        <div className="countdown-hero__meta">
          <span className="live-dot" /> PRE-START
          <span>{race.series} · {race.name}</span>
        </div>
        <div className={`countdown ${remaining <= 60_000 ? 'countdown--urgent' : ''}`}>{formatCountdown(remaining)}</div>
        <div className="countdown-hero__time"><Clock3 size={16} /> Start {new Date(session.syncedStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        <div className="prestart-tactics">
          <div><span>GPS boat speed</span><strong>{latestReading ? latestReading.speedKnots.toFixed(1) : '—'} <small>kn</small></strong></div>
          <div className={`prestart-timing prestart-timing--${lineTiming.tone}`}><span>Estimated line crossing</span><strong>{lineTiming.label}</strong></div>
        </div>
        <div className="signal-buttons">
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
              void updateSession({ syncedStartTime: next.getTime() })
            }}
          />
        </label>
      </section>

      <div className="content-grid prestart-grid">
        <div className="content-stack">
          <section className="panel line-panel">
            <div className="panel__heading">
              <div><Anchor size={18} /><h2>Course positions</h2></div>
              <span className={`chip ${line ? 'chip--verified' : ''}`}>{line ? 'Start line resolved' : 'Start line awaiting sightings'}</span>
            </div>
            <CoursePlot marks={marks} race={race} current={latestReading} line={line} compact />
            <div className="sight-marks-summary">
              <div><Crosshair size={20} /><span><strong>Sight or place race marks</strong><small>Pin end, committee boat, and {raceMarks.length} course marks</small></span></div>
              <button className="button button--primary" onClick={() => setShowSightMarks(true)}><Crosshair size={17} /> Sight marks</button>
            </div>
            <div className="sensor-strip">
              <Radio size={16} /><span>Sensor: <strong>{latestReading?.source ?? sensorStatus}</strong></span>
              <span>GPS: <strong>{latestReading ? `±${Math.round(latestReading.accuracy)} m` : '—'}</strong></span>
              <button className="text-button" onClick={onEnableSensors}>Enable</button>
            </div>
          </section>
        </div>
        <aside className="sidebar-stack">
          <section className="panel next-panel">
            <span className="eyebrow">Next mark</span>
            <h2>{marks.find((mark) => mark.id === race.course[0]?.markId)?.name}</h2>
            <p>Leave to {race.course[0]?.rounding}. Automatic rounding will ask for confirmation.</p>
          </section>
          <DevSimulator target={pin ?? undefined} />
          <section className="notice"><strong>Keep a proper lookout.</strong><p>Pin End is an aid only. Race documents and safe navigation take precedence.</p></section>
        </aside>
      </div>

      <div className="sticky-action sticky-action--dark">
        <div><strong>{line ? 'Start line ready' : 'You can refine the line while approaching'}</strong><span>Screen wake lock is active during pre-start and racing when supported</span></div>
        <button className="button button--orange" onClick={onStartRace}><Sailboat size={18} /> Start race mode</button>
      </div>
      <SightMarksDialog now={now} open={showSightMarks} onClose={() => setShowSightMarks(false)} />
    </div>
  )
}
