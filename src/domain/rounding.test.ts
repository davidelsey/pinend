import { describe, expect, it } from 'vitest'
import { shouldSuggestRounding } from './rounding'
import type { Coordinate, SensorReading } from './types'

const reading = (coordinate: Coordinate, timestamp: number): SensorReading => ({
  ...coordinate,
  timestamp,
  accuracy: 4,
  heading: 0,
  speedKnots: 5,
  source: 'simulator',
})

describe('automatic waypoint progression', () => {
  const mark = { latitude: -33.85, longitude: 151.25 }

  it('suggests confirmation after close approach and movement away', () => {
    const track = [
      reading({ latitude: -33.852, longitude: 151.25 }, 1),
      reading({ latitude: -33.8501, longitude: 151.25 }, 2),
      reading({ latitude: -33.851, longitude: 151.25 }, 3),
    ]
    expect(shouldSuggestRounding(track, mark, 35)).toBe(true)
  })

  it('does not suggest confirmation while still approaching', () => {
    const track = [
      reading({ latitude: -33.853, longitude: 151.25 }, 1),
      reading({ latitude: -33.852, longitude: 151.25 }, 2),
      reading({ latitude: -33.851, longitude: 151.25 }, 3),
    ]
    expect(shouldSuggestRounding(track, mark, 35)).toBe(false)
  })
})
