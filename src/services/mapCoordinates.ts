import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import type { Coordinate } from '../domain/types'

export function coordinatePair(coordinate: Coordinate): [number, number] {
  return [coordinate.longitude, coordinate.latitude]
}

export function fitMapToCoordinates(map: MapLibreMap, points: Coordinate[], padding: number) {
  if (points.length === 0) return
  if (points.length === 1) {
    map.easeTo({ center: coordinatePair(points[0]), zoom: 15 })
    return
  }
  const bounds = new maplibregl.LngLatBounds(coordinatePair(points[0]), coordinatePair(points[0]))
  points.slice(1).forEach((point) => bounds.extend(coordinatePair(point)))
  map.fitBounds(bounds, { padding, maxZoom: 16, duration: 0 })
}
