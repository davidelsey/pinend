import { destinationPoint } from '../domain/geo'
import type { Coordinate, SensorReading } from '../domain/types'

export type SimulatorState = {
  coordinate: Coordinate
  heading: number
  speedKnots: number
  accuracy: number
  reading: SensorReading
}

export function createSimulator(coordinate: Coordinate): SimulatorState {
  return {
    coordinate,
    heading: 22,
    speedKnots: 6.2,
    accuracy: 4,
    reading: {
      ...coordinate,
      timestamp: Date.now(),
      accuracy: 4,
      heading: 22,
      speedKnots: 6.2,
      source: 'simulator',
      headingSource: 'simulator',
      headingReliable: true,
      deviceHeading: 22,
      courseOverGround: 22,
    },
  }
}

export function moveSimulator(state: SimulatorState, elapsedSeconds: number, timestamp = Date.now()): SimulatorState {
  const distanceNm = state.speedKnots * (elapsedSeconds / 3600)
  const coordinate = destinationPoint(state.coordinate, distanceNm, state.heading)
  return {
    ...state,
    coordinate,
    reading: {
      ...coordinate,
      timestamp,
      accuracy: state.accuracy,
      heading: state.heading,
      speedKnots: state.speedKnots,
      source: 'simulator',
      headingSource: 'simulator',
      headingReliable: true,
      deviceHeading: state.heading,
      courseOverGround: state.heading,
    },
  }
}

export function configureSimulator(
  state: SimulatorState,
  patch: Partial<Pick<SimulatorState, 'heading' | 'speedKnots' | 'accuracy'>>,
  timestamp = Date.now(),
): SimulatorState {
  const next = { ...state, ...patch }
  return {
    ...next,
    reading: {
      ...next.coordinate,
      timestamp,
      accuracy: next.accuracy,
      heading: next.heading,
      speedKnots: next.speedKnots,
      source: 'simulator',
      headingSource: 'simulator',
      headingReliable: true,
      deviceHeading: next.heading,
      courseOverGround: next.heading,
    },
  }
}

export function setSimulatorPosition(
  state: SimulatorState,
  coordinate: Coordinate,
  heading = state.heading,
  timestamp = Date.now(),
): SimulatorState {
  return {
    ...state,
    coordinate,
    heading,
    reading: {
      ...coordinate,
      timestamp,
      accuracy: state.accuracy,
      heading,
      speedKnots: state.speedKnots,
      source: 'simulator',
      headingSource: 'simulator',
      headingReliable: true,
      deviceHeading: heading,
      courseOverGround: heading,
    },
  }
}
