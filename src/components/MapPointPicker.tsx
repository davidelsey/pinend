import { Crosshair, MapPin, Minus, Plus } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { destinationPoint } from '../domain/geo'
import type { Coordinate, LineObservation } from '../domain/types'

const SYDNEY_BOUNDS = { north: -33.81, south: -33.91, east: 151.30, west: 151.18 }

type Props = {
  value: Coordinate | null
  onChange?(coordinate: Coordinate): void
  secondValue?: Coordinate | null
  onSecondChange?(coordinate: Coordinate): void
  endpointLabels?: [string, string]
  observations?: LineObservation[]
  readOnly?: boolean
  otherMarks?: Array<{ id: string; label: string; coordinate: Coordinate }>
  otherGates?: Array<{ id: string; label: string; pointA: Coordinate; pointB: Coordinate }>
}

const project = (coordinate: Coordinate, bounds: typeof SYDNEY_BOUNDS) => ({
  x: ((coordinate.longitude - bounds.west) / (bounds.east - bounds.west)) * 100,
  y: ((bounds.north - coordinate.latitude) / (bounds.north - bounds.south)) * 100,
})

const fittedBounds = (coordinates: Coordinate[]) => {
  const inSydney = coordinates.length === 0 || coordinates.every((coordinate) => coordinate.latitude <= SYDNEY_BOUNDS.north && coordinate.latitude >= SYDNEY_BOUNDS.south && coordinate.longitude <= SYDNEY_BOUNDS.east && coordinate.longitude >= SYDNEY_BOUNDS.west)
  if (inSydney) return { bounds: SYDNEY_BOUNDS, inSydney }
  const latitudes = coordinates.map((coordinate) => coordinate.latitude)
  const longitudes = coordinates.map((coordinate) => coordinate.longitude)
  const centreLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
  const centreLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  const latitudeSpan = Math.max(Math.max(...latitudes) - Math.min(...latitudes), 0.05) * 1.35
  const longitudeSpan = Math.max(Math.max(...longitudes) - Math.min(...longitudes), 0.06) * 1.35
  return { bounds: { north: centreLatitude + latitudeSpan / 2, south: centreLatitude - latitudeSpan / 2, east: centreLongitude + longitudeSpan / 2, west: centreLongitude - longitudeSpan / 2 }, inSydney }
}

