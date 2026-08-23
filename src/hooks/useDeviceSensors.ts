import { useCallback, useEffect, useRef, useState } from 'react'
import type { SensorReading } from '../domain/types'

type PermissionEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

export function useDeviceSensors(enabled: boolean) {
  const [reading, setReading] = useState<SensorReading | null>(null)
  const [status, setStatus] = useState<'idle' | 'ready' | 'denied' | 'unavailable'>('idle')
  const heading = useRef(0)

  const requestPermission = useCallback(async () => {
    try {
      const orientationEvent = DeviceOrientationEvent as PermissionEvent
      if (orientationEvent.requestPermission) {
        const permission = await orientationEvent.requestPermission()
        if (permission !== 'granted') {
          setStatus('denied')
          return false
        }
      }
      const result = await new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { enableHighAccuracy: true, timeout: 10_000 },
        )
      })
      setStatus(result ? 'ready' : 'denied')
      return result
    } catch {
      setStatus('unavailable')
      return false
    }
  }, [])

  useEffect(() => {
    if (!enabled || status !== 'ready') return
    const onOrientation = (event: DeviceOrientationEvent) => {
      const iosHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      heading.current = iosHeading ?? (event.alpha == null ? heading.current : (360 - event.alpha) % 360)
    }
    window.addEventListener('deviceorientation', onOrientation, true)
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setReading({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading ?? heading.current,
          speedKnots: (position.coords.speed ?? 0) * 1.94384,
          source: 'device',
        })
      },
      () => setStatus('unavailable'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12_000 },
    )
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true)
      navigator.geolocation.clearWatch(watchId)
    }
  }, [enabled, status])

  return { reading, status, requestPermission }
}
