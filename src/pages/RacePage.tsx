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
  RotateCw,
  Wind,
} from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { Metric } from '../components/Metric'
import { StartLineTiming, StartSequenceControls } from '../components/StartSequenceControls'
import { InstrumentCarousel } from '../components/InstrumentCarousel'
import { distanceNm, initialBearing, intersectSightings, nauticalMilesToMetres, resolveMarkPosition, velocityMadeGood } from '../domain/geo'
import { isStartWaypoint } from '../domain/course'
import { shouldSuggestRounding } from '../domain/rounding'
import { cyca } from '../data/seed'
import { fetchForecast, type ForecastSnapshot } from '../services/weather'

type Props = { now: number; wakeLockStatus: string; onFinish(): void }

export function RacePage({ now, wakeLockStatus, onFinish }: Props) {
  const {
    marks,
    isNavigator,
    race,
    session,
    observations,
    latestReading,
    updateSession,
  } = useApp()
  const [showRounding, setShowRounding] = useState(false)
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(null)
  const [forecast, setForecast] = useState<ForecastSnapshot | null>(null)
  const [showPrestartConfirmation, setShowPrestartConfirmation] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const prestart = session.phase === 'prestart'
  const line = useMemo(() => {
    const startMark = marks.find((mark) => mark.id === race.course.find(isStartWaypoint)?.markId)
    const endpoint = (name: 'pin' | 'committee') => {
      const sightings = observations.filter((item) => item.endpoint === name)
      return sightings.length < 2 ? null : intersectSightings(sightings.at(-2)!, sightings.at(-1)!)
    }
    const pin = (startMark?.position.kind === 'gate' ? startMark.position.pointA : null) ?? endpoint('pin')
    const committee = (startMark?.position.kind === 'gate' ? startMark.position.pointB : null) ?? endpoint('committee')
    return pin && committee ? { pin, committee } : null
  }, [marks, observations, race.course])
  const navigationReading = latestReading ?? session.telemetry.at(-1) ?? null
  const activeWaypoint = race.course[session.activeWaypointIndex]
  const alreadyRounded = Boolean(activeWaypoint && session.roundedAt[activeWaypoint.id] != null)
  const priorWaypoint = race.course[session.activeWaypointIndex - 1]
  const priorMarkPending = Boolean(priorWaypoint && session.roundedAt[priorWaypoint.id] == null)
  const roundingBlocked = !alreadyRounded && priorMarkPending
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
  const wind = forecast?.hours.find((hour) => Math.abs(new Date(hour.time).getTime() - now) < 3600_000) ?? forecast?.hours[0]

  useEffect(() => {
    void fetchForecast(cyca.coordinate).then(setForecast)
  }, [])




  const roundingSuggested = useMemo(
    () => Boolean(target && shouldSuggestRounding(session.telemetry, target)),
    [session.telemetry, target],
  )

  useEffect(() => {
    if (!prestart && roundingSuggested && isNavigator && !alreadyRounded && !roundingBlocked && dismissedSuggestion !== activeWaypoint?.id) setShowRounding(true)
  }, [activeWaypoint?.id, alreadyRounded, dismissedSuggestion, isNavigator, prestart, roundingBlocked, roundingSuggested])

  const undoRounding = async () => {
    if (!activeWaypoint || !isNavigator || !alreadyRounded) return
    const roundedAt = { ...session.roundedAt }
    for (const waypoint of race.course.slice(session.activeWaypointIndex)) {
      delete roundedAt[waypoint.id]
    }
    setDismissedSuggestion(activeWaypoint.id)
    setShowRounding(false)
    await updateSession({ roundedAt })
  }

  const advance = async () => {
    if (!activeWaypoint || !isNavigator || alreadyRounded || roundingBlocked) return
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

  const showCurrentLeg = async () => {
    if (!isNavigator) return
    const index = race.course.findIndex((waypoint) => session.roundedAt[waypoint.id] == null)
    if (index < 0) return
    setShowRounding(false)
    await updateSession({ activeWaypointIndex: index })
  }

  const selectPrevious = async () => {
    if (!isNavigator) return
    setShowRounding(false)
    if (session.activeWaypointIndex === 0) {
      if (!prestart) { setResetError(''); setShowPrestartConfirmation(true) }
      return
    }
    await updateSession({ activeWaypointIndex: session.activeWaypointIndex - 1 })
  }

  const returnToPrestart = async () => {
    if (!isNavigator || resetting) return
    setResetting(true)
    setResetError('')
    try {
      await updateSession({ phase: 'prestart', activeWaypointIndex: 0, autoStartArmed: false, roundedAt: {}, telemetry: [], trackResetAt: Math.max(Date.now(), (session.trackResetAt ?? 0) + 1) })
      setShowRounding(false)
      setDismissedSuggestion(null)
      setShowPrestartConfirmation(false)
    } catch {
      setResetError('Could not reset the race. Please try again.')
    } finally { setResetting(false) }
  }

  const selectNext = async () => {
    if (!isNavigator || session.activeWaypointIndex >= race.course.length - 1) return
    setShowRounding(false)
    await updateSession({ activeWaypointIndex: session.activeWaypointIndex + 1 })
  }

  const metrics = <div className="race-metrics">
    <Metric label="GPS boat speed" value={navigationReading?.speedKnots.toFixed(1) ?? '—'} unit="kn" icon={<Gauge size={15} />} />
    <Metric label="VMG" value={vmg?.toFixed(1) ?? '—'} unit="kn" icon={<ArrowRight size={15} />} />
    <Metric label="Course" value={navigationReading ? Math.round(navigationReading.heading).toString().padStart(3, '0') : '—'} unit="°T" icon={<Compass size={15} />} />
    <div className="race-wind"><Metric label={forecast?.stale ? 'Wind · cached forecast' : 'Wind · forecast'} value={wind ? Math.round(wind.windSpeed).toString() : '—'} unit="kn" icon={<Wind size={15} />} /><span className="race-wind__direction">{wind ? `${Math.round(wind.windDirection).toString().padStart(3, '0')}° T` : 'Unavailable'}</span></div>
  </div>

  return (
    <div className={`race-view race-view--split${prestart ? ' prestart-race-view' : ''}`}>
      <main className="race-main" aria-label={prestart ? 'Pre-start instruments' : 'Race instruments'}>
        <div className="race-instruments">
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
            <button disabled={!isNavigator || (prestart && session.activeWaypointIndex <= 0)} aria-label="Previous mark" onClick={() => void selectPrevious()}><ChevronLeft size={24} /></button>
            <h1>{activeMark?.name ?? 'Course complete'}</h1>
            <button aria-label="Next mark" disabled={!isNavigator || session.activeWaypointIndex >= race.course.length - 1} onClick={() => void selectNext()}><ChevronRight size={24} /></button>
          </div>
          <div className="race-target-vector">
            <div className="race-bearing"><Navigation size={28} /><strong>{bearing == null ? '—' : Math.round(bearing).toString().padStart(3, '0')}°</strong><span>T</span></div>
            <div className="race-distance">{distanceDisplay.value} <span>{distanceDisplay.unit} TO MARK</span></div>
          </div>
          <div className={`race-eta ${etaSeconds == null ? 'race-eta--unavailable' : ''}`}><Clock3 size={14} /> ETA {etaLabel} <span>AT CURRENT VMG</span></div>
          {prestart && <StartLineTiming now={now} line={line} reading={navigationReading} />}
          {!prestart && <div className="race-actions">
            {isNavigator ? <button className="button button--race-next" onClick={() => alreadyRounded ? void undoRounding() : roundingBlocked ? void showCurrentLeg() : setShowRounding(true)}>
              {alreadyRounded ? <RotateCw size={18} /> : roundingBlocked ? <Navigation size={18} /> : <Flag size={18} />} {alreadyRounded ? 'Undo rounding' : roundingBlocked ? 'Show current leg' : activeWaypoint?.role === 'finish' ? 'Finish race' : activeWaypoint?.role === 'start' ? 'Start line crossed' : 'Mark rounded'} {!alreadyRounded && <ChevronRight size={18} />}
            </button> : <p className="crew-following">Following the navigator’s target</p>}
          </div>}
        </section>

        {prestart ? <InstrumentCarousel sync={<StartSequenceControls />} stats={metrics} /> : metrics}
        </div>

        <div className="race-layout">
          <section className="race-map-panel">
            <CoursePlot marks={marks} race={race} current={navigationReading} activeMarkId={activeMark?.id} activeWaypointIndex={session.activeWaypointIndex} line={prestart ? line : undefined} />
            <div className="map-progress">
              {race.course.map((waypoint, index) => (
                <span key={waypoint.id} className={index === session.activeWaypointIndex ? 'active' : session.roundedAt[waypoint.id] != null ? 'done' : ''} />
              ))}
            </div>
          </section>

        </div>
      </main>

      {showRounding && !prestart && !roundingBlocked && !alreadyRounded && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm mark rounding">
          <div className="rounding-modal">
            <div className="rounding-modal__icon"><Flag size={26} /></div>
            <span className="eyebrow">Confirm progression</span>
            <h2>{activeWaypoint?.role === 'finish' ? 'Confirm race finish?' : activeWaypoint?.role === 'start' ? 'Start line crossed?' : `${activeMark?.name} rounded?`}</h2>
            <p>{roundingSuggested ? 'Pin End detected a close approach followed by movement away.' : 'Advance manually if you have completed this rounding.'}</p>
            <div className="rounding-modal__stats">
              <span><strong>{distance?.toFixed(2) ?? '—'} NM</strong>current distance</span>
              <span><strong>±{Math.round(navigationReading?.accuracy ?? 0)} m</strong>GPS accuracy</span>
            </div>
            <button className="button button--orange button--wide" onClick={() => void advance()}><Check size={18} /> Confirm & advance</button>
            <button className="button button--ghost button--wide" onClick={() => { setDismissedSuggestion(activeWaypoint?.id ?? null); setShowRounding(false) }}>Keep current mark</button>
          </div>
        </div>
      )}

      {showPrestartConfirmation && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Return to pre-start?" onKeyDown={(event) => { if (event.key === 'Escape' && !resetting) setShowPrestartConfirmation(false) }}>
        <div className="rounding-modal">
          <div className="rounding-modal__icon"><AlertTriangle size={26} /></div>
          <h2>Return to pre-start?</h2>
          <p>All recorded roundings and the GPS track for this race will be deleted. Your sightings will be kept.</p>
          {resetError && <p className="form-error" role="alert">{resetError}</p>}
          <button className="button button--orange button--wide" disabled={resetting} onClick={() => void returnToPrestart()}>{resetting ? 'Returning…' : 'Delete roundings and track'}</button>
          <button autoFocus className="button button--ghost button--wide" disabled={resetting} onClick={() => setShowPrestartConfirmation(false)}>Keep racing</button>
        </div>
      </div>}

      {wakeLockStatus === 'blocked' && (
        <div className="race-warning"><AlertTriangle size={15} /> Screen lock was blocked by the device. Keep the display active manually.</div>
      )}
    </div>
  )
}
