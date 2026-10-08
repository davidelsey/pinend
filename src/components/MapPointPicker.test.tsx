import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { MapPointPicker } from './MapPointPicker'

describe('MapPointPicker gate mode', () => {
  it('shows the existing course as read-only context while the new mark stays editable', async () => {
    const change = vi.fn()
    const updateLine = vi.spyOn(google.maps.Polyline.prototype, 'setOptions')
    const coursePath = [{ latitude: -33.86, longitude: 151.23 }, { latitude: -33.85, longitude: 151.25 }]
    const otherMarks = [{ id: 'existing', label: 'Existing mark', coordinate: coursePath[0] }]
    try {
      const view = render(<MapPointPicker value={coursePath[1]} onChange={change} otherMarks={otherMarks} coursePath={coursePath} />)
      await screen.findByText('Existing mark')
      view.rerender(<MapPointPicker value={{ ...coursePath[1] }} onChange={change} otherMarks={otherMarks} coursePath={coursePath} />)
      expect(updateLine).toHaveBeenCalledWith(expect.objectContaining({ path: [{ lat: -33.86, lng: 151.23 }, { lat: -33.85, lng: 151.25 }], clickable: false, draggable: false, editable: false }))
      fireEvent(screen.getByText('Existing mark').closest('.point-map-pin')!, new Event('dragend'))
      expect(change).not.toHaveBeenCalled()
      fireEvent(screen.getByText('Mark').closest('.point-map-pin')!, new Event('dragend'))
      expect(change).toHaveBeenCalledOnce()
    } finally { updateLine.mockRestore() }
  })

  it('redraws the gate during either endpoint drag without replacing pins', async () => {
    const updateLine = vi.spyOn(google.maps.Polyline.prototype, 'setOptions')
    function Gate() {
      const [pin, setPin] = useState({ latitude: -33.86, longitude: 151.23 })
      const [boat, setBoat] = useState({ latitude: -33.86, longitude: 151.27 })
      return <MapPointPicker value={pin} onChange={setPin} secondValue={boat} onSecondChange={setBoat} />
    }
    try {
      render(<Gate />)
      const map = screen.getByRole('img', { name: 'Drag gate pins on Sydney Harbour map' })
      await waitFor(() => expect(map.querySelectorAll('.point-map-pin')).toHaveLength(2))
      const pin = map.querySelector('.point-map-pin--first')!
      const boat = map.querySelector('.point-map-pin--second')!
      fireEvent(pin, new CustomEvent('drag', { detail: { lat: -33.85, lng: 151.24 } }))
      expect(updateLine).toHaveBeenLastCalledWith(expect.objectContaining({ path: [{ lat: -33.85, lng: 151.24 }, { lat: -33.86, lng: 151.27 }] }))
      fireEvent(boat, new CustomEvent('drag', { detail: { lat: -33.84, lng: 151.28 } }))
      expect(updateLine).toHaveBeenLastCalledWith(expect.objectContaining({ path: [{ lat: -33.85, lng: 151.24 }, { lat: -33.84, lng: 151.28 }] }))
      expect(map.querySelector('.point-map-pin--first')).toBe(pin)
      expect(map.querySelector('.point-map-pin--second')).toBe(boat)
    } finally { updateLine.mockRestore() }
  })

  it('keeps pins mounted through parent updates and uses the latest drag callback', async () => {
    const firstChange = vi.fn()
    const nextChange = vi.fn()
    const view = render(<MapPointPicker value={{ latitude: -33.86, longitude: 151.23 }} onChange={firstChange} />)
    const map = screen.getByRole('img', { name: 'Drag mark on Sydney Harbour map' })
    await waitFor(() => expect(map.querySelector('.point-map-pin')).not.toBeNull())
    const pin = map.querySelector('.point-map-pin')!
    view.rerender(<MapPointPicker value={{ latitude: -33.86, longitude: 151.23 }} onChange={nextChange} />)
    expect(map.querySelector('.point-map-pin')).toBe(pin)
    fireEvent(pin, new Event('dragend', { bubbles: true }))
    expect(nextChange).toHaveBeenCalledOnce()
    expect(firstChange).not.toHaveBeenCalled()
    view.rerender(<MapPointPicker value={{ latitude: -33.85, longitude: 151.25 }} onChange={nextChange} />)
    expect(map.querySelector('.point-map-pin')).toBe(pin)
    fireEvent(pin, new Event('dragend', { bubbles: true }))
    expect(nextChange).toHaveBeenLastCalledWith({ latitude: -33.85, longitude: 151.25 })
    view.rerender(<MapPointPicker value={null} onChange={nextChange} />)
    expect(map.querySelector('.point-map-pin')).toBeNull()
  })

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
