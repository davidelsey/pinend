import { Check, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { resolveMarkPosition } from '../domain/geo'
import type { Coordinate, LineObservation, Mark } from '../domain/types'
import { MapPointPicker } from './MapPointPicker'

type Props = {
  mark: Mark
  otherMarks: Mark[]
  fallback?: Coordinate | null
  observations?: LineObservation[]
  onDeleteObservation?(observation: LineObservation): void | Promise<void>
  onSave(pointA: Coordinate, pointB: Coordinate): void | Promise<void>
  onCancel(): void
}

export function FullScreenLineMapEditor({ mark, otherMarks, fallback, observations = [], onDeleteObservation, onSave, onCancel }: Props) {
  const base = fallback ?? { latitude: -33.86, longitude: 151.24 }
  const gatePosition = mark.position.kind === 'gate' ? mark.position : { kind: 'gate' as const, labels: ['Pin', 'Boat'] as [string, string] }
  const [originalA] = useState(() => gatePosition.pointA ?? base)
  const [originalB] = useState(() => gatePosition.pointB ?? { latitude: base.latitude, longitude: base.longitude + 0.001 })
  const [pointA, setPointA] = useState(originalA)
  const [pointB, setPointB] = useState(originalB)
  const dirty = pointA.latitude !== originalA.latitude || pointA.longitude !== originalA.longitude || pointB.latitude !== originalB.latitude || pointB.longitude !== originalB.longitude
  const contextMarks = otherMarks.flatMap((other) => {
    if (other.position.kind === 'gate') return []
    const position = resolveMarkPosition(other.position)
    return position ? [{ id: other.id, label: other.name, coordinate: position }] : []
  })
  const contextGates = otherMarks.flatMap((other) => other.position.kind === 'gate' && !other.position.linkedToMarkId && other.position.pointA && other.position.pointB ? [{ id: other.id, label: other.name, pointA: other.position.pointA, pointB: other.position.pointB }] : [])
  if (mark.position.kind !== 'gate') return null

  return <div className="mark-map-editor" role="dialog" aria-modal="true" aria-label={`Position ${mark.name}`}>
    <header className="mark-map-editor__header"><div><span>POSITION GATE</span><h2>{mark.name}</h2></div><button className="icon-button" aria-label="Close position editor" onClick={onCancel}><X size={20} /></button></header>
    <main className="mark-map-editor__map">
      <MapPointPicker value={pointA} onChange={setPointA} secondValue={pointB} onSecondChange={setPointB} endpointLabels={gatePosition.labels ?? ['Pin', 'Boat']} otherMarks={contextMarks} otherGates={contextGates} observations={observations} />
      {onDeleteObservation && observations.length > 0 && <aside className="mark-map-editor__sightings"><strong>{observations.length} sight rays</strong>{observations.map((observation) => { const endpoint = observation.endpoint === 'committee' || observation.markPoint === 'b' ? 'Boat' : 'Pin'; return <div key={observation.id}><span><b>{endpoint} · {Math.max(0, Math.round((Date.now() - observation.timestamp) / 60000))}m ago</b><small>{observation.bearingTrue.toFixed(1)}° true</small></span><button aria-label={`Delete ${endpoint} sighting`} onClick={() => void onDeleteObservation(observation)}>Delete</button></div> })}</aside>}
    </main>
    <footer className="mark-map-editor__actions"><button className="button button--secondary" aria-label="Cancel positioning" onClick={onCancel}><X size={17} /> Cancel</button><button className="button button--secondary" aria-label="Undo position change" disabled={!dirty} onClick={() => { setPointA(originalA); setPointB(originalB) }}><RotateCcw size={17} /> Undo</button><button className="button button--orange" aria-label="Save position" onClick={() => void onSave(pointA, pointB)}><Check size={17} /> Save</button></footer>
  </div>
}
