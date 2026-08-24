import { describe, expect, it } from 'vitest'
import {
  bearingToTrue,
  destinationPoint,
  distanceNm,
  intersectSightings,
  resolveMarkPosition,
  timeToLineSeconds,
  velocityMadeGood,
  withManualMarkCoordinate,
  withSightingMarkCoordinate,
  withoutSightingMarkCoordinate,
} from './geo'

describe('navigation calculations', () => {
  it('resolves a two-point gate mark to its midpoint', () => {
    expect(resolveMarkPosition({ kind: 'gate', pointA: { latitude: -33.86, longitude: 151.23 }, pointB: { latitude: -33.84, longitude: 151.25 } })).toEqual({ latitude: -33.85, longitude: 151.24 })
  })
  it('preserves a constructed definition while applying and removing coordinate overrides', () => {
    const constructed = {
      kind: 'constructed' as const,
      origin: { latitude: -33.86, longitude: 151.24 },
      distanceNm: 1,
      bearing: { degrees: 45, reference: 'true' as const },
    }
    const manual = { latitude: -33.85, longitude: 151.25 }
    const sighted = { latitude: -33.84, longitude: 151.26 }
    const adjusted = withSightingMarkCoordinate(withManualMarkCoordinate(constructed, manual), sighted)

    expect(resolveMarkPosition(adjusted)).toEqual(sighted)
    const afterDeletingSightings = withoutSightingMarkCoordinate(adjusted)
    expect(resolveMarkPosition(afterDeletingSightings)).toEqual(manual)
    expect(afterDeletingSightings).toMatchObject(constructed)
  })
  it('resolves a mark one nautical mile due north', () => {
    const result = destinationPoint({ latitude: -33.87423, longitude: 151.23377 }, 1, 0)
    expect(result.latitude).toBeCloseTo(-33.85756, 4)
    expect(result.longitude).toBeCloseTo(151.23377, 4)
  })

  it('retains true bearings and converts magnetic bearings using declination', () => {
    expect(bearingToTrue({ degrees: 35, reference: 'true' })).toBe(35)
    expect(bearingToTrue({ degrees: 35, reference: 'magnetic', declination: 12.4 })).toBeCloseTo(47.4)
  })

  it('resolves constructed marks from their original instruction', () => {
    const coordinate = resolveMarkPosition({
      kind: 'constructed',
      origin: { latitude: -33.87423, longitude: 151.23377 },
      distanceNm: 1,
      bearing: { degrees: 0, reference: 'true' },
    })
    expect(coordinate?.latitude).toBeCloseTo(-33.85756, 4)
  })

  it('calculates VMG independently from speed and target bearing', () => {
    expect(velocityMadeGood(6, 45, 45)).toBeCloseTo(6)
    expect(velocityMadeGood(6, 135, 45)).toBeCloseTo(0, 5)
    expect(velocityMadeGood(6, 225, 45)).toBeCloseTo(-6)
  })

  it('intersects two separated sightings', () => {
    const target = { latitude: -33.85, longitude: 151.25 }
    const first = { latitude: -33.86, longitude: 151.23 }
    const second = { latitude: -33.87, longitude: 151.25 }
    const intersection = intersectSightings(
      { observer: first, bearingTrue: 58.9 },
      { observer: second, bearingTrue: 0 },
    )
    expect(intersection).not.toBeNull()
    expect(distanceNm(intersection!, target)).toBeLessThan(0.04)
  })

  it('projects time until the boat crosses the start line', () => {
    const seconds = timeToLineSeconds(
      { latitude: -33.87, longitude: 151.24 },
      0,
      6,
      { latitude: -33.869, longitude: 151.239 },
      { latitude: -33.869, longitude: 151.241 },
    )
    expect(seconds).toBeGreaterThan(30)
    expect(seconds).toBeLessThan(45)
  })

  it('does not estimate a crossing behind the boat', () => {
    expect(timeToLineSeconds(
      { latitude: -33.87, longitude: 151.24 },
      180,
      6,
      { latitude: -33.869, longitude: 151.239 },
      { latitude: -33.869, longitude: 151.241 },
    )).toBeNull()
  })
})
