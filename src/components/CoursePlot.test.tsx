import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { seedMarks, seedRace } from '../data/seed'
import { CoursePlot } from './CoursePlot'
import type { Mark, RaceDefinition } from '../domain/types'

describe('CoursePlot', () => {
  it('shows the boat and lets the user recenter or fit all waypoints', () => {
    render(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -33.87, longitude: 151.24 }} />)

    expect(screen.getByText('Current location')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recenter on current location' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fit all course waypoints' }))
  })

  it('lets the user align the map to the device heading', () => {
    const { container } = render(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -33.87, longitude: 151.24, deviceHeading: 92, courseOverGround: 135 }} />)

    expect(screen.getByRole('button', { name: 'North up' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('You, travelling 135 degrees')).toBeInTheDocument()
    expect(container.querySelector('.course-plot__you-direction')).toHaveAttribute('transform', 'rotate(135)')
    fireEvent.click(screen.getByRole('button', { name: 'Device aligned' }))

    expect(screen.getByRole('button', { name: 'Device aligned' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Offline course plot, device aligned at 092 degrees' })).toBeInTheDocument()
    expect(screen.getByText(/2 · CLARK/)).toHaveAttribute('transform', 'rotate(92)')
  })

  it('collapses colocated start and finish gate labels', () => {
    const pointA = { latitude: -33.86, longitude: 151.24 }
    const pointB = { latitude: -33.861, longitude: 151.241 }
    const marks: Mark[] = [
      { id: 'start', name: 'Start line', shortName: 'START', provenance: 'personal', position: { kind: 'gate', pointA, pointB } },
      { id: 'finish', name: 'Finish line', shortName: 'FINISH', provenance: 'personal', position: { kind: 'gate', pointA, pointB, linkedToMarkId: 'start' } },
    ]
    const race: RaceDefinition = { id: 'race', clubId: 'club', series: 'Series', name: 'Race', fleet: 'Fleet', scheduledStart: new Date().toISOString(), course: [
      { id: 'start-waypoint', markId: 'start', rounding: 'either', role: 'start' },
      { id: 'finish-waypoint', markId: 'finish', rounding: 'either', role: 'finish' },
    ] }

    render(<CoursePlot marks={marks} race={race} />)

    expect(screen.getByText('START / FINISH')).toBeInTheDocument()
    expect(screen.queryByText(/· START/)).not.toBeInTheDocument()
    expect(screen.queryByText(/· FINISH/)).not.toBeInTheDocument()
  })
})
