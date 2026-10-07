import { useState } from 'react'
import { ArrowRight, MapPinned, Navigation } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { isStartWaypoint, isFinishWaypoint } from '../domain/course'

export function RaceDetailPage({ onEdit, onPrepare, onEnter }: { onEdit(): void; onPrepare(): void; onEnter(): void }) {
  const { race, session, marks, canManage, isNavigator, enterRace, access } = useApp()
  const [choosing, setChoosing] = useState(false)
  const [target, setTarget] = useState(session.activeWaypointIndex)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = session.phase === 'prestart' || session.phase === 'racing'
  const navigatorName = access?.members.find((member) => member.userId === access.navigatorId)?.name ?? 'The navigator'
  const waypointLabel = (index: number) => {
    const waypoint = race.course[index]
    if (!waypoint) return 'No target selected'
    const mark = marks.find((item) => item.id === waypoint.markId)
    return `${isStartWaypoint(waypoint) ? 'Start' : isFinishWaypoint(waypoint) ? 'Finish' : `Mark ${index}`} · ${mark?.name ?? 'Unpositioned mark'}`
  }
  return <main className="page race-detail"><section className="page-title"><span className="eyebrow">{race.series} · {race.fleet}</span><h1>{race.name}</h1><p>{new Date(race.scheduledStart).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</p></section><section className="panel race-detail-map"><CoursePlot race={race} marks={marks} activeMarkId={active ? race.course[session.activeWaypointIndex]?.markId : undefined} /></section>
    <div className="race-detail-grid"><section className="panel"><div className="panel__heading"><h2>Course</h2>{canManage && <button className="button button--secondary" onClick={onEdit}><MapPinned size={16} /> Edit course</button>}</div><ol className="course-overview">{race.course.map((waypoint, index) => <li key={waypoint.id}><span className={active && session.activeWaypointIndex === index ? 'target-dot target-dot--active' : 'target-dot'}>{index + 1}</span><strong>{waypointLabel(index)}</strong><small>{waypoint.rounding === 'either' ? 'Cross line' : `Leave to ${waypoint.rounding}`}</small></li>)}</ol></section>
    <section className="panel race-entry-panel"><Navigation /><h2>{active ? 'Pick up where you are.' : 'Ready when you are.'}</h2><p>{isNavigator ? 'You’re navigating. Your target and rounding updates appear on every crew screen.' : `${navigatorName} controls the shared target. Your screen follows automatically.`}</p>{active && <p className="shared-target"><strong>Shared target</strong>{waypointLabel(session.activeWaypointIndex)}</p>}<button className="button button--primary button--wide" onClick={() => active || !isNavigator ? onEnter() : setChoosing(true)}>{active ? 'Resume race' : 'Enter race mode'}<ArrowRight size={18} /></button>{isNavigator && active && <button className="text-button" onClick={() => setChoosing(true)}>Change shared target</button>}{canManage && <button className="button button--secondary button--wide" onClick={onPrepare}>Race details & preparation</button>}</section></div>
    {choosing && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Select shared target"><form className="form-modal" onSubmit={(event) => { event.preventDefault(); setBusy(true); void enterRace(target).then(onEnter).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)) }}><span className="eyebrow">Navigator control</span><h2>Which mark are you heading to?</h2><p>Every crew screen will follow this selection. Existing timing and track are kept.</p><div className="target-options">{race.course.map((waypoint, index) => <label key={waypoint.id}><input type="radio" name="target" checked={target === index} onChange={() => setTarget(index)} /><span>{waypointLabel(index)}</span></label>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--primary button--wide" disabled={busy}>Navigate to this target</button><button type="button" className="text-button" onClick={() => setChoosing(false)}>Cancel</button></form></div>}
  </main>
}
