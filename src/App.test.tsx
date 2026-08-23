import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { database, seedDatabase } from './services/repository'

describe('primary local race journey', () => {
  beforeEach(async () => {
    await database.delete()
    await database.open()
    localStorage.clear()
    localStorage.setItem('pin-end-local-auth', 'true')
  })

  it('moves from setup through pre-start into race mode', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))

    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start race mode/i }))

    await waitFor(() => expect(screen.getByText('RACING')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Mark rounded/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sight marks' }))
    expect(screen.getByRole('dialog', { name: 'Sight marks' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close sight marks' }))
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Boat' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    expect(await screen.findByRole('heading', { name: 'Windward mark' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(await screen.findByRole('heading', { name: 'Clark Island' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start race mode/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Boat' }))
    expect(await screen.findByRole('heading', { name: 'Second Wind' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Race' }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('enters race mode automatically when the synchronized start arrives', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))

    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('lets the sailor return to pre-start after the start time has passed', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    expect(screen.getByText('PRE-START')).toBeInTheDocument()
    expect(screen.queryByText('RACING')).not.toBeInTheDocument()
  })

  it('offers one sighting flow for the start line and every race mark', async () => {
    await seedDatabase()
    await database.observations.put({
      id: 'clark-sighting',
      sessionId: 'local-session',
      endpoint: 'mark',
      markId: 'clark-island',
      observer: { latitude: -33.86, longitude: 151.24 },
      bearingTrue: 42,
      accuracy: 3,
      timestamp: Date.now() - 30_000,
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sight marks' }))
    const sightingDialog = screen.getByRole('dialog', { name: 'Sight marks' })
    const targets = within(sightingDialog)
    expect(targets.getByRole('button', { name: 'Pin end' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Committee boat' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Clark Island' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Windward mark' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Shark Island' })).toBeInTheDocument()

    fireEvent.click(targets.getByRole('button', { name: 'Clark Island' }))
    expect(targets.getByRole('button', { name: 'Open Clark Island viewfinder' })).toBeEnabled()
    expect(targets.getByText(/30s ago/)).toBeInTheDocument()
    expect(targets.getByText(/42.0° true/)).toBeInTheDocument()
    fireEvent.click(targets.getByRole('button', { name: /Delete Clark Island sighting/ }))
    expect(await targets.findByText('No sightings recorded yet.')).toBeInTheDocument()
    await waitFor(async () => expect(await database.observations.get('clark-sighting')).toBeUndefined())
  })

  it('lists course marks with direct sighting and draggable map positioning', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    const marks = screen.getByRole('region', { name: 'Course marks' })
    expect(within(marks).getByRole('button', { name: 'Sight Clark Island' })).toBeInTheDocument()
    expect(within(marks).getByRole('button', { name: 'Position Clark Island' })).toBeInTheDocument()
    expect(within(marks).getByRole('button', { name: 'Sight Windward mark' })).toBeInTheDocument()

    fireEvent.click(within(marks).getByRole('button', { name: 'Sight Clark Island' }))
    expect(await screen.findByRole('dialog', { name: 'Sight the Clark Island' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close camera' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close sight marks' }))

    fireEvent.click(within(marks).getByRole('button', { name: 'Position Clark Island' }))
    const positionDialog = screen.getByRole('dialog', { name: 'Position Clark Island' })
    expect(positionDialog).toHaveClass('modal-backdrop--position')
    expect(within(positionDialog).getByText('Windward mark')).toBeInTheDocument()
    expect(within(positionDialog).getByText('Shark Island')).toBeInTheDocument()
    expect(within(positionDialog).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(within(positionDialog).getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    const map = within(positionDialog).getByRole('img', { name: 'Drag mark on Sydney Harbour map' })
    Object.defineProperty(map, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) })
    const latitude = within(positionDialog).getAllByRole('spinbutton')[0]
    const initialLatitude = (latitude as HTMLInputElement).value
    const dispatchPointer = (type: string, clientX: number, clientY: number, pointerId = 1, pointerType = 'mouse') => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, clientX: { value: clientX }, clientY: { value: clientY } })
      fireEvent(map, event)
    }
    dispatchPointer('pointerdown', 30, 20)
    dispatchPointer('pointermove', 80, 70)
    dispatchPointer('pointerup', 80, 70)
    expect(latitude).not.toHaveValue(Number(initialLatitude))
    expect(Number((latitude as HTMLInputElement).value)).toBeGreaterThanOrEqual(-90)
    fireEvent.click(within(positionDialog).getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(within(positionDialog).getByRole('button', { name: 'Zoom out' }))
    const latitudeBeforePinch = (latitude as HTMLInputElement).value
    dispatchPointer('pointerdown', 40, 40, 1, 'touch')
    dispatchPointer('pointerdown', 100, 40, 2, 'touch')
    dispatchPointer('pointermove', 150, 40, 2, 'touch')
    dispatchPointer('pointerup', 150, 40, 2, 'touch')
    dispatchPointer('pointermove', 60, 60, 1, 'touch')
    dispatchPointer('pointerup', 60, 60, 1, 'touch')
    expect(latitude).toHaveValue(Number(latitudeBeforePinch))
    await waitFor(async () => expect((await database.sessions.get('local-session'))?.phase).toBe('prestart'))
  })

  it('lets a developer mock boat position and velocity', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    const simulator = screen.getByTestId('sensor-simulator')
    fireEvent.click(within(simulator).getByRole('button', { name: 'Debug mode: boat simulator' }))
    fireEvent.click(within(simulator).getByRole('checkbox', { name: 'Use simulated sensors' }))
    fireEvent.change(within(simulator).getByRole('spinbutton', { name: 'Mock latitude' }), { target: { value: '' } })
    expect(within(simulator).getByText('-33.87423, 151.23377')).toBeInTheDocument()
    fireEvent.click(within(simulator).getByRole('button', { name: 'Apply position' }))
    expect(within(simulator).getByRole('alert')).toHaveTextContent('latitude from -90 to 90')
    fireEvent.change(within(simulator).getByRole('spinbutton', { name: 'Mock latitude' }), { target: { value: '-33.90000' } })
    fireEvent.change(within(simulator).getByRole('spinbutton', { name: 'Mock longitude' }), { target: { value: '151.20000' } })
    fireEvent.change(within(simulator).getByRole('slider', { name: /Speed/ }), { target: { value: '8.4' } })
    fireEvent.click(within(simulator).getByRole('button', { name: 'Apply position' }))

    expect(within(simulator).getByText('-33.90000, 151.20000')).toBeInTheDocument()
    expect(within(simulator).getByText('8.4 kn')).toBeInTheDocument()
    expect(screen.getByText('Current location')).toBeInTheDocument()
  })
})
