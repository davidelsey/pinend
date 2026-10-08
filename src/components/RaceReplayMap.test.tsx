import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SensorReading } from '../domain/types'
import { RaceReplayMap } from './RaceReplayMap'

const point = (timestamp: number, latitude: number): SensorReading => ({ timestamp, latitude, longitude: 151.23, accuracy: 3, heading: 0, speedKnots: 5, source: 'simulator' })

describe('RaceReplayMap', () => {
  afterEach(() => vi.useRealTimers())

  it('replays pre-start and race telemetry on Google Maps over exactly 30 seconds', async () => {
    vi.useFakeTimers()
    await act(async () => { render(<RaceReplayMap telemetry={[point(1_000, -33.87), point(2_000, -33.871), point(12_000, -33.872)]} startTime={2_000} />) })
    expect(screen.getByRole('img', { name: 'Map of the actual sailed route' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Map of the actual sailed route' })).toHaveAttribute('data-fitted', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Play replay' }))
    expect(screen.getByRole('progressbar', { name: 'Race replay progress' })).toHaveValue(0)
    expect(screen.getByLabelText('Replay elapsed time')).toHaveTextContent('−0:00:01')

    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByLabelText('Replay position at 6500')).toBeInTheDocument()
    expect(screen.getByLabelText('Replay elapsed time')).toHaveTextContent('0:00:05')
    fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }))
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByLabelText('Replay position at 6500')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play replay' }))
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByRole('progressbar', { name: 'Race replay progress' })).toHaveValue(1)
    expect(screen.getByRole('button', { name: 'Play replay' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restart replay' }))
    expect(screen.getByRole('progressbar', { name: 'Race replay progress' })).toHaveValue(0)
    expect(screen.getByRole('button', { name: 'Pause replay' })).toBeInTheDocument()
  })

  it('shows an empty state and disables replay without recorded GPS positions', async () => {
    await act(async () => { render(<RaceReplayMap telemetry={[]} startTime={2_000} />) })
    expect(screen.getByText('No GPS track was recorded for this race.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play replay' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Restart replay' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fit route' })).toBeDisabled()
  })
})
