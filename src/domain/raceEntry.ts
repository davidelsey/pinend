import { isStartWaypoint } from './course'
import type { RaceDefinition, RaceSession } from './types'

export function enterAtWaypoint(race: RaceDefinition, session: RaceSession, index: number, now = Date.now()): Partial<RaceSession> {
  const target = race.course[index]
  if (!target) throw new Error('Choose a waypoint on this course.')
  if (session.phase === 'finished') throw new Error('This race is finished. Create another race to sail again.')
  const startTime = session.phase === 'setup' ? Date.parse(race.scheduledStart) : session.syncedStartTime
  if (!Number.isFinite(startTime)) throw new Error('Set a valid race start time first.')
  if (!isStartWaypoint(target) && startTime > now) throw new Error('The start time is still in the future. Choose Start or correct the start time first.')
  return { phase: isStartWaypoint(target) && startTime > now ? 'prestart' : 'racing', activeWaypointIndex: index, syncedStartTime: startTime, autoStartArmed: true }
}

export function raceSection(race: RaceDefinition, session: RaceSession | undefined, now = Date.now()) {
  if (session?.phase === 'finished') return 'Previous'
  if (session?.phase === 'prestart' || session?.phase === 'racing') return 'In progress'
  return Date.parse(race.scheduledStart) >= now ? 'Upcoming' : 'Previous'
}
