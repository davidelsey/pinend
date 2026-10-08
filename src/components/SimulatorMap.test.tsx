import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { seedMarks, seedRace } from '../data/seed'
import { destinationPoint } from '../domain/geo'
import { SimulatorMap } from './SimulatorMap'

describe('SimulatorMap', () => {
  it('uses Google Maps and updates position and velocity continuously while dragging', async () => {
    const onPosition = vi.fn()
    const onVector = vi.fn()
    const coordinate = { latitude: -33.87, longitude: 151.23 }
    const props = { coordinate, heading: 0, speedKnots: 5, marks: seedMarks, race: seedRace, onPosition, onVector }
    const view = render(<SimulatorMap {...props} />)
    const boat = await screen.findByRole('button', { name: 'Drag boat position' })
    const handle = screen.getByRole('button', { name: 'Drag to set heading and speed' })
    expect(screen.getByRole('img', { name: 'Course map, north up' })).toHaveAttribute('data-fitted', 'true')
    fireEvent(boat, new CustomEvent('drag', { detail: { lat: -33.88, lng: 151.24 } }))
    expect(onPosition).toHaveBeenLastCalledWith({ latitude: -33.88, longitude: 151.24 })
    const endpoint = destinationPoint(coordinate, 0.05 + 10 / 6, 90)
    fireEvent(handle, new CustomEvent('drag', { detail: { lat: endpoint.latitude, lng: endpoint.longitude } }))
    expect(onVector.mock.lastCall?.[0]).toBeCloseTo(90)
    expect(onVector.mock.lastCall?.[1]).toBeCloseTo(10)

    view.rerender(<SimulatorMap {...props} coordinate={{ latitude: -33.88, longitude: 151.24 }} heading={90} />)
    expect(screen.getByRole('button', { name: 'Drag boat position' })).toBe(boat)
    expect(boat.querySelector('.course-map-marker__icon')).toHaveStyle({ transform: 'rotate(90deg)' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onVector).toHaveBeenLastCalledWith(95, 5)
    fireEvent.keyDown(boat, { key: 'ArrowUp' })
    expect(onPosition.mock.lastCall?.[0].latitude).toBeGreaterThan(-33.88)
  })
})
