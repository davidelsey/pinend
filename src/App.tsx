import { useEffect, useRef, useState } from 'react'
import { Anchor, Bug, ChevronLeft, CloudOff, Crosshair, LogIn, LogOut, MoreVertical, Radio, Sailboat, Settings, Waves, Wifi, X } from 'lucide-react'
import { AppProvider, useApp } from './app/AppContext'
import { useDeviceSensors } from './hooks/useDeviceSensors'
import { useWakeLock } from './hooks/useWakeLock'
import { isSupabaseConfigured, signInWithGoogle, signOut, supabase } from './services/auth'
import { isStartWaypoint } from './domain/course'
import { BoatPage } from './pages/BoatPage'
import { MarksPage } from './pages/MarksPage'
import { PrestartPage } from './pages/PrestartPage'
import { RacePage } from './pages/RacePage'
import { SetupPage } from './pages/SetupPage'
import { DebugPage } from './pages/DebugPage'
import { FinishedPage } from './pages/FinishedPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { RacesPage } from './pages/RacesPage'
import { RaceDetailPage } from './pages/RaceDetailPage'
import './boatFlows.css'

type View = 'races' | 'detail' | 'setup' | 'marks' | 'race' | 'boat' | 'debug'

function LoginPage({ onLocal }: { onLocal(demo?: boolean): void }) {
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
          <button className="button button--orange button--wide" onClick={() => onLocal(true)}><Sailboat size={18} /> Open local demo</button>
        )}
        {!isSupabaseConfigured && <button className="button button--secondary button--wide" onClick={() => onLocal(false)}>Create local workspace</button>}
        {!isSupabaseConfigured && <div className="local-mode"><Settings size={15} /><span>Local development mode</span><small>Add Supabase environment variables later to enable Google login.</small></div>}
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="login-water"><Waves size={96} strokeWidth={0.8} /></div>
    </main>
  )
}

