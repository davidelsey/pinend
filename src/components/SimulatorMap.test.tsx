import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { seedMarks, seedRace } from '../data/seed'
import { SimulatorMap } from './SimulatorMap'

describe('SimulatorMap', () => {
  it('drags the boat position and forward handle independently', () => {
    const onPosition = vi.fn()
    const onVector = vi.fn()
    render(<SimulatorMap coordinate={{ latitude: -33.87, longitude: 151.23 }} heading={0} speedKnots={5} marks={seedMarks} race={seedRace} onPosition={onPosition} onVector={onVector} />)
    const map = screen.getByRole('img', { name: 'Drag the boat and its speed handle on the simulator map' })
    const createPoint = vi.fn(() => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x - 50, y: this.y } } }))
    Object.defineProperties(map, {
      getBoundingClientRect: { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) },
      getScreenCTM: { value: () => ({ inverse: () => ({}) }) },
      createSVGPoint: { value: createPoint },
    })
    const pointer = (type: string, target: Element, pointerId: number, clientX: number, clientY: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, { pointerId: { value: pointerId }, clientX: { value: clientX }, clientY: { value: clientY } })
      fireEvent(target, event)
    }

    pointer('pointerdown', screen.getByRole('button', { name: 'Drag boat position' }), 1, 50, 50)
    pointer('pointermove', map, 1, 60, 60)
    pointer('pointerup', map, 1, 60, 60)
    expect(onPosition).toHaveBeenCalled()

    pointer('pointerdown', screen.getByRole('button', { name: 'Drag to set heading and speed' }), 2, 70, 50)
    pointer('pointermove', map, 2, 80, 50)
    pointer('pointerup', map, 2, 80, 50)
    expect(onVector).toHaveBeenCalled()
    expect(onVector.mock.calls.at(-1)?.[0]).toBeGreaterThan(0)
    expect(createPoint).toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag boat position' }), { key: 'ArrowUp' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag to set heading and speed' }), { key: 'ArrowRight' })
    expect(onPosition).toHaveBeenCalled()
    expect(onVector).toHaveBeenCalled()
  })

  it('recentres when a synchronized boat position moves outside the map', async () => {
    const props = { heading: 0, speedKnots: 5, marks: seedMarks, race: seedRace, onPosition: vi.fn(), onVector: vi.fn() }
    const view = render(<SimulatorMap {...props} coordinate={{ latitude: -33.87, longitude: 151.23 }} />)

    view.rerender(<SimulatorMap {...props} coordinate={{ latitude: -34.2, longitude: 151.7 }} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Drag boat position' })).toHaveAttribute('transform', 'translate(50 50)'))
  })
})
