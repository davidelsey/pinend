import { describe, expect, it } from 'vitest'
import { seedRace } from '../data/seed'
import type { RaceSession, SensorReading } from './types'
import { formatRaceDuration, summarizeRace } from './raceSummary'

const reading = (timestamp: number, latitude: number, longitude: number, speedKnots: number): SensorReading => ({ latitude, longitude, timestamp, speedKnots, accuracy: 3, heading: 90, source: 'simulator' })

describe('race summary', () => {
  it('separates pre-start telemetry and applies a time correction factor', () => {
    const race = { ...seedRace, handicap: 0.95 }
    const finishId = race.course.at(-1)!.id
    const session: RaceSession = {
      id: 'session', raceId: race.id, phase: 'finished', syncedStartTime: 10_000, activeWaypointIndex: race.course.length - 1,
      selectedSailIds: [], telemetry: [reading(5_000, -33.87, 151.23, 2), reading(10_000, -33.87, 151.23, 6), reading(20_000, -33.87, 151.24, 8)],
      roundedAt: { [finishId]: 20_000 }, updatedAt: 20_500,
    }

    const summary = summarizeRace(race, session)
    expect(summary.allTelemetry).toHaveLength(3)
    expect(summary.raceTelemetry).toHaveLength(2)
    expect(summary.distanceNm).toBeGreaterThan(0)
    expect(summary.averageSpeedKnots).toBe(7)
    expect(summary.durationMs).toBe(10_000)
    expect(summary.correctedTimeMs).toBe(9_500)
    expect(formatRaceDuration(3_661_000)).toBe('1:01:01')
  })
})
