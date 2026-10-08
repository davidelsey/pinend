import { Calculator, Clock3, Gauge, Route, Sailboat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import { RaceReplayMap } from '../components/RaceReplayMap'
import { formatRaceDuration, summarizeRace } from '../domain/raceSummary'

export function FinishedPage({ onReset }: { onReset(): void }) {
  const { race: currentRace, session } = useApp()
  const race = session.courseSnapshot ?? currentRace
  const summary = useMemo(() => summarizeRace(race, session), [race, session])
  const [tab, setTab] = useState<'replay' | 'stats'>('replay')
  return (
    <div className={`finished-page ${tab === 'replay' ? 'finished-page--replay' : ''}`}>
      <header className="finished-page__header">
        <div className="finished-flag"><Sailboat size={34} /></div>
        <div><span className="eyebrow">Race complete</span><h1>Finished.</h1><p>{race.series} · {race.name} · {race.fleet}</p></div>
        <button className="button button--orange" onClick={onReset}>Back to races</button>
      </header>
      <main className="finished-page__overview">
        <div className="finished-tabs" role="tablist" aria-label="Race results">
          {(['replay', 'stats'] as const).map((value) => <button key={value} id={`finished-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`finished-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 'replay' : event.key === 'End' ? 'stats' : value === 'replay' ? 'stats' : 'replay'
            setTab(next)
            document.getElementById(`finished-tab-${next}`)?.focus()
          }}>{value === 'replay' ? 'Route replay' : 'Stats'}</button>)}
        </div>
        {tab === 'stats' ? <div className="finished-results-panel" role="tabpanel" id="finished-panel-stats" aria-labelledby="finished-tab-stats">
        <section className="finish-stats" aria-label="Race statistics">
          <span><Route size={19} /><small>Total distance sailed</small><strong>{summary.distanceNm.toFixed(2)} NM</strong></span>
          <span><Gauge size={19} /><small>Average GPS speed</small><strong>{summary.averageSpeedKnots == null ? '—' : `${summary.averageSpeedKnots.toFixed(1)} kn`}</strong></span>
          <span><Clock3 size={19} /><small>Total duration</small><strong>{formatRaceDuration(summary.durationMs)}</strong></span>
          <span><Calculator size={19} /><small>Corrected time</small><strong>{summary.correctedTimeMs == null ? 'No handicap' : formatRaceDuration(summary.correctedTimeMs)}</strong>{race.handicap && <em>TCF {race.handicap.toFixed(3)}</em>}</span>
        </section>
        <section className="panel"><h2>Race timings</h2><dl className="timing-list"><div><dt>Race start</dt><dd>{new Date(session.syncedStartTime).toLocaleString()}</dd></div>{race.course.map((waypoint, index) => <div key={waypoint.id}><dt>{session.marksSnapshot?.find((mark) => mark.id === waypoint.markId)?.name ?? `Waypoint ${index + 1}`}</dt><dd>{session.roundedAt[waypoint.id] ? new Date(session.roundedAt[waypoint.id]).toLocaleTimeString() : 'Not recorded'}</dd></div>)}</dl></section>
        </div> : <div className="finished-results-panel" role="tabpanel" id="finished-panel-replay" aria-labelledby="finished-tab-replay">
          <div className="finished-page__map-heading"><div><span className="eyebrow">GPS track</span><h2>Actual route sailed</h2></div><small>{summary.allTelemetry.length} recorded positions · 30-second replay</small></div>
          <RaceReplayMap key={session.id} telemetry={summary.allTelemetry} startTime={session.syncedStartTime} />
        </div>}
      </main>
    </div>
  )
}
