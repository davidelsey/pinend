import { useCallback, useEffect, useState } from 'react'

type WakeLockSentinelLike = EventTarget & { released: boolean; release(): Promise<void> }

export function useWakeLock(active: boolean) {
  const [sentinel, setSentinel] = useState<WakeLockSentinelLike | null>(null)
  const [status, setStatus] = useState<'inactive' | 'active' | 'unsupported' | 'blocked'>('inactive')

  const request = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      setStatus('unsupported')
      return
    }
    try {
      const lock = (await (
        navigator as Navigator & { wakeLock: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }
      ).wakeLock.request('screen')) as WakeLockSentinelLike
      lock.addEventListener('release', () => setStatus('inactive'))
      setSentinel(lock)
      setStatus('active')
    } catch {
      setStatus('blocked')
    }
  }, [])

  useEffect(() => {
    if (active && document.visibilityState === 'visible') void request()
    if (!active && sentinel && !sentinel.released) void sentinel.release()
  }, [active, request, sentinel])

  useEffect(() => {
    const onVisibility = () => {
      if (active && document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void request()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [active, request, sentinel])

  return { status, request }
}
