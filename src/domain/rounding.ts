import { distanceMetres } from './geo'
import type { Coordinate, SensorReading } from './types'

export function shouldSuggestRounding(
  telemetry: SensorReading[],
  mark: Coordinate,
  roundingRadiusMetres = 45,
): boolean {
  if (telemetry.length < 3) return false
  const recent = telemetry.slice(-8)
  const distances = recent.map((reading) => distanceMetres(reading, mark))
  const closestDistance = Math.min(...distances)
  const closestIndex = distances.indexOf(closestDistance)
  const lastDistance = distances.at(-1) ?? Number.POSITIVE_INFINITY
  const accuracyAllowance = Math.max(...recent.map((reading) => reading.accuracy))
  return (
    closestDistance <= roundingRadiusMetres + accuracyAllowance &&
    closestIndex < distances.length - 1 &&
    lastDistance > closestDistance + Math.max(15, accuracyAllowance)
  )
}
