import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SensorReading } from '../domain/types'

type Props = { telemetry: SensorReading[]; startTime: number }

export function RaceReplayMap({ telemetry, startTime }: Props) {
  const [progress, setProgress] = useState(1)
  const [playing, setPlaying] = useState(false)
  const replayStartedAt = useRef(0)
  const geometry = useMemo(() => {
    const rawPoints = [...telemetry].sort((first, second) => first.timestamp - second.timestamp)
    const sampleStep = Math.max(1, Math.ceil(rawPoints.length / 3_000))
    const points = rawPoints.filter((_point, index) => index % sampleStep === 0 || index === rawPoints.length - 1)
    const startReading = rawPoints.find((point) => point.timestamp >= startTime)
    if (startReading && !points.includes(startReading)) points.push(startReading)
    points.sort((first, second) => first.timestamp - second.timestamp)
    const extent = points.reduce((current, point) => ({ minLatitude: Math.min(current.minLatitude, point.latitude), maxLatitude: Math.max(current.maxLatitude, point.latitude), minLongitude: Math.min(current.minLongitude, point.longitude), maxLongitude: Math.max(current.maxLongitude, point.longitude) }), { minLatitude: Infinity, maxLatitude: -Infinity, minLongitude: Infinity, maxLongitude: -Infinity })
    const latitudeSpan = Math.max(extent.maxLatitude - extent.minLatitude || 0, 0.002) * 1.2
    const longitudeSpan = Math.max(extent.maxLongitude - extent.minLongitude || 0, 0.002) * 1.2
    const centreLatitude = points.length ? (extent.minLatitude + extent.maxLatitude) / 2 : 0
    const centreLongitude = points.length ? (extent.minLongitude + extent.maxLongitude) / 2 : 0
    const projected = points.map((point) => ({ ...point, x: 7 + ((point.longitude - (centreLongitude - longitudeSpan / 2)) / longitudeSpan) * 86, y: 7 + (((centreLatitude + latitudeSpan / 2) - point.latitude) / latitudeSpan) * 86 }))
    const metrics = (values: typeof projected) => {
      const cumulative = values.map((_point, index) => index === 0 ? 0 : Math.hypot(values[index].x - values[index - 1].x, values[index].y - values[index - 1].y))
      for (let index = 1; index < cumulative.length; index += 1) cumulative[index] += cumulative[index - 1]
      return { values, cumulative, total: cumulative.at(-1) ?? 0, path: values.map((point) => `${point.x},${point.y}`).join(' ') }
    }
    const prestart = projected.filter((point) => point.timestamp < startTime)
    const racing = projected.filter((point) => point.timestamp >= startTime)
    return { points: projected, fullPath: metrics(projected).path, prestart: metrics(prestart), racing: metrics(racing), startPoint: racing[0] }
  }, [startTime, telemetry])
  const firstTimestamp = geometry.points[0]?.timestamp ?? 0
  const lastTimestamp = geometry.points.at(-1)?.timestamp ?? firstTimestamp
  const replayTimestamp = firstTimestamp + progress * (lastTimestamp - firstTimestamp)
  const segmentAt = <T extends { timestamp: number },>(values: T[]) => {
    let low = 0
    let high = Math.max(0, values.length - 1)
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (values[middle].timestamp <= replayTimestamp) low = middle
      else high = middle - 1
    }
    return low
  }
  const currentIndex = geometry.points.length ? segmentAt(geometry.points) : -1
  const currentBase = geometry.points[currentIndex]
  const currentNext = geometry.points[currentIndex + 1]
  const currentFraction = currentBase && currentNext && currentNext.timestamp > currentBase.timestamp ? Math.min(1, Math.max(0, (replayTimestamp - currentBase.timestamp) / (currentNext.timestamp - currentBase.timestamp))) : 0
  const current = currentBase ? { ...currentBase, x: currentBase.x + ((currentNext?.x ?? currentBase.x) - currentBase.x) * currentFraction, y: currentBase.y + ((currentNext?.y ?? currentBase.y) - currentBase.y) * currentFraction } : undefined
  const routeProgress = (route: typeof geometry.prestart) => {
    if (!route.values.length || replayTimestamp < route.values[0].timestamp) return 0
    if (replayTimestamp >= route.values.at(-1)!.timestamp) return 1
    const index = segmentAt(route.values)
    const base = route.values[index]
    const next = route.values[index + 1]
    const timeFraction = next.timestamp > base.timestamp ? (replayTimestamp - base.timestamp) / (next.timestamp - base.timestamp) : 0
    const distance = route.cumulative[index] + (route.cumulative[index + 1] - route.cumulative[index]) * timeFraction
    return route.total > 0 ? distance / route.total : timeFraction
  }
  const prestartProgress = routeProgress(geometry.prestart)
  const raceProgress = routeProgress(geometry.racing)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const next = Math.min(1, (Date.now() - replayStartedAt.current) / 30_000)
      setProgress(next)
      if (next >= 1) setPlaying(false)
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
      <div className="race-replay__map">
        {geometry.points.length ? (
          <svg viewBox="0 0 100 100" role="img" aria-label="Map of the actual sailed route">
            <defs><pattern id="replay-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="rgba(160,205,218,.1)" strokeWidth=".35" /></pattern></defs>
            <rect width="100" height="100" fill="#082b40" />
            <rect width="100" height="100" fill="url(#replay-grid)" />
            <polyline points={geometry.fullPath} fill="none" stroke="rgba(245,241,232,.2)" strokeWidth="1" />
            {geometry.prestart.path && <polyline points={geometry.prestart.path} pathLength="1" fill="none" stroke="#ff9a73" strokeWidth="1.7" strokeDasharray={`${prestartProgress} 1`} />}
            {geometry.racing.path && <polyline points={geometry.racing.path} pathLength="1" fill="none" stroke="#53d3c2" strokeWidth="2" strokeDasharray={`${raceProgress} 1`} />}
            {geometry.startPoint && <g transform={`translate(${geometry.startPoint.x} ${geometry.startPoint.y})`} className="race-replay__start"><circle r="1.8" /><text x="3" y="1">START</text></g>}
            {current && <g transform={`translate(${current.x} ${current.y}) rotate(${current.heading})`} className="race-replay__boat" aria-label={`Replay position at ${Math.round(replayTimestamp)}`}><circle r="3.5" /><path d="M0 -3 L2.2 2.5 L0 1.5 L-2.2 2.5Z" /></g>}
          </svg>
        ) : <div className="race-replay__empty">No GPS track was recorded for this race.</div>}
        <div className="race-replay__key"><span className="prestart">Pre-start</span><span className="racing">Racing</span></div>
      </div>
      <div className="race-replay__controls">
        <button className="button button--secondary" disabled={!geometry.points.length} onClick={playing ? () => setPlaying(false) : startPlayback}>{playing ? <><Pause size={16} /> Pause replay</> : progress < 1 ? <><Play size={16} /> Resume replay</> : <><RotateCcw size={16} /> Replay 30 seconds</>}</button>
        <div><span>Entire race + pre-start</span><progress aria-label="Race replay progress" max="1" value={progress} /></div>
      </div>
    </section>
  )
}
