import { afterEach, describe, expect, it } from 'vitest'
import { PinEndDatabase, createRaceRepository } from './repository'
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

    const recovered = await createRaceRepository(database).getActiveSession()

    expect(recovered).toEqual(session)
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
})
