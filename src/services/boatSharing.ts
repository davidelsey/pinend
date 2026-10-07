import { supabase } from './auth'
import { createRaceRepository } from './repository'
import type { Boat, BoatAccess, CrewMember, Mark, RaceDefinition, RaceSession, Sail } from '../domain/types'

export type BoatCatalog = { boat: Boat; marks: Mark[]; races: RaceDefinition[]; sails: Sail[]; crew: CrewMember[] }
type Workspace = { id: string; navigator_id: string; catalog: BoatCatalog; revision: number }
type Progress = { boat_id: string; race_id: string; session: RaceSession; revision: number }
type Member = { boat_id: string; user_id: string; role: BoatAccess['role']; display_name: string }
export type SharedState = { workspaces: Workspace[]; progress: Progress[]; members: Member[] }
type Pending = { kind: 'catalog'; boatId: string; value: BoatCatalog; revision: number } | { kind: 'progress'; boatId: string; raceId: string; value: RaceSession; revision: number }

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase || !navigator.onLine) throw new Error('Connect to the internet to manage boat membership.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export function invitationCode(value: string): string {
  let code = value.trim()
  try { code = new URL(code).searchParams.get('invite') ?? code } catch { /* A plain code is also accepted. */ }
  return code.replace(/[\s-]/g, '').toUpperCase()
}

export const previewInvitation = (code: string) => rpc<{ id: string; name: string } | null>('preview_boat_invitation', { p_code: invitationCode(code) })
export const joinBoat = (code: string) => rpc<string>('join_boat_workspace', { p_code: invitationCode(code) })
export const inviteCrew = (boatId: string) => rpc<string>('create_boat_invitation', { p_boat: boatId })
export const assignMember = (boatId: string, userId: string, role: 'admin' | 'crew' | null, navigator = false) => rpc<void>('assign_boat_member', { p_boat: boatId, p_user: userId, p_role: role, p_navigator: navigator })
export const createSharedBoat = (catalog: BoatCatalog) => rpc<void>('create_boat_workspace', { p_id: catalog.boat.id, p_catalog: catalog })

/** One serialized sync loop per signed-in app. Outbox entries retain their base
 * revision across reloads, so offline edits never silently overwrite a handoff. */
export function createBoatSharing(userId: string) {
  const key = `pin-end-sharing:${userId}`
  let state: SharedState = { workspaces: [], progress: [], members: [] }
  let pending: Record<string, Pending> = {}
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (saved?.state && saved?.pending) { state = saved.state; pending = saved.pending }
  } catch { /* Start with an empty cache if browser storage was damaged. */ }
  let inFlight: Promise<{ state: SharedState; warning: string }> | null = null
  // GPS history is durable in IndexedDB. Keep the small sharing cache/outbox
  // below localStorage quotas even during long races.
  const persist = () => localStorage.setItem(key, JSON.stringify({
    state: { ...state, progress: state.progress.map((item) => ({ ...item, session: { ...item.session, telemetry: [] } })) },
    pending: Object.fromEntries(Object.entries(pending).map(([id, item]) => [id, item.kind === 'progress' ? { ...item, value: { ...item.value, telemetry: [] } } : item])),
  }))
  const visibleState = () => {
    const visible = structuredClone(state)
    for (const operation of Object.values(pending)) {
      if (operation.kind === 'catalog') {
        const workspace = visible.workspaces.find((item) => item.id === operation.boatId)
        if (workspace) workspace.catalog = operation.value
      } else {
        visible.progress = [...visible.progress.filter((item) => item.boat_id !== operation.boatId || item.race_id !== operation.raceId), { boat_id: operation.boatId, race_id: operation.raceId, session: operation.value, revision: operation.revision }]
      }
    }
    return visible
  }
  return {
    cached: visibleState,
    hasPending: () => Object.keys(pending).length > 0,
    queueCatalog(catalog: BoatCatalog) {
      const id = `catalog:${catalog.boat.id}`
      pending[id] = { kind: 'catalog', boatId: catalog.boat.id, value: structuredClone(catalog), revision: pending[id]?.revision ?? state.workspaces.find((item) => item.id === catalog.boat.id)?.revision ?? 0 }
      persist()
    },
    queueProgress(boatId: string, session: RaceSession) {
      const id = `progress:${boatId}:${session.raceId}`
      pending[id] = { kind: 'progress', boatId, raceId: session.raceId, value: structuredClone(session), revision: pending[id]?.revision ?? state.progress.find((item) => item.boat_id === boatId && item.race_id === session.raceId)?.revision ?? 0 }
      persist()
    },
    refresh(): Promise<{ state: SharedState; warning: string }> {
      if (inFlight) return inFlight
      inFlight = (async () => {
        if (!supabase || !navigator.onLine) return { state: visibleState(), warning: '' }
        let warning = ''
        for (const [id, operation] of Object.entries(pending)) {
          try {
            if (operation.kind === 'progress') {
              const stored = await createRaceRepository().getCompleteTelemetry(operation.value.id)
              if (stored.length) operation.value.telemetry = stored
            }
            const revision = operation.kind === 'catalog'
              ? await rpc<number>('save_boat_catalog', { p_boat: operation.boatId, p_catalog: operation.value, p_revision: operation.revision })
              : await rpc<number>('save_boat_progress', { p_boat: operation.boatId, p_race: operation.raceId, p_session: operation.value, p_revision: operation.revision })
            if (pending[id] === operation) delete pending[id]
            else if (pending[id]) pending[id].revision = revision
            if (operation.kind === 'catalog') {
              const workspace = state.workspaces.find((item) => item.id === operation.boatId)
              if (workspace) { workspace.revision = revision; workspace.catalog = operation.value }
            } else {
              state.progress = [...state.progress.filter((item) => item.boat_id !== operation.boatId || item.race_id !== operation.raceId), { boat_id: operation.boatId, race_id: operation.raceId, session: operation.value, revision }]
            }
            persist()
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Shared sync failed'
            if (/SHARED_CONFLICT|Only |read-only|cannot be replaced|Choose another shared target|Invalid race progress/.test(message)) {
              // Preserve a recoverable copy before adopting the authoritative state.
              localStorage.setItem(`${key}:conflict:${Date.now()}`, JSON.stringify(pending[id] ?? operation))
              delete pending[id]
              persist()
              warning = 'Shared data changed or navigation was handed over. Loaded the latest boat state; your conflicting edit was kept on this device for recovery.'
            } else throw error
          }
        }
        const results = await Promise.all([
          supabase.from('boat_workspaces').select('*'),
          supabase.from('boat_race_progress').select('*'),
          supabase.from('boat_memberships').select('*'),
        ])
        for (const result of results) if (result.error) throw new Error(result.error.message)
        state = { workspaces: results[0].data as Workspace[], progress: results[1].data as Progress[], members: results[2].data as Member[] }
        persist()
        // Mutations made during the network roundtrip must remain visible.
        return { state: visibleState(), warning }
      })().finally(() => { inFlight = null })
      return inFlight
    },
  }
}
