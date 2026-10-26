import process from 'node:process'
import { loadConfigFromFile, loadEnv } from 'vite'

const root = process.cwd()
const env = loadEnv('development', root, 'VITE_')
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, undefined, root, 'silent')
const expected = new URL(process.argv[2] ?? `http://localhost:${loaded?.config.server?.port ?? 5173}`).origin
if (!env.VITE_SUPABASE_URL) throw new Error('Set VITE_SUPABASE_URL before checking the auth redirect')

// Exercise Supabase's real callback selection by cancelling a fresh OAuth flow.
// This does not sign in, contact Google, or use an account's credentials.
const authorize = new URL('/auth/v1/authorize', env.VITE_SUPABASE_URL)
authorize.searchParams.set('provider', 'google')
authorize.searchParams.set('redirect_to', expected)
const authorization = await fetch(authorize, { redirect: 'manual' })
const providerLocation = authorization.headers.get('location')
if (!providerLocation) throw new Error(`OAuth authorization returned ${authorization.status} without a redirect`)
const state = new URL(providerLocation).searchParams.get('state')
if (!state) throw new Error('OAuth authorization did not return a state parameter')

const callback = new URL('/auth/v1/callback', env.VITE_SUPABASE_URL)
callback.searchParams.set('state', state)
callback.searchParams.set('error', 'access_denied')
callback.searchParams.set('error_description', 'Redirect destination check')
const cookie = authorization.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
const response = await fetch(callback, { redirect: 'manual', headers: cookie ? { cookie } : {} })
const destination = response.headers.get('location')
const actual = destination ? new URL(destination).origin : null
if (actual !== expected) throw new Error(`Expected login to return to ${expected}; Supabase returned ${actual ?? `HTTP ${response.status}`}`)
console.log(`PASS: Supabase returns login to ${expected}`)
