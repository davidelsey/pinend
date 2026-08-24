import { useMemo, useState } from 'react'
import { Camera, Check, ChevronRight, Copy, CornerUpLeft, CornerUpRight, Crosshair, GripVertical, LockKeyhole, MapPinned, MapPin, Plus, Ruler, Trash2 } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { FullScreenMarkMapEditor } from '../components/FullScreenMarkMapEditor'
import { FullScreenLineMapEditor } from '../components/FullScreenLineMapEditor'
import { MapPointPicker } from '../components/MapPointPicker'
import { SightMarksDialog, type SightTargetRef } from '../components/SightMarksDialog'
import { intersectSightings, resolveMarkPosition, withManualMarkCoordinate, withSightingMarkCoordinate, withoutSightingMarkCoordinate } from '../domain/geo'
import type { BearingReference, CourseWaypoint, LineObservation, Mark } from '../domain/types'
import { isFinishWaypoint, isStartWaypoint } from '../domain/course'

type Props = { onEnterPrestart(): void }
type View = 'course' | 'marks'
type CourseDrag = { waypointId: string; mode: 'move' | 'duplicate' }

function MarkRow({ mark, waypoint, isFinish = false, finishLinked = false, onFinishLinked, onPosition, onSight, onRounding, onRemove }: { mark: Mark; waypoint?: CourseWaypoint; isFinish?: boolean; finishLinked?: boolean; onFinishLinked?(linked: boolean): void; onPosition(mark: Mark): void; onSight(mark: Mark): void; onRounding?(rounding: CourseWaypoint['rounding']): void; onRemove?(): void }) {
  const coordinate = resolveMarkPosition(mark.position)
  return (
    <article className={`race-mark-row ${waypoint ? 'race-mark-row--course' : ''}`}>
      <div className={`mark-card__icon mark-card__icon--${mark.position.kind}`}><MapPin size={19} /></div>
      <div className="race-mark-row__main">
        <strong>{mark.name}</strong>
        <span>{mark.position.kind === 'gate' ? 'Two-point gate' : waypoint ? `Round to ${waypoint.rounding}` : `${mark.position.kind} mark`}</span>
        <small>{isFinish && finishLinked ? 'Locked to the start gate' : coordinate ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}` : mark.position.kind === 'gate' ? 'Position or sight both Pin and Boat ends' : 'Position required for this race'}</small>
      </div>
      {waypoint && mark.position.kind !== 'gate' && <div className="course-mark-controls" role="radiogroup" aria-label={`Rounding for ${mark.name}`}>
        <label className={`rounding-arrow rounding-arrow--port ${waypoint.rounding === 'port' ? 'is-selected' : ''}`}><input type="radio" name={`rounding-${waypoint.id}`} aria-label={`Round ${mark.name} to port`} checked={waypoint.rounding === 'port'} onChange={() => onRounding?.('port')} /><CornerUpLeft size={20} /></label>
        <label className={`rounding-arrow rounding-arrow--starboard ${waypoint.rounding === 'starboard' ? 'is-selected' : ''}`}><input type="radio" name={`rounding-${waypoint.id}`} aria-label={`Round ${mark.name} to starboard`} checked={waypoint.rounding === 'starboard'} onChange={() => onRounding?.('starboard')} /><CornerUpRight size={20} /></label>
        {onRemove && <button className="course-mark-remove" aria-label={`Remove ${mark.name}`} onClick={onRemove}><Trash2 size={18} /></button>}
      </div>}
      {waypoint && mark.position.kind === 'gate' && onRemove && <div className="course-mark-controls"><button className="course-mark-remove" aria-label={`Remove ${mark.name}`} onClick={onRemove}><Trash2 size={18} /></button></div>}
      {isFinish && onFinishLinked && <div className="gate-link-mode" role="radiogroup" aria-label="Finish line location"><label className={finishLinked ? 'is-selected' : ''}><input type="radio" name="finish-line-location" checked={finishLinked} onChange={() => onFinishLinked(true)} />Same as start</label><label className={!finishLinked ? 'is-selected' : ''}><input type="radio" name="finish-line-location" checked={!finishLinked} onChange={() => onFinishLinked(false)} />Separate</label></div>}
      <div className="race-mark-row__actions">
        <button className="button button--secondary" disabled={isFinish && finishLinked} aria-label={`Position ${mark.name}`} onClick={() => onPosition(mark)}><MapPinned size={16} /> Position</button>
        {mark.position.kind !== 'fixed' && <button className="button button--primary" disabled={isFinish && finishLinked} aria-label={`Sight ${mark.name}`} onClick={() => onSight(mark)}><Camera size={16} /> Sight</button>}
      </div>
    </article>
  )
}

export function MarksPage({ onEnterPrestart }: Props) {
  const { marks, race, session, observations, latestReading, updateSession, saveMark, mutateRace, deleteObservation } = useApp()
  const [view, setView] = useState<View>('course')
  const [newMarkId, setNewMarkId] = useState(marks.find((mark) => mark.name !== 'Start line' && mark.name !== 'Finish line')?.id ?? '')
  const [courseDrag, setCourseDrag] = useState<CourseDrag | null>(null)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [showMarkForm, setShowMarkForm] = useState(false)
  const [markKind, setMarkKind] = useState<Mark['position']['kind']>('fixed')
  const [markName, setMarkName] = useState('')
  const [markCoordinate, setMarkCoordinate] = useState({ latitude: -33.86, longitude: 151.24 })
  const [lineEndCoordinate, setLineEndCoordinate] = useState({ latitude: -33.86, longitude: 151.241 })
  const [markDistance, setMarkDistance] = useState(1)
  const [markBearing, setMarkBearing] = useState(0)
  const [bearingReference, setBearingReference] = useState<BearingReference>('true')
  const [declination, setDeclination] = useState(12.8)
  const [positionMark, setPositionMark] = useState<Mark | null>(null)
  const [sightTarget, setSightTarget] = useState<SightTargetRef | null>(null)
  const raceMarks = useMemo(() => race.course.reduce<Mark[]>((unique, waypoint) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    return mark && !unique.some((item) => item.id === mark.id) ? [...unique, mark] : unique
  }, []), [marks, race.course])
  const startWaypoint = race.course.find(isStartWaypoint)
  const finishWaypoint = race.course.find(isFinishWaypoint)
  const finishLine = marks.find((mark) => mark.id === finishWaypoint?.markId)
  const finishLinked = finishLine?.position.kind === 'gate' && finishLine.position.linkedToMarkId === startWaypoint?.markId

  const setFinishLinked = async (linked: boolean) => {
    const start = marks.find((mark) => mark.id === startWaypoint?.markId)
    const finish = marks.find((mark) => mark.id === finishWaypoint?.markId)
    if (start?.position.kind !== 'gate' || finish?.position.kind !== 'gate') return
    const position = { ...finish.position, pointA: linked ? start.position.pointA : finish.position.pointA ?? start.position.pointA, pointB: linked ? start.position.pointB : finish.position.pointB ?? start.position.pointB, linkedToMarkId: linked ? start.id : undefined }
    await saveMark({ ...finish, position })
  }

  const enterPrestart = async () => {
    await updateSession({ phase: 'prestart', syncedStartTime: Date.parse(race.scheduledStart), autoStartArmed: true })
    onEnterPrestart()
  }

  const moveWaypoint = (waypointId: string, targetIndex: number) => {
    void mutateRace((current) => {
      const sourceIndex = current.course.findIndex((item) => item.id === waypointId)
      const safeTargetIndex = Math.min(current.course.length - 2, Math.max(1, targetIndex))
      if (sourceIndex < 0 || safeTargetIndex < 0 || safeTargetIndex >= current.course.length || sourceIndex === safeTargetIndex) return current
      const course = [...current.course]
      const [waypoint] = course.splice(sourceIndex, 1)
      course.splice(safeTargetIndex, 0, waypoint)
      return { ...current, course }
    })
  }

  const waypointAtPointer = (clientX: number, clientY: number) =>
    document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-waypoint-id]')?.dataset.waypointId

  const finishWaypointDrag = (drag: CourseDrag, clientX: number, clientY: number) => {
    const targetId = waypointAtPointer(clientX, clientY) ?? dragTargetId
    const targetIndex = race.course.findIndex((item) => item.id === targetId)
    if (drag.mode === 'move') moveWaypoint(drag.waypointId, targetIndex)
    else if (targetId !== drag.waypointId) {
      const waypoint = race.course.find((item) => item.id === drag.waypointId)
      if (waypoint && targetIndex >= 0) duplicateWaypoint(waypoint, targetIndex)
    }
    setCourseDrag(null)
    setDragTargetId(null)
  }

  const duplicateWaypoint = (waypoint: CourseWaypoint, insertIndex: number) => {
    void mutateRace((current) => {
      const source = current.course.find((item) => item.id === waypoint.id) ?? waypoint
      const course = [...current.course]
      course.splice(Math.min(course.length - 1, Math.max(1, insertIndex)), 0, { ...source, id: crypto.randomUUID() })
      return { ...current, course }
    })
  }

  const discardMarkObservation = async (observation: LineObservation) => {
    await deleteObservation(observation.id)
    const markId = observation.endpoint === 'mark' ? observation.markId : 'start-line'
    if (!markId) return
    const mark = marks.find((item) => item.id === markId)
    if (!mark) return
    const remaining = observations.filter((item) => item.id !== observation.id && item.endpoint === observation.endpoint && item.markId === observation.markId && item.markPoint === observation.markPoint)
    if (mark.position.kind === 'gate') {
      const coordinate = remaining.length >= 2 ? intersectSightings(remaining.at(-2)!, remaining.at(-1)!) ?? undefined : undefined
      await saveMark({ ...mark, position: observation.endpoint === 'committee' || observation.markPoint === 'b' ? { ...mark.position, pointB: coordinate } : { ...mark.position, pointA: coordinate } })
      return
    }
    let position = withoutSightingMarkCoordinate(mark.position)
    if (remaining.length >= 2) {
      const coordinate = intersectSightings(remaining.at(-2)!, remaining.at(-1)!)
      if (coordinate) position = withSightingMarkCoordinate(position, coordinate)
    }
    await saveMark({ ...mark, position })
  }

  const createMark = async () => {
    const name = markName.trim()
    if (!name) return
    const mark: Mark = {
      id: crypto.randomUUID(),
      name,
      shortName: name.slice(0, 7).toUpperCase(),
      provenance: 'personal',
      position: markKind === 'fixed'
        ? { kind: 'fixed', coordinate: markCoordinate }
        : markKind === 'variable'
          ? { kind: 'variable' }
          : markKind === 'gate'
            ? { kind: 'gate', pointA: markCoordinate, pointB: lineEndCoordinate, labels: ['Pin', 'Boat'] }
            : { kind: 'constructed', origin: markCoordinate, distanceNm: markDistance, bearing: { degrees: markBearing, reference: bearingReference, declination: bearingReference === 'magnetic' ? declination : undefined } },
    }
    await saveMark(mark)
    await mutateRace((current) => ({ ...current, course: [...current.course, { id: crypto.randomUUID(), markId: mark.id, rounding: 'port', role: 'mark' }] }))
    setMarkName('')
    setShowMarkForm(false)
  }

  const addMarkToCourse = async () => {
    const source = marks.find((mark) => mark.id === newMarkId)
    if (!source) return
    const reusablePosition: Mark['position'] = source.position.kind === 'variable'
      ? { kind: 'variable' }
      : source.position.kind === 'gate'
        ? { kind: 'gate', labels: source.position.labels }
        : source.position.kind === 'constructed'
          ? { kind: 'constructed', origin: source.position.origin, distanceNm: source.position.distanceNm, bearing: { ...source.position.bearing } }
          : source.position
    const raceMark = source.position.kind === 'fixed' ? source : { ...source, id: crypto.randomUUID(), position: reusablePosition, provenance: 'personal' as const }
    if (raceMark.id !== source.id) await saveMark(raceMark)
    await mutateRace((current) => ({ ...current, course: [...current.course, { id: crypto.randomUUID(), markId: raceMark.id, rounding: 'port', role: 'mark' }] }))
  }

  return (
    <div className="page standard-page race-marks-page">
      <section className="page-title page-title--row">
        <div><span className="eyebrow"><MapPin size={14} /> Course confirmation</span><h1>Race marks</h1><p>Check every rounding and resolve movable marks before pre-start.</p></div>
        <button className="button button--primary" onClick={() => setShowMarkForm(true)}><Plus size={17} /> New mark</button>
      </section>

      <div className="segment-control race-marks-tabs" role="tablist" aria-label="Marks view">
        <button role="tab" aria-selected={view === 'course'} className={view === 'course' ? 'active' : ''} onClick={() => setView('course')}>Course</button>
        <button role="tab" aria-selected={view === 'marks'} className={view === 'marks' ? 'active' : ''} onClick={() => setView('marks')}>Marks</button>
      </div>

      <CoursePlot marks={marks} race={race} current={latestReading} />

      {view === 'course' ? (
        <section className="course-builder" aria-label="Course builder">
          <div className="race-mark-list" role="region" aria-label="Course mark list">
            {race.course.map((waypoint, index) => {
              const mark = marks.find((item) => item.id === waypoint.markId)
              return mark ? (
                <div
                  className={`course-mark-entry ${courseDrag?.waypointId === waypoint.id ? 'course-mark-entry--dragging' : ''} ${dragTargetId === waypoint.id && courseDrag?.waypointId !== waypoint.id ? 'course-mark-entry--drop-target' : ''}`}
                  key={waypoint.id}
                  data-waypoint-id={waypoint.id}
                >
                  {isStartWaypoint(waypoint) || isFinishWaypoint(waypoint) ? <div className="course-mark-entry__handle course-mark-entry__handle--locked"><LockKeyhole size={14} aria-hidden="true" /><strong>{index + 1}</strong></div> : <div className="course-mark-entry__handle">
                    <button
                      className="course-mark-entry__drag"
                      aria-label={`Drag ${mark.name} to reorder`}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp') moveWaypoint(waypoint.id, index - 1)
                        if (event.key === 'ArrowDown') moveWaypoint(waypoint.id, index + 1)
                      }}
                      onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setCourseDrag({ waypointId: waypoint.id, mode: 'move' }); setDragTargetId(waypoint.id) }}
                      onPointerMove={(event) => { if (courseDrag?.waypointId === waypoint.id && courseDrag.mode === 'move') setDragTargetId(waypointAtPointer(event.clientX, event.clientY) ?? waypoint.id) }}
                      onPointerUp={(event) => finishWaypointDrag({ waypointId: waypoint.id, mode: 'move' }, event.clientX, event.clientY)}
                      onPointerCancel={() => { setCourseDrag(null); setDragTargetId(null) }}
                    ><GripVertical size={16} aria-hidden="true" /><strong>{index + 1}</strong></button>
                    <button
                      className="course-mark-entry__duplicate"
                      aria-label={`Drag to duplicate ${mark.name}`}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') duplicateWaypoint(waypoint, index + 1) }}
                      onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setCourseDrag({ waypointId: waypoint.id, mode: 'duplicate' }); setDragTargetId(waypoint.id) }}
                      onPointerMove={(event) => { if (courseDrag?.waypointId === waypoint.id && courseDrag.mode === 'duplicate') setDragTargetId(waypointAtPointer(event.clientX, event.clientY) ?? waypoint.id) }}
                      onPointerUp={(event) => finishWaypointDrag({ waypointId: waypoint.id, mode: 'duplicate' }, event.clientX, event.clientY)}
                      onPointerCancel={() => { setCourseDrag(null); setDragTargetId(null) }}
                    ><Copy size={14} /></button>
                  </div>}
                  <MarkRow
                    mark={mark}
                    waypoint={waypoint}
                    isFinish={isFinishWaypoint(waypoint)}
                    finishLinked={finishLinked}
                    onFinishLinked={isFinishWaypoint(waypoint) ? (linked) => void setFinishLinked(linked) : undefined}
                    onPosition={setPositionMark}
                    onSight={(item) => setSightTarget({ endpoint: 'mark', markId: item.id })}
                    onRounding={(rounding) => void mutateRace((current) => ({ ...current, course: current.course.map((item) => item.id === waypoint.id ? { ...item, rounding } : item) }))}
                    onRemove={isStartWaypoint(waypoint) || isFinishWaypoint(waypoint) ? undefined : () => void mutateRace((current) => ({ ...current, course: current.course.filter((item) => item.id !== waypoint.id) }))}
                  />
                </div>
              ) : null
            })}
          </div>
          <div className="add-row">
            <select aria-label="Mark to add" value={newMarkId} onChange={(event) => setNewMarkId(event.target.value)}>
              {marks.filter((mark) => mark.name !== 'Start line' && mark.name !== 'Finish line').map((mark) => <option key={mark.id} value={mark.id}>{mark.name}</option>)}
            </select>
            <button className="button button--secondary" onClick={() => void addMarkToCourse()}><Plus size={16} /> Add mark</button>
          </div>
          <p className="microcopy"><MapPinned size={13} /> Repeat a mark for another lap, or remove remaining marks to shorten the course.</p>
        </section>
      ) : (
        <section className="race-mark-list" aria-label="Race mark list">
          {raceMarks.map((mark) => <MarkRow key={mark.id} mark={mark} isFinish={mark.id === finishWaypoint?.markId} finishLinked={finishLinked} onFinishLinked={mark.id === finishWaypoint?.markId ? (linked) => void setFinishLinked(linked) : undefined} onPosition={setPositionMark} onSight={(item) => setSightTarget({ endpoint: 'mark', markId: item.id })} />)}
        </section>
      )}

      {session.phase === 'setup' && <div className="sticky-action"><div><strong><Check size={16} /> Course reviewed</strong><span>{race.course.length} roundings · {raceMarks.length} unique marks</span></div><button className="button button--primary" onClick={() => void enterPrestart()}>Enter pre-start <ChevronRight size={18} /></button></div>}
      {positionMark?.position.kind === 'gate' && <FullScreenLineMapEditor mark={positionMark} otherMarks={raceMarks.filter((mark) => mark.id !== positionMark.id)} fallback={latestReading} observations={observations.filter((item) => positionMark.id === 'start-line' ? item.endpoint === 'pin' || item.endpoint === 'committee' : item.endpoint === 'mark' && item.markId === positionMark.id)} onDeleteObservation={discardMarkObservation} onCancel={() => setPositionMark(null)} onSave={async (pointA, pointB) => { if (positionMark.position.kind !== 'gate') return; await saveMark({ ...positionMark, position: { ...positionMark.position, pointA, pointB } }); setPositionMark(null) }} />}
      {positionMark && positionMark.position.kind !== 'gate' && <FullScreenMarkMapEditor mark={positionMark} otherMarks={raceMarks.filter((mark) => mark.id !== positionMark.id)} fallback={latestReading} observations={observations.filter((item) => item.endpoint === 'mark' && item.markId === positionMark.id)} onDeleteObservation={discardMarkObservation} onCancel={() => setPositionMark(null)} onSave={async (coordinate) => { await saveMark({ ...positionMark, position: withManualMarkCoordinate(positionMark.position, coordinate) }); setPositionMark(null) }} />}
      {sightTarget && <SightMarksDialog key={sightTarget.endpoint === 'mark' ? sightTarget.markId : sightTarget.endpoint} now={Date.now()} open initialTarget={sightTarget} initialAction="sight" onClose={() => setSightTarget(null)} />}
      {showMarkForm && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add a mark">
        <div className="form-modal">
          <div className="panel__heading"><div><Crosshair size={18} /><h2>Add a mark</h2></div><button className="text-button" onClick={() => setShowMarkForm(false)}>Cancel</button></div>
          <label className="field"><span>Name</span><input autoFocus value={markName} onChange={(event) => setMarkName(event.target.value)} /></label>
          <div className="segment-control" aria-label="Mark position type">{(['fixed', 'variable', 'constructed', 'gate'] as const).map((kind) => <button className={markKind === kind ? 'active' : ''} key={kind} onClick={() => setMarkKind(kind)}>{kind}</button>)}</div>
          {markKind !== 'variable' && <><MapPointPicker value={markCoordinate} onChange={setMarkCoordinate} /><div className="form-grid"><label className="field"><span>{markKind === 'fixed' ? 'Latitude' : markKind === 'gate' ? 'Pin latitude' : 'Origin latitude'}</span><input type="number" step="0.00001" value={markCoordinate.latitude} onChange={(event) => setMarkCoordinate({ ...markCoordinate, latitude: Number(event.target.value) })} /></label><label className="field"><span>{markKind === 'fixed' ? 'Longitude' : markKind === 'gate' ? 'Pin longitude' : 'Origin longitude'}</span><input type="number" step="0.00001" value={markCoordinate.longitude} onChange={(event) => setMarkCoordinate({ ...markCoordinate, longitude: Number(event.target.value) })} /></label></div></>}
          {markKind === 'constructed' && <><div className="form-grid"><label className="field"><span>Distance (NM)</span><input type="number" min="0" step="0.1" value={markDistance} onChange={(event) => setMarkDistance(Number(event.target.value))} /></label><label className="field"><span>Bearing</span><input type="number" min="0" max="359.9" value={markBearing} onChange={(event) => setMarkBearing(Number(event.target.value))} /></label></div><div className="segment-control" aria-label="Bearing reference"><button className={bearingReference === 'true' ? 'active' : ''} onClick={() => setBearingReference('true')}>True</button><button className={bearingReference === 'magnetic' ? 'active' : ''} onClick={() => setBearingReference('magnetic')}>Magnetic</button></div>{bearingReference === 'magnetic' && <label className="field"><span>Magnetic declination (east positive)</span><input type="number" step="0.1" value={declination} onChange={(event) => setDeclination(Number(event.target.value))} /></label>}<p className="microcopy"><Ruler size={13} /> Bearing, reference and origin are retained with the mark.</p></>}
          {markKind === 'gate' && <div className="form-grid"><label className="field"><span>Boat latitude</span><input type="number" step="0.00001" value={lineEndCoordinate.latitude} onChange={(event) => setLineEndCoordinate({ ...lineEndCoordinate, latitude: Number(event.target.value) })} /></label><label className="field"><span>Boat longitude</span><input type="number" step="0.00001" value={lineEndCoordinate.longitude} onChange={(event) => setLineEndCoordinate({ ...lineEndCoordinate, longitude: Number(event.target.value) })} /></label></div>}
          <button className="button button--primary button--wide" disabled={!markName.trim()} onClick={() => void createMark()}><Plus size={16} /> Add mark to course</button>
        </div>
      </div>}
    </div>
  )
}
