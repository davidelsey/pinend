import { Crosshair, MapPin, Minus, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import { destinationPoint } from '../domain/geo'
import type { Coordinate, LineObservation } from '../domain/types'
import { createOfflineMap } from '../services/offlineMap'
import { coordinatePair, fitMapToCoordinates } from '../services/mapCoordinates'

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

const fromLngLat = ({ lat, lng }: { lat: number; lng: number }): Coordinate => ({ latitude: lat, longitude: lng })

function pinElement(label: string, variant: 'first' | 'second' | 'context') {
  const element = document.createElement('div')
  element.className = `point-map-pin point-map-pin--${variant}`
  const dot = document.createElement('span')
  const text = document.createElement('strong')
  text.textContent = label
  element.append(dot, text)
  return element
}

export function MapPointPicker({ value, onChange, secondValue, onSecondChange, endpointLabels = ['Pin', 'Boat'], observations = [], readOnly = false, otherMarks = [], otherGates = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const fittedRef = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const plottedCoordinates = useMemo(() => [
    ...(value ? [value] : []),
    ...(secondValue ? [secondValue] : []),
    ...observations.map((observation) => observation.observer),
    ...otherMarks.map((mark) => mark.coordinate),
    ...otherGates.flatMap((gate) => [gate.pointA, gate.pointB]),
  ], [observations, otherGates, otherMarks, secondValue, value])

  useEffect(() => {
    if (!containerRef.current) return
    const map = createOfflineMap(containerRef.current)
    map.on('load', () => setLoaded(true))
    mapRef.current = map
    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
      fittedRef.current = false
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const sightFeatures = observations.map((observation) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: [coordinatePair(observation.observer), coordinatePair(destinationPoint(observation.observer, 10, observation.bearingTrue))] },
    }))
    const gateFeatures = [
      ...(value && secondValue ? [{ type: 'Feature' as const, properties: { target: true }, geometry: { type: 'LineString' as const, coordinates: [coordinatePair(value), coordinatePair(secondValue)] } }] : []),
      ...otherGates.map((gate) => ({ type: 'Feature' as const, properties: { target: false }, geometry: { type: 'LineString' as const, coordinates: [coordinatePair(gate.pointA), coordinatePair(gate.pointB)] } })),
    ]
    const updateSource = (id: string, data: FeatureCollection<LineString>) => {
      const source = map.getSource(id) as GeoJSONSource | undefined
      if (source) source.setData(data)
      else map.addSource(id, { type: 'geojson', data })
    }
    updateSource('picker-sight-rays', { type: 'FeatureCollection', features: sightFeatures })
    updateSource('picker-gates', { type: 'FeatureCollection', features: gateFeatures })
    if (!map.getLayer('picker-sight-rays-line')) map.addLayer({ id: 'picker-sight-rays-line', type: 'line', source: 'picker-sight-rays', paint: { 'line-color': '#f7dd72', 'line-width': 3, 'line-dasharray': [1, 2], 'line-opacity': 0.9 } })
    if (!map.getLayer('picker-gates-line')) map.addLayer({ id: 'picker-gates-line', type: 'line', source: 'picker-gates', paint: { 'line-color': ['case', ['get', 'target'], '#f5f1e8', '#9eb6bb'], 'line-width': ['case', ['get', 'target'], 4, 2], 'line-dasharray': [2, 2] } })

    markersRef.current.forEach((marker) => marker.remove())
    const markers: Marker[] = []
    const addTarget = (coordinate: Coordinate, label: string, variant: 'first' | 'second', change?: (coordinate: Coordinate) => void) => {
      const element = pinElement(label, variant)
      const marker = new maplibregl.Marker({ element, anchor: 'bottom', draggable: !readOnly && Boolean(change) }).setLngLat(coordinatePair(coordinate)).addTo(map)
      if (!readOnly && change) marker.on('dragend', () => change(fromLngLat(marker.getLngLat())))
      markers.push(marker)
    }
    if (value) addTarget(value, secondValue ? endpointLabels[0] : 'Mark', 'first', onChange)
    if (secondValue) addTarget(secondValue, endpointLabels[1], 'second', onSecondChange)
    otherMarks.forEach((mark) => markers.push(new maplibregl.Marker({ element: pinElement(mark.label, 'context'), anchor: 'bottom' }).setLngLat(coordinatePair(mark.coordinate)).addTo(map)))
    otherGates.forEach((gate) => {
      const midpoint: Coordinate = { latitude: (gate.pointA.latitude + gate.pointB.latitude) / 2, longitude: (gate.pointA.longitude + gate.pointB.longitude) / 2 }
      markers.push(new maplibregl.Marker({ element: pinElement(gate.label, 'context'), anchor: 'bottom' }).setLngLat(coordinatePair(midpoint)).addTo(map))
    })
    markersRef.current = markers
    if (!fittedRef.current) {
      fitMapToCoordinates(map, plottedCoordinates, 35)
      fittedRef.current = true
    }
  }, [endpointLabels, loaded, observations, onChange, onSecondChange, otherGates, otherMarks, plottedCoordinates, readOnly, secondValue, value])

  const label = readOnly ? 'Sight rays on Sydney Harbour map' : secondValue ? 'Drag gate pins on Sydney Harbour map' : 'Drag mark on Sydney Harbour map'
  return (
    <div className="point-picker">
      <div className="point-picker__zoom" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" disabled={!loaded} onClick={() => mapRef.current?.zoomIn()}><Plus size={17} /></button>
        <button type="button" aria-label="Zoom out" disabled={!loaded} onClick={() => mapRef.current?.zoomOut()}><Minus size={17} /></button>
      </div>
      <div ref={containerRef} className={`point-picker__map ${readOnly ? 'point-picker__readonly' : ''}`} role="img" aria-label={label} />
      <span><Crosshair size={13} /> {readOnly ? 'Sight rays' : secondValue ? 'Drag either pin · pinch to zoom' : 'Drag to position · pinch to zoom'}</span>
      <i><MapPin size={13} /> Sydney Harbour map</i>
    </div>
  )
}
