import type { Coordinate, Mark } from '../domain/types'
import { resolveMarkPosition } from '../domain/geo'

export function courseCoordinates(markIds: string[], marks: Mark[], editedMarkId: string, draft: Coordinate): Coordinate[] {
  return markIds.flatMap((id) => {
    const mark = marks.find((item) => item.id === id)
    if (!mark) return []
    const linkedId = mark.position.kind === 'gate' ? mark.position.linkedToMarkId : undefined
    if (id === editedMarkId || linkedId === editedMarkId) return [draft]
    const position = linkedId ? marks.find((item) => item.id === linkedId)?.position ?? mark.position : mark.position
    const coordinate = resolveMarkPosition(position)
    return coordinate ? [coordinate] : []
  })
}

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
