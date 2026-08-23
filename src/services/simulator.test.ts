import { describe, expect, it } from 'vitest'
import { createSimulator, moveSimulator } from './simulator'

describe('development sensor simulator', () => {
  it('moves at the selected bearing and emits simulator readings', () => {
    const simulator = createSimulator({ latitude: -33.87423, longitude: 151.23377 })
    const moved = moveSimulator({ ...simulator, heading: 90, speedKnots: 6 }, 60, 1000)
    expect(moved.reading.source).toBe('simulator')
    expect(moved.reading.longitude).toBeGreaterThan(simulator.coordinate.longitude)
    expect(moved.reading.latitude).toBeCloseTo(simulator.coordinate.latitude, 3)
  })
})
