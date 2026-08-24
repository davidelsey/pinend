import { useEffect, useState } from 'react'
import { Check, Crosshair, MapPin, Trash2, X } from 'lucide-react'
import { useApp } from '../app/AppContext'
import {
  distanceMetres,
  intersectSightings,
  resolveMarkPosition,
  withManualMarkCoordinate,
  withSightingMarkCoordinate,
  withoutSightingMarkCoordinate,
} from '../domain/geo'
import type { Coordinate, LineObservation } from '../domain/types'
import { MapPointPicker } from './MapPointPicker'
import { SightingCamera } from './SightingCamera'

type SightingTarget = { endpoint: 'pin' | 'committee'; label: string } | { endpoint: 'mark'; markId: string; markPoint?: 'a' | 'b'; label: string }
export type SightTargetRef = { endpoint: 'pin' | 'committee' } | { endpoint: 'mark'; markId: string; markPoint?: 'a' | 'b' }
type Props = { now: number; open: boolean; onClose(): void; initialTarget?: SightTargetRef; initialAction?: 'sight' | 'position' }

const observationsFor = (observations: LineObservation[], target: SightingTarget) => observations.filter((item) =>
  item.endpoint === target.endpoint && (target.endpoint !== 'mark' || item.markId === target.markId && item.markPoint === target.markPoint),
)

const resolveEndpoint = (observations: LineObservation[], endpoint: 'pin' | 'committee') => {
  const sightings = observations.filter((item) => item.endpoint === endpoint)
  return sightings.length >= 2 ? intersectSightings(sightings.at(-2)!, sightings.at(-1)!) : null
}

