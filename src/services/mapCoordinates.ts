import type { Coordinate } from '../domain/types'

export function googleCoordinate(coordinate: Coordinate): google.maps.LatLngLiteral {
  return { lat: coordinate.latitude, lng: coordinate.longitude }
}

export function fitMapToCoordinates(map: google.maps.Map, points: Coordinate[], padding: number) {
  if (points.length === 0) return
  if (points.length === 1) {
    map.setCenter(googleCoordinate(points[0]))
    map.setZoom(15)
    return
  }
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  map.fitBounds({
    north: Math.max(...latitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    west: Math.min(...longitudes),
  }, padding)
  google.maps.event.addListenerOnce(map, 'idle', () => {
    if ((map.getZoom() ?? 0) > 16) map.setZoom(16)
  })
}
