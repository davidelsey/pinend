import { Bug, FastForward, LocateFixed, Navigation, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const [latitudeDraft, setLatitudeDraft] = useState(String(simulator.coordinate.latitude))
  const [longitudeDraft, setLongitudeDraft] = useState(String(simulator.coordinate.longitude))
  const [positionError, setPositionError] = useState<string | null>(null)

  useEffect(() => {
    setLatitudeDraft(String(simulator.coordinate.latitude))
    setLongitudeDraft(String(simulator.coordinate.longitude))
  }, [simulator.coordinate.latitude, simulator.coordinate.longitude])

  const applyPosition = () => {
    const latitude = Number(latitudeDraft)
    const longitude = Number(longitudeDraft)
    if (latitudeDraft.trim() === '' || longitudeDraft.trim() === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setPositionError('Enter a latitude from -90 to 90 and longitude from -180 to 180')
      return
    }
    setPositionError(null)
    placeSimulator(latitude, longitude)
  }

  if (!import.meta.env.DEV) return null

  return (
    <aside className={`simulator ${expanded ? 'simulator--expanded' : ''}`} data-testid="sensor-simulator">
      <button className="simulator__header" aria-label="Debug mode: boat simulator" aria-expanded={expanded} aria-controls="debug-simulator-controls" aria-describedby="debug-simulator-status" onClick={() => setExpanded((value) => !value)}>
        <span><Bug size={16} /> Debug mode</span>
        <span className={`status-dot ${simulatorEnabled ? 'status-dot--active' : ''}`} aria-hidden="true" />
      </button>
      <span id="debug-simulator-status" className="sr-only">Simulated sensors {simulatorEnabled ? 'enabled' : 'disabled'}</span>
      {expanded && (
        <div className="simulator__body" id="debug-simulator-controls">
          <label className="toggle-row">
            <span><SlidersHorizontal size={15} /> Use simulated sensors</span>
            <input
              type="checkbox"
              checked={simulatorEnabled}
              onChange={(event) => setSimulatorEnabled(event.target.checked)}
            />
          </label>
          <label>
            <span>Course / bearing <strong>{Math.round(simulator.heading)}° T</strong></span>
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
          <div className="simulator__position">
            <label><span>Mock latitude</span><input aria-label="Mock latitude" type="number" step="0.00001" value={latitudeDraft} onChange={(event) => setLatitudeDraft(event.target.value)} /></label>
            <label><span>Mock longitude</span><input aria-label="Mock longitude" type="number" step="0.00001" value={longitudeDraft} onChange={(event) => setLongitudeDraft(event.target.value)} /></label>
          </div>
          {positionError && <p className="simulator__error" role="alert">{positionError}</p>}
          <button className="button button--small button--secondary" onClick={applyPosition}><LocateFixed size={15} /> Apply position</button>
          <div className="simulator__coords">{simulator.coordinate.latitude.toFixed(5)}, {simulator.coordinate.longitude.toFixed(5)}</div>
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
