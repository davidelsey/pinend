import { Bug, FastForward, LocateFixed, Navigation, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import type { Coordinate } from '../domain/types'

export function DevSimulator({ target }: { target?: Coordinate }) {
  const {
    simulator,
    simulatorEnabled,
    setSimulatorEnabled,
    configureSimulator,
    stepSimulator,
    placeSimulator,
  } = useApp()
  const [expanded, setExpanded] = useState(false)

  if (!import.meta.env.DEV) return null

  return (
    <aside className={`simulator ${expanded ? 'simulator--expanded' : ''}`} data-testid="sensor-simulator">
      <button className="simulator__header" onClick={() => setExpanded((value) => !value)}>
        <span><Bug size={16} /> Sensor simulator</span>
        <span className={`status-dot ${simulatorEnabled ? 'status-dot--active' : ''}`} />
      </button>
      {expanded && (
        <div className="simulator__body">
          <label className="toggle-row">
            <span><SlidersHorizontal size={15} /> Use simulated sensors</span>
            <input
              type="checkbox"
              checked={simulatorEnabled}
              onChange={(event) => setSimulatorEnabled(event.target.checked)}
            />
          </label>
          <label>
            <span>Bearing <strong>{Math.round(simulator.heading)}° T</strong></span>
            <input
              type="range"
              min="0"
              max="359"
              value={simulator.heading}
              onChange={(event) => configureSimulator({ heading: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Speed <strong>{simulator.speedKnots.toFixed(1)} kn</strong></span>
            <input
              type="range"
              min="0"
              max="20"
              step="0.1"
              value={simulator.speedKnots}
              onChange={(event) => configureSimulator({ speedKnots: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Accuracy <strong>±{simulator.accuracy} m</strong></span>
            <input
              type="range"
              min="1"
              max="50"
              value={simulator.accuracy}
              onChange={(event) => configureSimulator({ accuracy: Number(event.target.value) })}
            />
          </label>
          <div className="simulator__coords">
            {simulator.coordinate.latitude.toFixed(5)}, {simulator.coordinate.longitude.toFixed(5)}
          </div>
          <div className="button-row">
            <button className="button button--small button--secondary" onClick={() => stepSimulator(30)}>
              <FastForward size={15} /> Move 30 sec
            </button>
            {target && (
              <button
                className="button button--small button--secondary"
                onClick={() => placeSimulator(target.latitude - 0.00015, target.longitude, simulator.heading)}
              >
                <LocateFixed size={15} /> Near next mark
              </button>
            )}
          </div>
          <p className="microcopy"><Navigation size={12} /> Development builds only. Never included in production bundles.</p>
        </div>
      )}
    </aside>
  )
}
