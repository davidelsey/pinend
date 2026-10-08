import { Maximize2, Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SensorReading } from '../domain/types'
import { normalizeBearing } from '../domain/geo'
import { formatRaceDuration } from '../domain/raceSummary'
import { googleMapOptions, loadGoogleMaps } from '../services/googleMaps'
import { fitMapToCoordinates, googleCoordinate } from '../services/mapCoordinates'

type Props = { telemetry: SensorReading[]; startTime: number }

export function RaceReplayMap({ telemetry, startTime }: Props) {
  const [progress, setProgress] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const replayStartedAt = useRef(0)
  const canvasRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const linesRef = useRef<google.maps.Polyline[]>([])
  const boatRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const startRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const points = useMemo(() => {
    const sorted = [...telemetry].filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Number.isFinite(point.timestamp)).sort((a, b) => a.timestamp - b.timestamp)
    const step = Math.max(1, Math.ceil(sorted.length / 3000))
    const startIndex = sorted.findIndex((point) => point.timestamp >= startTime)
    return sorted.filter((_point, index) => index % step === 0 || index === sorted.length - 1 || index === startIndex || index === startIndex - 1)
  }, [startTime, telemetry])
  const firstTimestamp = points[0]?.timestamp ?? 0
  const lastTimestamp = points.at(-1)?.timestamp ?? firstTimestamp
  const replayTimestamp = firstTimestamp + progress * (lastTimestamp - firstTimestamp)
  let currentIndex = points.findIndex((point) => point.timestamp > replayTimestamp) - 1
  if (currentIndex < 0) currentIndex = points.length - 1
  const base = points[currentIndex]
  const next = points[currentIndex + 1]
  const fraction = base && next ? Math.min(1, Math.max(0, (replayTimestamp - base.timestamp) / (next.timestamp - base.timestamp))) : 0
  const current = useMemo(() => base ? {
    ...base,
    timestamp: replayTimestamp,
    latitude: base.latitude + ((next?.latitude ?? base.latitude) - base.latitude) * fraction,
    longitude: base.longitude + ((next?.longitude ?? base.longitude) - base.longitude) * fraction,
    heading: normalizeBearing(base.heading + (next ? ((next.heading - base.heading + 540) % 360 - 180) * fraction : 0)),
  } : null, [base, fraction, next, replayTimestamp])

  useEffect(() => {
    let cancelled = false
    void loadGoogleMaps().then(({ maps, marker }) => {
      if (cancelled || !canvasRef.current) return
      const map = new maps.Map(canvasRef.current, googleMapOptions({ lat: -33.86, lng: 151.235 }))
      mapRef.current = map
      linesRef.current = [
        new google.maps.Polyline({ map, strokeColor: '#f5f1e8', strokeOpacity: 0.35, strokeWeight: 3 }),
        new google.maps.Polyline({ map, strokeColor: '#ff9a73', strokeWeight: 4 }),
        new google.maps.Polyline({ map, strokeColor: '#53d3c2', strokeWeight: 5 }),
      ]
      const boat = document.createElement('div')
      boat.className = 'course-map-marker course-map-marker--boat'
      const icon = document.createElement('span')
      icon.className = 'course-map-marker__icon'
      boat.append(icon)
      boatRef.current = new marker.AdvancedMarkerElement({ content: boat, anchorLeft: '-50%', anchorTop: '-50%', zIndex: 100 })
      const start = document.createElement('div')
      start.className = 'replay-start-marker'
      start.textContent = 'START'
      startRef.current = new marker.AdvancedMarkerElement({ content: start, anchorLeft: '-50%', anchorTop: '-100%' })
      setLoaded(true)
    }).catch((error: Error) => { if (!cancelled) setMapError(error.message) })
    return () => {
      cancelled = true
      linesRef.current.forEach((line) => line.setMap(null))
      if (boatRef.current) boatRef.current.map = null
      if (startRef.current) startRef.current.map = null
      linesRef.current = []
      boatRef.current = null
      startRef.current = null
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!loaded || !mapRef.current) return
    fitMapToCoordinates(mapRef.current, points, 48)
    linesRef.current[0].setOptions({ path: points.map(googleCoordinate) })
    const startPoint = points.find((point) => point.timestamp >= startTime)
    if (startRef.current) {
      if (startPoint) startRef.current.position = googleCoordinate(startPoint)
      startRef.current.map = startPoint ? mapRef.current : null
    }
  }, [loaded, points, startTime])

  useEffect(() => {
    if (!loaded || !mapRef.current || !boatRef.current) return
    if (!current) { boatRef.current.map = null; return }
    const visible = [...points.slice(0, currentIndex + 1), current]
    const prestart = visible.filter((point) => point.timestamp < startTime)
    const racing = visible.filter((point) => point.timestamp >= startTime)
    // Keep the recorded segment across the start boundary connected.
    if (prestart.length && racing.length) prestart.push(racing[0])
    linesRef.current[1].setOptions({ path: prestart.map(googleCoordinate) })
    linesRef.current[2].setOptions({ path: racing.map(googleCoordinate) })
    const boat = boatRef.current
    boat.position = googleCoordinate(current)
    if (boat.map !== mapRef.current) boat.map = mapRef.current
    const content = boat.content as HTMLElement
    content.setAttribute('aria-label', `Replay position at ${Math.round(replayTimestamp)}`)
    content.querySelector<HTMLElement>('.course-map-marker__icon')!.style.transform = `rotate(${current.heading}deg)`
  }, [current, currentIndex, loaded, points, replayTimestamp, startTime])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const nextProgress = Math.min(1, (Date.now() - replayStartedAt.current) / 30_000)
      setProgress(nextProgress)
      if (nextProgress >= 1) setPlaying(false)
    }, 100)
    return () => window.clearInterval(timer)
  }, [playing])

  const startPlayback = () => {
    const startProgress = progress >= 1 ? 0 : progress
    replayStartedAt.current = Date.now() - startProgress * 30_000
    setProgress(startProgress)
    setPlaying(true)
  }

  return (
    <section className="race-replay" aria-label="Actual sailed route and replay">
      <div className="race-replay__controls">
        <button className="button button--secondary" aria-label={playing ? 'Pause replay' : 'Play replay'} disabled={!points.length || !loaded || Boolean(mapError)} onClick={playing ? () => setPlaying(false) : startPlayback}>{playing ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Play</>}</button>
        <button className="button button--secondary" aria-label="Restart replay" disabled={!points.length || !loaded || Boolean(mapError)} onClick={() => { replayStartedAt.current = Date.now(); setProgress(0); setPlaying(true) }}><RotateCcw size={18} /> Restart</button>
        <div className="race-replay__elapsed"><span>{replayTimestamp < startTime ? 'Before start' : 'Elapsed time'}</span><output aria-label="Replay elapsed time">{points.length ? `${replayTimestamp < startTime ? '−' : ''}${formatRaceDuration(Math.abs(replayTimestamp - startTime))}` : '—'}</output></div>
        <progress aria-label="Race replay progress" max="1" value={progress} />
      </div>
      <div className="race-replay__map">
        <div ref={canvasRef} className="race-replay__canvas" role="img" aria-label="Map of the actual sailed route" />
        {mapError && <div className="map-provider-error" role="status">{mapError}</div>}
        {!points.length && <div className="race-replay__empty" role="status">No GPS track was recorded for this race.</div>}
        <div className="map-controls"><button disabled={!loaded || !points.length} onClick={() => mapRef.current && fitMapToCoordinates(mapRef.current, points, 48)}><Maximize2 size={16} /> Fit route</button></div>
        <div className="race-replay__key"><span className="prestart">Pre-start</span><span className="racing">Racing</span></div>
      </div>
    </section>
  )
}
