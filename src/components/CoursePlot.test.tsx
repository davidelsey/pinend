import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { seedMarks, seedRace } from '../data/seed'
import { CoursePlot } from './CoursePlot'

describe('CoursePlot', () => {
  it('shows the boat and lets the user recenter or fit all waypoints', () => {
    render(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -33.87, longitude: 151.24 }} />)

    expect(screen.getByText('Current location')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Recenter on current location' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fit all course waypoints' }))
  })
})
