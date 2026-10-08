import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeBearing } from '../domain/geo'
import type { SensorReading } from '../domain/types'

type PermissionEvent = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

export function useDeviceSensors(enabled: boolean, declinationDegrees = 12.8) {
  const [reading, setReading] = useState<SensorReading | null>(null)
  const [status, setStatus] = useState<'idle' | 'ready' | 'denied' | 'unavailable'>('idle')
  const magneticHeading = useRef<number | null>(null)

  const requestPermission = useCallback(async () => {
    try {
      const orientationEvent = typeof DeviceOrientationEvent === 'undefined' ? null : DeviceOrientationEvent as PermissionEvent
      if (orientationEvent?.requestPermission) {
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
      if (iosHeading != null) magneticHeading.current = iosHeading
      else if (event.absolute && event.alpha != null) magneticHeading.current = normalizeBearing(360 - event.alpha)
    }
    window.addEventListener('deviceorientation', onOrientation, true)
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const compassHeading = magneticHeading.current
        const deviceHeading = compassHeading == null ? undefined : normalizeBearing(compassHeading + declinationDegrees)
        const courseOverGround = position.coords.heading == null ? undefined : normalizeBearing(position.coords.heading)
        const heading = deviceHeading ?? courseOverGround ?? 0
        setReading({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
          heading,
          speedKnots: (position.coords.speed ?? 0) * 1.94384,
          source: 'device',
          headingSource: compassHeading != null ? 'compass' : courseOverGround != null ? 'course-over-ground' : undefined,
          headingReliable: compassHeading != null,
          deviceHeading,
          courseOverGround,
          rawHeading: compassHeading ?? courseOverGround ?? undefined,
          rawHeadingReference: compassHeading != null ? 'magnetic' : 'true',
          declination: compassHeading != null ? declinationDegrees : undefined,
        })
      },
      () => setStatus('unavailable'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12_000 },
    )
    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true)
      navigator.geolocation.clearWatch(watchId)
    }
  }, [declinationDegrees, enabled, status])

  return { reading, status, requestPermission }
}