export function MapPointPicker({ value, onChange, secondValue, onSecondChange, endpointLabels = ['Pin', 'Boat'], observations = [], readOnly = false, otherMarks = [], otherGates = [] }: Props) {
  const [zoom, setZoom] = useState(1)
  const [zoomCentre, setZoomCentre] = useState<Coordinate | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const pinchGesture = useRef(false)
  const gestureStartValue = useRef<Coordinate | null>(null)
  const gestureStartSecondValue = useRef<Coordinate | null>(null)
  const activeEndpoint = useRef<'first' | 'second'>('first')
  const plottedCoordinates = [...(value ? [value] : []), ...(secondValue ? [secondValue] : []), ...observations.map((observation) => observation.observer), ...otherMarks.map((mark) => mark.coordinate), ...otherGates.flatMap((gate) => [gate.pointA, gate.pointB])]
  const [{ bounds: baseBounds, inSydney: useSydneyBounds }] = useState(() => fittedBounds(plottedCoordinates))
  const bounds = (() => {
    const centreLatitude = zoomCentre?.latitude ?? (baseBounds.north + baseBounds.south) / 2
    const centreLongitude = zoomCentre?.longitude ?? (baseBounds.east + baseBounds.west) / 2
    const latitudeSpan = (baseBounds.north - baseBounds.south) / zoom
    const longitudeSpan = (baseBounds.east - baseBounds.west) / zoom
    return { north: centreLatitude + latitudeSpan / 2, south: centreLatitude - latitudeSpan / 2, east: centreLongitude + longitudeSpan / 2, west: centreLongitude - longitudeSpan / 2 }
  })()
  const target = value ? project(value, bounds) : null
  const secondTarget = secondValue ? project(secondValue, bounds) : null
  const coordinateAt = (clientX: number, clientY: number, element: SVGSVGElement) => {
    const matrix = element.getScreenCTM?.()
    const point = element.createSVGPoint?.()
    if (matrix && point) {
      point.x = clientX
      point.y = clientY
      const local = point.matrixTransform(matrix.inverse())
      return {
        latitude: bounds.north - Math.min(1, Math.max(0, local.y / 100)) * (bounds.north - bounds.south),
        longitude: bounds.west + Math.min(1, Math.max(0, local.x / 100)) * (bounds.east - bounds.west),
      }
    }
    const rect = element.getBoundingClientRect()
    const normalX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const normalY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    return {
      latitude: bounds.north - normalY * (bounds.north - bounds.south),
      longitude: bounds.west + normalX * (bounds.east - bounds.west),
    }
  }
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    if (readOnly || !onChange) return
    const coordinate = coordinateAt(event.clientX, event.clientY, event.currentTarget)
    if (activeEndpoint.current === 'second' && onSecondChange) onSecondChange(coordinate)
    else onChange(coordinate)
  }
  const distanceBetweenPointers = () => {
    const [first, second] = [...pointers.current.values()]
    return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0
  }
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (readOnly || !onChange) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      gestureStartValue.current = value
      gestureStartSecondValue.current = secondValue ?? null
      if (target && secondTarget && onSecondChange) {
        const clicked = project(coordinateAt(event.clientX, event.clientY, event.currentTarget), bounds)
        const { x, y } = clicked
        activeEndpoint.current = Math.hypot(x - secondTarget.x, y - secondTarget.y) < Math.hypot(x - target.x, y - target.y) ? 'second' : 'first'
      }
      if (event.pointerType !== 'touch') pick(event)
    }
    if (pointers.current.size === 2) {
      pinchGesture.current = true
      if (gestureStartValue.current && onChange) onChange(gestureStartValue.current)
      if (gestureStartSecondValue.current && onSecondChange) onSecondChange(gestureStartSecondValue.current)
      const [first, second] = [...pointers.current.values()]
      setZoomCentre(coordinateAt((first.x + second.x) / 2, (first.y + second.y) / 2, event.currentTarget))
      pinch.current = { distance: distanceBetweenPointers(), zoom }
    }
  }
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1 && !pinchGesture.current) pick(event)
    if (pointers.current.size >= 2 && pinch.current?.distance) {
      setZoom(Math.min(6, Math.max(1, pinch.current.zoom * distanceBetweenPointers() / pinch.current.distance)))
    }
  }
  const pointerUp = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      pinchGesture.current = false
      gestureStartValue.current = null
      gestureStartSecondValue.current = null
    }
  }
  return (
    <div className="point-picker">
      <div className="point-picker__zoom" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" onClick={() => { setZoomCentre(value && secondValue ? { latitude: (value.latitude + secondValue.latitude) / 2, longitude: (value.longitude + secondValue.longitude) / 2 } : value); setZoom((current) => Math.min(6, current * 1.5)) }}><Plus size={17} /></button>
        <button type="button" aria-label="Zoom out" onClick={() => { setZoomCentre(value && secondValue ? { latitude: (value.latitude + secondValue.latitude) / 2, longitude: (value.longitude + secondValue.longitude) / 2 } : value); setZoom((current) => Math.max(1, current / 1.5)) }}><Minus size={17} /></button>
      </div>
      <svg viewBox="0 0 100 100" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} role="img" aria-label={readOnly ? 'Sight rays on Sydney Harbour map' : secondValue ? 'Drag gate pins on Sydney Harbour map' : 'Drag mark on Sydney Harbour map'} className={readOnly ? 'point-picker__readonly' : ''}>
        <rect width="100" height="100" fill="#0a3045" />
        <path d="M0 67 C18 56 23 66 38 50 C51 37 67 44 74 26 C83 11 93 15 100 8 L100 100 L0 100Z" fill="#1d4b48" />
        <path d="M0 67 C18 56 23 66 38 50 C51 37 67 44 74 26 C83 11 93 15 100 8" fill="none" stroke="#4a7770" strokeWidth="1" />
        {observations.map((observation) => {
          const observer = project(observation.observer, bounds)
          const rayEnd = project(destinationPoint(observation.observer, 10, observation.bearingTrue), bounds)
          return <g key={observation.id}><line className="sighting-ray" x1={observer.x} y1={observer.y} x2={rayEnd.x} y2={rayEnd.y} /><circle className="sighting-ray__origin" cx={observer.x} cy={observer.y} r="1.5" /></g>
        })}
        {otherMarks.map((mark) => {
          const position = project(mark.coordinate, bounds)
          return <g key={mark.id} transform={`translate(${position.x} ${position.y})`} className="point-picker__context-mark"><circle r="2.4" /><text x="3.5" y="1.2">{mark.label}</text></g>
        })}
        {otherGates.map((gate) => {
          const pointA = project(gate.pointA, bounds)
          const pointB = project(gate.pointB, bounds)
          return <g key={gate.id} className="point-picker__context-gate"><line x1={pointA.x} y1={pointA.y} x2={pointB.x} y2={pointB.y} /><circle cx={pointA.x} cy={pointA.y} r="2" /><circle cx={pointB.x} cy={pointB.y} r="2" /><text x={(pointA.x + pointB.x) / 2 + 2} y={(pointA.y + pointB.y) / 2 - 2}>{gate.label}</text></g>
        })}
        {target && secondTarget && <line className="gate-line" x1={target.x} y1={target.y} x2={secondTarget.x} y2={secondTarget.y} />}
        {target && <g transform={`translate(${target.x} ${target.y})`} className="gate-pin"><circle r="4" fill="#ff6b35" stroke="white" strokeWidth="1" /><path d="M0 5v7" stroke="#ff6b35" strokeWidth="1" />{secondTarget && <text x="5" y="-4">{endpointLabels[0]}</text>}</g>}
        {secondTarget && <g transform={`translate(${secondTarget.x} ${secondTarget.y})`} className="gate-pin"><circle r="4" fill="#53d3c2" stroke="white" strokeWidth="1" /><path d="M0 5v7" stroke="#53d3c2" strokeWidth="1" /><text x="5" y="-4">{endpointLabels[1]}</text></g>}
      </svg>
      <span><Crosshair size={13} /> {readOnly ? 'Sight rays' : secondValue ? 'Drag either pin · pinch to zoom' : 'Drag to position · pinch to zoom'}{value && !secondValue ? ` · ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : ''}</span>
      <i><MapPin size={13} /> {useSydneyBounds ? 'Sydney Harbour area' : 'Local plotting area'}</i>
    </div>
  )
}
