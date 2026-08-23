import type { Bearing, Coordinate, MarkPosition } from './types'

const EARTH_RADIUS_METRES = 6_371_008.8
const METRES_PER_NAUTICAL_MILE = 1852
const radians = (degrees: number) => (degrees * Math.PI) / 180
const degrees = (radiansValue: number) => (radiansValue * 180) / Math.PI

export const normalizeBearing = (bearing: number) => ((bearing % 360) + 360) % 360

export function bearingToTrue(bearing: Bearing): number {
  return normalizeBearing(
    bearing.reference === 'magnetic' ? bearing.degrees + (bearing.declination ?? 0) : bearing.degrees,
  )
}

export function distanceMetres(from: Coordinate, to: Coordinate): number {
  const latitudeDelta = radians(to.latitude - from.latitude)
  const longitudeDelta = radians(to.longitude - from.longitude)
  const fromLatitude = radians(from.latitude)
  const toLatitude = radians(to.latitude)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const distanceNm = (from: Coordinate, to: Coordinate) =>
  distanceMetres(from, to) / METRES_PER_NAUTICAL_MILE

export function initialBearing(from: Coordinate, to: Coordinate): number {
  const fromLatitude = radians(from.latitude)
  const toLatitude = radians(to.latitude)
  const longitudeDelta = radians(to.longitude - from.longitude)
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude)
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta)
  return normalizeBearing(degrees(Math.atan2(y, x)))
}

export function destinationPoint(origin: Coordinate, distanceInNm: number, bearingTrue: number): Coordinate {
  const angularDistance = (distanceInNm * METRES_PER_NAUTICAL_MILE) / EARTH_RADIUS_METRES
  const bearing = radians(bearingTrue)
  const originLatitude = radians(origin.latitude)
  const originLongitude = radians(origin.longitude)
  const latitude = Math.asin(
    Math.sin(originLatitude) * Math.cos(angularDistance) +
      Math.cos(originLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  )
  const longitude =
    originLongitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(originLatitude),
      Math.cos(angularDistance) - Math.sin(originLatitude) * Math.sin(latitude),
    )
  return { latitude: degrees(latitude), longitude: degrees(longitude) }
}

export function resolveMarkPosition(position: MarkPosition): Coordinate | undefined {
  if (position.kind === 'fixed') return position.coordinate
  if (position.kind === 'variable') return position.coordinate
  return destinationPoint(position.origin, position.distanceNm, bearingToTrue(position.bearing))
}

export function velocityMadeGood(speedKnots: number, courseTrue: number, bearingToMarkTrue: number): number {
  return speedKnots * Math.cos(radians(normalizeBearing(courseTrue - bearingToMarkTrue)))
}

export function timeToLineSeconds(
  position: Coordinate,
  headingTrue: number,
  speedKnots: number,
  pin: Coordinate,
  committee: Coordinate,
): number | null {
  if (speedKnots <= 0.1) return null

  const metresPerLatitudeDegree = 111_320
  const metresPerLongitudeDegree = metresPerLatitudeDegree * Math.cos(radians(position.latitude))
  const toLocalPoint = (coordinate: Coordinate) => ({
    x: (coordinate.longitude - position.longitude) * metresPerLongitudeDegree,
    y: (coordinate.latitude - position.latitude) * metresPerLatitudeDegree,
  })
  const start = toLocalPoint(pin)
  const end = toLocalPoint(committee)
  const line = { x: end.x - start.x, y: end.y - start.y }
  const course = { x: Math.sin(radians(headingTrue)), y: Math.cos(radians(headingTrue)) }
  const cross = (first: { x: number; y: number }, second: { x: number; y: number }) =>
    first.x * second.y - first.y * second.x
  const denominator = cross(course, line)
  if (Math.abs(denominator) < 0.001) return null

  const distanceAlongCourse = cross(start, line) / denominator
  const positionAlongLine = cross(start, course) / denominator
  if (distanceAlongCourse < 0 || positionAlongLine < 0 || positionAlongLine > 1) return null

  const speedMetresPerSecond = (speedKnots * METRES_PER_NAUTICAL_MILE) / 3600
  return distanceAlongCourse / speedMetresPerSecond
}

type Sighting = { observer: Coordinate; bearingTrue: number }

export function intersectSightings(first: Sighting, second: Sighting): Coordinate | null {
  const referenceLatitude = radians((first.observer.latitude + second.observer.latitude) / 2)
  const metresPerLatitudeDegree = 111_320
  const metresPerLongitudeDegree = metresPerLatitudeDegree * Math.cos(referenceLatitude)
  const origin = first.observer
  const secondPoint = {
    x: (second.observer.longitude - origin.longitude) * metresPerLongitudeDegree,
    y: (second.observer.latitude - origin.latitude) * metresPerLatitudeDegree,
  }
  const firstDirection = { x: Math.sin(radians(first.bearingTrue)), y: Math.cos(radians(first.bearingTrue)) }
  const secondDirection = { x: Math.sin(radians(second.bearingTrue)), y: Math.cos(radians(second.bearingTrue)) }
  const cross = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x
  if (Math.abs(cross) < 0.02) return null
  const firstDistance =
    (secondPoint.x * secondDirection.y - secondPoint.y * secondDirection.x) / cross
  const secondDistance =
    (secondPoint.x * firstDirection.y - secondPoint.y * firstDirection.x) / cross
  if (firstDistance < 0 || secondDistance < 0) return null
  return {
    latitude: origin.latitude + (firstDistance * firstDirection.y) / metresPerLatitudeDegree,
    longitude: origin.longitude + (firstDistance * firstDirection.x) / metresPerLongitudeDegree,
  }
}
