import Dexie, { type EntityTable } from 'dexie'
import { createSeedSession, seedBoat, seedMarks, seedRace, seedSails } from '../data/seed'
import type { Boat, LineObservation, Mark, RaceDefinition, RaceSession, Sail } from '../domain/types'

export class PinEndDatabase extends Dexie {
  marks!: EntityTable<Mark, 'id'>
  boats!: EntityTable<Boat, 'id'>
  sails!: EntityTable<Sail, 'id'>
  races!: EntityTable<RaceDefinition, 'id'>
  sessions!: EntityTable<RaceSession, 'id'>
  observations!: EntityTable<LineObservation, 'id'>

  constructor(name = 'pin-end') {
    super(name)
    this.version(1).stores({
      marks: 'id, name, provenance',
      boats: 'id, name',
      sails: 'id, boatId, type, location',
      races: 'id, clubId, series',
      sessions: 'id, raceId, phase, updatedAt',
      observations: 'id, endpoint, timestamp',
    })
    this.version(2).stores({
      observations: 'id, sessionId, endpoint, timestamp',
      sails: 'id, boatId, type, location',
    })
  }
}

export const database = new PinEndDatabase()

export async function seedDatabase(db = database): Promise<void> {
  if ((await db.races.count()) > 0) return
  await db.transaction('rw', [db.marks, db.boats, db.sails, db.races, db.sessions], async () => {
    await db.marks.bulkPut(seedMarks)
    await db.boats.put(seedBoat)
    await db.sails.bulkPut(seedSails)
    await db.races.put(seedRace)
    await db.sessions.put(createSeedSession())
  })
}

export const createRaceRepository = (db = database) => ({
  async getActiveSession() {
    return db.sessions.where('phase').anyOf(['setup', 'prestart', 'racing']).last()
  },
  async saveSession(session: RaceSession) {
    await db.sessions.put(session)
  },
  async loadAll() {
    const [marks, boats, sails, races, session] = await Promise.all([
      db.marks.toArray(),
      db.boats.toArray(),
      db.sails.toArray(),
      db.races.toArray(),
      db.sessions.where('phase').anyOf(['setup', 'prestart', 'racing']).last(),
    ])
    return { marks, boats, sails, races, session }
  },
  async saveMark(mark: Mark) {
    await db.marks.put(mark)
  },
  async saveBoat(boat: Boat) {
    await db.boats.put(boat)
  },
  async saveSail(sail: Sail) {
    await db.sails.put(sail)
  },
  async saveRace(race: RaceDefinition) {
    await db.races.put(race)
  },
  async getObservations(sessionId: string) {
    return db.observations.where('sessionId').equals(sessionId).sortBy('timestamp')
  },
  async saveObservation(observation: LineObservation) {
    await db.observations.put(observation)
  },
})

export type RaceRepository = ReturnType<typeof createRaceRepository>
