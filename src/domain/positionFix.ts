import type { Coordinate, SensorReading } from './types'

export type PositionFix = Coordinate & Partial<Pick<SensorReading, 'timestamp' | 'accuracy' | 'source'>>

export function currentCoordinate(fix?: PositionFix | null, now = Date.now()): Coordinate | null {
  if (!fix || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return null
  if (fix.accuracy != null && fix.accuracy > 50) return null
  if (fix.source !== 'simulator' && fix.timestamp != null && now - fix.timestamp > 30_000) return null
  return { latitude: fix.latitude, longitude: fix.longitude }
}
