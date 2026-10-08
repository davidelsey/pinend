import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass, LocateFixed, MapPin, Maximize2, Minus, Navigation, Plus } from 'lucide-react'
import { normalizeBearing, resolveMarkPosition } from '../domain/geo'
import type { Coordinate, Mark, RaceDefinition, SensorReading } from '../domain/types'
import { isFinishWaypoint, isStartWaypoint } from '../domain/course'
import { googleMapOptions, loadGoogleMaps } from '../services/googleMaps'
import { fitMapToCoordinates, googleCoordinate } from '../services/mapCoordinates'
import { animateCourseDirection } from '../services/courseDirection'

type CurrentPosition = Coordinate & Partial<Pick<SensorReading, 'heading' | 'headingSource' | 'deviceHeading' | 'courseOverGround'>>
type Props = { marks: Mark[]; race: RaceDefinition; current?: CurrentPosition | null; activeMarkId?: string; line?: { pin: Coordinate; committee: Coordinate } | null; compact?: boolean; zoomControls?: boolean }
const FIT_PADDING = 44

function markerElement(label: string, variant: 'mark' | 'active' | 'line' | 'boat') {
  const element = document.createElement('div')
  element.className = `course-map-marker course-map-marker--${variant}`
  const icon = document.createElement('span')
  icon.className = 'course-map-marker__icon'
  element.append(icon)
  const text = document.createElement('span')
  text.className = 'course-map-marker__label'
  text.textContent = label
  element.append(text)
  return element
}

