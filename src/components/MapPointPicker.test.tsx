import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MapPointPicker } from './MapPointPicker'

describe('MapPointPicker gate mode', () => {
  it('shows two draggable pins with a dotted line and moves the nearest endpoint', () => {
    const movePin = vi.fn()
    const moveBoat = vi.fn()
    render(<MapPointPicker value={{ latitude: -33.86, longitude: 151.23 }} onChange={movePin} secondValue={{ latitude: -33.86, longitude: 151.27 }} onSecondChange={moveBoat} />)

    const map = screen.getByRole('img', { name: 'Drag gate pins on Sydney Harbour map' })
    Object.defineProperty(map, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) })
    expect(map.querySelectorAll('.gate-pin')).toHaveLength(2)
    expect(map.querySelector('.gate-line')).toBeInTheDocument()

    const pointerDown = new Event('pointerdown', { bubbles: true })
    Object.defineProperties(pointerDown, { pointerId: { value: 1 }, pointerType: { value: 'mouse' }, clientX: { value: 76 }, clientY: { value: 50 } })
    fireEvent(map, pointerDown)

    expect(moveBoat).toHaveBeenCalledOnce()
    expect(movePin).not.toHaveBeenCalled()
  })

  it('renders another gate as a line rather than a midpoint mark', () => {
    render(<MapPointPicker value={{ latitude: -33.86, longitude: 151.23 }} onChange={() => undefined} otherGates={[{ id: 'start-line', label: 'Start line', pointA: { latitude: -33.865, longitude: 151.22 }, pointB: { latitude: -33.865, longitude: 151.24 } }]} />)

    const map = screen.getByRole('img', { name: 'Drag mark on Sydney Harbour map' })
    expect(map.querySelector('.point-picker__context-gate line')).toBeInTheDocument()
    expect(map).toHaveTextContent('Start line')
  })
})
