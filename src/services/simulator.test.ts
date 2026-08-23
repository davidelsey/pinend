import { describe, expect, it } from 'vitest'
import { configureSimulator, createSimulator, moveSimulator } from './simulator'

describe('development sensor simulator', () => {
  it('moves at the selected bearing and emits simulator readings', () => {
    const simulator = createSimulator({ latitude: -33.87423, longitude: 151.23377 })
    const moved = moveSimulator({ ...simulator, heading: 90, speedKnots: 6 }, 60, 1000)
    expect(moved.reading.source).toBe('simulator')
    expect(moved.reading.longitude).toBeGreaterThan(simulator.coordinate.longitude)
    expect(moved.reading.latitude).toBeCloseTo(simulator.coordinate.latitude, 3)
  })

  it('publishes mocked bearing, velocity, and accuracy immediately', () => {
    const simulator = createSimulator({ latitude: -33.9, longitude: 151.2 })
    const configured = configureSimulator(simulator, { heading: 245, speedKnots: 8.4, accuracy: 2 }, 1234)

    expect(configured.reading).toMatchObject({ heading: 245, speedKnots: 8.4, accuracy: 2, timestamp: 1234, source: 'simulator' })
  })
})
