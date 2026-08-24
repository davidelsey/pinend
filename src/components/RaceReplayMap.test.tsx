import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SensorReading } from '../domain/types'
import { RaceReplayMap } from './RaceReplayMap'

const point = (timestamp: number, latitude: number): SensorReading => ({ timestamp, latitude, longitude: 151.23, accuracy: 3, heading: 0, speedKnots: 5, source: 'simulator' })

describe('RaceReplayMap', () => {
  afterEach(() => vi.useRealTimers())

  it('replays pre-start and race telemetry over exactly 30 seconds', () => {
    vi.useFakeTimers()
    render(<RaceReplayMap telemetry={[point(1_000, -33.87), point(2_000, -33.871), point(12_000, -33.872)]} startTime={2_000} />)
    expect(screen.getByRole('img', { name: 'Map of the actual sailed route' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Replay 30 seconds' }))
    expect(screen.getByRole('progressbar', { name: 'Race replay progress' })).toHaveValue(0)

    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByLabelText('Replay position at 6500')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByRole('progressbar', { name: 'Race replay progress' })).toHaveValue(1)
    expect(screen.getByRole('button', { name: 'Replay 30 seconds' })).toBeInTheDocument()
  })
})
