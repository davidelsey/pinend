import { useEffect, useRef, useState } from 'react'
import { Anchor, CloudOff, Crosshair, LogIn, MapPinned, Radio, Sailboat, Settings, Waves, Wifi } from 'lucide-react'
import { AppProvider, useApp } from './app/AppContext'
import { useDeviceSensors } from './hooks/useDeviceSensors'
import { useWakeLock } from './hooks/useWakeLock'
import { isSupabaseConfigured, signInWithGoogle, supabase } from './services/auth'
import { BoatPage } from './pages/BoatPage'
import { MarksPage } from './pages/MarksPage'
import { PrestartPage } from './pages/PrestartPage'
import { RacePage } from './pages/RacePage'
import { SetupPage } from './pages/SetupPage'

type Tab = 'setup' | 'race' | 'boat' | 'marks'

function LoginPage({ onLocal }: { onLocal(): void }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <main className="login-page">
      <div className="login-brand"><span className="brand-mark"><Crosshair size={32} /></span><strong>PIN END</strong></div>
      <div className="login-card">
        <span className="eyebrow"><Anchor size={14} /> Ready when you are</span>
        <h1>Your race, from shore to finish.</h1>
        <p>Prepare the boat. Build the start line. Race with the information that matters—even when coverage disappears.</p>
        {isSupabaseConfigured ? (
          <button className="button button--google button--wide" onClick={() => void signInWithGoogle().catch((reason: Error) => setError(reason.message))}>
            <LogIn size={18} /> Continue with Google
          </button>
        ) : (
          <button className="button button--orange button--wide" onClick={onLocal}><Sailboat size={18} /> Open local demo</button>
        )}
        {!isSupabaseConfigured && <div className="local-mode"><Settings size={15} /><span>Local development mode</span><small>Add Supabase environment variables later to enable Google login.</small></div>}
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="login-water"><Waves size={96} strokeWidth={0.8} /></div>
    </main>
  )
}

function FinishedPage({ onReset }: { onReset(): void }) {
  const { race, session } = useApp()
  return (
    <div className="finished-page">
      <div className="finished-flag"><Sailboat size={52} /></div>
      <span className="eyebrow">Race complete</span>
      <h1>Finished.</h1>
      <p>{race.series} · {race.name}</p>
      <div className="finish-stats"><span><strong>{race.course.length}</strong> marks</span><span><strong>{session.telemetry.length}</strong> positions</span><span><strong>{Object.keys(session.roundedAt).length}</strong> roundings</span></div>
      <button className="button button--orange" onClick={onReset}>Prepare another race</button>
    </div>
  )
}

function PinEndApp() {
  const { loading, online, session, updateSession, acceptDeviceReading } = useApp()
  const [tab, setTab] = useState<Tab>('race')
  const [now, setNow] = useState(Date.now())
  const automaticStartInFlight = useRef(false)
  const sensors = useDeviceSensors(true)
  const wakeLock = useWakeLock(session.phase === 'prestart' || session.phase === 'racing')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (sensors.reading) acceptDeviceReading(sensors.reading)
  }, [acceptDeviceReading, sensors.reading])

  useEffect(() => {
    if (session.phase === 'setup') setTab('setup')
    if (session.phase === 'prestart' || session.phase === 'racing' || session.phase === 'finished') setTab('race')
  }, [session.phase])

  useEffect(() => {
    if (session.phase !== 'prestart' || session.autoStartArmed === false || now < session.syncedStartTime) {
      automaticStartInFlight.current = false
      return
    }
    if (automaticStartInFlight.current) return
    automaticStartInFlight.current = true
    void updateSession({ phase: 'racing' }).catch(() => {
      automaticStartInFlight.current = false
    })
  }, [now, session.autoStartArmed, session.phase, session.syncedStartTime, updateSession])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [tab, session.phase])

  if (loading) return <div className="loading-screen"><span className="brand-mark"><Crosshair size={28} /></span><strong>Loading race pack…</strong></div>

  const raceContent = session.phase === 'setup'
    ? <SetupPage onEnterPrestart={() => setTab('race')} sensorStatus={sensors.status} onEnableSensors={() => void sensors.requestPermission()} />
    : session.phase === 'prestart'
      ? <PrestartPage now={now} onStartRace={() => void updateSession({ phase: 'racing' })} sensorStatus={sensors.status} onEnableSensors={() => void sensors.requestPermission()} />
      : session.phase === 'racing'
        ? <RacePage now={now} wakeLockStatus={wakeLock.status} onFinish={() => setTab('race')} />
        : <FinishedPage onReset={() => void updateSession({ id: crypto.randomUUID(), phase: 'setup', autoStartArmed: true, activeWaypointIndex: 0, telemetry: [], roundedAt: {} })} />

  const content = tab === 'setup'
    ? <SetupPage onEnterPrestart={() => setTab('race')} sensorStatus={sensors.status} onEnableSensors={() => void sensors.requestPermission()} />
    : tab === 'race' ? raceContent : tab === 'boat' ? <BoatPage /> : <MarksPage />

  const inRace = tab === 'race' && session.phase === 'racing'
  return (
    <div className={`app-shell ${inRace ? 'app-shell--racing' : ''}`}>
      {!inRace && (
        <header className="app-header">
          <button className="app-brand" onClick={() => setTab('race')}><span className="brand-mark"><Crosshair size={21} /></span><strong>PIN END</strong></button>
          <div className="app-header__status">
            <span className={`connection ${online ? '' : 'connection--offline'}`}>{online ? <Wifi size={14} /> : <CloudOff size={14} />}{online ? 'Online' : 'Offline ready'}</span>
            <span className="sensor-mini"><Radio size={14} /> {sensors.status}</span>
          </div>
        </header>
      )}
      <div className="app-content">{content}</div>
      <nav className="bottom-nav" aria-label="Primary navigation">
        <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}><Settings size={20} /><span>Setup</span></button>
        <button className={tab === 'race' ? 'active' : ''} onClick={() => setTab('race')}><Anchor size={20} /><span>Race</span><i className={`phase-indicator phase-indicator--${session.phase}`} /></button>
        <button className={tab === 'boat' ? 'active' : ''} onClick={() => setTab('boat')}><Sailboat size={20} /><span>Boat</span></button>
        <button className={tab === 'marks' ? 'active' : ''} onClick={() => setTab('marks')}><MapPinned size={20} /><span>Marks</span></button>
      </nav>
    </div>
  )
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem('pin-end-local-auth') === 'true')

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setAuthenticated(Boolean(data.session)))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!authenticated) return <LoginPage onLocal={() => { localStorage.setItem('pin-end-local-auth', 'true'); setAuthenticated(true) }} />
  return <AppProvider><PinEndApp /></AppProvider>
}
