import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedSession, seedBoat, seedRace } from '../data/seed'
import { createBoatSharing, invitationCode, type SharedState } from './boatSharing'

const remote = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('./auth', () => ({ supabase: remote }))

describe('shared boat synchronization', () => {
  const state: SharedState = {
    workspaces: [{ id: seedBoat.id, navigator_id: 'navigator', revision: 1, catalog: { boat: seedBoat, races: [seedRace], marks: [], sails: [], crew: [] } }],
    progress: [{ boat_id: seedBoat.id, race_id: seedRace.id, revision: 1, session: { ...createSeedSession(), phase: 'racing', activeWaypointIndex: 1 } }],
    members: [{ boat_id: seedBoat.id, user_id: 'navigator', role: 'owner', display_name: 'Navigator' }],
  }
  beforeEach(() => {
    localStorage.clear(); vi.resetAllMocks()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    localStorage.setItem('pin-end-sharing:navigator', JSON.stringify({ state, pending: {} }))
    remote.rpc.mockResolvedValue({ data: 2, error: null })
    remote.from.mockImplementation((table: string) => ({ select: () => Promise.resolve({ data: table === 'boat_workspaces' ? state.workspaces : table === 'boat_race_progress' ? state.progress : state.members, error: null }) }))
  })
  it('restores offline target and catalog changes after a reload', async () => {
    const sharing = createBoatSharing('navigator')
    sharing.queueProgress(seedBoat.id, { ...state.progress[0].session, activeWaypointIndex: 3 })
    sharing.queueCatalog({ ...state.workspaces[0].catalog, boat: { ...seedBoat, name: 'Updated boat' } })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const restarted = createBoatSharing('navigator')
    expect(restarted.cached().progress[0].session.activeWaypointIndex).toBe(3)
    expect(restarted.cached().workspaces[0].catalog.boat.name).toBe('Updated boat')
    expect((await restarted.refresh()).state.progress[0].session.activeWaypointIndex).toBe(3)
    expect(remote.rpc).not.toHaveBeenCalled()
  })
  it('catches up to authoritative navigation after a conflicting offline update', async () => {
    const sharing = createBoatSharing('navigator')
    sharing.queueProgress(seedBoat.id, { ...state.progress[0].session, activeWaypointIndex: 3 })
    remote.rpc.mockResolvedValue({ error: { message: 'SHARED_CONFLICT: Changed on another device' } })
    const result = await sharing.refresh()
    expect(result.state.progress[0].session.activeWaypointIndex).toBe(1)
    expect(result.warning).toContain('Loaded the latest')
    expect(sharing.hasPending()).toBe(false)
    expect(Object.keys(localStorage).some((key) => key.startsWith('pin-end-sharing:navigator:conflict:'))).toBe(true)
  })
  it('keeps queued changes after a temporary network failure', async () => {
    const sharing = createBoatSharing('navigator')
    sharing.queueProgress(seedBoat.id, { ...state.progress[0].session, activeWaypointIndex: 2 })
    remote.rpc.mockResolvedValue({ error: { message: 'Network unavailable' } })
    await expect(sharing.refresh()).rejects.toThrow('Network unavailable')
    expect(createBoatSharing('navigator').cached().progress[0].session.activeWaypointIndex).toBe(2)
  })
  it('accepts invitation links and formatted codes without navigating them', () => {
    expect(invitationCode('https://example.test/?invite=ABCDEF123456')).toBe('ABCDEF123456')
    expect(invitationCode('abcd ef12-3456')).toBe('ABCDEF123456')
  })
})
