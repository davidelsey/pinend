import { describe, expect, it } from 'vitest'
import { formatCountdown, syncStartFromSignal } from './countdown'

describe('start countdown', () => {
  it('syncs the start from standard five, four, and one minute signals', () => {
    const now = Date.parse('2026-08-23T03:00:00Z')
    expect(syncStartFromSignal(now, 5)).toBe(now + 300_000)
    expect(syncStartFromSignal(now, 4)).toBe(now + 240_000)
    expect(syncStartFromSignal(now, 1)).toBe(now + 60_000)
  })

  it('formats time either side of the gun', () => {
    expect(formatCountdown(65_000)).toBe('01:05')
    expect(formatCountdown(-3_000)).toBe('+00:03')
  })
})