export function CoursePlot({ marks, race, current, activeMarkId, line, compact, zoomControls = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const linesRef = useRef<google.maps.Polyline[]>([])
  const courseLineRef = useRef<google.maps.Polyline | null>(null)
  const markerClassRef = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(null)
  const initialFitRef = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'north' | 'device'>('north')

  const model = useMemo(() => {
    const courseMarks = race.course.flatMap((waypoint, waypointIndex) => {
      const mark = marks.find((item) => item.id === waypoint.markId)
      if (mark?.position.kind === 'gate') return []
      const coordinate = mark ? resolveMarkPosition(mark.position) : undefined
      return mark && coordinate ? [{ ...mark, coordinate, waypointIndex }] : []
    })
    const gates = race.course.flatMap((waypoint, waypointIndex) => {
      const mark = marks.find((item) => item.id === waypoint.markId)
      if (mark?.position.kind !== 'gate') return []
      const pointA = isStartWaypoint(waypoint) && line ? line.pin : mark.position.pointA
      const pointB = isStartWaypoint(waypoint) && line ? line.committee : mark.position.pointB
      return pointA && pointB ? [{ ...mark, pointA, pointB, waypointIndex, isStart: isStartWaypoint(waypoint), isFinish: isFinishWaypoint(waypoint) }] : []
    })
    const startGate = gates.find((gate) => gate.isStart)
    const finishGate = gates.find((gate) => gate.isFinish)
    const sameCoordinate = (first: Coordinate, second: Coordinate) => Math.abs(first.latitude - second.latitude) < 1e-7 && Math.abs(first.longitude - second.longitude) < 1e-7
    const sharedStartFinish = Boolean(startGate && finishGate && ((sameCoordinate(startGate.pointA, finishGate.pointA) && sameCoordinate(startGate.pointB, finishGate.pointB)) || (sameCoordinate(startGate.pointA, finishGate.pointB) && sameCoordinate(startGate.pointB, finishGate.pointA))))
    const coursePoints = [...courseMarks.map((mark) => mark.coordinate), ...gates.flatMap((gate) => [gate.pointA, gate.pointB])]
    const allPoints = current ? [...coursePoints, current] : coursePoints
    const routeCoordinates = race.course.flatMap((_waypoint, waypointIndex) => {
      const gate = gates.find((item) => item.waypointIndex === waypointIndex)
      if (gate) return [{ latitude: (gate.pointA.latitude + gate.pointB.latitude) / 2, longitude: (gate.pointA.longitude + gate.pointB.longitude) / 2 }]
      const mark = courseMarks.find((item) => item.waypointIndex === waypointIndex)
      return mark ? [mark.coordinate] : []
    })
    return { courseMarks, gates, coursePoints, allPoints, routeCoordinates, sharedStartFinish }
  }, [current, line, marks, race])

  const legacyDeviceHeading = current?.headingSource === 'compass' || current?.headingSource === 'simulator' ? current.heading : undefined
  const legacyCourseOverGround = current?.headingSource === 'course-over-ground' || current?.headingSource === 'simulator' ? current.heading : undefined
  const deviceHeading = current?.deviceHeading ?? legacyDeviceHeading
  const courseOverGround = current?.courseOverGround ?? legacyCourseOverGround
  const deviceHeadingAvailable = deviceHeading != null && Number.isFinite(deviceHeading)
  const travelHeadingAvailable = courseOverGround != null && Number.isFinite(courseOverGround)
  const deviceAligned = orientation === 'device' && deviceHeadingAvailable
  const mapBearing = deviceAligned ? normalizeBearing(deviceHeading) : 0
  const plotLabel = deviceAligned ? `Course map, device aligned at ${Math.round(normalizeBearing(deviceHeading)).toString().padStart(3, '0')} degrees` : 'Course map, north up'

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    void loadGoogleMaps().then(({ maps, marker }) => {
      if (cancelled || !containerRef.current) return
      mapRef.current = new maps.Map(containerRef.current, googleMapOptions({ lat: -33.86, lng: 151.235 }))
      markerClassRef.current = marker.AdvancedMarkerElement
      setLoaded(true)
    }).catch((error: Error) => setMapError(error.message))
    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => { marker.map = null })
      linesRef.current.forEach((line) => line.setMap(null))
      markersRef.current = []
      linesRef.current = []
      courseLineRef.current = null
      mapRef.current = null
      markerClassRef.current = null
      initialFitRef.current = false
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const AdvancedMarkerElement = markerClassRef.current
    if (!map || !AdvancedMarkerElement || !loaded) return
    const visibleGates = model.gates.filter((gate) => !(model.sharedStartFinish && gate.isFinish))
    const gateIsActive = (gate: typeof visibleGates[number]) => gate.id === activeMarkId
      || (model.sharedStartFinish && gate.isStart && model.gates.some((item) => item.isFinish && item.id === activeMarkId))
    const lineOptions: google.maps.PolylineOptions[] = [
      ...(model.routeCoordinates.length > 1 ? [{ path: model.routeCoordinates.map(googleCoordinate), strokeColor: '#f5f1e8', strokeWeight: 3, strokeOpacity: 0.8 }] : []),
      ...visibleGates.map((gate) => ({ path: [googleCoordinate(gate.pointA), googleCoordinate(gate.pointB)], strokeColor: gateIsActive(gate) ? '#ffb340' : gate.isFinish ? '#53d3c2' : '#ff6b35', strokeWeight: gateIsActive(gate) ? 9 : 6, strokeOpacity: 1, icons: [] })),
    ]
    lineOptions.forEach((options, index) => {
      if (linesRef.current[index]) linesRef.current[index].setOptions(options)
      else linesRef.current[index] = new google.maps.Polyline({ ...options, map })
    })
    linesRef.current.splice(lineOptions.length).forEach((line) => line.setMap(null))
    courseLineRef.current = model.routeCoordinates.length > 1 ? linesRef.current[0] : null

    const nextMarkers: google.maps.marker.AdvancedMarkerElement[] = []
    const addMarker = (options: google.maps.marker.AdvancedMarkerElementOptions & { content: HTMLDivElement }) => {
      let marker = markersRef.current[nextMarkers.length]
      if (!marker) marker = new AdvancedMarkerElement(options)
      else {
        const content = marker.content as HTMLDivElement
        content.className = options.content.className
        const label = options.content.getAttribute('aria-label')
        if (label) content.setAttribute('aria-label', label)
        else content.removeAttribute('aria-label')
        const text = content.querySelector('.course-map-marker__label')!
        const nextText = options.content.querySelector('.course-map-marker__label')!.textContent
        if (text.textContent !== nextText) text.textContent = nextText
        content.querySelector<HTMLElement>('.course-map-marker__icon')!.style.transform = options.content.querySelector<HTMLElement>('.course-map-marker__icon')!.style.transform
        marker.position = options.position
        marker.anchorLeft = options.anchorLeft
        marker.anchorTop = options.anchorTop
      }
      nextMarkers.push(marker)
    }
    model.courseMarks.forEach((mark) => addMarker({
      map,
      content: markerElement(`${mark.waypointIndex + 1} · ${mark.shortName}`, mark.id === activeMarkId ? 'active' : 'mark'),
      position: googleCoordinate(mark.coordinate),
      anchorLeft: '0%',
      anchorTop: '-50%',
    }))
    visibleGates.forEach((gate) => {
      const label = model.sharedStartFinish && gate.isStart ? 'START / FINISH' : `${gate.waypointIndex + 1} · ${gate.shortName}`
      const midpoint = { lat: (gate.pointA.latitude + gate.pointB.latitude) / 2, lng: (gate.pointA.longitude + gate.pointB.longitude) / 2 }
      addMarker({ map, content: markerElement(label, gateIsActive(gate) ? 'active' : 'line'), position: midpoint, anchorLeft: '0%', anchorTop: '-100%' })
      ;[gate.pointA, gate.pointB].forEach((coordinate, index) => {
        const endpointLabel = gate.position.kind === 'gate' ? gate.position.labels?.[index] ?? (index === 0 ? 'Pin' : 'Boat') : ''
        const content = markerElement('', gateIsActive(gate) ? 'active' : 'mark')
        content.classList.add('course-map-endpoint')
        content.setAttribute('aria-label', `${label}: ${endpointLabel}`)
        addMarker({ map, content, position: googleCoordinate(coordinate), anchorLeft: '-50%', anchorTop: '-50%' })
      })
    })
    if (current) {
      const element = markerElement('YOU', 'boat')
      const icon = element.querySelector<HTMLElement>('.course-map-marker__icon')
      if (icon && travelHeadingAvailable) icon.style.transform = `rotate(${normalizeBearing(courseOverGround - mapBearing)}deg)`
      element.setAttribute('aria-label', travelHeadingAvailable ? `You, travelling ${Math.round(normalizeBearing(courseOverGround))} degrees` : 'You, direction unavailable')
      addMarker({ map, content: element, position: googleCoordinate(current), anchorLeft: '-50%', anchorTop: '-50%' })
    }
    markersRef.current.slice(nextMarkers.length).forEach((marker) => { marker.map = null })
    markersRef.current = nextMarkers
    if (!initialFitRef.current && model.allPoints.length > 0) {
      fitMapToCoordinates(map, model.allPoints, FIT_PADDING)
      initialFitRef.current = true
    }
  }, [activeMarkId, courseOverGround, current, loaded, mapBearing, model, travelHeadingAvailable])

  useEffect(() => {
    if (loaded) return animateCourseDirection(() => courseLineRef.current)
  }, [loaded])

  useEffect(() => {
    if (!mapRef.current || !loaded) return
    mapRef.current.moveCamera({ heading: deviceAligned ? normalizeBearing(deviceHeading) : 0 })
  }, [deviceAligned, deviceHeading, loaded])

  return (
    <div className={`course-plot course-plot--real ${compact ? 'course-plot--compact' : ''}`} aria-label="Course map">
      <div ref={containerRef} className="course-map-canvas" role="img" aria-label={plotLabel} />
      {mapError && <div className="map-provider-error" role="status">{mapError}</div>}
      {!mapError && model.coursePoints.length === 0 && <div className={`course-map-hint ${current ? 'course-map-hint--above-location' : ''}`} role="status"><MapPin size={16} aria-hidden="true" /><span>Position your marks to plot the course.</span></div>}
      <div className="map-controls">
        <button aria-label="Recenter on current location" disabled={!current || !loaded} onClick={() => { if (!current || !mapRef.current) return; mapRef.current.setCenter(googleCoordinate(current)); mapRef.current.setZoom(Math.max(mapRef.current.getZoom() ?? 12, 15)) }}><LocateFixed size={15} /> <span>Recenter</span></button>
        <button aria-label="Fit all course waypoints" disabled={model.coursePoints.length === 0 || !loaded} onClick={() => mapRef.current && fitMapToCoordinates(mapRef.current, model.coursePoints, FIT_PADDING)}><Maximize2 size={15} /> <span>Fit course</span></button>
        {zoomControls && <><button aria-label="Zoom in" disabled={!loaded} onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 12) + 1)}><Plus size={15} /></button><button aria-label="Zoom out" disabled={!loaded} onClick={() => mapRef.current?.setZoom((mapRef.current.getZoom() ?? 12) - 1)}><Minus size={15} /></button></>}
        <button aria-label="North up" aria-pressed={!deviceAligned} disabled={!loaded} onClick={() => setOrientation('north')}><Compass size={15} /> <span>North</span></button>
        <button aria-label="Device aligned" aria-pressed={deviceAligned} disabled={!deviceHeadingAvailable || !loaded} onClick={() => setOrientation('device')}><Navigation size={15} /> <span>Device</span></button>
      </div>
      {current && <div className="map-current-label"><span /> Current location</div>}
    </div>
  )
}
