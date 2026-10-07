import { Calculator, Clock3, Gauge, Route, Sailboat } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { RaceReplayMap } from '../components/RaceReplayMap'
import { formatRaceDuration, summarizeRace } from '../domain/raceSummary'

export function FinishedPage({ onReset }: { onReset(): void }) {
  const { race: currentRace, session } = useApp()
  const race = session.courseSnapshot ?? currentRace
  const summary = summarizeRace(race, session)
  return (
    <div className="finished-page">
      <header className="finished-page__header">
        <div className="finished-flag"><Sailboat size={34} /></div>
        <div><span className="eyebrow">Race complete</span><h1>Finished.</h1><p>{race.series} · {race.name} · {race.fleet}</p></div>
        <button className="button button--orange" onClick={onReset}>Back to races</button>
      </header>
      <main className="finished-page__overview">
        <section className="finish-stats" aria-label="Race statistics">
          <span><Route size={19} /><small>Total distance sailed</small><strong>{summary.distanceNm.toFixed(2)} NM</strong></span>
          <span><Gauge size={19} /><small>Average GPS speed</small><strong>{summary.averageSpeedKnots == null ? '—' : `${summary.averageSpeedKnots.toFixed(1)} kn`}</strong></span>
          <span><Clock3 size={19} /><small>Total duration</small><strong>{formatRaceDuration(summary.durationMs)}</strong></span>
          <span><Calculator size={19} /><small>Corrected time</small><strong>{summary.correctedTimeMs == null ? 'No handicap' : formatRaceDuration(summary.correctedTimeMs)}</strong>{race.handicap && <em>TCF {race.handicap.toFixed(3)}</em>}</span>
        </section>
        <div className="finished-page__map-heading"><div><span className="eyebrow">GPS track</span><h2>Actual route sailed</h2></div><small>{summary.allTelemetry.length} recorded positions · 30-second replay</small></div>
        <RaceReplayMap telemetry={summary.allTelemetry} startTime={session.syncedStartTime} />
        <section className="panel"><h2>Race timings</h2><dl className="timing-list"><div><dt>Race start</dt><dd>{new Date(session.syncedStartTime).toLocaleString()}</dd></div>{race.course.map((waypoint, index) => <div key={waypoint.id}><dt>{session.marksSnapshot?.find((mark) => mark.id === waypoint.markId)?.name ?? `Waypoint ${index + 1}`}</dt><dd>{session.roundedAt[waypoint.id] ? new Date(session.roundedAt[waypoint.id]).toLocaleTimeString() : 'Not recorded'}</dd></div>)}</dl></section>
      </main>
    </div>
  )
}
