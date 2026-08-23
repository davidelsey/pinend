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

type SightingTarget = { endpoint: 'pin' | 'committee'; label: string } | { endpoint: 'mark'; markId: string; label: string }
type Props = { now: number; open: boolean; onClose(): void }

const observationsFor = (observations: LineObservation[], target: SightingTarget) => observations.filter((item) =>
  item.endpoint === target.endpoint && (target.endpoint !== 'mark' || item.markId === target.markId),
)

const resolveEndpoint = (observations: LineObservation[], endpoint: 'pin' | 'committee') => {
  const sightings = observations.filter((item) => item.endpoint === endpoint)
  return sightings.length >= 2 ? intersectSightings(sightings.at(-2)!, sightings.at(-1)!) : null
}

export function SightMarksDialog({ now, open, onClose }: Props) {
  const { marks, race, session, observations, latestReading, saveObservation, deleteObservation, saveMark } = useApp()
  const [selectedTarget, setSelectedTarget] = useState<SightingTarget | null>(null)
  const [cameraTarget, setCameraTarget] = useState<SightingTarget | null>(null)
  const [mapCoordinate, setMapCoordinate] = useState<Coordinate | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const raceMarks = race.course.reduce<typeof marks>((unique, waypoint) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    return mark && !unique.some((item) => item.id === mark.id) ? [...unique, mark] : unique
  }, [])
  const targets: SightingTarget[] = [
    { endpoint: 'pin', label: 'Pin end' },
    { endpoint: 'committee', label: 'Committee boat' },
    ...raceMarks.map((mark) => ({ endpoint: 'mark' as const, markId: mark.id, label: mark.name })),
  ]
  const selectedObservations = selectedTarget ? observationsFor(observations, selectedTarget) : []
  const selectedMark = selectedTarget?.endpoint === 'mark' ? marks.find((mark) => mark.id === selectedTarget.markId) : undefined
  const resolvedCoordinate = selectedTarget?.endpoint === 'pin'
    ? resolveEndpoint(observations, 'pin')
    : selectedTarget?.endpoint === 'committee'
      ? resolveEndpoint(observations, 'committee')
      : selectedMark
        ? resolveMarkPosition(selectedMark.position) ?? null
        : null
  const selectedMapCoordinate = selectedTarget?.endpoint === 'mark' ? mapCoordinate ?? resolvedCoordinate : resolvedCoordinate

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
    if (!latestReading) return setMessage('Enable device sensors or the development simulator first')
    if (latestReading.headingReliable === false) return setMessage('An absolute compass heading is required for a sighting')
    const targetObservations = observationsFor(observations, target)
    const previous = targetObservations.at(-1)
    if (previous && distanceMetres(previous.observer, latestReading) < 25) return setMessage('Move at least 25 m before the second sighting')
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
      if (!coordinate || !mark) return setMessage('Sightings do not intersect reliably—move farther and try again')
      await saveMark({ ...mark, position: withSightingMarkCoordinate(mark.position, coordinate) })
      setMessage(`${target.label} position resolved`)
    } else {
      setMessage(`${target.label} sighting saved`)
    }
    setCameraTarget(null)
  }

  const saveMapPosition = async () => {
    if (!selectedMark || !mapCoordinate) return
    await saveMark({ ...selectedMark, position: withManualMarkCoordinate(selectedMark.position, mapCoordinate) })
    setMapCoordinate(null)
    setMessage(`${selectedMark.name} placed from map`)
  }

  const discardObservation = async (observation: LineObservation) => {
    await deleteObservation(observation.id)
    if (observation.endpoint !== 'mark' || !observation.markId) return
    const mark = marks.find((item) => item.id === observation.markId)
    if (!mark) return
    const remaining = observations.filter((item) => item.id !== observation.id && item.endpoint === 'mark' && item.markId === observation.markId)
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
  if (cameraTarget) return <SightingCamera endpoint={cameraTarget.endpoint} label={cameraTarget.label} reading={latestReading} simulated={latestReading?.source === 'simulator'} onClose={() => setCameraTarget(null)} onCapture={() => capture(cameraTarget)} />

  return (
    <>
      {message && <div className="toast"><Check size={16} /> {message}</div>}
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Sight marks">
        <div className="form-modal sight-marks-modal">
          <div className="panel__heading"><div><Crosshair size={18} /><h2>Sight marks</h2></div><button className="icon-button" aria-label="Close sight marks" onClick={close}><X size={18} /></button></div>
          <p className="sight-marks-modal__intro">Select a target, then use the crosshair to sight it. Course marks can also be placed or adjusted directly on the map.</p>
          <div className="sighting-targets">
            {targets.map((target) => {
              const selected = selectedTarget?.endpoint === target.endpoint && (target.endpoint !== 'mark' || (selectedTarget?.endpoint === 'mark' && selectedTarget.markId === target.markId))
              const count = observationsFor(observations, target).length
              return <button key={target.endpoint === 'mark' ? target.markId : target.endpoint} aria-label={target.label} className={selected ? 'selected' : ''} onClick={() => {
                setSelectedTarget(target)
                if (target.endpoint === 'mark') {
                  const mark = marks.find((item) => item.id === target.markId)
                  setMapCoordinate(mark ? resolveMarkPosition(mark.position) ?? latestReading ?? { latitude: -33.86, longitude: 151.24 } : null)
                } else setMapCoordinate(null)
              }}><strong>{target.label}</strong><small>{count} sighting{count === 1 ? '' : 's'}</small></button>
            })}
          </div>
          {selectedTarget && <div className="mark-adjustment">
            <div className="mark-adjustment__heading"><div><MapPin size={16} /><strong>{selectedTarget.label} adjustment</strong></div><span>{selectedObservations.length} sight ray{selectedObservations.length === 1 ? '' : 's'}</span></div>
            <MapPointPicker value={selectedMapCoordinate} onChange={selectedTarget.endpoint === 'mark' ? setMapCoordinate : undefined} observations={selectedObservations} readOnly={selectedTarget.endpoint !== 'mark'} />
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
            <button className="button button--primary sighting-crosshair-button" disabled={!selectedTarget} aria-label={selectedTarget ? `Open ${selectedTarget.label} viewfinder` : 'Select a mark to open viewfinder'} onClick={() => { if (selectedTarget) setCameraTarget(selectedTarget) }}><Crosshair size={22} /></button>
          </div>
        </div>
      </div>
    </>
  )
}
