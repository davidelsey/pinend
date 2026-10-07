/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cyca, createSeedSession, seedBoat, seedMarks, seedRace, seedSails } from '../data/seed'
import type {
  Boat,
  CrewMember,
  LineObservation,
  Mark,
  RaceDefinition,
  RaceSession,
  Sail,
  SensorReading,
} from '../domain/types'
import { isFinishWaypoint, isStartWaypoint } from '../domain/course'
import { configureSimulator as configureSimulatorState, createSimulator, moveSimulator, setSimulatorPosition, type SimulatorState } from '../services/simulator'
import { createRaceRepository, database, seedDatabase } from '../services/repository'
import { createBoatSharing, createSharedBoat, type BoatCatalog, type SharedState } from '../services/boatSharing'
import type { BoatAccess } from '../domain/types'
import { enterAtWaypoint } from '../domain/raceEntry'
import { supabase } from '../services/auth'

type AppContextValue = {
  loading: boolean
  error: string
  syncStatus: string
  userId: string
  access: BoatAccess | undefined
  canManage: boolean
  isNavigator: boolean
  sessions: RaceSession[]
  refreshSharing(): Promise<void>
  enterRace(index: number): Promise<void>
  clearError(): void
  online: boolean
  marks: Mark[]
  boats: Boat[]
  boat: Boat
  sails: Sail[]
  crew: CrewMember[]
  races: RaceDefinition[]
  race: RaceDefinition
  session: RaceSession
  observations: LineObservation[]
  simulatorEnabled: boolean
  simulator: SimulatorState
  latestReading: SensorReading | null
  updateSession(patch: Partial<RaceSession>): Promise<void>
  saveMark(mark: Mark): Promise<void>
  saveBoat(boat: Boat): Promise<void>
  selectBoat(boatId: string): void
  saveSail(sail: Sail): Promise<void>
  saveCrewMember(member: CrewMember): Promise<void>
  saveRace(race: RaceDefinition): Promise<void>
  mutateRace(mutator: (race: RaceDefinition) => RaceDefinition): Promise<void>
  selectRace(raceId: string): Promise<void>
  saveObservation(observation: LineObservation): Promise<void>
  deleteObservation(id: string): Promise<void>
  setSimulatorEnabled(enabled: boolean): void
  configureSimulator(patch: Partial<Pick<SimulatorState, 'heading' | 'speedKnots' | 'accuracy'>>): void
  stepSimulator(seconds: number): void
  placeSimulator(latitude: number, longitude: number, heading?: number): void
  acceptDeviceReading(reading: SensorReading): void
  recordLatestReading(): Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)
const simulatorStorageKey = 'pin-end-dev-simulator'

type SimulatorSnapshot = {
  enabled: boolean
  simulator: SimulatorState
}

function parseSimulatorSnapshot(value: string): SimulatorSnapshot | null {
  try {
    const snapshot = JSON.parse(value) as SimulatorSnapshot
    const finite = (candidate: unknown): candidate is number => typeof candidate === 'number' && Number.isFinite(candidate)
    const coordinate = snapshot.simulator?.coordinate
    const reading = snapshot.simulator?.reading
    if (
      typeof snapshot.enabled !== 'boolean'
      || !coordinate || !reading
      || !finite(coordinate.latitude) || coordinate.latitude < -90 || coordinate.latitude > 90
      || !finite(coordinate.longitude) || coordinate.longitude < -180 || coordinate.longitude > 180
      || !finite(snapshot.simulator.heading) || snapshot.simulator.heading < 0 || snapshot.simulator.heading >= 360
      || !finite(snapshot.simulator.speedKnots) || snapshot.simulator.speedKnots < 0 || snapshot.simulator.speedKnots > 20
      || !finite(snapshot.simulator.accuracy) || snapshot.simulator.accuracy < 1 || snapshot.simulator.accuracy > 50
      || !finite(reading.latitude) || !finite(reading.longitude) || !finite(reading.timestamp)
      || !finite(reading.accuracy) || !finite(reading.heading) || !finite(reading.speedKnots)
      || reading.source !== 'simulator'
    ) return null
    return snapshot
  } catch {
    return null
  }
}