export function SightMarksDialog({ now, open, onClose, initialTarget, initialAction }: Props) {
  const { marks, race, session, observations, latestReading, simulator, saveObservation, deleteObservation, saveMark } = useApp()
  const sightingReading = import.meta.env.DEV && !latestReading
    ? simulator.reading
    : import.meta.env.DEV && latestReading?.headingReliable === false
      ? { ...latestReading, heading: simulator.reading.heading, headingSource: 'simulator' as const, headingReliable: true }
      : latestReading
  const [selectedTarget, setSelectedTarget] = useState<SightingTarget | null>(null)
  const [cameraTarget, setCameraTarget] = useState<SightingTarget | null>(null)
  const [mapCoordinate, setMapCoordinate] = useState<Coordinate | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const raceMarks = race.course.reduce<typeof marks>((unique, waypoint) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    return mark && !unique.some((item) => item.id === mark.id) ? [...unique, mark] : unique
  }, [])
  const targetForGatePoint = (markId: string, point: 'a' | 'b'): SightingTarget => markId === 'start-line'
    ? { endpoint: point === 'a' ? 'pin' : 'committee', label: point === 'a' ? 'Pin' : 'Boat' }
    : { endpoint: 'mark', markId, markPoint: point, label: point === 'a' ? 'Pin' : 'Boat' }
  const targets: SightingTarget[] = [
    { endpoint: 'pin', label: 'Pin end' },
    { endpoint: 'committee', label: 'Committee boat' },
    ...raceMarks.map((mark) => ({ endpoint: 'mark' as const, markId: mark.id, label: mark.name })),
  ]
  useEffect(() => {
    if (!open || !initialTarget) return
    const initialMark = initialTarget.endpoint === 'mark' ? marks.find((mark) => mark.id === initialTarget.markId) : undefined
    const initialMarkPoint = initialTarget.endpoint === 'mark' ? initialTarget.markPoint : undefined
    const target = initialMark?.position.kind === 'gate'
      ? targetForGatePoint(initialMark.id, initialMarkPoint ?? 'a')
      : targets.find((candidate) => candidate.endpoint === initialTarget.endpoint && (candidate.endpoint !== 'mark' || (initialTarget.endpoint === 'mark' && candidate.markId === initialTarget.markId)))
    if (!target) return
    setSelectedTarget(target)
    if (target.endpoint === 'mark') {
      const mark = marks.find((item) => item.id === target.markId)
      setMapCoordinate(mark ? resolveMarkPosition(mark.position) ?? sightingReading ?? { latitude: -33.86, longitude: 151.24 } : null)
    }
    if (initialAction === 'sight') setCameraTarget(target)
  // The dialog is keyed by the caller for each direct action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const selectedObservations = selectedTarget ? observationsFor(observations, selectedTarget) : []
  const selectedMark = selectedTarget?.endpoint === 'mark' ? marks.find((mark) => mark.id === selectedTarget.markId) : undefined
  const resolvedCoordinate = selectedTarget?.endpoint === 'pin'
    ? resolveEndpoint(observations, 'pin')
    : selectedTarget?.endpoint === 'committee'
      ? resolveEndpoint(observations, 'committee')
      : selectedMark
        ? selectedMark.position.kind === 'gate' && selectedTarget?.endpoint === 'mark' && selectedTarget.markPoint
          ? selectedTarget.markPoint === 'a' ? selectedMark.position.pointA ?? null : selectedMark.position.pointB ?? null
          : resolveMarkPosition(selectedMark.position) ?? null
        : null
  const selectedMapCoordinate = selectedTarget?.endpoint === 'mark' ? mapCoordinate ?? resolvedCoordinate : resolvedCoordinate
  const otherMarks = raceMarks.flatMap((mark) => {
    if (mark.id === selectedMark?.id) return []
    const coordinate = resolveMarkPosition(mark.position)
    return coordinate ? [{ id: mark.id, label: mark.name, coordinate }] : []
  })
  const cameraObservations: LineObservation[] = cameraTarget && sightingReading ? [...selectedObservations, {
    id: 'live-sighting-ray',
    sessionId: session.id,
    endpoint: cameraTarget.endpoint,
    markId: cameraTarget.endpoint === 'mark' ? cameraTarget.markId : undefined,
    markPoint: cameraTarget.endpoint === 'mark' ? cameraTarget.markPoint : undefined,
    observer: { latitude: sightingReading.latitude, longitude: sightingReading.longitude },
    bearingTrue: sightingReading.heading,
    accuracy: sightingReading.accuracy,
    timestamp: now,
  }] : selectedObservations

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [message])

  const close = () => {
    setSelectedTarget(null)
    setCameraTarget(null)
    setMapCoordinate(null)
    onClose()
  }

  const capture = async (target: SightingTarget) => {
    if (!sightingReading) return setMessage('Enable device sensors or the development simulator first')
    if (sightingReading.headingReliable === false) return setMessage('An absolute compass heading is required for a sighting')
    const targetObservations = observationsFor(observations, target)
    const previous = targetObservations.at(-1)
    if (previous && distanceMetres(previous.observer, sightingReading) < 25) return setMessage('Move at least 25 m before the second sighting')
    const observation: LineObservation = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      endpoint: target.endpoint,
      markId: target.endpoint === 'mark' ? target.markId : undefined,
      markPoint: target.endpoint === 'mark' ? target.markPoint : undefined,
      observer: { latitude: sightingReading.latitude, longitude: sightingReading.longitude },
      bearingTrue: sightingReading.heading,
      accuracy: sightingReading.accuracy,
      timestamp: Date.now(),
    }
    await saveObservation(observation)
    if (target.endpoint === 'mark' && previous) {
      const coordinate = intersectSightings(previous, observation)
      const mark = marks.find((item) => item.id === target.markId)
      if (!coordinate || !mark) return setMessage('Sightings do not intersect reliably—move farther and try again')
      const position = mark.position.kind === 'gate' && target.markPoint
        ? target.markPoint === 'a' ? { ...mark.position, pointA: coordinate } : { ...mark.position, pointB: coordinate }
        : withSightingMarkCoordinate(mark.position, coordinate)
      await saveMark({ ...mark, position })
      setMessage(`${target.label} position resolved`)
    } else if (target.endpoint !== 'mark' && previous) {
      const coordinate = intersectSightings(previous, observation)
      const startLine = marks.find((mark) => mark.position.kind === 'gate' && mark.id === 'start-line')
      if (!coordinate || !startLine || startLine.position.kind !== 'gate') return setMessage('Sightings do not intersect reliably—move farther and try again')
      const position = target.endpoint === 'pin'
        ? { ...startLine.position, pointA: coordinate }
        : { ...startLine.position, pointB: coordinate }
      await saveMark({ ...startLine, position })
      setMessage(`${target.label} position resolved`)
    } else {
      setMessage(`${target.label} sighting saved`)
    }
    if (initialAction === 'sight') close()
    else setCameraTarget(null)
  }

  const saveMapPosition = async () => {
    if (!selectedMark || !mapCoordinate) return
    await saveMark({ ...selectedMark, position: withManualMarkCoordinate(selectedMark.position, mapCoordinate) })
    setMapCoordinate(null)
    setMessage(`${selectedMark.name} placed from map`)
  }

  const discardObservation = async (observation: LineObservation) => {
    await deleteObservation(observation.id)
    const markId = observation.endpoint === 'mark' ? observation.markId : 'start-line'
    if (!markId) return
    const mark = marks.find((item) => item.id === markId)
    if (!mark) return
    const remaining = observations.filter((item) => item.id !== observation.id && item.endpoint === observation.endpoint && item.markId === observation.markId && item.markPoint === observation.markPoint)
    if (mark.position.kind === 'gate') {
      const coordinate = remaining.length >= 2 ? intersectSightings(remaining.at(-2)!, remaining.at(-1)!) ?? undefined : undefined
      const position = observation.endpoint === 'committee' || observation.markPoint === 'b' ? { ...mark.position, pointB: coordinate } : { ...mark.position, pointA: coordinate }
      await saveMark({ ...mark, position })
      return
    }
    let position = withoutSightingMarkCoordinate(mark.position)
    if (remaining.length >= 2) {
      const coordinate = intersectSightings(remaining.at(-2)!, remaining.at(-1)!)
      if (coordinate) position = withSightingMarkCoordinate(position, coordinate)
    }
    await saveMark({ ...mark, position })
  }

  const age = (timestamp: number) => {
    const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.round(seconds / 60)
    return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`
  }

  if (!open) return null
  if (cameraTarget) {
    const gateMark = initialTarget?.endpoint === 'mark' ? marks.find((mark) => mark.id === initialTarget.markId && mark.position.kind === 'gate') : undefined
    const choices = gateMark ? (['a', 'b'] as const).map((point) => {
      const target = targetForGatePoint(gateMark.id, point)
      const selected = cameraTarget.endpoint === target.endpoint && (target.endpoint !== 'mark' || cameraTarget.endpoint === 'mark' && cameraTarget.markId === target.markId && cameraTarget.markPoint === target.markPoint)
      return { id: point, label: point === 'a' ? 'Pin' : 'Boat', selected, onSelect: () => { setSelectedTarget(target); setCameraTarget(target) } }
    }) : undefined
    return <SightingCamera endpoint={cameraTarget.endpoint} label={cameraTarget.label} reading={sightingReading} simulated={sightingReading?.source === 'simulator'} onClose={initialAction === 'sight' ? close : () => setCameraTarget(null)} onCapture={() => capture(cameraTarget)} targetChoices={choices} map={<MapPointPicker value={resolvedCoordinate} observations={cameraObservations} readOnly otherMarks={otherMarks} />} />
  }

  return (
    <>
      {message && <div className="toast"><Check size={16} /> {message}</div>}
      <div className={`modal-backdrop ${initialAction === 'position' ? 'modal-backdrop--position' : ''}`} role="dialog" aria-modal="true" aria-label={initialAction === 'position' && selectedTarget ? `Position ${selectedTarget.label}` : 'Sight marks'}>
        <div className={`form-modal sight-marks-modal ${initialAction === 'position' ? 'sight-marks-modal--position' : ''}`}>
          <div className="panel__heading"><div>{initialAction === 'position' ? <MapPin size={18} /> : <Crosshair size={18} />}<h2>{initialAction === 'position' && selectedTarget ? `Position ${selectedTarget.label}` : 'Sight marks'}</h2></div><button className="icon-button" aria-label={initialAction === 'position' ? 'Close mark position' : 'Close sight marks'} onClick={close}><X size={18} /></button></div>
          {!initialTarget && <p className="sight-marks-modal__intro">Select a target, then use the crosshair to sight it. Course marks can also be placed or adjusted directly on the map.</p>}
          {!initialTarget && <div className="sighting-targets">
            {targets.map((target) => {
              const selected = selectedTarget?.endpoint === target.endpoint && (target.endpoint !== 'mark' || (selectedTarget?.endpoint === 'mark' && selectedTarget.markId === target.markId))
              const count = observationsFor(observations, target).length
              return <button key={target.endpoint === 'mark' ? target.markId : target.endpoint} aria-label={target.label} className={selected ? 'selected' : ''} onClick={() => {
                setSelectedTarget(target)
                if (target.endpoint === 'mark') {
                  const mark = marks.find((item) => item.id === target.markId)
                  setMapCoordinate(mark ? resolveMarkPosition(mark.position) ?? sightingReading ?? { latitude: -33.86, longitude: 151.24 } : null)
                } else setMapCoordinate(null)
              }}><strong>{target.label}</strong><small>{count} sighting{count === 1 ? '' : 's'}</small></button>
            })}
          </div>}
          {selectedTarget && <div className="mark-adjustment">
            <div className="mark-adjustment__heading"><div><MapPin size={16} /><strong>{selectedTarget.label} adjustment</strong></div><span>{selectedObservations.length} sight ray{selectedObservations.length === 1 ? '' : 's'}</span></div>
            <MapPointPicker value={selectedMapCoordinate} onChange={selectedTarget.endpoint === 'mark' ? setMapCoordinate : undefined} observations={selectedObservations} readOnly={selectedTarget.endpoint !== 'mark'} otherMarks={otherMarks} />
            {selectedTarget.endpoint === 'mark' && selectedMapCoordinate && <div className="coordinate-adjustment-fields">
              <label><span>Latitude</span><input type="number" step="0.00001" value={selectedMapCoordinate.latitude} onChange={(event) => setMapCoordinate({ ...selectedMapCoordinate, latitude: Number(event.target.value) })} /></label>
              <label><span>Longitude</span><input type="number" step="0.00001" value={selectedMapCoordinate.longitude} onChange={(event) => setMapCoordinate({ ...selectedMapCoordinate, longitude: Number(event.target.value) })} /></label>
            </div>}
            <div className="sighting-history" aria-label={`${selectedTarget.label} sighting history`}>
              {selectedObservations.length === 0 && <p>No sightings recorded yet.</p>}
              {selectedObservations.map((observation) => { const created = age(observation.timestamp); return <div className="sighting-history__item" key={observation.id}><span><strong>{created}</strong><small>{observation.bearingTrue.toFixed(1)}° true · GPS ±{Math.round(observation.accuracy)} m</small></span><button className="icon-button icon-button--danger" aria-label={`Delete ${selectedTarget.label} sighting from ${created}`} onClick={() => void discardObservation(observation)}><Trash2 size={16} /></button></div> })}
            </div>
          </div>}
          <div className="sighting-actions">
            {selectedTarget?.endpoint === 'mark' && mapCoordinate && <button className="button button--orange" onClick={() => void saveMapPosition()}><Check size={17} /> Save map position</button>}
            {initialAction !== 'position' && <button className="button button--primary sighting-crosshair-button" disabled={!selectedTarget} aria-label={selectedTarget ? `Open ${selectedTarget.label} viewfinder` : 'Select a mark to open viewfinder'} onClick={() => { if (selectedTarget) setCameraTarget(selectedTarget) }}><Crosshair size={22} /></button>}
          </div>
        </div>
      </div>
    </>
  )
}
