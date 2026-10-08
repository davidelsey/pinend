import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass, LocateFixed, MapPin, Maximize2, Minus, Navigation, Plus } from 'lucide-react'
import { destinationPoint, distanceNm, initialBearing, normalizeBearing, resolveMarkPosition } from '../domain/geo'
import type { Coordinate, Mark, RaceDefinition, SensorReading } from '../domain/types'
import { isFinishWaypoint, isStartWaypoint } from '../domain/course'
import { googleMapOptions, loadGoogleMaps } from '../services/googleMaps'
import { fitMapToCoordinates, googleCoordinate } from '../services/mapCoordinates'
import { animateCourseDirection } from '../services/courseDirection'

type CurrentPosition = Coordinate & Partial<Pick<SensorReading, 'heading' | 'headingSource' | 'deviceHeading' | 'courseOverGround'>>
type SimulationControls = { speedKnots: number; onPosition(coordinate: Coordinate): void; onVector(heading: number, speedKnots: number): void }
type Props = { marks: Mark[]; race: RaceDefinition; current?: CurrentPosition | null; activeMarkId?: string; activeWaypointIndex?: number; line?: { pin: Coordinate; committee: Coordinate } | null; compact?: boolean; zoomControls?: boolean; simulation?: SimulationControls }
type MarkerInteraction = { onDrag?(coordinate: Coordinate): void; onKeyDown?(event: KeyboardEvent): void }
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

