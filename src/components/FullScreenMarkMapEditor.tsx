import { Check, LocateFixed, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { resolveMarkPosition } from '../domain/geo'
import { currentCoordinate, type PositionFix } from '../domain/positionFix'
import type { Coordinate, LineObservation, Mark } from '../domain/types'
import { MapPointPicker } from './MapPointPicker'
import { courseCoordinates } from '../services/mapCoordinates'

type Props = {
  mark: Mark
  otherMarks: Mark[]
  courseMarkIds?: string[]
  fallback?: PositionFix | null
  observations?: LineObservation[]
  now?: number
  onDeleteObservation?(observation: LineObservation): void | Promise<void>
  onSave(coordinate: Coordinate): void | Promise<void>
  onCancel(): void
}

export function FullScreenMarkMapEditor({ mark, otherMarks, courseMarkIds = [], fallback, observations = [], now, onDeleteObservation, onSave, onCancel }: Props) {
  const [clock, setClock] = useState(() => now ?? Date.now())
  useEffect(() => {
    if (now !== undefined) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [now])
  const effectiveNow = now ?? clock
  const here = currentCoordinate(fallback, effectiveNow)
  const [original] = useState(() => resolveMarkPosition(mark.position) ?? here ?? { latitude: -33.86, longitude: 151.24 })
  const [coordinate, setCoordinate] = useState(original)
  const dirty = coordinate.latitude !== original.latitude || coordinate.longitude !== original.longitude
  const contextMarks = otherMarks.flatMap((other) => {
    if (other.position.kind === 'gate') return []
    const position = resolveMarkPosition(other.position)
    return position ? [{ id: other.id, label: other.name, coordinate: position }] : []
  })
  const contextGates = otherMarks.flatMap((other) => other.position.kind === 'gate' && !other.position.linkedToMarkId && other.position.pointA && other.position.pointB ? [{ id: other.id, label: other.name, pointA: other.position.pointA, pointB: other.position.pointB }] : [])
  const age = (timestamp: number) => {
    const seconds = Math.max(0, Math.round((effectiveNow - timestamp) / 1000))
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.round(seconds / 60)
    return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`
  }

  return (
    <div className="mark-map-editor" role="dialog" aria-modal="true" aria-label={`Position ${mark.name}`}>
      <header className="mark-map-editor__header">
        <div><span>POSITION MARK</span><h2>{mark.name}</h2></div>
        <button className="icon-button" aria-label="Close position editor" onClick={onCancel}><X size={20} /></button>
      </header>
      <main className="mark-map-editor__map">
        <MapPointPicker value={coordinate} onChange={setCoordinate} observations={observations} otherMarks={contextMarks} otherGates={contextGates} coursePath={courseCoordinates(courseMarkIds, [...otherMarks, mark], mark.id, coordinate)} />
        <div className="position-here-actions"><button className="button button--secondary" disabled={!here} aria-describedby={!here ? 'mark-position-fix-status' : undefined} onClick={() => { const current = currentCoordinate(fallback, now ?? Date.now()); if (current) setCoordinate(current) }}><LocateFixed size={16} /> Set mark here</button>{!here && <span id="mark-position-fix-status" className="position-here-status" role="status">Waiting for a recent GPS fix within 50 m accuracy</span>}</div>
        {observations.length > 0 && <aside className="mark-map-editor__sightings" aria-label={`${mark.name} sighting history`}>
          <strong>{observations.length} sight ray{observations.length === 1 ? '' : 's'}</strong>
          {observations.map((observation) => <div key={observation.id}><span><b>{age(observation.timestamp)}</b><small>{observation.bearingTrue.toFixed(1)}° true · GPS ±{Math.round(observation.accuracy)} m</small></span><button aria-label={`Delete ${mark.name} sighting from ${age(observation.timestamp)}`} onClick={() => void onDeleteObservation?.(observation)}><Trash2 size={15} /></button></div>)}
        </aside>}
      </main>
      <footer className="mark-map-editor__actions">
        <button className="button button--secondary" aria-label="Cancel positioning" onClick={onCancel}><X size={17} /> Cancel</button>
        <button className="button button--secondary" aria-label="Undo position change" disabled={!dirty} onClick={() => setCoordinate(original)}><RotateCcw size={17} /> Undo</button>
        <button className="button button--orange" aria-label="Save position" onClick={() => void onSave(coordinate)}><Check size={17} /> Save</button>
      </footer>
    </div>
  )
}
