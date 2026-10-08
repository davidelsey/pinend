import { Bug, FastForward, LocateFixed, SlidersHorizontal } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { SimulatorMap } from '../components/SimulatorMap'
import { resolveMarkPosition } from '../domain/geo'

export function DebugPage() {
  const { marks, race, session, simulator, simulatorEnabled, latestReading, setSimulatorEnabled, configureSimulator, placeSimulator, stepSimulator } = useApp()
  const target = race.course
    .slice(session.activeWaypointIndex)
    .map((waypoint) => marks.find((mark) => mark.id === waypoint.markId))
    .flatMap((mark) => {
      const coordinate = mark ? resolveMarkPosition(mark.position) : undefined
      return mark && coordinate ? [{ mark, coordinate }] : []
    })[0]

  if (!import.meta.env.DEV) return null

  return (
    <div className="page standard-page debug-page">
      <section className="page-title">
        <span className="eyebrow"><Bug size={14} /> Development tools</span>
        <h1>Drive the simulated boat.</h1>
        <p>Drag the boat to move it. Drag the handle ahead of it to set course and speed.</p>
      </section>

      <section className="debug-map-panel">
        <SimulatorMap coordinate={simulator.coordinate} heading={simulator.heading} speedKnots={simulator.speedKnots} marks={marks} race={race} onPosition={(coordinate) => placeSimulator(coordinate.latitude, coordinate.longitude)} onVector={(heading, speedKnots) => configureSimulator({ heading, speedKnots })} />
        <div className="debug-map-panel__controls">
          <label className="toggle-row"><span><SlidersHorizontal size={15} /> Use simulated sensors</span><input type="checkbox" checked={simulatorEnabled} onChange={(event) => setSimulatorEnabled(event.target.checked)} /></label>
          <label className="debug-accuracy"><span>GPS accuracy <strong>±{simulator.accuracy} m</strong></span><input aria-label="GPS accuracy" type="range" min="1" max="50" value={simulator.accuracy} onChange={(event) => configureSimulator({ accuracy: Number(event.target.value) })} /></label>
          <div className="button-row">
            <button className="button button--small button--secondary" onClick={() => stepSimulator(30)}><FastForward size={15} /> Move 30 sec</button>
            {target && <button className="button button--small button--secondary" onClick={() => placeSimulator(target.coordinate.latitude - 0.00015, target.coordinate.longitude, simulator.heading)}><LocateFixed size={15} /> Near {target.mark.shortName}</button>}
          </div>
          <p className="debug-sensor-status" role="status">{simulatorEnabled ? 'Simulated GPS, direction and speed are active throughout the app.' : latestReading?.source === 'simulator' ? 'Using the simulated boat throughout the app while GPS is unavailable.' : 'Enable simulated sensors to override device GPS throughout the app.'}</p>
        </div>
      </section>
    </div>
  )
}
