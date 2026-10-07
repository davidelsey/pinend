import { beforeEach, expect, it, vi } from 'vitest'
import { createSeedSession, seedBoat, seedMarks, seedRace } from '../data/seed'
import { importLegacyBoats } from './legacyBoats'
import type { RepositorySnapshot } from './repository'

const remote = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('./auth', () => ({ supabase: remote }))

beforeEach(() => { localStorage.clear(); remote.rpc.mockResolvedValue({ error: null }) })
it('preserves legacy start/finish roles and recorded history when namespacing old IDs', async () => {
  const snapshot: RepositorySnapshot = {
    version: 1, boats: [seedBoat], marks: seedMarks, sails: [], crew: [], observations: [], telemetry: [],
    races: [{ ...seedRace, course: seedRace.course.map((waypoint) => ({ ...waypoint, role: undefined })) }],
    sessions: [{ ...createSeedSession(), phase: 'finished', roundedAt: { 'leg-1': 1000 } }],
  }
  remote.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { data: snapshot }, error: null }) }) }) })
  const sessions = await importLegacyBoats('owner', { workspaces: [], progress: [], members: [] })
  const catalog = remote.rpc.mock.calls[0][1].p_catalog
  expect(catalog.races[0].course[0]).toMatchObject({ role: 'start', markId: 'owner:boat-1:start-line' })
  expect(catalog.races[0].course.at(-1)).toMatchObject({ role: 'finish', markId: 'owner:boat-1:finish-line' })
  expect(sessions[0]).toMatchObject({ phase: 'finished', roundedAt: { 'leg-1': 1000 }, courseSnapshot: { boatId: 'owner:boat-1' } })
})
