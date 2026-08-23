/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cyca, createSeedSession, seedBoat, seedMarks, seedRace, seedSails } from '../data/seed'
import type {
  Boat,
  LineObservation,
  Mark,
  RaceDefinition,
  RaceSession,
  Sail,
  SensorReading,
} from '../domain/types'
import { createSimulator, moveSimulator, setSimulatorPosition, type SimulatorState } from '../services/simulator'
import { createRaceRepository, seedDatabase } from '../services/repository'

type AppContextValue = {
  loading: boolean
  online: boolean
  marks: Mark[]
  boats: Boat[]
  boat: Boat
  sails: Sail[]
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
  saveRace(race: RaceDefinition): Promise<void>
  saveObservation(observation: LineObservation): Promise<void>
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
  const [race, setRace] = useState(seedRace)
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
      setRace(data.races[0] ?? seedRace)
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
    setMarks((current) => [...current.filter((item) => item.id !== mark.id), mark])
    await repository.saveMark(mark)
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

  const saveRace = async (next: RaceDefinition) => {
    setRace(next)
    await repository.saveRace(next)
  }

  const saveObservation = async (observation: LineObservation) => {
    setObservations((current) => [...current, observation])
    await repository.saveObservation(observation)
  }

  const configureSimulator = (patch: Partial<Pick<SimulatorState, 'heading' | 'speedKnots' | 'accuracy'>>) =>
    setSimulator((current) => ({ ...current, ...patch }))

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
    saveRace,
    saveObservation,
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
