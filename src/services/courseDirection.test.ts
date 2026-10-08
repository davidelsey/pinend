import { describe, expect, it, vi } from 'vitest'
import { animateCourseDirection } from './courseDirection'

describe('course direction arrows', () => {
  it('moves arrows forward, keeps their spacing, and cancels animation on cleanup', () => {
    let tick: FrameRequestCallback = () => undefined
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { tick = callback; return 7 })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const line = new google.maps.Polyline()
    const update = vi.spyOn(line, 'setOptions')
    try {
      const stop = animateCourseDirection(() => line)
      tick(0)
      expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ icons: [expect.objectContaining({ offset: '0px', repeat: '96px' })] }))
      tick(1000)
      expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ icons: [expect.objectContaining({ offset: '24px', repeat: '96px' })] }))
      stop()
      expect(cancel).toHaveBeenCalledWith(7)
    } finally { request.mockRestore(); cancel.mockRestore() }
  })

  it('keeps direction arrows still when reduced motion is requested', () => {
    let tick: FrameRequestCallback = () => undefined
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { tick = callback; return 1 })
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) })
    const line = new google.maps.Polyline()
    const update = vi.spyOn(line, 'setOptions')
    try {
      const stop = animateCourseDirection(() => line)
      tick(0); tick(1000)
      expect(update).toHaveBeenCalledOnce()
      stop()
    } finally {
      request.mockRestore()
      if (original) Object.defineProperty(window, 'matchMedia', original)
      else Reflect.deleteProperty(window, 'matchMedia')
    }
  })
})
