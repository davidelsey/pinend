import { useEffect, useMemo, useState } from 'react'
import { Anchor, Check, Clock3, Crosshair, LocateFixed, Navigation, Radio, Sailboat, TimerReset } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { DevSimulator } from '../components/DevSimulator'
import { SightingCamera } from '../components/SightingCamera'
import { formatCountdown, syncStartFromSignal } from '../domain/countdown'
import { distanceMetres, intersectSightings, timeToLineSeconds } from '../domain/geo'
import type { LineObservation } from '../domain/types'

type Props = { now: number; onStartRace(): void; sensorStatus: string; onEnableSensors(): void }
type CameraTarget = { endpoint: 'pin' | 'committee'; label: string } | { endpoint: 'mark'; markId: string; label: string }

const resolveEndpoint = (observations: LineObservation[], endpoint: LineObservation['endpoint']) => {
  const endpointObservations = observations.filter((item) => item.endpoint === endpoint)
  if (endpointObservations.length < 2) return null
  const first = endpointObservations.at(-2)!
  const second = endpointObservations.at(-1)!
  return intersectSightings(first, second)
}

export function PrestartPage({ now, onStartRace, sensorStatus, onEnableSensors }: Props) {
  const { marks, race, session, observations, latestReading, saveObservation, saveMark, updateSession } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null)
  const remaining = session.syncedStartTime - now
  const pin = useMemo(() => resolveEndpoint(observations, 'pin'), [observations])
  const committee = useMemo(() => resolveEndpoint(observations, 'committee'), [observations])
  const line = pin && committee ? { pin, committee } : null
  const movableMarks = marks.filter((mark) => mark.position.kind === 'variable')
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

  const capture = async (target: CameraTarget) => {
    if (!latestReading) {
      setMessage('Enable device sensors or the development simulator first')
      return false
    }
    if (latestReading.headingReliable === false) {
      setMessage('An absolute compass heading is required for a sighting')
      return false
    }
    const targetObservations = observations.filter((item) =>
      item.endpoint === target.endpoint && (target.endpoint !== 'mark' || item.markId === target.markId),
    )
    const previous = targetObservations.at(-1)
    if (previous && distanceMetres(previous.observer, latestReading) < 25) {
      setMessage('Move at least 25 m before the second sighting')
      return false
    }
    const observation: LineObservation = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      endpoint: target.endpoint,
      markId: target.endpoint === 'mark' ? target.markId : undefined,
      observer: { latitude: latestReading.latitude, longitude: latestReading.longitude },
      bearingTrue: latestReading.heading,
      accuracy: latestReading.accuracy,
      timestamp: Date.now(),
    }
    await saveObservation(observation)
    if (target.endpoint === 'mark' && previous) {
      const coordinate = intersectSightings(previous, observation)
      const mark = marks.find((item) => item.id === target.markId)
      if (coordinate && mark) {
        await saveMark({ ...mark, position: { kind: 'variable', coordinate } })
        setMessage(`${target.label} position resolved`)
        return true
      }
      setMessage('Sightings do not intersect reliably—move farther and try again')
      return false
    }
    setMessage(`${target.label} sighting saved`)
    return true
  }

  const directCapture = async (endpoint: 'pin' | 'committee') => {
    if (!latestReading) return setMessage('No precise position available')
    const southObservation: LineObservation = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      endpoint,
      observer: { latitude: latestReading.latitude - 0.0001, longitude: latestReading.longitude },
      bearingTrue: 0,
      accuracy: latestReading.accuracy,
      timestamp: Date.now(),
    }
    const westObservation: LineObservation = {
      ...southObservation,
      id: crypto.randomUUID(),
      observer: { latitude: latestReading.latitude, longitude: latestReading.longitude - 0.0001 },
      bearingTrue: 90,
    }
    await saveObservation(southObservation)
    await saveObservation(westObservation)
    setMessage(`${endpoint === 'pin' ? 'Pin' : 'Committee boat'} set from current GPS`)
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
              <div><Anchor size={18} /><h2>Build the start line</h2></div>
              <span className={`chip ${line ? 'chip--verified' : ''}`}>{line ? 'Line resolved' : 'Sight both ends'}</span>
            </div>
            <CoursePlot marks={marks} race={race} current={latestReading} line={line} compact />
            <div className="line-end-grid">
              {(['pin', 'committee'] as const).map((endpoint) => {
                const endpointObservations = observations.filter((item) => item.endpoint === endpoint)
                const resolved = endpoint === 'pin' ? pin : committee
                return (
                  <div className={`line-end ${resolved ? 'line-end--resolved' : ''}`} key={endpoint}>
                    <div className="line-end__title">
                      <span className={`endpoint-icon endpoint-icon--${endpoint}`}>{endpoint === 'pin' ? <Crosshair size={18} /> : <Sailboat size={18} />}</span>
                      <div><strong>{endpoint === 'pin' ? 'Pin end' : 'Committee boat'}</strong><small>{endpointObservations.length} sightings</small></div>
                    </div>
                    {resolved ? (
                      <div className="resolved-coordinate"><Check size={15} /> {resolved.latitude.toFixed(5)}, {resolved.longitude.toFixed(5)}</div>
                    ) : <p>Hold the phone vertically, align the camera crosshair, then repeat after moving.</p>}
                    <button className="button button--primary button--wide" onClick={() => setCameraTarget({ endpoint, label: endpoint === 'pin' ? 'Pin' : 'Committee boat' })}>
                      <Navigation size={17} /> Open {endpoint === 'pin' ? 'pin' : 'committee'} viewfinder
                    </button>
                    <button className="text-button" onClick={() => void directCapture(endpoint)}><LocateFixed size={14} /> I am beside this endpoint</button>
                  </div>
                )
              })}
            </div>
            {movableMarks.length > 0 && (
              <div className="movable-marks">
                <div className="movable-marks__heading"><div><Crosshair size={16} /><strong>Other movable marks</strong></div><span>Select any laid mark to sight</span></div>
                {movableMarks.map((mark) => {
                  const markObservations = observations.filter((item) => item.endpoint === 'mark' && item.markId === mark.id)
                  const coordinate = mark.position.kind === 'variable' ? mark.position.coordinate : undefined
                  return (
                    <div className="movable-mark-row" key={mark.id}>
                      <div><strong>{mark.name}</strong><small>{coordinate ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}` : `${markObservations.length} of 2 sightings`}</small></div>
                      <button className="button button--small button--secondary" onClick={() => setCameraTarget({ endpoint: 'mark', markId: mark.id, label: mark.name })}><Navigation size={14} /> Sight mark</button>
                    </div>
                  )
                })}
              </div>
            )}
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
      {cameraTarget && (
        <SightingCamera
          endpoint={cameraTarget.endpoint}
          label={cameraTarget.label}
          reading={latestReading}
          simulated={latestReading?.source === 'simulator'}
          onClose={() => setCameraTarget(null)}
          onCapture={async () => {
            const captured = await capture(cameraTarget)
            if (captured) setCameraTarget(null)
          }}
        />
      )}
    </div>
  )
}
