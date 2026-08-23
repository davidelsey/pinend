import { Crosshair, MapPin } from 'lucide-react'
import type { MouseEvent } from 'react'
import { destinationPoint } from '../domain/geo'
import type { Coordinate, LineObservation } from '../domain/types'

const BOUNDS = { north: -33.81, south: -33.91, east: 151.30, west: 151.18 }

type Props = {
  value: Coordinate | null
  onChange?(coordinate: Coordinate): void
  observations?: LineObservation[]
  readOnly?: boolean
}

const project = (coordinate: Coordinate) => ({
  x: ((coordinate.longitude - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * 100,
  y: ((BOUNDS.north - coordinate.latitude) / (BOUNDS.north - BOUNDS.south)) * 100,
})

export function MapPointPicker({ value, onChange, observations = [], readOnly = false }: Props) {
  const target = value ? project(value) : null
  const pick = (event: MouseEvent<SVGSVGElement>) => {
    if (readOnly || !onChange) return
    const rect = event.currentTarget.getBoundingClientRect()
    const normalX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const normalY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    onChange({
      latitude: BOUNDS.north - normalY * (BOUNDS.north - BOUNDS.south),
      longitude: BOUNDS.west + normalX * (BOUNDS.east - BOUNDS.west),
    })
  }
  return (
    <div className="point-picker">
      <svg viewBox="0 0 100 100" onClick={pick} role="img" aria-label={readOnly ? 'Sight rays on Sydney Harbour map' : 'Select reference point on Sydney Harbour map'} className={readOnly ? 'point-picker__readonly' : ''}>
        <rect width="100" height="100" fill="#0a3045" />
        <path d="M0 67 C18 56 23 66 38 50 C51 37 67 44 74 26 C83 11 93 15 100 8 L100 100 L0 100Z" fill="#1d4b48" />
        <path d="M0 67 C18 56 23 66 38 50 C51 37 67 44 74 26 C83 11 93 15 100 8" fill="none" stroke="#4a7770" strokeWidth="1" />
        {observations.map((observation) => {
          const observer = project(observation.observer)
          const rayEnd = project(destinationPoint(observation.observer, 10, observation.bearingTrue))
          return <g key={observation.id}><line className="sighting-ray" x1={observer.x} y1={observer.y} x2={rayEnd.x} y2={rayEnd.y} /><circle className="sighting-ray__origin" cx={observer.x} cy={observer.y} r="1.5" /></g>
        })}
        {target && <g transform={`translate(${target.x} ${target.y})`}><circle r="4" fill="#ff6b35" stroke="white" strokeWidth="1" /><path d="M0 5v7" stroke="#ff6b35" strokeWidth="1" /></g>}
      </svg>
      <span><Crosshair size={13} /> {readOnly ? 'Sight rays' : 'Tap to select'}{value ? ` · ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : ''}</span>
      <i><MapPin size={13} /> Sydney Harbour area</i>
    </div>
  )
}
