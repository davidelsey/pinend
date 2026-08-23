import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

describe('race screen wake lock', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock')
  })

  it('requests one lock and does not loop after the sentinel is stored', async () => {
    const sentinel = new EventTarget() as EventTarget & { released: boolean; release(): Promise<void> }
    sentinel.released = false
    sentinel.release = vi.fn(async () => { sentinel.released = true })
    const request = vi.fn(async () => sentinel)
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    const { result } = renderHook(() => useWakeLock(true))

    await waitFor(() => expect(result.current.status).toBe('active'))
    await act(async () => Promise.resolve())
    expect(request).toHaveBeenCalledOnce()
  })
})