function readSimulatorSnapshot(fallback: SimulatorState): SimulatorSnapshot {
  if (!import.meta.env.DEV) return { enabled: false, simulator: fallback }
  const stored = localStorage.getItem(simulatorStorageKey)
  return stored ? parseSimulatorSnapshot(stored) ?? { enabled: false, simulator: fallback } : { enabled: false, simulator: fallback }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState('local')
  const [accessList, setAccessList] = useState<BoatAccess[]>([])
  const [error, setError] = useState('')
  const [syncStatus, setSyncStatus] = useState(supabase ? navigator.onLine ? 'Connecting…' : 'Offline · last synced target' : 'Local only')
  const sharing = useRef<ReturnType<typeof createBoatSharing> | null>(null)
  const [sessions, setSessions] = useState<RaceSession[]>([])
  const booted = useRef(false)
  const lastTrackSync = useRef(0)
  const repository = useMemo(() => createRaceRepository(), [])
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(navigator.onLine)
  const [marks, setMarks] = useState(seedMarks)
  const [boats, setBoats] = useState<Boat[]>([])
  const [boat, setBoat] = useState<Boat>({ ...seedBoat, id: '', name: '' })
  const [allSails, setAllSails] = useState(seedSails)
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [races, setRaces] = useState<RaceDefinition[]>([])
  const [race, setRace] = useState(seedRace)
  const raceRef = useRef(seedRace)
  const raceSelectionRef = useRef(0)
  const [session, setSession] = useState(createSeedSession)
  const [observations, setObservations] = useState<LineObservation[]>([])
  const [simulatorSnapshot, setSimulatorSnapshot] = useState(() => readSimulatorSnapshot(createSimulator(cyca.coordinate)))
  const simulatorSnapshotRef = useRef(simulatorSnapshot)
  const { enabled: simulatorEnabled, simulator } = simulatorSnapshot
  const [deviceReading, setDeviceReading] = useState<SensorReading | null>(null)

  const current = useRef({ boat, race, session, marks, boats, allSails, crew, races, userId, accessList })
  current.current = { boat, race, session, marks, boats, allSails, crew, races, userId, accessList }
  const setActiveSession = (next: RaceSession) => {
    current.current.session = next
    setSession(next)
    setSessions((items) => [...items.filter((item) => item.raceId !== next.raceId), next])
  }
  const applyShared = useCallback(async (state: SharedState) => {
    const access = state.workspaces.map((workspace) => ({
      boatId: workspace.id, navigatorId: workspace.navigator_id,
      role: state.members.find((member) => member.boat_id === workspace.id && member.user_id === current.current.userId)?.role ?? 'crew' as const,
      members: state.members.filter((member) => member.boat_id === workspace.id).map((member) => ({ userId: member.user_id, name: member.display_name, role: member.role })),
    }))
    setAccessList(access)
    const catalogs = state.workspaces.map((item) => item.catalog)
    const nextBoats = catalogs.map((item) => item.boat)
    const nextRaces = catalogs.flatMap((item) => item.races.map((race) => ({ ...race, boatId: item.boat.id })))
    const nextMarks = catalogs.flatMap((item) => item.marks.map((mark) => ({ ...mark, boatId: item.boat.id })))
    const nextSails = catalogs.flatMap((item) => item.sails)
    const nextCrew = catalogs.flatMap((item) => item.crew.map((member) => ({ ...member, boatId: item.boat.id })))
    await database.transaction('rw', [database.boats, database.races, database.marks, database.sails, database.crew, database.sessions, database.telemetry], async () => {
      await database.boats.clear()
      await database.races.clear()
      if (nextBoats.length) await database.boats.bulkPut(nextBoats)
      if (nextRaces.length) await database.races.bulkPut(nextRaces)
      if (nextMarks.length) await database.marks.bulkPut(nextMarks)
      if (nextSails.length) await database.sails.bulkPut(nextSails)
      if (nextCrew.length) await database.crew.bulkPut(nextCrew)
      for (const progress of state.progress) {
        await repository.saveSession(progress.session)
        for (const reading of progress.session.telemetry) await repository.saveTelemetry(progress.session.id, reading)
      }
    })
    setBoats(nextBoats); setRaces(nextRaces); setMarks(nextMarks); setAllSails(nextSails); setCrew(nextCrew)
    const selectedBoat = nextBoats.find((item) => item.id === localStorage.getItem('pin-end-selected-boat')) ?? nextBoats.find((item) => item.id === current.current.boat.id) ?? nextBoats[0]
    setBoat(selectedBoat ?? { ...seedBoat, id: '', name: '' })
    const selectedRace = nextRaces.find((item) => item.id === current.current.race.id && item.boatId === selectedBoat?.id)
    const savedSessions = await database.sessions.toArray()
    const sharedRaceIds = new Set(state.progress.map((item) => item.race_id))
    setSessions([...savedSessions.filter((item) => !sharedRaceIds.has(item.raceId)), ...state.progress.map((item) => item.session)])
    if (selectedRace) {
      setRace(selectedRace); raceRef.current = selectedRace
      const progress = state.progress.find((item) => item.race_id === selectedRace.id)
      const nextSession = progress ? await repository.getSession(progress.session.id) : await repository.getSessionForRace(selectedRace.id)
      if (nextSession) setSession(nextSession)
    }
  }, [repository])

  const refreshSharing = useCallback(async () => {
    if (!sharing.current || !navigator.onLine) return
    try {
      const result = await sharing.current.refresh()
      await applyShared(result.state)
      setSyncStatus(sharing.current.hasPending() ? 'Syncing changes…' : 'Live · updated just now')
      if (result.warning) setError(result.warning)
    } catch (reason) {
      setSyncStatus('Not synced · showing saved data')
      setError(reason instanceof Error ? reason.message : 'Could not synchronize the boat.')
    }
  }, [applyShared])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void (async () => {
      try {
        if (supabase) {
          const { data } = await supabase.auth.getSession()
          if (!data.session?.user) throw new Error('Sign in again to load your boats.')
          const id = data.session.user.id
          current.current.userId = id
          setUserId(id)
          sharing.current = createBoatSharing(id)
          if (localStorage.getItem('pin-end-cloud-owner') === id && !localStorage.getItem(`pin-end-legacy-import:${id}`) && !localStorage.getItem(`pin-end-legacy-local:${id}`)) {
            const { exportRepositorySnapshot } = await import('../services/repository')
            const legacy = await exportRepositorySnapshot()
            if (legacy.boats.length) localStorage.setItem(`pin-end-legacy-local:${id}`, JSON.stringify(legacy))
          }
          // Keep account caches isolated, including when offline.
          if (localStorage.getItem('pin-end-data-owner') !== id) {
            const { clearRepository } = await import('../services/repository')
            await clearRepository()
            localStorage.setItem('pin-end-data-owner', id)
          }
          await applyShared(sharing.current.cached())
          if (navigator.onLine) {
            const initial = await sharing.current.refresh()
            const { importLegacyBoats } = await import('../services/legacyBoats')
            const importedSessions = await importLegacyBoats(id, initial.state)
            const refreshed = await sharing.current.refresh()
            for (const imported of importedSessions) {
              const workspace = refreshed.state.workspaces.find((item) => item.catalog.races.some((race) => race.id === imported.raceId))
              if (workspace) sharing.current.queueProgress(workspace.id, imported)
            }
            await sharing.current.refresh()
            localStorage.setItem(`pin-end-legacy-import:${id}`, 'done')
          }
          await refreshSharing()
        } else if (localStorage.getItem('pin-end-empty') !== 'true') await seedDatabase()
        const data = await repository.loadAll()
        const scopedRaces = data.races.map((item) => ({ ...item, boatId: item.boatId ?? data.boats[0]?.id }))
        for (const item of scopedRaces) await repository.saveRace(item)
        setMarks(data.marks); setBoats(data.boats); setAllSails(data.sails); setCrew(data.crew); setRaces(scopedRaces); setSessions(data.sessions)
        const selected = data.boats.find((item) => item.id === localStorage.getItem('pin-end-selected-boat')) ?? data.boats[0]
        if (selected) setBoat(selected)
        const selectedRace = scopedRaces.find((item) => item.boatId === selected?.id)
        if (selectedRace) {
          setRace(selectedRace); raceRef.current = selectedRace
          const saved = await repository.getSessionForRace(selectedRace.id)
          if (saved) setSession(saved)
        }
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your boats.') }
      finally { setLoading(false) }
    })()
  }, [applyShared, refreshSharing, repository])

  useEffect(() => {
    const goOnline = () => { setOnline(true); void refreshSharing() }
    const goOffline = () => { setOnline(false); setSyncStatus('Offline · last synced target') }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const timer = window.setInterval(() => { if (!loading) void refreshSharing() }, 3000)
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); window.clearInterval(timer) }
  }, [loading, refreshSharing])

  const catalogFor = (boatId: string): BoatCatalog => {
    const state = current.current
    return { boat: state.boats.find((item) => item.id === boatId) ?? state.boat, marks: state.marks.filter((item) => !item.boatId || item.boatId === boatId), races: state.races.filter((item) => item.boatId === boatId), sails: state.allSails.filter((item) => item.boatId === boatId), crew: state.crew.filter((item) => !item.boatId || item.boatId === boatId) }
  }
  const syncCatalog = () => { if (current.current.boat.id) sharing.current?.queueCatalog(catalogFor(current.current.boat.id)) }
  const access = accessList.find((item) => item.boatId === boat.id)
  const canManage = !supabase || access?.role === 'owner' || access?.role === 'admin'
  const isNavigator = !supabase || access?.navigatorId === userId
  const requireManager = () => {
    const entry = current.current.accessList.find((item) => item.boatId === current.current.boat.id)
    if (supabase && entry?.role !== 'owner' && entry?.role !== 'admin') throw new Error('Only an owner or admin can edit this boat.')
  }
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const syncSimulator = (event: StorageEvent) => {
      if (event.key !== simulatorStorageKey || !event.newValue) return
      const stored = localStorage.getItem(simulatorStorageKey)
      const snapshot = stored ? parseSimulatorSnapshot(stored) : null
      if (snapshot) {
        simulatorSnapshotRef.current = snapshot
        setSimulatorSnapshot(snapshot)
      }
    }
    window.addEventListener('storage', syncSimulator)
    return () => window.removeEventListener('storage', syncSimulator)
  }, [])

  const updateSimulatorSnapshot = useCallback((update: (current: SimulatorSnapshot) => SimulatorSnapshot) => {
    const apply = () => {
      const stored = import.meta.env.DEV ? localStorage.getItem(simulatorStorageKey) : null
      const latest = stored ? parseSimulatorSnapshot(stored) ?? simulatorSnapshotRef.current : simulatorSnapshotRef.current
      const next = update(latest)
      simulatorSnapshotRef.current = next
      if (import.meta.env.DEV) localStorage.setItem(simulatorStorageKey, JSON.stringify(next))
      setSimulatorSnapshot(next)
    }
    const locks = navigator.locks
    if (import.meta.env.DEV && locks) void locks.request(simulatorStorageKey, apply)
    else apply()
  }, [])

  const setSimulatorEnabled = useCallback((enabled: boolean) => {
    updateSimulatorSnapshot((current) => ({ ...current, enabled }))
  }, [updateSimulatorSnapshot])

  const updateSession = useCallback(async (patch: Partial<RaceSession>) => {
    const state = current.current
    const access = state.accessList.find((item) => item.boatId === state.boat.id)
    if (supabase && access?.navigatorId !== state.userId) { setError('Only the assigned navigator can change race progress.'); return }
    if (state.session.phase === 'finished') { setError('Finished race history is read-only.'); return }
    const next = { ...state.session, ...patch, updatedAt: Date.now() }
    if (patch.phase === 'finished') {
      next.courseSnapshot = structuredClone(state.race)
      next.marksSnapshot = structuredClone(state.marks.filter((mark) => state.race.course.some((waypoint) => waypoint.markId === mark.id)))
    }
    setActiveSession(next)
    if (patch.telemetry?.length === 0 && next.id !== state.session.id) await repository.resetSession(next)
    else await repository.saveSession(next)
    if (patch.phase === 'finished') {
      const completed = await repository.getSessionForRace(next.raceId)
      if (completed) { setActiveSession(completed); sharing.current?.queueProgress(state.boat.id, completed) }
    } else if (!patch.telemetry || Date.now() - lastTrackSync.current >= 10_000) {
      sharing.current?.queueProgress(state.boat.id, next)
      lastTrackSync.current = Date.now()
    }
  }, [repository])

  const enterRace = async (index: number) => {
    await updateSession(enterAtWaypoint(current.current.race, current.current.session, index))
  }

  const saveMark = async (mark: Mark) => {
    requireManager()
    mark = { ...mark, boatId: boat.id }
    const linkedFinish = mark.position.kind === 'gate'
      ? marks.find((item) => item.position.kind === 'gate' && item.position.linkedToMarkId === mark.id)
      : undefined
    const syncedFinish = linkedFinish?.position.kind === 'gate' && mark.position.kind === 'gate'
      ? { ...linkedFinish, position: { ...linkedFinish.position, pointA: mark.position.pointA, pointB: mark.position.pointB } }
      : undefined
    const nextMarks = [...current.current.marks.filter((item) => item.id !== mark.id && item.id !== syncedFinish?.id), mark, ...(syncedFinish ? [syncedFinish] : [])]
    current.current.marks = nextMarks
    setMarks(nextMarks)
    if (syncedFinish) await repository.saveMarks([mark, syncedFinish])
    else await repository.saveMark(mark)
    syncCatalog()
  }

  const saveBoat = async (next: Boat) => {
    const existing = current.current.boats.some((item) => item.id === next.id)
    if (existing) requireManager()
    if (!next.name.trim()) throw new Error('Enter a boat name.')
    if (!existing && supabase) {
      await createSharedBoat({ boat: next, marks: [], races: [], sails: [], crew: [] })
      localStorage.setItem('pin-end-selected-boat', next.id)
      await refreshSharing()
    } else {
      current.current.boats = [...current.current.boats.filter((item) => item.id !== next.id), next]
      current.current.boat = next
      setBoats(current.current.boats); setBoat(next)
      localStorage.setItem('pin-end-selected-boat', next.id)
      await repository.saveBoat(next)
      if (existing) syncCatalog()
    }
  }

  const selectBoat = (boatId: string) => {
    const selected = boats.find((item) => item.id === boatId)
    if (!selected) return
    raceSelectionRef.current += 1
    current.current.boat = selected
    setBoat(selected)
    localStorage.setItem('pin-end-selected-boat', boatId)
  }

  const saveSail = async (sail: Sail) => {
    requireManager()
    current.current.allSails = [...current.current.allSails.filter((item) => item.id !== sail.id), sail]
    setAllSails(current.current.allSails)
    await repository.saveSail(sail)
    syncCatalog()
  }

  const saveCrewMember = async (member: CrewMember) => {
    requireManager()
    member = { ...member, boatId: boat.id }
    current.current.crew = [...current.current.crew.filter((item) => item.id !== member.id), member]
    setCrew(current.current.crew)
    await repository.saveCrewMember(member)
    syncCatalog()
  }

  const saveRace = async (next: RaceDefinition) => {
    requireManager()
    if (sessions.some((item) => item.raceId === next.id && item.phase === 'finished')) throw new Error('Finished race history is read-only.')
    const navigating = session.raceId === next.id && (session.phase === 'prestart' || session.phase === 'racing')
    const targetId = navigating ? raceRef.current.course[current.current.session.activeWaypointIndex]?.id : undefined
    if (targetId && !next.course.some((waypoint) => waypoint.id === targetId)) {
      setError('Choose another shared target before removing the current waypoint.')
      return
    }
    if (next.id !== raceRef.current.id) raceSelectionRef.current += 1
    const startLine = next.course.find(isStartWaypoint) ?? { id: `start-${next.id}`, markId: 'start-line', rounding: 'either' as const, role: 'start' as const }
    const finishLine = next.course.find(isFinishWaypoint) ?? { id: `finish-${next.id}`, markId: 'finish-line', rounding: 'either' as const, role: 'finish' as const }
    const normalized = { ...next, boatId: boat.id, course: [{ ...startLine, role: 'start' as const }, ...next.course.filter((waypoint) => !isStartWaypoint(waypoint) && !isFinishWaypoint(waypoint)), { ...finishLine, role: 'finish' as const }] }
    raceRef.current = normalized
    setRace(normalized)
    current.current.races = [...current.current.races.filter((item) => item.id !== normalized.id), normalized]
    current.current.race = normalized
    setRaces(current.current.races)
    await repository.saveRace(normalized)
    if (targetId) {
      const updated = { ...current.current.session, activeWaypointIndex: normalized.course.findIndex((waypoint) => waypoint.id === targetId) }
      setActiveSession(updated)
      await repository.saveSession(updated)
    }
    syncCatalog()
    if (session.raceId !== normalized.id) {
      const nextSession = { ...createSeedSession(), id: `session-${normalized.id}`, raceId: normalized.id, syncedStartTime: Date.parse(normalized.scheduledStart), selectedSailIds: [], telemetry: [], roundedAt: {} }
      setActiveSession(nextSession)
      await repository.saveSession(nextSession)
    }
  }

  const mutateRace = async (mutator: (race: RaceDefinition) => RaceDefinition) => saveRace(mutator(raceRef.current))

  const selectRace = async (raceId: string) => {
    const requestId = ++raceSelectionRef.current
    const selected = races.find((item) => item.id === raceId)
    if (!selected || selected.boatId !== current.current.boat.id) return
    const stored = await repository.getSessionForRace(selected.id)
    const next = stored ?? { ...createSeedSession(), id: `session-${selected.id}`, raceId: selected.id, phase: 'setup' as const, selectedSailIds: [], crewAssignments: [], syncedStartTime: Date.parse(selected.scheduledStart), activeWaypointIndex: 0, telemetry: [], roundedAt: {}, updatedAt: Date.now() }
    const selectedObservations = await repository.getObservations(next.id)
    if (requestId !== raceSelectionRef.current) return
    raceRef.current = selected
    setRace(selected)
    current.current.race = selected
    setActiveSession(next)
    setObservations(selectedObservations)
    await repository.saveSession(next)
  }

  const saveObservation = async (observation: LineObservation) => {
    setObservations((current) => [...current, observation])
    await repository.saveObservation(observation)
    syncCatalog()
  }

  const deleteObservation = async (id: string) => {
    setObservations((current) => current.filter((observation) => observation.id !== id))
    await repository.deleteObservation(id)
    syncCatalog()
  }

  const configureSimulator = (patch: Partial<Pick<SimulatorState, 'heading' | 'speedKnots' | 'accuracy'>>) =>
    updateSimulatorSnapshot((current) => ({ ...current, simulator: configureSimulatorState(current.simulator, patch) }))

  const stepSimulator = (seconds: number) =>
    updateSimulatorSnapshot((current) => ({ ...current, simulator: moveSimulator(current.simulator, seconds) }))
  const placeSimulator = (latitude: number, longitude: number, heading?: number) =>
    updateSimulatorSnapshot((current) => ({ ...current, simulator: setSimulatorPosition(current.simulator, { latitude, longitude }, heading) }))

  const latestReading = simulatorEnabled ? simulator.reading : deviceReading

  const recordLatestReading = useCallback(async () => {
    if (!latestReading || !isNavigator) return
    const last = session.telemetry.at(-1)
    if (last?.timestamp === latestReading.timestamp) return
    const telemetry = [...session.telemetry.slice(-3_599), latestReading]
    await repository.saveTelemetry(session.id, latestReading)
    await updateSession({ telemetry })
  }, [isNavigator, latestReading, repository, session.id, session.telemetry, updateSession])

  const sails = allSails.filter((sail) => sail.boatId === boat.id)

  const value: AppContextValue = {
    loading,
    error, syncStatus, userId, access, canManage, isNavigator, sessions, refreshSharing, enterRace, clearError: () => setError(''),
    online,
    marks: marks.filter((item) => !item.boatId || item.boatId === boat.id),
    boats,
    boat,
    sails,
    crew: crew.filter((item) => !item.boatId || item.boatId === boat.id),
    races: races.filter((item) => item.boatId === boat.id),
    race,
    session,
    observations,
    simulatorEnabled,
    simulator,
    latestReading,
    updateSession,
    saveMark,
    saveBoat,
    selectBoat,
    saveSail,
    saveCrewMember,
    saveRace,
    mutateRace,
    selectRace,
    saveObservation,
    deleteObservation,
    setSimulatorEnabled,
    configureSimulator,
    stepSimulator,
    placeSimulator,
    acceptDeviceReading: setDeviceReading,
    recordLatestReading,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
