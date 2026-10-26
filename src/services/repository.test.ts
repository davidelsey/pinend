import { afterEach, describe, expect, it } from 'vitest'
import { PinEndDatabase, createRaceRepository, exportRepositorySnapshot, importRepositorySnapshot } from './repository'
import type { LineObservation, RaceSession } from '../domain/types'

describe('offline race repository', () => {
  let database: PinEndDatabase | undefined

  afterEach(async () => {
    await database?.delete()
  })

  it('recovers the active race session after a new repository instance is created', async () => {
    database = new PinEndDatabase(`pin-end-test-${crypto.randomUUID()}`)
    const firstRepository = createRaceRepository(database)
    const session: RaceSession = {
      id: 'session-1',
      raceId: 'race-1',
      phase: 'racing',
      syncedStartTime: 100,
      activeWaypointIndex: 2,
      selectedSailIds: ['main'],
      telemetry: [],
      roundedAt: {},
      updatedAt: 200,
    }
    await firstRepository.saveSession(session)
    const reading = { latitude: -33.86, longitude: 151.24, timestamp: 150, accuracy: 3, heading: 90, speedKnots: 6, source: 'simulator' as const }
    await firstRepository.saveTelemetry(session.id, reading)

    const recovered = await createRaceRepository(database).getActiveSession()

    expect(recovered).toEqual({ ...session, telemetry: [reading] })

    const reset = { ...session, phase: 'prestart' as const, telemetry: [], updatedAt: 300 }
    await firstRepository.resetSession(reset)
    await expect(createRaceRepository(database).getActiveSession()).resolves.toEqual(reset)
  })

  it('removes a discarded sighting from offline storage', async () => {
    database = new PinEndDatabase(`pin-end-test-${crypto.randomUUID()}`)
    const repository = createRaceRepository(database)
    const observation: LineObservation = {
      id: 'observation-1',
      sessionId: 'session-1',
      endpoint: 'mark',
      markId: 'mark-1',
      observer: { latitude: -33.86, longitude: 151.24 },
      bearingTrue: 42,
      accuracy: 3,
      timestamp: 100,
    }
    await repository.saveObservation(observation)

    await repository.deleteObservation(observation.id)

    await expect(repository.getObservations('session-1')).resolves.toEqual([])
  })

  it('keeps sightings and another race when clearing a track, and rejects old fixes arriving after the reset', async () => {
    database = new PinEndDatabase(`pin-end-test-${crypto.randomUUID()}`)
    const repository = createRaceRepository(database)
    const session: RaceSession = { id: 'reset-session', raceId: 'reset-race', phase: 'racing', syncedStartTime: 100, activeWaypointIndex: 1, selectedSailIds: ['main'], roundedAt: { start: 110 }, telemetry: [], updatedAt: 200 }
    const other = { ...session, id: 'other-session', raceId: 'other-race' }
    const oldFix = { latitude: -33.86, longitude: 151.24, timestamp: 150, accuracy: 3, heading: 90, speedKnots: 6, source: 'device' as const }
    const sighting: LineObservation = { id: 'sighting', sessionId: session.id, endpoint: 'pin', observer: oldFix, bearingTrue: 90, accuracy: 3, timestamp: 140 }
    await repository.saveSession(session)
    await repository.saveSession(other)
    await repository.saveTelemetry(session.id, oldFix)
    await repository.saveTelemetry(other.id, oldFix)
    await repository.saveObservation(sighting)
    await repository.resetSession({ ...session, phase: 'prestart', activeWaypointIndex: 0, roundedAt: {}, trackResetAt: 300, updatedAt: 300 })
    await repository.saveTelemetry(session.id, oldFix)
    const newFix = { ...oldFix, timestamp: 350 }
    await repository.saveTelemetry(session.id, newFix)

    const reloaded = createRaceRepository(database)
    await expect(reloaded.getSession(session.id)).resolves.toMatchObject({ phase: 'prestart', roundedAt: {}, telemetry: [newFix], selectedSailIds: ['main'], syncedStartTime: 100 })
    await expect(reloaded.getCompleteTelemetry(session.id)).resolves.toEqual([expect.objectContaining({ timestamp: 350 })])
    await expect(reloaded.getObservations(session.id)).resolves.toEqual([sighting])
    await expect(reloaded.getSession(other.id)).resolves.toMatchObject({ roundedAt: { start: 110 }, telemetry: [oldFix] })
  })

  it('round-trips all local data through a cloud snapshot', async () => {
    database = new PinEndDatabase(`pin-end-test-${crypto.randomUUID()}`)
    const repository = createRaceRepository(database)
    const session: RaceSession = {
      id: 'session-cloud', raceId: 'race-cloud', phase: 'racing', syncedStartTime: 100,
      activeWaypointIndex: 1, selectedSailIds: [], telemetry: [], roundedAt: {}, updatedAt: 200,
    }
    const reading = { latitude: -33.86, longitude: 151.24, timestamp: 150, accuracy: 3, heading: 90, speedKnots: 6, source: 'device' as const }
    await repository.saveSession(session)
    await repository.saveTelemetry(session.id, reading)
    const snapshot = await exportRepositorySnapshot(database)
    await database.sessions.clear()
    await database.telemetry.clear()

    await importRepositorySnapshot(snapshot, database)

    await expect(repository.getActiveSession()).resolves.toEqual({ ...session, telemetry: [reading] })
  })
})
