import { Crosshair, MapPin, Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { destinationPoint } from '../domain/geo'
import type { Coordinate, LineObservation } from '../domain/types'
import { googleMapOptions, loadGoogleMaps } from '../services/googleMaps'
import { fitMapToCoordinates, googleCoordinate } from '../services/mapCoordinates'

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

const fromPosition = (position: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined): Coordinate | null => {
  if (!position) return null
  const latitude = typeof position.lat === 'function' ? position.lat() : position.lat
  const longitude = typeof position.lng === 'function' ? position.lng() : position.lng
  return { latitude, longitude }
}

function pinElement(label: string, variant: 'first' | 'second' | 'context') {
  const element = document.createElement('div')
  element.className = `point-map-pin point-map-pin--${variant}`
  const dot = document.createElement('span')
  const text = document.createElement('strong')
  text.textContent = label
  element.append(dot, text)
  return element
}

type Pin = {
  marker: google.maps.marker.AdvancedMarkerElement
  content: HTMLDivElement
  coordinate: string
  change?: (coordinate: Coordinate) => void
}

export function MapPointPicker({ value, onChange, secondValue, onSecondChange, endpointLabels = ['Pin', 'Boat'], observations = [], readOnly = false, otherMarks = [], otherGates = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef(new Map<string, Pin>())
  const linesRef = useRef<google.maps.Polyline[]>([])
  const markerClassRef = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(null)
  const fittedRef = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const plottedCoordinates = useMemo(() => [
    ...(value ? [value] : []),
    ...(secondValue ? [secondValue] : []),
    ...observations.map((observation) => observation.observer),
    ...otherMarks.map((mark) => mark.coordinate),
    ...otherGates.flatMap((gate) => [gate.pointA, gate.pointB]),
  ], [observations, otherGates, otherMarks, secondValue, value])

  useEffect(() => {
    if (!containerRef.current) return
    const pins = markersRef.current
    let cancelled = false
    void loadGoogleMaps()
      .then(({ maps, marker }) => {
        if (cancelled || !containerRef.current) return
        mapRef.current = new maps.Map(containerRef.current, googleMapOptions({ lat: -33.86, lng: 151.235 }))
        markerClassRef.current = marker.AdvancedMarkerElement
        setLoaded(true)
      })
      .catch((error: Error) => setMapError(error.message))
    return () => {
      cancelled = true
      pins.forEach(({ marker }) => { marker.map = null })
      linesRef.current.forEach((line) => line.setMap(null))
      pins.clear()
      linesRef.current = []
      mapRef.current = null
      markerClassRef.current = null
      fittedRef.current = false
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const AdvancedMarkerElement = markerClassRef.current
    if (!map || !AdvancedMarkerElement || !loaded) return
    const sightLines = observations.map((observation) => ({
      path: [googleCoordinate(observation.observer), googleCoordinate(destinationPoint(observation.observer, 10, observation.bearingTrue))],
      strokeColor: '#f7dd72', strokeWeight: 3, strokeOpacity: 0.9,
    }))
    const gateLines = [
      ...(value && secondValue ? [{ pointA: value, pointB: secondValue, target: true }] : []),
      ...otherGates.map((gate) => ({ ...gate, target: false })),
    ].map((gate) => ({
      path: [googleCoordinate(gate.pointA), googleCoordinate(gate.pointB)],
      strokeColor: gate.target ? '#f5f1e8' : '#6d858a', strokeWeight: gate.target ? 4 : 2, strokeOpacity: 0.9,
    }))
    const lineOptions = [...sightLines, ...gateLines]
    lineOptions.forEach((options, index) => {
      if (linesRef.current[index]) linesRef.current[index].setOptions(options)
      else linesRef.current[index] = new google.maps.Polyline({ ...options, map })
    })
    linesRef.current.splice(lineOptions.length).forEach((line) => line.setMap(null))

    const activeKeys = new Set<string>()
    const updatePin = (key: string, coordinate: Coordinate, label: string, variant: 'first' | 'second' | 'context', change?: (coordinate: Coordinate) => void) => {
      activeKeys.add(key)
      const coordinateKey = `${coordinate.latitude},${coordinate.longitude}`
      let pin = markersRef.current.get(key)
      if (!pin) {
        const content = pinElement(label, variant)
        const marker = new AdvancedMarkerElement({ map, position: googleCoordinate(coordinate), content })
        const entry: Pin = { marker, content, coordinate: coordinateKey }
        const reportPosition = () => {
          const next = fromPosition(marker.position)
          if (next) entry.change?.(next)
        }
        marker.addListener('drag', reportPosition)
        marker.addListener('dragend', reportPosition)
        markersRef.current.set(key, entry)
        pin = entry
      }
      // Do not reset a pin mid-drag on unrelated clock or GPS renders.
      if (pin.coordinate !== coordinateKey) {
        const current = fromPosition(pin.marker.position)
        if (current?.latitude !== coordinate.latitude || current?.longitude !== coordinate.longitude) {
          pin.marker.position = googleCoordinate(coordinate)
        }
        pin.coordinate = coordinateKey
      }
      const text = pin.content.querySelector('strong')!
      if (text.textContent !== label) text.textContent = label
      pin.change = readOnly ? undefined : change
      if (pin.marker.gmpDraggable !== Boolean(pin.change)) pin.marker.gmpDraggable = Boolean(pin.change)
    }
    if (value) updatePin('first', value, secondValue ? endpointLabels[0] : 'Mark', 'first', onChange)
    if (secondValue) updatePin('second', secondValue, endpointLabels[1], 'second', onSecondChange)
    otherMarks.forEach((mark) => updatePin(`mark:${mark.id}`, mark.coordinate, mark.label, 'context'))
    otherGates.forEach((gate) => {
      const midpoint = { latitude: (gate.pointA.latitude + gate.pointB.latitude) / 2, longitude: (gate.pointA.longitude + gate.pointB.longitude) / 2 }
      updatePin(`gate:${gate.id}`, midpoint, gate.label, 'context')
    })
    markersRef.current.forEach(({ marker }, key) => {
      if (!activeKeys.has(key)) { marker.map = null; markersRef.current.delete(key) }
    })
    if (!fittedRef.current) {
      fitMapToCoordinates(map, plottedCoordinates, 35)
      fittedRef.current = true
    }
  }, [endpointLabels, loaded, observations, onChange, onSecondChange, otherGates, otherMarks, plottedCoordinates, readOnly, secondValue, value])

  const label = readOnly ? 'Sight rays on Sydney Harbour map' : secondValue ? 'Drag gate pins on Sydney Harbour map' : 'Drag mark on Sydney Harbour map'
  return (
    <div className="point-picker">
      <div className="point-picker__zoom" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" disabled={!loaded} onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 12) + 1)}><Plus size={17} /></button>
        <button type="button" aria-label="Zoom out" disabled={!loaded} onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 12) - 1)}><Minus size={17} /></button>
      </div>
      <div ref={containerRef} className={`point-picker__map ${readOnly ? 'point-picker__readonly' : ''}`} role="img" aria-label={label} />
      {mapError && <div className="map-provider-error" role="status">{mapError}</div>}
      <span><Crosshair size={13} /> {readOnly ? 'Sight rays' : secondValue ? 'Drag either pin · pinch to zoom' : 'Drag to position · pinch to zoom'}</span>
      <i><MapPin size={13} /> Google Maps · live connection</i>
    </div>
  )
}
