import { Crosshair, Navigation } from 'lucide-react'
import { CoursePlot } from './CoursePlot'
import { normalizeBearing } from '../domain/geo'
import type { Coordinate, Mark, RaceDefinition } from '../domain/types'

type Props = {
  coordinate: Coordinate
  heading: number
  speedKnots: number
  marks: Mark[]
  race: RaceDefinition
  onPosition(coordinate: Coordinate): void
  onVector(heading: number, speedKnots: number): void
}

export function SimulatorMap({ coordinate, heading, speedKnots, marks, race, onPosition, onVector }: Props) {
  return (
    <div className="simulator-map" aria-label="Drag the boat and its speed handle on the simulator map">
      <CoursePlot marks={marks} race={race} current={{ ...coordinate, deviceHeading: heading, courseOverGround: heading }} simulation={{ speedKnots, onPosition, onVector }} zoomControls />
      <div className="simulator-map__legend"><span><Crosshair size={13} /> Drag YOU to move</span><span><Navigation size={13} /> Drag handle · {Math.round(normalizeBearing(heading))}° · {speedKnots.toFixed(1)} kn</span></div>
    </div>
  )
}
