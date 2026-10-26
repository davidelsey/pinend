import { useEffect, useState } from 'react'
import { Check, TimerReset } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { syncStartFromSignal } from '../domain/countdown'
import { timeToLineSeconds } from '../domain/geo'
import type { Coordinate, SensorReading } from '../domain/types'

export function StartSequenceControls() {
  const { isNavigator, session, updateSession } = useApp()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(null), 3500)
    return () => window.clearTimeout(timeout)
  }, [message])

  const sync = (minutes: 5 | 4 | 1 | 0) => {
    void updateSession({ syncedStartTime: syncStartFromSignal(Date.now(), minutes), autoStartArmed: true })
    setMessage(minutes === 0 ? 'Start gun synchronized' : `${minutes}-minute signal synchronized`)
  }

  return <div className="prestart-sync">
    {message && <div className="toast"><Check size={16} /> {message}</div>}
    <div className="signal-buttons" aria-label="Start sequence synchronization">
      {([5, 4, 1, 0] as const).map((minute) => <button disabled={!isNavigator} key={minute} onClick={() => sync(minute)}>
        <span>{minute === 0 ? 'START' : `${minute}:00`}</span><small>{minute === 5 ? 'Warning' : minute === 4 ? 'Preparatory' : minute === 1 ? 'One minute' : 'Gun'}</small>
      </button>)}
    </div>
    <label className="specific-countdown"><TimerReset size={14} /> Exact start
      <input aria-label="Exact start" disabled={!isNavigator} type="time" step="1" value={new Date(session.syncedStartTime - new Date(session.syncedStartTime).getTimezoneOffset() * 60_000).toISOString().slice(11, 19)} onChange={(event) => {
        if (!event.target.value) return
        const [hours, minutes, seconds] = event.target.value.split(':').map(Number)
        const next = new Date(session.syncedStartTime)
        next.setHours(hours, minutes, seconds || 0, 0)
        void updateSession({ syncedStartTime: next.getTime(), autoStartArmed: true })
      }} />
    </label>
  </div>
}

export function StartLineTiming({ now, line, reading }: { now: number; line: { pin: Coordinate; committee: Coordinate } | null; reading: SensorReading | null }) {
  const { session } = useApp()
  const crossingSeconds = line && reading ? timeToLineSeconds(reading, reading.heading, reading.speedKnots, line.pin, line.committee) : null
  const delta = crossingSeconds == null ? null : crossingSeconds - Math.max((session.syncedStartTime - now) / 1000, 0)
  const label = delta == null
    ? !line ? 'Set the start line' : !reading ? 'Waiting for GPS' : reading.speedKnots <= 0.1 ? 'Build boat speed' : 'Not on a crossing course'
    : Math.abs(delta) <= 1 ? 'On time' : `${Math.round(Math.abs(delta))}s ${delta < 0 ? 'early' : 'late'}`
  return <div className="prestart-crossing"><span>Estimated line crossing</span><strong>{label}</strong></div>
}
