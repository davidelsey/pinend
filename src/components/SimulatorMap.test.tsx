import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { seedMarks, seedRace } from '../data/seed'
import { SimulatorMap } from './SimulatorMap'

describe('SimulatorMap', () => {
  it('drags the boat position and forward handle independently', () => {
    const onPosition = vi.fn()
    const onVector = vi.fn()
    render(<SimulatorMap coordinate={{ latitude: -33.87, longitude: 151.23 }} heading={0} speedKnots={5} marks={seedMarks} race={seedRace} onPosition={onPosition} onVector={onVector} />)
    const map = screen.getByRole('img', { name: 'Drag the boat and its speed handle on the simulator map' })
    Object.defineProperty(map, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) })
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
  })
})