export function CoursePlot({ marks, race, current, activeMarkId, activeWaypointIndex, line, compact, zoomControls = false, simulation }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([])
  const linesRef = useRef<google.maps.Polyline[]>([])
  const courseLineRef = useRef<google.maps.Polyline | null>(null)
  const markerClassRef = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(null)
  const initialFitRef = useRef(false)
  const positionedBoatRef = useRef(false)
  const interactionsRef = useRef(new WeakMap<google.maps.marker.AdvancedMarkerElement, MarkerInteraction>())
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
  const boatHeading = courseOverGround ?? deviceHeading
  const deviceHeadingAvailable = deviceHeading != null && Number.isFinite(deviceHeading)
  const travelHeadingAvailable = boatHeading != null && Number.isFinite(boatHeading)
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
      positionedBoatRef.current = false
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const AdvancedMarkerElement = markerClassRef.current
    if (!map || !AdvancedMarkerElement || !loaded) return
    const visibleGates = model.gates.filter((gate) => !(model.sharedStartFinish && gate.isFinish))
    // A ten-minute velocity vector, with a short minimum handle for a stopped boat.
    const vectorEnd = simulation && current ? destinationPoint(current, 0.05 + simulation.speedKnots / 6, boatHeading ?? 0) : null
    const gateIsActive = (gate: typeof visibleGates[number]) => gate.id === activeMarkId
      || (model.sharedStartFinish && gate.isStart && model.gates.some((item) => item.isFinish && item.id === activeMarkId))
    const focusLeg = activeWaypointIndex != null
    const coordinateAt = (index: number) => {
      const gate = model.gates.find((item) => item.waypointIndex === index)
      return gate ? { latitude: (gate.pointA.latitude + gate.pointB.latitude) / 2, longitude: (gate.pointA.longitude + gate.pointB.longitude) / 2 } : model.courseMarks.find((item) => item.waypointIndex === index)?.coordinate
    }
    const legStart = focusLeg ? coordinateAt(activeWaypointIndex - 1) : undefined
    const legEnd = focusLeg ? coordinateAt(activeWaypointIndex) : undefined
    const activePath = legStart && legEnd ? [legStart, legEnd] : null
    const hasRoute = model.routeCoordinates.length > 1
    const lineOptions: google.maps.PolylineOptions[] = [
      ...(hasRoute ? [{ path: model.routeCoordinates.map(googleCoordinate), strokeColor: '#f5f1e8', strokeWeight: 3, strokeOpacity: focusLeg ? 0.2 : 0.8, zIndex: 1, ...(focusLeg ? { icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: '#ff6b35', fillOpacity: 0.2, strokeOpacity: 0.2, strokeWeight: 1 }, offset: '24px', repeat: '96px' }] } : {}) }] : []),
      ...(activePath ? [{ path: activePath.map(googleCoordinate), strokeColor: '#f5f1e8', strokeWeight: 5, strokeOpacity: 1, zIndex: 2 }] : []),
      ...visibleGates.map((gate) => ({ path: [googleCoordinate(gate.pointA), googleCoordinate(gate.pointB)], strokeColor: gateIsActive(gate) ? '#ffb340' : gate.isFinish ? '#53d3c2' : '#ff6b35', strokeWeight: gateIsActive(gate) ? 9 : 6, strokeOpacity: focusLeg && !gateIsActive(gate) ? 0.2 : 1, icons: [] })),
      ...(vectorEnd && current ? [{ path: [googleCoordinate(current), googleCoordinate(vectorEnd)], strokeColor: '#ff6b35', strokeWeight: 3, icons: [] }] : []),
    ]
    lineOptions.forEach((options, index) => {
      if (linesRef.current[index]) linesRef.current[index].setOptions(options)
      else linesRef.current[index] = new google.maps.Polyline({ ...options, map })
    })
    linesRef.current.splice(lineOptions.length).forEach((line) => line.setMap(null))
    courseLineRef.current = focusLeg ? activePath ? linesRef.current[hasRoute ? 1 : 0] : null : hasRoute ? linesRef.current[0] : null

    const nextMarkers: google.maps.marker.AdvancedMarkerElement[] = []
    const addMarker = ({ onDrag, onKeyDown, ...options }: google.maps.marker.AdvancedMarkerElementOptions & { content: HTMLDivElement } & MarkerInteraction) => {
      let marker = markersRef.current[nextMarkers.length]
      if (!marker) {
        marker = new AdvancedMarkerElement(options)
        const created = marker
        const drag = () => {
          const position = created.position
          if (!position) return
          interactionsRef.current.get(created)?.onDrag?.({ latitude: typeof position.lat === 'function' ? position.lat() : position.lat, longitude: typeof position.lng === 'function' ? position.lng() : position.lng })
        }
        created.addListener('drag', drag)
        created.addListener('dragend', drag)
        options.content.addEventListener('keydown', (event) => { if (event instanceof KeyboardEvent) interactionsRef.current.get(created)?.onKeyDown?.(event) })
      }
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
        const position = marker.position
        const nextPosition = options.position as google.maps.LatLngLiteral
        const lat = position && (typeof position.lat === 'function' ? position.lat() : position.lat)
        const lng = position && (typeof position.lng === 'function' ? position.lng() : position.lng)
        if (lat !== nextPosition.lat || lng !== nextPosition.lng) marker.position = nextPosition
        marker.anchorLeft = options.anchorLeft
        marker.anchorTop = options.anchorTop
      }
      marker.gmpDraggable = Boolean(onDrag)
      marker.zIndex = options.zIndex
      const content = marker.content as HTMLDivElement
      content.tabIndex = onDrag ? 0 : -1
      if (onDrag) content.setAttribute('role', 'button')
      else content.removeAttribute('role')
      interactionsRef.current.set(marker, { onDrag, onKeyDown })
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
      if (icon && travelHeadingAvailable) icon.style.transform = `rotate(${normalizeBearing(boatHeading - mapBearing)}deg)`
      if (!travelHeadingAvailable) element.classList.add('course-map-marker--no-heading')
      element.setAttribute('aria-label', simulation ? 'Drag boat position' : travelHeadingAvailable ? `You, ${courseOverGround != null ? 'travelling' : 'heading'} ${Math.round(normalizeBearing(boatHeading))} degrees` : 'You, direction unavailable')
      addMarker({ map, content: element, position: googleCoordinate(current), anchorLeft: '-50%', anchorTop: '-50%', zIndex: 1000,
        onDrag: simulation?.onPosition,
        onKeyDown: simulation ? (event) => {
          const bearings: Record<string, number> = { ArrowUp: 0, ArrowRight: 90, ArrowDown: 180, ArrowLeft: 270 }
          if (!(event.key in bearings)) return
          event.preventDefault()
          simulation.onPosition(destinationPoint(current, 0.01, bearings[event.key]))
        } : undefined,
      })
      if (simulation && vectorEnd) {
        const handle = markerElement('Speed / direction', 'active')
        handle.classList.add('course-map-vector-handle')
        handle.setAttribute('aria-label', 'Drag to set heading and speed')
        addMarker({ map, content: handle, position: googleCoordinate(vectorEnd), anchorLeft: '-50%', anchorTop: '-50%', zIndex: 1001,
          onDrag: (point) => simulation.onVector(initialBearing(current, point), Math.min(20, Math.max(0, (distanceNm(current, point) - 0.05) * 6))),
          onKeyDown: (event) => {
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
            event.preventDefault()
            simulation.onVector(normalizeBearing((boatHeading ?? 0) + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0)), Math.min(20, Math.max(0, simulation.speedKnots + (event.key === 'ArrowUp' ? 0.5 : event.key === 'ArrowDown' ? -0.5 : 0))))
          },
        })
      }
    }
    markersRef.current.slice(nextMarkers.length).forEach((marker) => { marker.map = null })
    markersRef.current = nextMarkers
    if ((!initialFitRef.current || (current && !positionedBoatRef.current)) && model.allPoints.length > 0) {
      fitMapToCoordinates(map, vectorEnd ? [...model.allPoints, vectorEnd] : model.allPoints, FIT_PADDING)
      initialFitRef.current = true
    }
    positionedBoatRef.current = Boolean(current)
  }, [activeMarkId, activeWaypointIndex, boatHeading, courseOverGround, current, loaded, mapBearing, model, simulation, travelHeadingAvailable])

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
