import { Crosshair, MapPin, Minus, Plus } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { destinationPoint } from '../domain/geo'
import type { Coordinate, LineObservation } from '../domain/types'

const SYDNEY_BOUNDS = { north: -33.81, south: -33.91, east: 151.30, west: 151.18 }

type Props = {
  value: Coordinate | null
  onChange?(coordinate: Coordinate): void
  observations?: LineObservation[]
  readOnly?: boolean
  otherMarks?: Array<{ id: string; label: string; coordinate: Coordinate }>
}

const project = (coordinate: Coordinate, bounds: typeof SYDNEY_BOUNDS) => ({
  x: ((coordinate.longitude - bounds.west) / (bounds.east - bounds.west)) * 100,
  y: ((bounds.north - coordinate.latitude) / (bounds.north - bounds.south)) * 100,
})

export function MapPointPicker({ value, onChange, observations = [], readOnly = false, otherMarks = [] }: Props) {
  const [zoom, setZoom] = useState(1)
  const [zoomCentre, setZoomCentre] = useState<Coordinate | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | null>(null)
  const pinchGesture = useRef(false)
  const gestureStartValue = useRef<Coordinate | null>(null)
  const plottedCoordinates = [...(value ? [value] : []), ...observations.map((observation) => observation.observer), ...otherMarks.map((mark) => mark.coordinate)]
  const useSydneyBounds = plottedCoordinates.length === 0 || plottedCoordinates.every((coordinate) =>
    coordinate.latitude <= SYDNEY_BOUNDS.north && coordinate.latitude >= SYDNEY_BOUNDS.south && coordinate.longitude <= SYDNEY_BOUNDS.east && coordinate.longitude >= SYDNEY_BOUNDS.west,
  )
  const baseBounds = useSydneyBounds ? SYDNEY_BOUNDS : (() => {
    const latitudes = plottedCoordinates.map((coordinate) => coordinate.latitude)
    const longitudes = plottedCoordinates.map((coordinate) => coordinate.longitude)
    const centreLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
    const centreLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
    const latitudeSpan = Math.max(Math.max(...latitudes) - Math.min(...latitudes), 0.05) * 1.35
    const longitudeSpan = Math.max(Math.max(...longitudes) - Math.min(...longitudes), 0.06) * 1.35
    return { north: centreLatitude + latitudeSpan / 2, south: centreLatitude - latitudeSpan / 2, east: centreLongitude + longitudeSpan / 2, west: centreLongitude - longitudeSpan / 2 }
  })()
  const bounds = (() => {
    const centreLatitude = zoomCentre?.latitude ?? (baseBounds.north + baseBounds.south) / 2
    const centreLongitude = zoomCentre?.longitude ?? (baseBounds.east + baseBounds.west) / 2
    const latitudeSpan = (baseBounds.north - baseBounds.south) / zoom
    const longitudeSpan = (baseBounds.east - baseBounds.west) / zoom
    return { north: centreLatitude + latitudeSpan / 2, south: centreLatitude - latitudeSpan / 2, east: centreLongitude + longitudeSpan / 2, west: centreLongitude - longitudeSpan / 2 }
  })()
  const target = value ? project(value, bounds) : null
  const coordinateAt = (clientX: number, clientY: number, element: SVGSVGElement) => {
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
    onChange(coordinateAt(event.clientX, event.clientY, event.currentTarget))
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
      if (event.pointerType !== 'touch') pick(event)
    }
    if (pointers.current.size === 2) {
      pinchGesture.current = true
      if (gestureStartValue.current && onChange) onChange(gestureStartValue.current)
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
    }
  }
  return (
    <div className="point-picker">
      <div className="point-picker__zoom" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" onClick={() => { setZoomCentre(value); setZoom((current) => Math.min(6, current * 1.5)) }}><Plus size={17} /></button>
        <button type="button" aria-label="Zoom out" onClick={() => { setZoomCentre(value); setZoom((current) => Math.max(1, current / 1.5)) }}><Minus size={17} /></button>
      </div>
      <svg viewBox="0 0 100 100" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} role="img" aria-label={readOnly ? 'Sight rays on Sydney Harbour map' : 'Drag mark on Sydney Harbour map'} className={readOnly ? 'point-picker__readonly' : ''}>
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
        {target && <g transform={`translate(${target.x} ${target.y})`}><circle r="4" fill="#ff6b35" stroke="white" strokeWidth="1" /><path d="M0 5v7" stroke="#ff6b35" strokeWidth="1" /></g>}
      </svg>
      <span><Crosshair size={13} /> {readOnly ? 'Sight rays' : 'Drag to position · pinch to zoom'}{value ? ` · ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : ''}</span>
      <i><MapPin size={13} /> {useSydneyBounds ? 'Sydney Harbour area' : 'Local plotting area'}</i>
    </div>
  )
}
