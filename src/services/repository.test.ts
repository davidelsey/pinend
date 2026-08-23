import { afterEach, describe, expect, it } from 'vitest'
import { PinEndDatabase, createRaceRepository } from './repository'
import type { RaceSession } from '../domain/types'

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
})
