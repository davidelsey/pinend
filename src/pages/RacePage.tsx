import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Gauge,
  Navigation,
  Radio,
  RotateCw,
  Sailboat,
  Shield,
  Wind,
} from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { DevSimulator } from '../components/DevSimulator'
import { Metric } from '../components/Metric'
import { formatCountdown } from '../domain/countdown'
import { distanceNm, initialBearing, nauticalMilesToMetres, resolveMarkPosition, velocityMadeGood } from '../domain/geo'
import { shouldSuggestRounding } from '../domain/rounding'
import { cyca } from '../data/seed'
import { fetchForecast, fetchMarineForecast, type ForecastSnapshot, type MarineSnapshot } from '../services/weather'

type Props = { now: number; wakeLockStatus: string; onFinish(): void }

export function RacePage({ now, wakeLockStatus, onFinish }: Props) {
  const {
    marks,
    race,
    session,
    latestReading,
    simulatorEnabled,
    stepSimulator,
    recordLatestReading,
    updateSession,
  } = useApp()
  const [showRounding, setShowRounding] = useState(false)
  const [showPrestartWarning, setShowPrestartWarning] = useState(false)
  const [forecast, setForecast] = useState<ForecastSnapshot | null>(null)
  const [marine, setMarine] = useState<MarineSnapshot | null>(null)
  const navigationReading = latestReading ?? session.telemetry.at(-1) ?? null
  const activeWaypoint = race.course[session.activeWaypointIndex]
  const activeMark = marks.find((mark) => mark.id === activeWaypoint?.markId)
  const target = activeMark ? resolveMarkPosition(activeMark.position) : undefined
  const distance = navigationReading && target ? distanceNm(navigationReading, target) : null
  const distanceDisplay = distance == null
    ? { value: '—', unit: 'NM' }
    : distance < 1
      ? { value: String(Math.round(nauticalMilesToMetres(distance))), unit: 'M' }
      : { value: distance.toFixed(1), unit: 'NM' }
  const bearing = navigationReading && target ? initialBearing(navigationReading, target) : null
  const vmg = navigationReading && bearing != null
    ? velocityMadeGood(navigationReading.speedKnots, navigationReading.heading, bearing)
    : null
  const etaSeconds = distance != null && vmg != null && vmg > 0.1 ? (distance / vmg) * 3600 : null
  const etaLabel = etaSeconds == null
    ? 'No closing VMG'
    : etaSeconds >= 3600
      ? `${Math.floor(etaSeconds / 3600)}h ${Math.round((etaSeconds % 3600) / 60)}m`
      : `${Math.floor(etaSeconds / 60)}m ${Math.round(etaSeconds % 60)}s`
  const elapsed = now - session.syncedStartTime

  useEffect(() => {
    void fetchForecast(cyca.coordinate).then(setForecast)
    void fetchMarineForecast(cyca.coordinate).then(setMarine)
  }, [])

  useEffect(() => {
    if (!simulatorEnabled) return
    const interval = window.setInterval(() => stepSimulator(1), 1000)
    return () => window.clearInterval(interval)
  }, [simulatorEnabled, stepSimulator])

  useEffect(() => {
    if (session.phase === 'racing') void recordLatestReading()
  }, [latestReading, recordLatestReading, session.phase])

  const roundingSuggested = useMemo(
    () => Boolean(target && shouldSuggestRounding(session.telemetry, target)),
    [session.telemetry, target],
  )

  useEffect(() => {
    if (roundingSuggested) setShowRounding(true)
  }, [roundingSuggested])

  const advance = async () => {
    if (!activeWaypoint) return
    const nextIndex = session.activeWaypointIndex + 1
    if (nextIndex >= race.course.length) {
      await updateSession({ phase: 'finished', roundedAt: { ...session.roundedAt, [activeWaypoint.id]: Date.now() } })
      onFinish()
      return
    }
    await updateSession({
      activeWaypointIndex: nextIndex,
      roundedAt: { ...session.roundedAt, [activeWaypoint.id]: Date.now() },
    })
    setShowRounding(false)
  }

  const selectPrevious = async () => {
    setShowRounding(false)
    if (session.activeWaypointIndex === 0) {
      setShowPrestartWarning(true)
      return
    }
    await updateSession({ activeWaypointIndex: session.activeWaypointIndex - 1 })
  }

  const returnToPrestart = async () => {
    await updateSession({
      phase: 'prestart',
      syncedStartTime: Date.parse(race.scheduledStart),
      autoStartArmed: false,
      activeWaypointIndex: 0,
      telemetry: [],
      roundedAt: {},
    })
    setShowPrestartWarning(false)
  }

  const selectNext = async () => {
    if (session.activeWaypointIndex >= race.course.length - 1) return
    setShowRounding(false)
    await updateSession({ activeWaypointIndex: session.activeWaypointIndex + 1 })
  }

  return (
    <div className="race-view">
      <header className="race-header">
        <div className="race-header__live"><span className="live-dot" /> RACING</div>
        <div className="race-header__title"><strong>{race.name}</strong><span>{race.fleet}</span></div>
        <div className="race-header__elapsed"><Clock3 size={14} /> {formatCountdown(-elapsed)}</div>
      </header>

      <main className="race-main">
        <section className="race-focus">
          <div className="race-focus__topline">
            <span>LEG {session.activeWaypointIndex + 1} OF {race.course.length}</span>
            <span className={`rounding-instruction rounding-instruction--${activeWaypoint?.rounding}`}>
              {activeWaypoint?.rounding === 'port'
                ? <CornerUpLeft size={14} role="img" aria-label="Port rounding" />
                : activeWaypoint?.rounding === 'starboard'
                  ? <CornerUpRight size={14} role="img" aria-label="Starboard rounding" />
                  : <RotateCw size={14} role="img" aria-label="Either rounding" />}
              Leave to {activeWaypoint?.rounding}
            </span>
          </div>
          <div className="race-mark-selector">
            <button aria-label="Previous mark" onClick={() => void selectPrevious()}><ChevronLeft size={24} /></button>
            <h1>{activeMark?.name ?? 'Course complete'}</h1>
            <button aria-label="Next mark" disabled={session.activeWaypointIndex >= race.course.length - 1} onClick={() => void selectNext()}><ChevronRight size={24} /></button>
          </div>
          <div className="race-bearing"><Navigation size={28} /><strong>{bearing == null ? '—' : Math.round(bearing).toString().padStart(3, '0')}°</strong><span>T</span></div>
          <div className="race-distance">{distanceDisplay.value} <span>{distanceDisplay.unit} TO MARK</span></div>
          <div className={`race-eta ${etaSeconds == null ? 'race-eta--unavailable' : ''}`}><Clock3 size={14} /> ETA {etaLabel} <span>AT CURRENT VMG</span></div>
        </section>

        <div className="race-metrics">
          <Metric label="GPS boat speed" value={navigationReading?.speedKnots.toFixed(1) ?? '—'} unit="kn" icon={<Gauge size={15} />} />
          <Metric label="VMG" value={vmg?.toFixed(1) ?? '—'} unit="kn" icon={<ArrowRight size={15} />} />
          <Metric label="Course" value={navigationReading ? Math.round(navigationReading.heading).toString().padStart(3, '0') : '—'} unit="°T" icon={<Compass size={15} />} />
          <Metric label="Accuracy" value={navigationReading ? Math.round(navigationReading.accuracy).toString() : '—'} unit="m" icon={<Radio size={15} />} />
        </div>

        <div className="race-layout">
          <section className="race-map-panel">
            <CoursePlot marks={marks} race={race} current={navigationReading} activeMarkId={activeMark?.id} />
            <div className="map-progress">
              {race.course.map((waypoint, index) => (
                <span key={waypoint.id} className={index < session.activeWaypointIndex ? 'done' : index === session.activeWaypointIndex ? 'active' : ''} />
              ))}
            </div>
          </section>

          <aside className="race-sidebar">
            <section className="race-info-card">
              <div><Wind size={18} /><span>Forecast wind</span><strong>{forecast?.hours[0] ? `${Math.round(forecast.hours[0].windDirection).toString().padStart(3, '0')}° T · ${Math.round(forecast.hours[0].windSpeed)} kn` : 'Unavailable'}</strong></div>
              <div><Navigation size={18} /><span>Model current</span><strong>{marine?.currentKnots != null && marine.currentDirection != null ? `${marine.currentKnots.toFixed(1)} kn · ${Math.round(marine.currentDirection).toString().padStart(3, '0')}° T` : 'Unavailable'}</strong></div>
              <small>{forecast?.stale || marine?.stale ? 'Cached data' : 'Latest downloaded data'} · advisory only</small>
            </section>
            <section className="race-info-card system-status">
              <div><Shield size={18} /><span>Offline race pack</span><strong>Ready</strong></div>
              <div><Sailboat size={18} /><span>Screen awake</span><strong>{wakeLockStatus}</strong></div>
              <div><Radio size={18} /><span>Sensor source</span><strong>{latestReading?.source ?? (navigationReading ? 'last saved fix' : 'waiting')}</strong></div>
            </section>
            <DevSimulator target={target} />
          </aside>
        </div>

        <div className="race-actions">
          <button className="button button--race-next" onClick={() => setShowRounding(true)}>
            <Flag size={18} /> Mark rounded <ChevronRight size={18} />
          </button>
        </div>
      </main>

      {showRounding && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm mark rounding">
          <div className="rounding-modal">
            <div className="rounding-modal__icon"><Flag size={26} /></div>
            <span className="eyebrow">Confirm progression</span>
            <h2>{activeMark?.name} rounded?</h2>
            <p>{roundingSuggested ? 'Pin End detected a close approach followed by movement away.' : 'Advance manually if you have completed this rounding.'}</p>
            <div className="rounding-modal__stats">
              <span><strong>{distance?.toFixed(2) ?? '—'} NM</strong>current distance</span>
              <span><strong>±{Math.round(navigationReading?.accuracy ?? 0)} m</strong>GPS accuracy</span>
            </div>
            <button className="button button--orange button--wide" onClick={() => void advance()}><Check size={18} /> Confirm & advance</button>
            <button className="button button--ghost button--wide" onClick={() => setShowRounding(false)}>Keep current mark</button>
          </div>
        </div>
      )}

      {showPrestartWarning && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Return to pre-start?">
          <div className="rounding-modal">
            <div className="rounding-modal__icon"><AlertTriangle size={26} /></div>
            <span className="eyebrow">Reset race timing</span>
            <h2>Return to pre-start?</h2>
            <p>This will clear all timing data for this race.</p>
            <button className="button button--orange button--wide" onClick={() => void returnToPrestart()}>Clear timing &amp; enter pre-start</button>
            <button className="button button--ghost button--wide" onClick={() => setShowPrestartWarning(false)}>Stay in race</button>
          </div>
        </div>
      )}

      {wakeLockStatus === 'blocked' && (
        <div className="race-warning"><AlertTriangle size={15} /> Screen lock was blocked by the device. Keep the display active manually.</div>
      )}
    </div>
  )
}
