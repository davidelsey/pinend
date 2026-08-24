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
import { createRaceRepository, seedDatabase } from '../services/repository'

type AppContextValue = {
  loading: boolean
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

export function AppProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => createRaceRepository(), [])
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(navigator.onLine)
  const [marks, setMarks] = useState(seedMarks)
  const [boats, setBoats] = useState([seedBoat])
  const [boat, setBoat] = useState(seedBoat)
  const [allSails, setAllSails] = useState(seedSails)
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [races, setRaces] = useState<RaceDefinition[]>([seedRace])
  const [race, setRace] = useState(seedRace)
  const raceRef = useRef(seedRace)
  const raceSelectionRef = useRef(0)
  const [session, setSession] = useState(createSeedSession)
  const [observations, setObservations] = useState<LineObservation[]>([])
  const [simulatorEnabled, setSimulatorEnabled] = useState(false)
  const [simulator, setSimulator] = useState(() => createSimulator(cyca.coordinate))
  const [deviceReading, setDeviceReading] = useState<SensorReading | null>(null)

  useEffect(() => {
    void (async () => {
      await seedDatabase()
      const data = await repository.loadAll()
      const activeSession = data.session ?? createSeedSession()
      const storedObservations = await repository.getObservations(activeSession.id)
      setMarks(data.marks)
      setBoats(data.boats.length ? data.boats : [seedBoat])
      const selectedBoatId = localStorage.getItem('pin-end-selected-boat')
      setBoat(data.boats.find((item) => item.id === selectedBoatId) ?? data.boats[0] ?? seedBoat)
      setAllSails(data.sails)
      setCrew(data.crew)
      setRaces(data.races.length ? data.races : [seedRace])
      const activeRace = data.races.find((item) => item.id === activeSession.raceId) ?? data.races[0] ?? seedRace
      raceRef.current = activeRace
      setRace(activeRace)
      setSession(activeSession)
      setObservations(storedObservations)
      setLoading(false)
    })()
  }, [repository])

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const updateSession = useCallback(
    async (patch: Partial<RaceSession>) => {
      const next = { ...session, ...patch, updatedAt: Date.now() }
      if (next.id !== session.id) setObservations([])
      setSession(next)
      await repository.saveSession(next)
    },
    [repository, session],
  )

  const saveMark = async (mark: Mark) => {
    const linkedFinish = mark.position.kind === 'gate'
      ? marks.find((item) => item.position.kind === 'gate' && item.position.linkedToMarkId === mark.id)
      : undefined
    const syncedFinish = linkedFinish?.position.kind === 'gate' && mark.position.kind === 'gate'
      ? { ...linkedFinish, position: { ...linkedFinish.position, pointA: mark.position.pointA, pointB: mark.position.pointB } }
      : undefined
    setMarks((current) => [...current.filter((item) => item.id !== mark.id && item.id !== syncedFinish?.id), mark, ...(syncedFinish ? [syncedFinish] : [])])
    if (syncedFinish) await repository.saveMarks([mark, syncedFinish])
    else await repository.saveMark(mark)
  }

  const saveBoat = async (next: Boat) => {
    setBoats((current) => [...current.filter((item) => item.id !== next.id), next])
    setBoat(next)
    localStorage.setItem('pin-end-selected-boat', next.id)
    await repository.saveBoat(next)
  }

  const selectBoat = (boatId: string) => {
    const selected = boats.find((item) => item.id === boatId)
    if (!selected) return
    setBoat(selected)
    localStorage.setItem('pin-end-selected-boat', boatId)
    void updateSession({ selectedSailIds: allSails.filter((sail) => sail.boatId === boatId && sail.location !== 'locker').map((sail) => sail.id) })
  }

  const saveSail = async (sail: Sail) => {
    setAllSails((current) => [...current.filter((item) => item.id !== sail.id), sail])
    await repository.saveSail(sail)
  }

  const saveCrewMember = async (member: CrewMember) => {
    setCrew((current) => [...current.filter((item) => item.id !== member.id), member])
    await repository.saveCrewMember(member)
  }

  const saveRace = async (next: RaceDefinition) => {
    if (next.id !== raceRef.current.id) raceSelectionRef.current += 1
    const startLine = next.course.find(isStartWaypoint) ?? { id: `start-${next.id}`, markId: 'start-line', rounding: 'either' as const, role: 'start' as const }
    const finishLine = next.course.find(isFinishWaypoint) ?? { id: `finish-${next.id}`, markId: 'finish-line', rounding: 'either' as const, role: 'finish' as const }
    const normalized = { ...next, course: [{ ...startLine, role: 'start' as const }, ...next.course.filter((waypoint) => !isStartWaypoint(waypoint) && !isFinishWaypoint(waypoint)), { ...finishLine, role: 'finish' as const }] }
    raceRef.current = normalized
    setRace(normalized)
    setRaces((current) => [...current.filter((item) => item.id !== normalized.id), normalized])
    await repository.saveRace(normalized)
  }

  const mutateRace = async (mutator: (race: RaceDefinition) => RaceDefinition) => saveRace(mutator(raceRef.current))

  const selectRace = async (raceId: string) => {
    const requestId = ++raceSelectionRef.current
    const selected = races.find((item) => item.id === raceId)
    if (!selected || selected.id === race.id) return
    const stored = await repository.getSessionForRace(selected.id)
    const next = stored ? { ...stored, updatedAt: Date.now() } : { ...createSeedSession(), id: crypto.randomUUID(), raceId: selected.id, phase: 'setup' as const, syncedStartTime: Date.parse(selected.scheduledStart), activeWaypointIndex: 0, telemetry: [], roundedAt: {}, updatedAt: Date.now() }
    const selectedObservations = await repository.getObservations(next.id)
    if (requestId !== raceSelectionRef.current) return
    raceRef.current = selected
    setRace(selected)
    setSession(next)
    setObservations(selectedObservations)
    await repository.saveSession(next)
  }

  const saveObservation = async (observation: LineObservation) => {
    setObservations((current) => [...current, observation])
    await repository.saveObservation(observation)
  }

  const deleteObservation = async (id: string) => {
    setObservations((current) => current.filter((observation) => observation.id !== id))
    await repository.deleteObservation(id)
  }

  const configureSimulator = (patch: Partial<Pick<SimulatorState, 'heading' | 'speedKnots' | 'accuracy'>>) =>
    setSimulator((current) => configureSimulatorState(current, patch))

  const stepSimulator = (seconds: number) => setSimulator((current) => moveSimulator(current, seconds))
  const placeSimulator = (latitude: number, longitude: number, heading?: number) =>
    setSimulator((current) => setSimulatorPosition(current, { latitude, longitude }, heading))

  const latestReading = simulatorEnabled ? simulator.reading : deviceReading

  const recordLatestReading = useCallback(async () => {
    if (!latestReading) return
    const last = session.telemetry.at(-1)
    if (last?.timestamp === latestReading.timestamp) return
    const telemetry = [...session.telemetry.slice(-3599), latestReading]
    await updateSession({ telemetry })
  }, [latestReading, session.telemetry, updateSession])

  const sails = allSails.filter((sail) => sail.boatId === boat.id)

  const value: AppContextValue = {
    loading,
    online,
    marks,
    boats,
    boat,
    sails,
    crew,
    races,
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
