import { useMemo, useRef, useState } from 'react'
import { Camera, Check, ChevronRight, Copy, CornerUpLeft, CornerUpRight, Crosshair, GripVertical, LockKeyhole, MapPinned, MapPin, Plus, Ruler, Trash2 } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { CoursePlot } from '../components/CoursePlot'
import { FullScreenMarkMapEditor } from '../components/FullScreenMarkMapEditor'
import { FullScreenLineMapEditor } from '../components/FullScreenLineMapEditor'
import { MapPointPicker } from '../components/MapPointPicker'
import { SightMarksDialog, type SightTargetRef } from '../components/SightMarksDialog'
import { distanceMetres, intersectSightings, resolveMarkPosition, withManualMarkCoordinate, withSightingMarkCoordinate, withoutSightingMarkCoordinate } from '../domain/geo'
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
        <small>{isFinish && finishLinked ? 'Locked to the start gate' : coordinate ? mark.position.kind === 'gate' ? 'Two-point line' : mark.position.kind === 'fixed' ? 'Fixed position' : 'Movable mark positioned' : mark.position.kind === 'gate' ? 'Position or sight both Pin and Boat ends' : 'Position required for this race'}</small>
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
  const [courseDrag, setCourseDrag] = useState<CourseDrag | null>(null)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [insertMarkAt, setInsertMarkAt] = useState<number | null>(null)
  const [newMarkRounding, setNewMarkRounding] = useState<CourseWaypoint['rounding']>('port')
  const [addingMark, setAddingMark] = useState(false)
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
  const insertionTrigger = useRef<HTMLButtonElement | null>(null)
  const markDialog = useRef<HTMLDivElement | null>(null)
  const addMarkInFlight = useRef(false)
  const raceMarks = useMemo(() => race.course.reduce<Mark[]>((unique, waypoint) => {
    const mark = marks.find((item) => item.id === waypoint.markId)
    return mark && !unique.some((item) => item.id === mark.id) ? [...unique, mark] : unique
  }, []), [marks, race.course])
  const startWaypoint = race.course.find(isStartWaypoint)
  const finishWaypoint = race.course.find(isFinishWaypoint)
  const finishLine = marks.find((mark) => mark.id === finishWaypoint?.markId)
  const finishLinked = finishLine?.position.kind === 'gate' && finishLine.position.linkedToMarkId === startWaypoint?.markId
  const selectableMarks = useMemo(() => marks.filter((mark) => mark.name !== 'Start line' && mark.name !== 'Finish line'), [marks])
  const markOptionValue = (mark: Mark) => selectableMarks.filter((item) => item.name.toLocaleLowerCase() === mark.name.toLocaleLowerCase()).length === 1
    ? mark.name
    : `${mark.name} — ${mark.position.kind} · ${mark.id.slice(0, 6)}`
  const selectedLibraryMark = selectableMarks.find((mark) => markOptionValue(mark).toLocaleLowerCase() === markName.trim().toLocaleLowerCase())
  const validCoordinate = (coordinate: { latitude: number; longitude: number }) => Number.isFinite(coordinate.latitude) && coordinate.latitude >= -90 && coordinate.latitude <= 90 && Number.isFinite(coordinate.longitude) && coordinate.longitude >= -180 && coordinate.longitude <= 180
  const newMarkIsValid = markKind === 'variable'
    || (validCoordinate(markCoordinate) && (markKind === 'fixed'
      || (markKind === 'constructed' && Number.isFinite(markDistance) && markDistance > 0 && Number.isFinite(markBearing) && markBearing >= 0 && markBearing < 360 && (bearingReference !== 'magnetic' || (Number.isFinite(declination) && declination >= -180 && declination <= 180)))
      || (markKind === 'gate' && validCoordinate(lineEndCoordinate) && distanceMetres(markCoordinate, lineEndCoordinate) >= 3)))

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

  const closeMarkCreator = (force = false) => {
    if (addingMark && !force) return
    setInsertMarkAt(null)
    setMarkName('')
    setNewMarkRounding('port')
    window.setTimeout(() => insertionTrigger.current?.focus(), 0)
  }

  const handleMarkDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMarkCreator()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(markDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  const addCourseMark = async () => {
    const name = markName.trim()
    if (!name || insertMarkAt === null || (!selectedLibraryMark && !newMarkIsValid) || addMarkInFlight.current) return
    addMarkInFlight.current = true
    setAddingMark(true)
    try {
      let raceMark: Mark
      if (selectedLibraryMark) {
        const reusablePosition: Mark['position'] = selectedLibraryMark.position.kind === 'variable'
          ? { kind: 'variable' }
          : selectedLibraryMark.position.kind === 'gate'
            ? { kind: 'gate', labels: selectedLibraryMark.position.labels }
            : selectedLibraryMark.position.kind === 'constructed'
              ? { kind: 'constructed', origin: selectedLibraryMark.position.origin, distanceNm: selectedLibraryMark.position.distanceNm, bearing: { ...selectedLibraryMark.position.bearing } }
              : selectedLibraryMark.position
        raceMark = selectedLibraryMark.position.kind === 'fixed' ? selectedLibraryMark : { ...selectedLibraryMark, id: crypto.randomUUID(), position: reusablePosition, provenance: 'personal' }
        if (raceMark.id !== selectedLibraryMark.id) await saveMark(raceMark)
      } else {
        raceMark = {
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
        await saveMark(raceMark)
      }
      await mutateRace((current) => {
        const course = [...current.course]
        course.splice(Math.min(course.length - 1, Math.max(1, insertMarkAt)), 0, { id: crypto.randomUUID(), markId: raceMark.id, rounding: newMarkRounding, role: 'mark' })
        return { ...current, course }
      })
      closeMarkCreator(true)
    } finally {
      addMarkInFlight.current = false
      setAddingMark(false)
    }
  }

  return (
    <div className="page standard-page race-marks-page">
      <section className="page-title page-title--row">
        <div><span className="eyebrow"><MapPin size={14} /> Course confirmation</span><h1>Race marks</h1><p>Check every rounding and resolve movable marks before pre-start.</p></div>
      </section>

      <div className="segment-control race-marks-tabs" role="tablist" aria-label="Marks view">
        <button role="tab" aria-selected={view === 'course'} className={view === 'course' ? 'active' : ''} onClick={() => setView('course')}>Course</button>
        <button role="tab" aria-selected={view === 'marks'} className={view === 'marks' ? 'active' : ''} onClick={() => setView('marks')}>Marks</button>
      </div>

      <CoursePlot marks={marks} race={race} current={latestReading} zoomControls />

      {view === 'course' ? (
        <section className="course-builder" aria-label="Course builder">
          <div className="race-mark-list" role="region" aria-label="Course mark list">
            {race.course.map((waypoint, index) => {
              const mark = marks.find((item) => item.id === waypoint.markId)
              const nextMark = marks.find((item) => item.id === race.course[index + 1]?.markId)
              return mark ? (
                <div className="course-mark-slot" key={waypoint.id}>
                <div
                  className={`course-mark-entry ${courseDrag?.waypointId === waypoint.id ? 'course-mark-entry--dragging' : ''} ${dragTargetId === waypoint.id && courseDrag?.waypointId !== waypoint.id ? 'course-mark-entry--drop-target' : ''}`}
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
                {index < race.course.length - 1 && <button className="course-insert-mark" disabled={addingMark} aria-label={`Add mark between ${mark.name} and ${nextMark?.name ?? 'next mark'}`} onClick={(event) => { insertionTrigger.current = event.currentTarget; setInsertMarkAt(index + 1); setMarkName(''); setNewMarkRounding('port') }}><span aria-hidden="true" /><Plus size={18} aria-hidden="true" /><span aria-hidden="true" /></button>}
                </div>
              ) : null
            })}
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
      {insertMarkAt !== null && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add course mark" onKeyDown={handleMarkDialogKeyDown}>
        <div className="form-modal" ref={markDialog}>
          <div className="panel__heading"><div><Crosshair size={18} /><h2>Add course mark</h2></div><button className="text-button" disabled={addingMark} onClick={() => closeMarkCreator()}>Cancel</button></div>
          <label className="field"><span>Select or create a mark</span><input autoFocus role="combobox" list="course-mark-options" value={markName} onChange={(event) => setMarkName(event.target.value)} placeholder="Search marks or enter a new name" /></label>
          <datalist id="course-mark-options">{selectableMarks.map((mark) => <option key={mark.id} value={markOptionValue(mark)} />)}</datalist>
          {selectedLibraryMark ? <p className="selected-mark-summary"><MapPin size={16} /> Using {selectedLibraryMark.name} · {selectedLibraryMark.position.kind}</p> : markName.trim() && <>
            <div className="segment-control" role="group" aria-label="Mark position type">{(['fixed', 'variable', 'constructed', 'gate'] as const).map((kind) => <button aria-pressed={markKind === kind} className={markKind === kind ? 'active' : ''} key={kind} onClick={() => setMarkKind(kind)}>{kind}</button>)}</div>
            {markKind !== 'variable' && <><MapPointPicker value={markCoordinate} onChange={setMarkCoordinate} /><div className="form-grid"><label className="field"><span>{markKind === 'fixed' ? 'Latitude' : markKind === 'gate' ? 'Pin latitude' : 'Origin latitude'}</span><input type="number" step="0.00001" value={markCoordinate.latitude} onChange={(event) => setMarkCoordinate({ ...markCoordinate, latitude: Number(event.target.value) })} /></label><label className="field"><span>{markKind === 'fixed' ? 'Longitude' : markKind === 'gate' ? 'Pin longitude' : 'Origin longitude'}</span><input type="number" step="0.00001" value={markCoordinate.longitude} onChange={(event) => setMarkCoordinate({ ...markCoordinate, longitude: Number(event.target.value) })} /></label></div></>}
            {markKind === 'constructed' && <><div className="form-grid"><label className="field"><span>Distance (NM)</span><input type="number" min="0" step="0.1" value={markDistance} onChange={(event) => setMarkDistance(Number(event.target.value))} /></label><label className="field"><span>Bearing</span><input type="number" min="0" max="359.9" value={markBearing} onChange={(event) => setMarkBearing(Number(event.target.value))} /></label></div><div className="segment-control" role="group" aria-label="Bearing reference"><button aria-pressed={bearingReference === 'true'} className={bearingReference === 'true' ? 'active' : ''} onClick={() => setBearingReference('true')}>True</button><button aria-pressed={bearingReference === 'magnetic'} className={bearingReference === 'magnetic' ? 'active' : ''} onClick={() => setBearingReference('magnetic')}>Magnetic</button></div>{bearingReference === 'magnetic' && <label className="field"><span>Magnetic declination (east positive)</span><input type="number" step="0.1" value={declination} onChange={(event) => setDeclination(Number(event.target.value))} /></label>}<p className="microcopy"><Ruler size={13} /> Bearing, reference and origin are retained with the mark.</p></>}
            {markKind === 'gate' && <div className="form-grid"><label className="field"><span>Boat latitude</span><input type="number" step="0.00001" value={lineEndCoordinate.latitude} onChange={(event) => setLineEndCoordinate({ ...lineEndCoordinate, latitude: Number(event.target.value) })} /></label><label className="field"><span>Boat longitude</span><input type="number" step="0.00001" value={lineEndCoordinate.longitude} onChange={(event) => setLineEndCoordinate({ ...lineEndCoordinate, longitude: Number(event.target.value) })} /></label></div>}
          </>}
          {!selectedLibraryMark && markName.trim() && !newMarkIsValid && <p id="new-mark-validation" className="field-error" role="alert">Enter a valid position. Gates must be at least 3 m wide; distance must be positive, bearing 0–359.9°, and magnetic declination −180–180°.</p>}
          <fieldset className="mark-rounding-picker"><legend>Rounding</legend><div role="radiogroup" aria-label="New mark rounding"><label className={`rounding-arrow rounding-arrow--port ${newMarkRounding === 'port' ? 'is-selected' : ''}`}><input type="radio" name="new-mark-rounding" aria-label="Round new mark to port" checked={newMarkRounding === 'port'} onChange={() => setNewMarkRounding('port')} /><CornerUpLeft size={20} /></label><label className={`rounding-arrow rounding-arrow--starboard ${newMarkRounding === 'starboard' ? 'is-selected' : ''}`}><input type="radio" name="new-mark-rounding" aria-label="Round new mark to starboard" checked={newMarkRounding === 'starboard'} onChange={() => setNewMarkRounding('starboard')} /><CornerUpRight size={20} /></label></div></fieldset>
          <button className="button button--primary button--wide" aria-describedby={!selectedLibraryMark && markName.trim() && !newMarkIsValid ? 'new-mark-validation' : undefined} disabled={addingMark || !markName.trim() || (!selectedLibraryMark && !newMarkIsValid)} onClick={() => void addCourseMark()}><Plus size={16} /> {addingMark ? 'Adding…' : 'Add to course'}</button>
        </div>
      </div>}
    </div>
  )
}
