import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapPointPicker } from './MapPointPicker'

describe('MapPointPicker gate mode', () => {
  it('shows two draggable pins with a dotted line and updates a dragged endpoint', async () => {
    const movePin = vi.fn()
    const moveBoat = vi.fn()
    render(<MapPointPicker value={{ latitude: -33.86, longitude: 151.23 }} onChange={movePin} secondValue={{ latitude: -33.86, longitude: 151.27 }} onSecondChange={moveBoat} />)

    const map = screen.getByRole('img', { name: 'Drag gate pins on Sydney Harbour map' })
    await waitFor(() => expect(map.querySelectorAll('.point-map-pin')).toHaveLength(2))
    fireEvent(map.querySelector('.point-map-pin--second')!, new Event('dragend', { bubbles: true }))

    expect(moveBoat).toHaveBeenCalledOnce()
    expect(movePin).not.toHaveBeenCalled()
  })

  it('renders another gate as map context', async () => {
    render(<MapPointPicker value={{ latitude: -33.86, longitude: 151.23 }} onChange={() => undefined} otherGates={[{ id: 'start-line', label: 'Start line', pointA: { latitude: -33.865, longitude: 151.22 }, pointB: { latitude: -33.865, longitude: 151.24 } }]} />)

    const map = screen.getByRole('img', { name: 'Drag mark on Sydney Harbour map' })
    await waitFor(() => expect(map).toHaveTextContent('Start line'))
  })
})
