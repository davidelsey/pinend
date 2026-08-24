import { useState } from 'react'
import { Crosshair, Flag, LocateFixed, Maximize2, Navigation } from 'lucide-react'
import { resolveMarkPosition } from '../domain/geo'
import type { Coordinate, Mark, RaceDefinition } from '../domain/types'
import { isFinishWaypoint, isStartWaypoint } from '../domain/course'

type Props = {
  marks: Mark[]
  race: RaceDefinition
  current?: Coordinate | null
  activeMarkId?: string
  line?: { pin: Coordinate; committee: Coordinate } | null
  compact?: boolean
}

export function CoursePlot({ marks, race, current, activeMarkId, line, compact }: Props) {
  const [view, setView] = useState<'all' | 'course' | 'current'>('all')
  const courseMarks = race.course.flatMap((waypoint, waypointIndex) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    if (mark?.position.kind === 'gate') return []
    const coordinate = mark ? resolveMarkPosition(mark.position) : undefined
    return mark && coordinate ? [{ ...mark, coordinate, waypointIndex }] : []
  })
  const gates = race.course.flatMap((waypoint, waypointIndex) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    if (mark?.position.kind !== 'gate') return []
    const pointA = isStartWaypoint(waypoint) && line ? line.pin : mark.position.pointA
    const pointB = isStartWaypoint(waypoint) && line ? line.committee : mark.position.pointB
    return pointA && pointB ? [{ ...mark, pointA, pointB, waypointIndex }] : []
  })
  const startGate = gates.find((gate) => isStartWaypoint(race.course[gate.waypointIndex]))
  const finishGate = gates.find((gate) => isFinishWaypoint(race.course[gate.waypointIndex]))
  const sameCoordinate = (first: Coordinate, second: Coordinate) => Math.abs(first.latitude - second.latitude) < 1e-7 && Math.abs(first.longitude - second.longitude) < 1e-7
  const sharedStartFinish = Boolean(startGate && finishGate && (
    (sameCoordinate(startGate.pointA, finishGate.pointA) && sameCoordinate(startGate.pointB, finishGate.pointB))
    || (sameCoordinate(startGate.pointA, finishGate.pointB) && sameCoordinate(startGate.pointB, finishGate.pointA))
  ))
  const allPoints = [
    ...courseMarks.map((mark) => mark.coordinate),
    ...(current ? [current] : []),
    ...gates.flatMap((gate) => [gate.pointA, gate.pointB]),
  ]
  const coursePoints = [
    ...courseMarks.map((mark) => mark.coordinate),
    ...gates.flatMap((gate) => [gate.pointA, gate.pointB]),
  ]
  const points = view === 'current' && current
    ? [current]
    : view === 'course' && coursePoints.length > 0
      ? coursePoints
      : allPoints
  if (points.length === 0) return <div className="map-empty">No resolved positions yet</div>
  const latitudeValues = points.map((point) => point.latitude)
  const longitudeValues = points.map((point) => point.longitude)
  const padding = view === 'current' ? 0.0015 : 0.003
  const minLatitude = Math.min(...latitudeValues) - padding
  const maxLatitude = Math.max(...latitudeValues) + padding
  const minLongitude = Math.min(...longitudeValues) - padding
  const maxLongitude = Math.max(...longitudeValues) + padding
  const project = (coordinate: Coordinate) => ({
    x: 32 + ((coordinate.longitude - minLongitude) / (maxLongitude - minLongitude || 1)) * 336,
    y: 28 + ((maxLatitude - coordinate.latitude) / (maxLatitude - minLatitude || 1)) * 254,
  })
  const routeCoordinates = race.course.flatMap((_waypoint, waypointIndex) => {
    const gate = gates.find((item) => item.waypointIndex === waypointIndex)
    if (gate) return [{ latitude: (gate.pointA.latitude + gate.pointB.latitude) / 2, longitude: (gate.pointA.longitude + gate.pointB.longitude) / 2 }]
    const mark = courseMarks.find((item) => item.waypointIndex === waypointIndex)
    return mark ? [mark.coordinate] : []
  })
  const path = routeCoordinates.map((coordinate) => project(coordinate)).map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div className={`course-plot ${compact ? 'course-plot--compact' : ''}`} aria-label="Offline course plot">
      <svg viewBox="0 0 400 310" role="img">
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(160,205,218,.09)" strokeWidth="1" />
          </pattern>
          <linearGradient id="sea" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#08273c" />
            <stop offset="1" stopColor="#0a3448" />
          </linearGradient>
        </defs>
        <rect width="400" height="310" fill="url(#sea)" />
        <rect width="400" height="310" fill="url(#grid)" />
        <path d="M0 245 C70 217 112 252 175 222 C238 193 284 235 400 174 L400 310 L0 310Z" fill="#173c3c" opacity=".55" />
        {path && <polyline points={path} fill="none" stroke="#f5f1e8" strokeWidth="2.5" strokeDasharray="6 7" opacity=".72" />}
        {gates.map((gate) => {
          const waypoint = race.course[gate.waypointIndex]
          if (sharedStartFinish && isFinishWaypoint(waypoint)) return null
          const pin = project(gate.pointA)
          const boat = project(gate.pointB)
          const midpoint = { x: (pin.x + boat.x) / 2, y: (pin.y + boat.y) / 2 }
          const label = sharedStartFinish && isStartWaypoint(waypoint) ? 'START / FINISH' : `${gate.waypointIndex + 1} · ${gate.shortName}`
          return <g key={`${gate.id}-${gate.waypointIndex}`}><line x1={pin.x} y1={pin.y} x2={boat.x} y2={boat.y} stroke={isFinishWaypoint(waypoint) ? '#53d3c2' : '#ff6b35'} strokeWidth="5" /><text x={midpoint.x + 8} y={midpoint.y - 7} fill="#f5f1e8" fontSize="10" fontWeight="700">{label}</text></g>
        })}
        {courseMarks.map((mark, index) => {
          const point = project(mark.coordinate)
          const active = mark.id === activeMarkId
          return (
            <g key={`${mark.id}-${index}`} transform={`translate(${point.x} ${point.y})`}>
              {active && <circle r="17" fill="none" stroke="#ff6b35" strokeWidth="2" className="pulse-ring" />}
              <circle r="9" fill={active ? '#ff6b35' : '#f5f1e8'} stroke="#071b2f" strokeWidth="3" />
              <text x="13" y="4" fill="#f5f1e8" fontSize="10" fontWeight="700">{mark.waypointIndex + 1} · {mark.shortName}</text>
            </g>
          )
        })}
        {current && (() => {
          const point = project(current)
          return (
            <g transform={`translate(${point.x} ${point.y})`}>
              <circle r="12" fill="#53d3c2" opacity=".2" />
              <path d="M0 -10 L7 8 L0 5 L-7 8Z" fill="#53d3c2" stroke="#071b2f" strokeWidth="2" />
              <text x="12" y="4" fill="#53d3c2" fontSize="9" fontWeight="800">YOU</text>
            </g>
          )
        })()}
      </svg>
      <div className="map-label map-label--left"><Crosshair size={13} /> Offline plot</div>
      <div className="map-label map-label--right"><Navigation size={13} /> True north</div>
      <div className="map-controls">
        <button aria-label="Recenter on current location" disabled={!current} onClick={() => setView('current')}><LocateFixed size={15} /> <span>Recenter</span></button>
        <button aria-label="Fit all course waypoints" disabled={coursePoints.length === 0} onClick={() => setView('course')}><Maximize2 size={15} /> <span>Fit course</span></button>
      </div>
      {current && <div className="map-current-label"><span /> Current location</div>}
      <div className="map-watermark"><Flag size={12} /> PIN END</div>
    </div>
  )
}
