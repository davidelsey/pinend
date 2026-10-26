import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createRaceRepository, database } from './services/repository'
import { seedBoat, seedRace, seedMarks, createSeedSession } from './data/seed'
import type { SharedState } from './services/boatSharing'

const server = vi.hoisted(() => ({ state: null as unknown, getUser: vi.fn(), from: vi.fn() }))
vi.mock('./services/auth', () => ({
  isSupabaseConfigured: true, signInWithGoogle: vi.fn(), signOut: vi.fn(),
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'crew' } } } }), getUser: server.getUser, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    from: server.from,
    rpc: vi.fn(),
  },
}))

describe('shared crew race screens', () => {
  beforeEach(async () => {
    await database.delete(); await database.open(); localStorage.clear()
    localStorage.setItem('pin-end-legacy-import:crew', 'done')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    const state: SharedState = {
      workspaces: [{ id: seedBoat.id, revision: 1, navigator_id: 'owner', catalog: { boat: seedBoat, races: [{ ...seedRace, boatId: seedBoat.id }], marks: seedMarks, sails: [], crew: [] } }],
      progress: [{ boat_id: seedBoat.id, race_id: seedRace.id, revision: 1, session: { ...createSeedSession(), phase: 'racing', activeWaypointIndex: 1, syncedStartTime: Date.now() - 60_000 } }],
      members: [{ boat_id: seedBoat.id, user_id: 'owner', role: 'owner', display_name: 'Alex' }, { boat_id: seedBoat.id, user_id: 'crew', role: 'crew', display_name: 'Sam' }],
    }
    server.state = state
    server.from.mockImplementation((table: string) => ({ select: () => Promise.resolve({ error: null, data: table === 'boat_workspaces' ? (server.state as SharedState).workspaces : table === 'boat_race_progress' ? (server.state as SharedState).progress : (server.state as SharedState).members }) }))
    server.getUser.mockRejectedValue(new Error('No network'))
    localStorage.setItem('pin-end-sharing:crew', JSON.stringify({ state, pending: {} }))
  })
  afterEach(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }) })
  const resume = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Race 4.*Resume race/ }))
    expect(screen.queryByRole('button', { name: 'Edit course' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Resume race' }))
    await screen.findByRole('heading', { name: 'Clark Island' })
  }
  it('joins at the navigator target and follows subsequent shared selections', async () => {
    render(<App />)
    await resume()
    expect(screen.getByRole('button', { name: 'Next mark' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Mark rounded' })).not.toBeInTheDocument()
    const state = server.state as SharedState
    state.progress[0] = { ...state.progress[0], revision: 2, session: { ...state.progress[0].session, activeWaypointIndex: 2 } }
    fireEvent(window, new Event('online'))
    expect(await screen.findByRole('heading', { name: 'Windward mark' })).toBeInTheDocument()
  })
  it('restores cached boat and target offline without server user validation', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    render(<App />)
    await resume()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByText(/Offline · last synced target/)).toBeInTheDocument()
    await waitFor(() => expect(server.getUser).not.toHaveBeenCalled())
  })

  it('follows a confirmed navigator reset without restoring old track points or deleting sightings', async () => {
    const state = server.state as SharedState
    const fix = { latitude: -33.86, longitude: 151.24, timestamp: Date.now() - 1_000, accuracy: 3, heading: 90, speedKnots: 6, source: 'device' as const }
    state.progress[0].session.telemetry = [fix]
    state.progress[0].session.roundedAt = { 'leg-start': fix.timestamp }
    render(<App />)
    await resume()
    const repository = createRaceRepository(database)
    const session = state.progress[0].session
    const sighting = { id: 'crew-sighting', sessionId: session.id, endpoint: 'pin' as const, observer: fix, bearingTrue: 90, accuracy: 3, timestamp: fix.timestamp }
    await repository.saveObservation(sighting)
    expect(await repository.getCompleteTelemetry(session.id)).toHaveLength(1)
    state.progress[0] = { ...state.progress[0], revision: 2, session: { ...session, phase: 'prestart', activeWaypointIndex: 0, autoStartArmed: false, trackResetAt: Date.now(), roundedAt: {}, telemetry: [] } }
    fireEvent(window, new Event('online'))
    await screen.findByText('PRE-START')
    await waitFor(async () => expect(await repository.getCompleteTelemetry(session.id)).toEqual([]))
    expect(await repository.getObservations(session.id)).toEqual([sighting])
    expect(screen.getByRole('button', { name: /5:00 Warning/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous mark' })).toBeDisabled()
  })
})
