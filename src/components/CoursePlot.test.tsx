import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { seedMarks, seedRace } from '../data/seed'
import { CoursePlot } from './CoursePlot'
import type { Mark, RaceDefinition } from '../domain/types'
import { loadGoogleMaps } from '../services/googleMaps'

describe('CoursePlot', () => {
  it('dims the course while highlighting the selected leg, including repeat visits to a mark', async () => {
    const marks: Mark[] = [
      { id: 'a', name: 'A', shortName: 'A', provenance: 'personal', position: { kind: 'fixed', coordinate: { latitude: -33.86, longitude: 151.23 } } },
      { id: 'b', name: 'B', shortName: 'B', provenance: 'personal', position: { kind: 'fixed', coordinate: { latitude: -33.87, longitude: 151.24 } } },
    ]
    const race: RaceDefinition = { ...seedRace, course: ['a', 'b', 'a'].map((markId, index) => ({ id: `leg-${index}`, markId, rounding: 'port' })) }
    const options = vi.spyOn(google.maps.Polyline.prototype, 'setOptions')
    try {
      const view = render(<CoursePlot marks={marks} race={race} activeWaypointIndex={1} />)
      await screen.findByText('2 · B')
      options.mockClear()
      view.rerender(<CoursePlot marks={marks} race={race} activeWaypointIndex={2} />)
      expect(options).toHaveBeenCalledWith(expect.objectContaining({ strokeOpacity: 0.2, path: [
        { lat: -33.86, lng: 151.23 }, { lat: -33.87, lng: 151.24 }, { lat: -33.86, lng: 151.23 },
      ] }))
      expect(options).toHaveBeenCalledWith(expect.objectContaining({ strokeOpacity: 1, strokeWeight: 5, path: [
        { lat: -33.87, lng: 151.24 }, { lat: -33.86, lng: 151.23 },
      ] }))
    } finally { options.mockRestore() }
  })
  it('includes the first GPS fix in the viewport after the course has already loaded', async () => {
    const { maps } = await loadGoogleMaps()
    const fit = vi.spyOn(maps.Map.prototype, 'fitBounds')
    try {
      const view = render(<CoursePlot marks={seedMarks} race={seedRace} />)
      await waitFor(() => expect(fit).toHaveBeenCalled())
      fit.mockClear()
      view.rerender(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -34, longitude: 151 }} />)
      expect(fit).toHaveBeenCalledWith(expect.objectContaining({ south: -34, west: 151 }), 44)
      fit.mockClear()
      view.rerender(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -34.001, longitude: 151 }} />)
      expect(fit).not.toHaveBeenCalled()
    } finally { fit.mockRestore() }
  })
  it('shows a compass direction when GPS course is unavailable and a dot when neither is known', async () => {
    const current = { latitude: -33.87, longitude: 151.24, deviceHeading: 270 }
    const view = render(<CoursePlot marks={seedMarks} race={seedRace} current={current} />)
    const boat = await screen.findByLabelText('You, heading 270 degrees')
    expect(boat.querySelector('.course-map-marker__icon')).toHaveStyle({ transform: 'rotate(270deg)' })
    view.rerender(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -33.87, longitude: 151.24 }} />)
    expect(screen.getByLabelText('You, direction unavailable')).toHaveClass('course-map-marker--no-heading')
  })
  it('keeps course overlays mounted through pre-start line and sensor updates', async () => {
    const detach = vi.spyOn(google.maps.Polyline.prototype, 'setMap')
    try {
      const props = { marks: seedMarks, race: seedRace, line: { pin: { latitude: -33.86, longitude: 151.23 }, committee: { latitude: -33.86, longitude: 151.24 } } }
      const view = render(<CoursePlot {...props} current={{ latitude: -33.87, longitude: 151.24 }} />)
      await waitFor(() => expect(view.container.querySelector('.course-map-marker')).not.toBeNull())
      const points = [...view.container.querySelectorAll('.course-map-marker')]
      detach.mockClear()
      view.rerender(<CoursePlot {...props} line={{ ...props.line }} current={{ latitude: -33.8701, longitude: 151.2401 }} />)
      view.container.querySelectorAll('.course-map-marker').forEach((point, index) => expect(point).toBe(points[index]))
      expect(detach).not.toHaveBeenCalled()
    } finally { detach.mockRestore() }
  })

  it('initializes the real map before the first course position is resolved', async () => {
    const unresolvedRace = { ...seedRace, course: [] }
    const view = render(<CoursePlot marks={[]} race={unresolvedRace} />)

    expect(screen.getByText('Position your marks to plot the course.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Course map, north up' })).toBeInTheDocument()
    view.rerender(<CoursePlot marks={seedMarks} race={seedRace} />)
    await waitFor(() => expect(view.container.querySelectorAll('.course-map-marker').length).toBeGreaterThan(0))
    expect(view.container.querySelector('.course-map-canvas')).toHaveAttribute('data-fitted', 'true')
    expect(screen.queryByText('Position your marks to plot the course.')).not.toBeInTheDocument()
  })

  it('shows the boat and lets the user recenter or fit all waypoints', async () => {
    render(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -33.87, longitude: 151.24 }} />)

    expect(screen.getByText('Current location')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recenter on current location' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Recenter on current location' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fit all course waypoints' }))
  })

  it('zooms the real basemap when controls are enabled', async () => {
    const { container } = render(<CoursePlot marks={seedMarks} race={seedRace} zoomControls />)

    const zoomIn = screen.getByRole('button', { name: 'Zoom in' })
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' })
    await waitFor(() => expect(zoomOut).toBeEnabled())
    fireEvent.click(zoomIn)
    expect(container.querySelector('.course-map-canvas')).toHaveAttribute('data-zoom', '13')
    fireEvent.click(screen.getByRole('button', { name: 'Fit all course waypoints' }))
    fireEvent.click(zoomOut)
    expect(container.querySelector('.course-map-canvas')).toHaveAttribute('data-zoom', '12')
  })

  it('lets the user align the map to the device heading', async () => {
    const { container } = render(<CoursePlot marks={seedMarks} race={seedRace} current={{ latitude: -33.87, longitude: 151.24, deviceHeading: 92, courseOverGround: 135 }} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'North up' })).toBeEnabled())
    expect(screen.getByRole('button', { name: 'North up' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('You, travelling 135 degrees')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Device aligned' }))

    expect(screen.getByRole('button', { name: 'Device aligned' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: 'Course map, device aligned at 092 degrees' })).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.course-map-canvas')).toHaveAttribute('data-bearing', '92'))
  })

  it('collapses colocated start and finish gate labels', async () => {
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

    const view = render(<CoursePlot marks={marks} race={race} />)

    expect(await screen.findByText('START / FINISH')).toBeInTheDocument()
    expect(screen.queryByText(/· START/)).not.toBeInTheDocument()
    expect(screen.queryByText(/· FINISH/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('START / FINISH: Pin')).toBeInTheDocument()
    expect(screen.getByLabelText('START / FINISH: Boat')).toBeInTheDocument()
    expect(screen.queryByText('Pin')).not.toBeInTheDocument()
    expect(screen.queryByText('Boat')).not.toBeInTheDocument()
    view.rerender(<CoursePlot marks={marks} race={race} activeMarkId="finish" />)
    expect(screen.getByLabelText('START / FINISH: Pin')).toHaveClass('course-map-marker--active')
    expect(screen.getByLabelText('START / FINISH: Boat')).toHaveClass('course-map-marker--active')
  })
})
