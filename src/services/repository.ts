import Dexie, { type EntityTable } from 'dexie'
import { createSeedSession, finishLineMark, seedBoat, seedMarks, seedRace, seedSails, startLineMark } from '../data/seed'
import type { Boat, Coordinate, CrewMember, LineObservation, Mark, RaceDefinition, RaceSession, Sail, SensorReading } from '../domain/types'

type StoredTelemetry = SensorReading & { id: string; sessionId: string }

export class PinEndDatabase extends Dexie {
  marks!: EntityTable<Mark, 'id'>
  boats!: EntityTable<Boat, 'id'>
  sails!: EntityTable<Sail, 'id'>
  races!: EntityTable<RaceDefinition, 'id'>
  sessions!: EntityTable<RaceSession, 'id'>
  observations!: EntityTable<LineObservation, 'id'>
  crew!: EntityTable<CrewMember, 'id'>
  telemetry!: EntityTable<StoredTelemetry, 'id'>

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
    this.version(3).stores({
      crew: 'id, name',
    })
    this.version(4).stores({
      marks: 'id, name, provenance',
      races: 'id, clubId, series',
    }).upgrade(async (transaction) => {
      await transaction.table('marks').put(startLineMark)
      await transaction.table('races').toCollection().modify((race: RaceDefinition) => {
        race.course = [{ id: `start-${race.id}`, markId: startLineMark.id, rounding: 'either' }, ...race.course.filter((waypoint) => waypoint.markId !== startLineMark.id)]
      })
    })
    this.version(5).stores({
      marks: 'id, name, provenance',
      races: 'id, clubId, series',
    }).upgrade(async (transaction) => {
      const markTable = transaction.table('marks')
      const storedStart = await markTable.get(startLineMark.id) as Mark | undefined
      if (!storedStart) await markTable.put(startLineMark)
      else if ((storedStart.position as unknown as { kind: string }).kind === 'line') {
        const legacy = storedStart.position as unknown as { pointA?: Coordinate; pointB?: Coordinate; labels?: [string, string] }
        await markTable.put({ ...storedStart, position: { ...legacy, kind: 'gate', labels: legacy.labels ?? ['Pin', 'Boat'] } })
      }
      if (!await markTable.get(finishLineMark.id)) await markTable.put(finishLineMark)
      await transaction.table('races').toCollection().modify((race: RaceDefinition) => {
        const start = race.course.find((waypoint) => waypoint.markId === startLineMark.id) ?? { id: `start-${race.id}`, markId: startLineMark.id, rounding: 'either' as const }
        const finish = race.course.find((waypoint) => waypoint.markId === finishLineMark.id) ?? { id: `finish-${race.id}`, markId: finishLineMark.id, rounding: 'either' as const }
        race.course = [start, ...race.course.filter((waypoint) => waypoint.markId !== startLineMark.id && waypoint.markId !== finishLineMark.id), finish]
      })
    })
    this.version(6).stores({
      marks: 'id, name, provenance',
    }).upgrade(async (transaction) => {
      const markTable = transaction.table('marks')
      const start = await markTable.get(startLineMark.id) as Mark | undefined
      const finish = await markTable.get(finishLineMark.id) as Mark | undefined
      if (start?.position.kind !== 'gate' || finish?.position.kind !== 'gate') return
      if (!finish.position.pointA && !finish.position.pointB) {
        await markTable.put({ ...finish, position: { ...finish.position, pointA: start.position.pointA, pointB: start.position.pointB, linkedToMarkId: start.id } })
      }
    })
    this.version(7).stores({
      telemetry: 'id, sessionId, timestamp',
    }).upgrade(async (transaction) => {
      const sessions = await transaction.table('sessions').toArray() as RaceSession[]
      const fixes = sessions.flatMap((session) => session.telemetry.map((reading) => ({ ...reading, id: `${session.id}:${reading.timestamp}`, sessionId: session.id })))
      if (fixes.length) await transaction.table('telemetry').bulkPut(fixes)
      await transaction.table('sessions').toCollection().modify((session: RaceSession) => { session.telemetry = [] })
    })
    this.version(8).stores({
      telemetry: 'id, sessionId, timestamp, [sessionId+timestamp]',
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

const hydrateSession = async (db: PinEndDatabase, session: RaceSession | undefined) => {
  if (!session) return undefined
  const telemetryQuery = db.telemetry.where('[sessionId+timestamp]').between([session.id, Dexie.minKey], [session.id, Dexie.maxKey])
  const telemetry = session.phase === 'finished'
    ? await telemetryQuery.toArray()
    : (await telemetryQuery.reverse().limit(3_600).toArray()).reverse()
  return { ...session, telemetry: telemetry.map((stored) => {
    const reading = { ...stored } as Partial<StoredTelemetry>
    delete reading.id
    delete reading.sessionId
    return reading as SensorReading
  }) }
}

export const createRaceRepository = (db = database) => ({
  async getActiveSession() {
    const sessions = await db.sessions.where('phase').anyOf(['setup', 'prestart', 'racing', 'finished']).toArray()
    return hydrateSession(db, sessions.sort((first, second) => second.updatedAt - first.updatedAt)[0])
  },
  async getSessionForRace(raceId: string) {
    const sessions = await db.sessions.where('raceId').equals(raceId).toArray()
    return hydrateSession(db, sessions.sort((first, second) => second.updatedAt - first.updatedAt)[0])
  },
  async saveSession(session: RaceSession) {
    await db.sessions.put({ ...session, telemetry: [] })
  },
  async saveTelemetry(sessionId: string, reading: SensorReading) {
    await db.telemetry.put({ ...reading, id: `${sessionId}:${reading.timestamp}`, sessionId })
  },
  async resetSession(session: RaceSession) {
    await db.transaction('rw', [db.sessions, db.telemetry], async () => {
      await db.telemetry.where('sessionId').equals(session.id).delete()
      await db.sessions.put({ ...session, telemetry: [] })
    })
  },
  async loadAll() {
    const [marks, boats, sails, races, crew, sessions] = await Promise.all([
      db.marks.toArray(),
      db.boats.toArray(),
      db.sails.toArray(),
      db.races.toArray(),
      db.crew.toArray(),
      db.sessions.where('phase').anyOf(['setup', 'prestart', 'racing', 'finished']).toArray(),
    ])
    const session = await hydrateSession(db, sessions.sort((first, second) => second.updatedAt - first.updatedAt)[0])
    return { marks, boats, sails, races, crew, session }
  },
  async saveMark(mark: Mark) {
    await db.marks.put(mark)
  },
  async saveMarks(marks: Mark[]) {
    await db.transaction('rw', db.marks, async () => {
      await db.marks.bulkPut(marks)
    })
  },
  async saveBoat(boat: Boat) {
    await db.boats.put(boat)
  },
  async saveSail(sail: Sail) {
    await db.sails.put(sail)
  },
  async saveCrewMember(member: CrewMember) {
    await db.crew.put(member)
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
  async deleteObservation(id: string) {
    await db.observations.delete(id)
  },
})

export type RaceRepository = ReturnType<typeof createRaceRepository>
