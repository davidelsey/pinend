import { describe, expect, it } from 'vitest'
import { createSeedSession, seedRace } from '../data/seed'
import { enterAtWaypoint, raceSection } from './raceEntry'

describe('joining a race', () => {
  const race = { ...seedRace, scheduledStart: new Date(10_000).toISOString() }
  const session = { ...createSeedSession(), syncedStartTime: 10_000 }
  it('enters prestart only at Start before the gun', () => {
    expect(enterAtWaypoint(race, session, 0, 9_000)).toMatchObject({ phase: 'prestart', activeWaypointIndex: 0 })
    expect(enterAtWaypoint(race, session, 0, 10_000)).toMatchObject({ phase: 'racing', activeWaypointIndex: 0 })
  })
  it('joins a later leg without changing the start or inventing roundings', () => {
    const patch = enterAtWaypoint(race, session, 2, 20_000)
    expect(patch).toMatchObject({ phase: 'racing', syncedStartTime: 10_000, activeWaypointIndex: 2 })
    expect(patch).not.toHaveProperty('roundedAt')
    expect(patch).not.toHaveProperty('telemetry')
  })
  it('retains a synchronized gun when resuming', () => {
    expect(enterAtWaypoint(race, { ...session, phase: 'racing', syncedStartTime: 8_000 }, 3, 20_000).syncedStartTime).toBe(8_000)
  })
  it('rejects impossible targets, future later legs, and finished races', () => {
    expect(() => enterAtWaypoint(race, session, 20, 20_000)).toThrow('Choose a waypoint')
    expect(() => enterAtWaypoint(race, session, 2, 9_000)).toThrow('still in the future')
    expect(() => enterAtWaypoint(race, { ...session, phase: 'finished' }, 0, 20_000)).toThrow('finished')
  })
  it('does not infer completion from a past scheduled start', () => {
    expect(raceSection(race, session, 20_000)).toBe('Previous')
    expect(raceSection(race, { ...session, phase: 'racing' }, 20_000)).toBe('In progress')
    expect(raceSection(race, { ...session, phase: 'finished' }, 1_000)).toBe('Previous')
  })
})
