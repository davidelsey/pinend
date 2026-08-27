import type { User } from '@supabase/supabase-js'
import { clearRepository, database, exportRepositorySnapshot, importRepositorySnapshot, seedDatabase, type PinEndDatabase, type RepositorySnapshot } from './repository'
import { supabase } from './auth'

const syncDelayMs = 2_000
const cloudOwnerKey = 'pin-end-cloud-owner'
const cloudDirtyKey = 'pin-end-cloud-dirty'
let pendingTimer: number | undefined
let pendingUser: User | null = null
let syncChain = Promise.resolve()

function isRepositorySnapshot(value: unknown): value is RepositorySnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<RepositorySnapshot>
  return snapshot.version === 1
    && Array.isArray(snapshot.marks)
    && Array.isArray(snapshot.boats)
    && Array.isArray(snapshot.sails)
    && Array.isArray(snapshot.races)
    && Array.isArray(snapshot.sessions)
    && Array.isArray(snapshot.observations)
    && Array.isArray(snapshot.crew)
    && Array.isArray(snapshot.telemetry)
}

async function uploadSnapshot(user: User, db: PinEndDatabase): Promise<void> {
  if (!supabase || !navigator.onLine) return
  const data = await exportRepositorySnapshot(db)
  const { error } = await supabase.from('user_app_state').upsert({
    user_id: user.id,
    schema_version: data.version,
    data,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
  localStorage.removeItem(cloudDirtyKey)
}

export async function hydrateCloudState(user: User, db = database): Promise<'downloaded' | 'uploaded' | 'offline'> {
  if (!supabase || !navigator.onLine) return 'offline'
  const previousOwner = localStorage.getItem(cloudOwnerKey)
  if (previousOwner === user.id && localStorage.getItem(cloudDirtyKey) === 'true') {
    await uploadSnapshot(user, db)
    return 'uploaded'
  }
  const { data, error } = await supabase
    .from('user_app_state')
    .select('data')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  if (data?.data && isRepositorySnapshot(data.data)) {
    await importRepositorySnapshot(data.data, db)
    localStorage.setItem(cloudOwnerKey, user.id)
    localStorage.removeItem(cloudDirtyKey)
    return 'downloaded'
  }
  if (previousOwner && previousOwner !== user.id) {
    await clearRepository(db)
    await seedDatabase(db)
  }
  await uploadSnapshot(user, db)
  localStorage.setItem(cloudOwnerKey, user.id)
  return 'uploaded'
}

export function scheduleCloudSync(user: User, db = database): void {
  if (!supabase) return
  localStorage.setItem(cloudOwnerKey, user.id)
  localStorage.setItem(cloudDirtyKey, 'true')
  pendingUser = user
  if (pendingTimer !== undefined) window.clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => {
    const userToSync = pendingUser
    pendingTimer = undefined
    if (!userToSync) return
    syncChain = syncChain
      .catch(() => undefined)
      .then(() => uploadSnapshot(userToSync, db))
      .catch((error: unknown) => console.error('Pin End cloud sync failed', error))
  }, syncDelayMs)
}

export function clearScheduledCloudSync(): void {
  if (pendingTimer !== undefined) window.clearTimeout(pendingTimer)
  pendingTimer = undefined
  pendingUser = null
}
