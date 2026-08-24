import { distanceNm } from './geo'
import type { RaceDefinition, RaceSession, SensorReading } from './types'

export type RaceSummary = {
  raceTelemetry: SensorReading[]
  allTelemetry: SensorReading[]
  distanceNm: number
  averageSpeedKnots: number | null
  durationMs: number
  correctedTimeMs: number | null
  finishedAt: number
}

export function summarizeRace(race: RaceDefinition, session: RaceSession): RaceSummary {
  const finishWaypoint = race.course.at(-1)
  const finishTimestamp = finishWaypoint ? session.roundedAt[finishWaypoint.id] : undefined
  const finishedAt = finishTimestamp ?? session.updatedAt
  const allTelemetry = [...session.telemetry].filter((reading) => reading.timestamp <= finishedAt).sort((first, second) => first.timestamp - second.timestamp)
  const raceTelemetry = allTelemetry.filter((reading) => reading.timestamp >= session.syncedStartTime)
  const distance = raceTelemetry.slice(1).reduce((total, reading, index) => total + distanceNm(raceTelemetry[index], reading), 0)
  const averageSpeedKnots = raceTelemetry.length
    ? raceTelemetry.reduce((total, reading) => total + reading.speedKnots, 0) / raceTelemetry.length
    : null
  const durationMs = Math.max(0, finishedAt - session.syncedStartTime)
  return {
    raceTelemetry,
    allTelemetry,
    distanceNm: distance,
    averageSpeedKnots,
    durationMs,
    correctedTimeMs: race.handicap && race.handicap > 0 ? durationMs * race.handicap : null,
    finishedAt,
  }
}

export function formatRaceDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
}
