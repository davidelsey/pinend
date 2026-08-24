import { Crosshair, Navigation } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { normalizeBearing, resolveMarkPosition } from '../domain/geo'
import type { Coordinate, Mark, RaceDefinition } from '../domain/types'

const MIN_HANDLE_LENGTH = 9
const MAX_HANDLE_LENGTH = 30
const MAX_SPEED_KNOTS = 20

type Bounds = { north: number; south: number; east: number; west: number }

type Props = {
  coordinate: Coordinate
  heading: number
  speedKnots: number
  marks: Mark[]
  race: RaceDefinition
  onPosition(coordinate: Coordinate): void
  onVector(heading: number, speedKnots: number): void
}

function fitBounds(coordinates: Coordinate[]): Bounds {
  const latitudes = coordinates.map((coordinate) => coordinate.latitude)
  const longitudes = coordinates.map((coordinate) => coordinate.longitude)
  const centreLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
  const centreLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  const latitudeSpan = Math.max(Math.max(...latitudes) - Math.min(...latitudes), 0.018) * 1.35
  const longitudeSpan = Math.max(Math.max(...longitudes) - Math.min(...longitudes), 0.022) * 1.35
  return {
    north: centreLatitude + latitudeSpan / 2,
    south: centreLatitude - latitudeSpan / 2,
    east: centreLongitude + longitudeSpan / 2,
    west: centreLongitude - longitudeSpan / 2,
  }
}

export function SimulatorMap({ coordinate, heading, speedKnots, marks, race, onPosition, onVector }: Props) {
  const courseMarks = race.course.flatMap((waypoint, index) => {
    const mark = marks.find((candidate) => candidate.id === waypoint.markId)
    if (!mark) return []
    const position = resolveMarkPosition(mark.position)
    return position ? [{ id: waypoint.id, label: `${index + 1} · ${mark.shortName}`, coordinate: position }] : []
  })
  const [bounds] = useState(() => fitBounds([coordinate, ...courseMarks.map((mark) => mark.coordinate)]))
  const activeControl = useRef<'boat' | 'vector' | null>(null)
  const project = (value: Coordinate) => ({
    x: ((value.longitude - bounds.west) / (bounds.east - bounds.west)) * 100,
    y: ((bounds.north - value.latitude) / (bounds.north - bounds.south)) * 100,
  })
  const boat = project(coordinate)
  const handleLength = MIN_HANDLE_LENGTH + Math.min(MAX_SPEED_KNOTS, Math.max(0, speedKnots)) / MAX_SPEED_KNOTS * (MAX_HANDLE_LENGTH - MIN_HANDLE_LENGTH)
  const headingRadians = normalizeBearing(heading) * Math.PI / 180
  const handle = {
    x: boat.x + Math.sin(headingRadians) * handleLength,
    y: boat.y - Math.cos(headingRadians) * handleLength,
  }
  const coordinateAt = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, (event.clientX - rect.left) / (rect.width || 1) * 100))
    const y = Math.min(100, Math.max(0, (event.clientY - rect.top) / (rect.height || 1) * 100))
    return {
      point: { x, y },
      coordinate: {
        latitude: bounds.north - y / 100 * (bounds.north - bounds.south),
        longitude: bounds.west + x / 100 * (bounds.east - bounds.west),
      },
    }
  }
  const update = (event: PointerEvent<SVGSVGElement>) => {
    if (!activeControl.current) return
    const value = coordinateAt(event)
    if (activeControl.current === 'boat') {
      onPosition(value.coordinate)
      return
    }
    const x = value.point.x - boat.x
    const y = value.point.y - boat.y
    const distance = Math.hypot(x, y)
    const nextHeading = normalizeBearing(Math.atan2(x, -y) * 180 / Math.PI)
    const nextSpeed = Math.min(MAX_SPEED_KNOTS, Math.max(0, (distance - MIN_HANDLE_LENGTH) / (MAX_HANDLE_LENGTH - MIN_HANDLE_LENGTH) * MAX_SPEED_KNOTS))
    onVector(nextHeading, nextSpeed)
  }
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const control = (event.target as Element).closest<SVGElement>('[data-simulator-control]')?.dataset.simulatorControl
    if (control !== 'boat' && control !== 'vector') return
    activeControl.current = control
    event.currentTarget.setPointerCapture?.(event.pointerId)
    update(event)
  }
  const pointerUp = (event: PointerEvent<SVGSVGElement>) => {
    activeControl.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div className="simulator-map">
      <svg viewBox="0 0 100 100" role="img" aria-label="Drag the boat and its speed handle on the simulator map" onPointerDown={pointerDown} onPointerMove={update} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <defs>
          <pattern id="simulator-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="rgba(160,205,218,.1)" strokeWidth=".35" /></pattern>
        </defs>
        <rect width="100" height="100" fill="#082b40" />
        <rect width="100" height="100" fill="url(#simulator-grid)" />
        <path d="M0 78 C17 67 26 75 42 58 C56 44 67 51 76 31 C85 13 94 18 100 10 V100 H0Z" fill="#173f3e" opacity=".72" />
        {courseMarks.length > 1 && <polyline points={courseMarks.map((mark) => { const point = project(mark.coordinate); return `${point.x},${point.y}` }).join(' ')} fill="none" stroke="#f5f1e8" strokeWidth=".7" strokeDasharray="2 2" opacity=".58" />}
        {courseMarks.map((mark) => { const point = project(mark.coordinate); const alignLeft = point.x > 75; return <g key={mark.id} transform={`translate(${point.x} ${point.y})`} className="simulator-map__mark"><circle r="1.8" /><text x={alignLeft ? -2.8 : 2.8} y="1" textAnchor={alignLeft ? 'end' : 'start'}>{mark.label}</text></g> })}
        <line className="simulator-map__vector" x1={boat.x} y1={boat.y} x2={handle.x} y2={handle.y} />
        <g transform={`translate(${handle.x} ${handle.y})`} data-simulator-control="vector" className="simulator-map__handle" role="button" aria-label="Drag to set heading and speed"><circle r="5.5" className="simulator-map__touch-target" /><circle r="2.8" /><path d="M-1.4 0h2.8M0-1.4v2.8" /></g>
        <g transform={`translate(${boat.x} ${boat.y})`} data-simulator-control="boat" className="simulator-map__boat" role="button" aria-label="Drag boat position"><circle r="7" className="simulator-map__touch-target" /><g transform={`rotate(${normalizeBearing(heading)})`}><path d="M0 -5 L3.8 4 L0 2.5 L-3.8 4Z" /></g><text x="5" y="1.4">YOU</text></g>
      </svg>
      <div className="simulator-map__legend"><span><Crosshair size={13} /> Drag YOU to move</span><span><Navigation size={13} /> Drag handle · {Math.round(normalizeBearing(heading))}° · {speedKnots.toFixed(1)} kn</span></div>
    </div>
  )
}
