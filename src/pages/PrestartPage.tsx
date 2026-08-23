import { useEffect, useMemo, useState } from 'react'
import { Anchor, Check, Clock3, Crosshair, MapPin, Radio, Sailboat, TimerReset, Trash2, X } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { DevSimulator } from '../components/DevSimulator'
import { MapPointPicker } from '../components/MapPointPicker'
import { SightingCamera } from '../components/SightingCamera'
import { formatCountdown, syncStartFromSignal } from '../domain/countdown'
import { distanceMetres, intersectSightings, resolveMarkPosition, timeToLineSeconds, withManualMarkCoordinate, withSightingMarkCoordinate, withoutSightingMarkCoordinate } from '../domain/geo'
import type { Coordinate, LineObservation } from '../domain/types'

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
  const { marks, race, session, observations, latestReading, saveObservation, deleteObservation, saveMark, updateSession } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const [showSightMarks, setShowSightMarks] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<CameraTarget | null>(null)
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null)
  const [mapCoordinate, setMapCoordinate] = useState<Coordinate | null>(null)
  const remaining = session.syncedStartTime - now
  const pin = useMemo(() => resolveEndpoint(observations, 'pin'), [observations])
  const committee = useMemo(() => resolveEndpoint(observations, 'committee'), [observations])
  const line = pin && committee ? { pin, committee } : null
  const raceMarks = race.course.reduce<typeof marks>((unique, waypoint) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    return mark && !unique.some((item) => item.id === mark.id) ? [...unique, mark] : unique
  }, [])
  const sightingTargets: CameraTarget[] = [
    { endpoint: 'pin', label: 'Pin end' },
    { endpoint: 'committee', label: 'Committee boat' },
    ...raceMarks.map((mark) => ({ endpoint: 'mark' as const, markId: mark.id, label: mark.name })),
  ]
  const selectedObservations = selectedTarget
    ? observations.filter((item) => item.endpoint === selectedTarget.endpoint && (selectedTarget.endpoint !== 'mark' || item.markId === selectedTarget.markId))
    : []
  const selectedMark = selectedTarget?.endpoint === 'mark' ? marks.find((mark) => mark.id === selectedTarget.markId) : undefined
  const selectedResolvedCoordinate = selectedTarget?.endpoint === 'pin'
    ? pin
    : selectedTarget?.endpoint === 'committee'
      ? committee
      : selectedMark
        ? resolveMarkPosition(selectedMark.position) ?? null
        : null
  const selectedMapCoordinate = selectedTarget?.endpoint === 'mark' ? mapCoordinate ?? selectedResolvedCoordinate : selectedResolvedCoordinate
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
        await saveMark({ ...mark, position: withSightingMarkCoordinate(mark.position, coordinate) })
        setMessage(`${target.label} position resolved`)
        return true
      }
      setMessage('Sightings do not intersect reliably—move farther and try again')
      return false
    }
    setMessage(`${target.label} sighting saved`)
    return true
  }

  const placeSelectedMark = async () => {
    if (selectedTarget?.endpoint !== 'mark' || !mapCoordinate) return
    const mark = marks.find((item) => item.id === selectedTarget.markId)
    if (!mark) return
    await saveMark({ ...mark, position: withManualMarkCoordinate(mark.position, mapCoordinate) })
    setMapCoordinate(null)
    setMessage(`${mark.name} placed from map`)
  }

  const observationAge = (timestamp: number) => {
    const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.round(minutes / 60)
    return `${hours}h ago`
  }

  const discardObservation = async (observation: LineObservation) => {
    await deleteObservation(observation.id)
    if (observation.endpoint !== 'mark' || !observation.markId) return
    const mark = marks.find((item) => item.id === observation.markId)
    if (!mark) return
    const remainingSightings = observations.filter((item) => item.id !== observation.id && item.endpoint === 'mark' && item.markId === observation.markId)
    let position = withoutSightingMarkCoordinate(mark.position)
    if (remainingSightings.length >= 2) {
      const coordinate = intersectSightings(remainingSightings.at(-2)!, remainingSightings.at(-1)!)
      if (coordinate) position = withSightingMarkCoordinate(position, coordinate)
    }
    await saveMark({ ...mark, position })
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
      {showSightMarks && !cameraTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Sight marks">
          <div className="form-modal sight-marks-modal">
            <div className="panel__heading">
              <div><Crosshair size={18} /><h2>Sight marks</h2></div>
              <button className="icon-button" aria-label="Close sight marks" onClick={() => { setShowSightMarks(false); setSelectedTarget(null); setMapCoordinate(null) }}><X size={18} /></button>
            </div>
            <p className="sight-marks-modal__intro">Select a target, then use the crosshair to sight it. Course marks can also be placed or adjusted directly on the map.</p>
            <div className="sighting-targets">
              {sightingTargets.map((target) => {
                const selected = selectedTarget?.endpoint === target.endpoint && (target.endpoint !== 'mark' || (selectedTarget?.endpoint === 'mark' && selectedTarget.markId === target.markId))
                const count = observations.filter((item) => item.endpoint === target.endpoint && (target.endpoint !== 'mark' || item.markId === target.markId)).length
                return <button key={target.endpoint === 'mark' ? target.markId : target.endpoint} aria-label={target.label} className={selected ? 'selected' : ''} onClick={() => {
                  setSelectedTarget(target)
                  if (target.endpoint === 'mark') {
                    const mark = marks.find((item) => item.id === target.markId)
                    setMapCoordinate(mark ? resolveMarkPosition(mark.position) ?? latestReading ?? { latitude: -33.86, longitude: 151.24 } : null)
                  } else {
                    setMapCoordinate(null)
                  }
                }}><strong>{target.label}</strong><small>{count} sighting{count === 1 ? '' : 's'}</small></button>
              })}
            </div>
            {selectedTarget && (
              <div className="mark-adjustment">
                <div className="mark-adjustment__heading"><div><MapPin size={16} /><strong>{selectedTarget.label} adjustment</strong></div><span>{selectedObservations.length} sight ray{selectedObservations.length === 1 ? '' : 's'}</span></div>
                <MapPointPicker
                  value={selectedMapCoordinate}
                  onChange={selectedTarget.endpoint === 'mark' ? setMapCoordinate : undefined}
                  observations={selectedObservations}
                  readOnly={selectedTarget.endpoint !== 'mark'}
                />
                {selectedTarget.endpoint === 'mark' && selectedMapCoordinate && (
                  <div className="coordinate-adjustment-fields">
                    <label><span>Latitude</span><input type="number" step="0.00001" value={selectedMapCoordinate.latitude} onChange={(event) => setMapCoordinate({ ...selectedMapCoordinate, latitude: Number(event.target.value) })} /></label>
                    <label><span>Longitude</span><input type="number" step="0.00001" value={selectedMapCoordinate.longitude} onChange={(event) => setMapCoordinate({ ...selectedMapCoordinate, longitude: Number(event.target.value) })} /></label>
                  </div>
                )}
                <div className="sighting-history" aria-label={`${selectedTarget.label} sighting history`}>
                  {selectedObservations.length === 0 && <p>No sightings recorded yet.</p>}
                  {selectedObservations.map((observation) => {
                    const age = observationAge(observation.timestamp)
                    return (
                      <div className="sighting-history__item" key={observation.id}>
                        <span><strong>{age}</strong><small>{observation.bearingTrue.toFixed(1)}° true · GPS ±{Math.round(observation.accuracy)} m</small></span>
                        <button className="icon-button icon-button--danger" aria-label={`Delete ${selectedTarget.label} sighting from ${age}`} onClick={() => void discardObservation(observation)}><Trash2 size={16} /></button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="sighting-actions">
              {selectedTarget?.endpoint === 'mark' && mapCoordinate && <button className="button button--orange" onClick={() => void placeSelectedMark()}><Check size={17} /> Save map position</button>}
              <button
                className="button button--primary sighting-crosshair-button"
                disabled={!selectedTarget}
                aria-label={selectedTarget ? `Open ${selectedTarget.label} viewfinder` : 'Select a mark to open viewfinder'}
                onClick={() => { if (selectedTarget) setCameraTarget(selectedTarget) }}
              ><Crosshair size={22} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