function PinEndApp() {
  const { loading, online, error, clearError, boats, boat, selectBoat, race, session, updateSession, acceptDeviceReading, isNavigator, canManage, syncStatus, recordLatestReading, latestReading, refreshSharing } = useApp()
  const [view, setView] = useState<View>('races')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [addingBoat, setAddingBoat] = useState(Boolean(localStorage.getItem('pin-end-invite')))
  const [now, setNow] = useState(Date.now())
  const automaticStartInFlight = useRef(false)
  const sensors = useDeviceSensors(true)
  const active = race.boatId === boat.id && (session.phase === 'prestart' || session.phase === 'racing')
  const wakeLock = useWakeLock(active && view === 'race')
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer) }, [])
  useEffect(() => { if (sensors.reading) acceptDeviceReading(sensors.reading) }, [acceptDeviceReading, sensors.reading])
  useEffect(() => {
    if (active && isNavigator) void recordLatestReading().catch(() => undefined)
  }, [active, isNavigator, latestReading, recordLatestReading])
  useEffect(() => {
    if (!active || !isNavigator || session.phase !== 'prestart' || session.autoStartArmed === false || now < session.syncedStartTime) { automaticStartInFlight.current = false; return }
    if (automaticStartInFlight.current) return
    automaticStartInFlight.current = true
    void updateSession({ phase: 'racing', activeWaypointIndex: Math.max(0, race.course.findIndex((waypoint) => !isStartWaypoint(waypoint))) }).catch(() => { automaticStartInFlight.current = false })
  }, [active, isNavigator, now, race.course, session.autoStartArmed, session.phase, session.syncedStartTime, updateSession])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [view])
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [menuOpen])
  if (loading) return <div className="loading-screen"><span className="brand-mark"><Crosshair size={28} /></span><strong>Loading your boats…</strong></div>
  const onboarding = boats.length === 0 || addingBoat
  const inRace = view === 'race' && active && !onboarding
  const navigate = (next: View) => { setMenuOpen(false); setView(next) }
  const pageTitle = onboarding ? 'Add / join boat' : view === 'marks' ? 'Race marks' : view === 'races' ? 'Races' : view === 'boat' ? 'Boat' : view === 'debug' ? 'Debug' : view === 'setup' ? 'Race setup' : race.name
  const openDetail = () => setView('detail')
  const finish = <FinishedPage onReset={() => setView('races')} />
  const raceContent = session.phase === 'finished' ? finish : session.phase === 'setup'
    ? <main className="page"><section className="panel waiting-navigator"><Radio size={32} /><h1>Waiting for the navigator</h1><p>The navigator hasn’t selected a target yet. Your screen will follow as soon as the race is ready.</p><button className="button button--secondary" onClick={openDetail}>Back to race</button></section></main>
    : session.phase === 'prestart'
      ? <PrestartPage now={now} onStartRace={() => void updateSession({ phase: 'racing', syncedStartTime: Date.now(), activeWaypointIndex: Math.max(0, race.course.findIndex((waypoint) => !isStartWaypoint(waypoint))) })} sensorStatus={sensors.status} onEnableSensors={() => void sensors.requestPermission()} wakeLockStatus={wakeLock.status} />
      : <RacePage now={now} wakeLockStatus={wakeLock.status} onFinish={() => setView('race')} />
  const content = onboarding ? <OnboardingPage onDone={() => { setAddingBoat(false); setView('races') }} onCancel={boats.length ? () => { setAddingBoat(false); localStorage.removeItem('pin-end-invite') } : undefined} />
    : view === 'races' ? <RacesPage onOpen={openDetail} onCreate={() => setView('marks')} />
    : view === 'detail' ? session.phase === 'finished' ? finish : <RaceDetailPage key={race.id} onEdit={() => setView('marks')} onPrepare={() => setView('setup')} onEnter={() => setView('race')} />
    : view === 'setup' && canManage ? <SetupPage onConfirmCourse={() => setView('marks')} sensorStatus={sensors.status} onEnableSensors={() => void sensors.requestPermission()} />
    : view === 'marks' && canManage ? <MarksPage onEnterPrestart={openDetail} />
    : view === 'boat' ? <BoatPage key={boat.id} />
    : view === 'debug' && import.meta.env.DEV ? <DebugPage /> : raceContent
  return <div className={`app-shell ${inRace ? 'app-shell--racing' : ''} ${view === 'marks' && canManage && !onboarding ? 'app-shell--marks' : ''}`}>
    <header className="app-header app-header--simple">
      <button className="icon-button" aria-label="Back" disabled={(!onboarding && view === 'races') || (onboarding && !boats.length)} onClick={() => { if (onboarding) { setAddingBoat(false); localStorage.removeItem('pin-end-invite') } navigate(view === 'marks' || view === 'setup' ? 'detail' : 'races') }}><ChevronLeft size={22} /></button>
      <h1 className="app-page-title">{pageTitle}</h1>
      <div className="app-overflow" ref={menuRef}>
      <button className="icon-button" aria-label="More options" aria-expanded={menuOpen} aria-controls="app-options" onClick={() => setMenuOpen(!menuOpen)}><MoreVertical size={22} /></button>
      {menuOpen && <div className="app-options" id="app-options">
      {!onboarding && <label className="header-boat-picker"><span className="sr-only">Switch boat</span><select value={boat.id} onChange={(event) => { setMenuOpen(false); if (event.target.value === '__add') setAddingBoat(true); else { selectBoat(event.target.value); setView('races') } }}>
        {boats.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__add">＋ Add / join boat</option>
      </select></label>}
      {!onboarding && <nav aria-label="Primary navigation"><button onClick={() => navigate('races')}><Anchor size={18} /> Races</button><button onClick={() => navigate('boat')}><Sailboat size={18} /> Boat</button>{import.meta.env.DEV && <button onClick={() => navigate('debug')}><Bug size={18} /> Debug</button>}</nav>}
      <div className="app-header__status"><span className={`connection ${online ? '' : 'connection--offline'}`}>{online ? <Wifi size={14} /> : <CloudOff size={14} />}{online ? 'Online' : 'Offline'}</span>{supabase && <button className="icon-button" aria-label="Sign out" onClick={() => void signOut()}><LogOut size={16} /></button>}</div>
      <small>{view === 'race' ? isNavigator ? 'You are navigating · ' : 'Following navigator · ' : ''}{syncStatus}</small>
      </div>}
      </div>
    </header>
    {error && <div className="app-alert" role="alert"><span>{error}</span><button onClick={() => void refreshSharing()}>Retry sync</button><button aria-label="Dismiss message" onClick={clearError}><X size={18} /></button></div>}
    <div className="app-content">{content}</div>
  </div>
}

export default function App() {
  const [identity, setIdentity] = useState<string | null>(() => !supabase && localStorage.getItem('pin-end-local-auth') === 'true' ? 'local' : null)
  useEffect(() => {
    const invite = new URL(window.location.href).searchParams.get('invite')
    if (invite) { localStorage.setItem('pin-end-invite', invite); window.history.replaceState({}, '', window.location.pathname) }
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setIdentity(data.session?.user.id ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setIdentity(session?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!identity) return <LoginPage onLocal={(demo = true) => { localStorage.setItem('pin-end-local-auth', 'true'); localStorage.setItem('pin-end-empty', String(!demo)); setIdentity('local') }} />
  return <AppProvider key={identity}><PinEndApp /></AppProvider>
}
