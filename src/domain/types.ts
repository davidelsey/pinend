export type Coordinate = { latitude: number; longitude: number }

export type BearingReference = 'true' | 'magnetic'

export type Bearing = {
  degrees: number
  reference: BearingReference
  declination?: number
}

type MarkPositionOverrides = {
  manualCoordinate?: Coordinate
  sightingCoordinate?: Coordinate
}

export type MarkPosition = (
  | { kind: 'fixed'; coordinate: Coordinate }
  | { kind: 'variable'; coordinate?: Coordinate }
  | {
      kind: 'constructed'
      origin: Coordinate
      distanceNm: number
      bearing: Bearing
    }
) & MarkPositionOverrides

export type Mark = {
  id: string
  name: string
  shortName: string
  position: MarkPosition
  notes?: string
  provenance: 'official' | 'community' | 'personal'
}

export type CourseWaypoint = {
  id: string
  markId: string
  rounding: 'port' | 'starboard' | 'either'
}

export type Boat = {
  id: string
  name: string
  sailNumber: string
  design: string
  lengthMetres: number
  draftMetres: number
}

export type Sail = {
  id: string
  boatId: string
  name: string
  type: 'mainsail' | 'headsail' | 'spinnaker' | 'staysail' | 'other'
  condition: 'excellent' | 'good' | 'serviceable' | 'repair'
  location: 'rigged' | 'wardrobe' | 'locker'
  notes?: string
}

export type Club = {
  id: string
  name: string
  shortName: string
  coordinate: Coordinate
  address: string
  website: string
}

export type RaceDefinition = {
  id: string
  clubId: string
  series: string
  name: string
  fleet: string
  scheduledStart: string
  course: CourseWaypoint[]
}

export type RacePhase = 'setup' | 'prestart' | 'racing' | 'finished'

export type SensorReading = Coordinate & {
  timestamp: number
  accuracy: number
  heading: number
  speedKnots: number
  source: 'device' | 'simulator'
  headingSource?: 'compass' | 'course-over-ground' | 'simulator'
  headingReliable?: boolean
  rawHeading?: number
  rawHeadingReference?: BearingReference
  declination?: number
}

export type RaceSession = {
  id: string
  raceId: string
  phase: RacePhase
  syncedStartTime: number
  autoStartArmed?: boolean
  activeWaypointIndex: number
  selectedSailIds: string[]
  telemetry: SensorReading[]
  roundedAt: Record<string, number>
  updatedAt: number
}

export type LineObservation = {
  id: string
  sessionId: string
  endpoint: 'pin' | 'committee' | 'mark'
  markId?: string
  observer: Coordinate
  bearingTrue: number
  accuracy: number
  timestamp: number
}
