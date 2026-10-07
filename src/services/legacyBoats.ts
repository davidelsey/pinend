import { supabase } from './auth'
import { createSharedBoat, type BoatCatalog, type SharedState } from './boatSharing'
import type { RepositorySnapshot } from './repository'
import type { RaceSession } from '../domain/types'
import { isStartWaypoint, isFinishWaypoint } from '../domain/course'

/** Import existing personal data once, without deleting the original snapshot.
 * Namespaced IDs make retries safe and isolate old demo-style IDs across owners. */
export async function importLegacyBoats(userId: string, shared: SharedState): Promise<RaceSession[]> {
  if (!supabase || !navigator.onLine || localStorage.getItem(`pin-end-legacy-import:${userId}`)) return []
  const { data, error } = await supabase.from('user_app_state').select('data').eq('user_id', userId).maybeSingle()
  if (error) throw error
  const local = localStorage.getItem(`pin-end-legacy-local:${userId}`)
  const snapshot = (local && localStorage.getItem('pin-end-cloud-dirty') === 'true' ? JSON.parse(local) : data?.data ?? (local ? JSON.parse(local) : undefined)) as RepositorySnapshot | undefined
  if (!snapshot?.boats?.length) { localStorage.setItem(`pin-end-legacy-import:${userId}`, 'done'); return [] }
  const sessions: RaceSession[] = []
  for (const [index, boat] of snapshot.boats.entries()) {
    const boatId = `${userId}:${boat.id}`
    const prefix = (id: string) => `${boatId}:${id}`
    const races = snapshot.races.filter((race) => race.boatId === boat.id || (!race.boatId && index === 0)).map((race) => ({ ...race, id: prefix(race.id), boatId, course: race.course.map((waypoint) => ({ ...waypoint, role: isStartWaypoint(waypoint) ? 'start' as const : isFinishWaypoint(waypoint) ? 'finish' as const : 'mark' as const, markId: prefix(waypoint.markId) })) }))
    const marks = snapshot.marks.map((mark) => ({ ...mark, id: prefix(mark.id), position: mark.position.kind === 'gate' ? { ...mark.position, linkedToMarkId: mark.position.linkedToMarkId ? prefix(mark.position.linkedToMarkId) : undefined } : mark.position }))
    const catalog: BoatCatalog = { boat: { ...boat, id: boatId }, races, marks, sails: snapshot.sails.filter((sail) => sail.boatId === boat.id).map((sail) => ({ ...sail, id: prefix(sail.id), boatId })), crew: snapshot.crew.map((member) => ({ ...member, id: prefix(member.id), boatId })) }
    if (!shared.workspaces.some((workspace) => workspace.id === boatId)) await createSharedBoat(catalog)
    for (const race of races) {
      if (shared.progress.some((progress) => progress.race_id === race.id)) continue
      const old = snapshot.sessions.filter((session) => prefix(session.raceId) === race.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (!old) continue
      const telemetry = snapshot.telemetry.filter((reading) => reading.sessionId === old.id).map((reading) => ({ latitude: reading.latitude, longitude: reading.longitude, timestamp: reading.timestamp, accuracy: reading.accuracy, heading: reading.heading, speedKnots: reading.speedKnots, source: reading.source, headingSource: reading.headingSource, headingReliable: reading.headingReliable, courseOverGround: reading.courseOverGround }))
      sessions.push({ ...old, id: prefix(old.id), raceId: race.id, crewAssignments: old.crewAssignments?.map((assignment) => ({ ...assignment, crewId: prefix(assignment.crewId) })), selectedSailIds: old.selectedSailIds.map(prefix), telemetry: telemetry.length ? telemetry : old.telemetry, courseSnapshot: old.phase === 'finished' ? race : undefined, marksSnapshot: old.phase === 'finished' ? marks : undefined })
    }
  }
  return sessions
}
