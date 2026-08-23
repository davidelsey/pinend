import { resolveMarkPosition } from '../domain/geo'
import type { Boat, Club, Mark, RaceDefinition, RaceSession, Sail } from '../domain/types'

export const cyca: Club = {
  id: 'cyca',
  name: 'Cruising Yacht Club of Australia',
  shortName: 'CYCA',
  coordinate: { latitude: -33.87423, longitude: 151.23377 },
  address: '1 New Beach Road, Darling Point NSW 2027',
  website: 'https://cyca.com.au/',
}

export const seedMarks: Mark[] = [
  {
    id: 'shark-island',
    name: 'Shark Island',
    shortName: 'SHARK',
    position: { kind: 'fixed', coordinate: { latitude: -33.85982, longitude: 151.25738 } },
    notes: 'Demo coordinate — verify against current sailing instructions.',
    provenance: 'community',
  },
  {
    id: 'clark-island',
    name: 'Clark Island',
    shortName: 'CLARK',
    position: { kind: 'fixed', coordinate: { latitude: -33.86384, longitude: 151.23965 } },
    notes: 'Demo coordinate — verify against current sailing instructions.',
    provenance: 'community',
  },
  {
    id: 'windward',
    name: 'Windward mark',
    shortName: 'WM',
    position: {
      kind: 'constructed',
      origin: { latitude: -33.8643, longitude: 151.242 },
      distanceNm: 1.2,
      bearing: { degrees: 25, reference: 'magnetic', declination: 12.8 },
    },
    notes: '1.2 NM at 025° M from the selected reference point.',
    provenance: 'personal',
  },
  {
    id: 'laid-mark',
    name: 'Laid rounding mark',
    shortName: 'LAID',
    position: { kind: 'variable' },
    notes: 'Resolve by sighting, direct GPS capture, or map placement.',
    provenance: 'personal',
  },
]

export const seedBoat: Boat = {
  id: 'boat-1',
  name: 'Second Wind',
  sailNumber: 'AUS 2247',
  design: 'Sydney 38',
  lengthMetres: 11.65,
  draftMetres: 2.7,
}

export const seedSails: Sail[] = [
  { id: 'main-1', boatId: seedBoat.id, name: 'Race main', type: 'mainsail', condition: 'good', location: 'rigged' },
  { id: 'jib-1', boatId: seedBoat.id, name: 'J1 Light', type: 'headsail', condition: 'excellent', location: 'wardrobe' },
  { id: 'jib-3', boatId: seedBoat.id, name: 'J3 Heavy', type: 'headsail', condition: 'good', location: 'locker' },
  { id: 'spin-1', boatId: seedBoat.id, name: 'A2 Runner', type: 'spinnaker', condition: 'good', location: 'wardrobe' },
  { id: 'spin-2', boatId: seedBoat.id, name: 'A4 Heavy', type: 'spinnaker', condition: 'serviceable', location: 'locker' },
]

const todayAt = (hours: number, minutes: number) => {
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

export const seedRace: RaceDefinition = {
  id: 'cyca-spring-r4',
  clubId: cyca.id,
  series: 'Spring Series',
  name: 'Race 4',
  fleet: 'PHS Division 1',
  scheduledStart: todayAt(13, 5),
  course: [
    { id: 'leg-1', markId: 'clark-island', rounding: 'port' },
    { id: 'leg-2', markId: 'windward', rounding: 'port' },
    { id: 'leg-3', markId: 'shark-island', rounding: 'starboard' },
  ],
}

export const createSeedSession = (): RaceSession => ({
  id: 'local-session',
  raceId: seedRace.id,
  phase: 'setup',
  autoStartArmed: true,
  syncedStartTime: Date.parse(seedRace.scheduledStart),
  activeWaypointIndex: 0,
  selectedSailIds: seedSails.filter((sail) => sail.location !== 'locker').map((sail) => sail.id),
  telemetry: [],
  roundedAt: {},
  updatedAt: Date.now(),
})

export const resolvedSeedMarks = seedMarks.flatMap((mark) => {
  const coordinate = resolveMarkPosition(mark.position)
  return coordinate ? [{ ...mark, coordinate }] : []
})
