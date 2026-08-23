import type { Coordinate } from '../domain/types'

export type ForecastHour = {
  time: string
  temperature: number
  windSpeed: number
  windDirection: number
  gust: number
  waveHeight: number | null
}

export type ForecastSnapshot = {
  fetchedAt: number
  source: string
  hours: ForecastHour[]
  stale: boolean
}

export type MarineSnapshot = {
  fetchedAt: number
  currentKnots: number | null
  currentDirection: number | null
  seaLevelMetres: number | null
  stale: boolean
}

export async function fetchForecast(coordinate: Coordinate): Promise<ForecastSnapshot | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(coordinate.latitude),
      longitude: String(coordinate.longitude),
      hourly: 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'kn',
      forecast_hours: '8',
      timezone: 'auto',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    if (!response.ok) throw new Error('Forecast unavailable')
    const data = await response.json()
    const hours: ForecastHour[] = data.hourly.time.slice(0, 8).map((time: string, index: number) => ({
      time,
      temperature: data.hourly.temperature_2m[index],
      windSpeed: data.hourly.wind_speed_10m[index],
      windDirection: data.hourly.wind_direction_10m[index],
      gust: data.hourly.wind_gusts_10m[index],
      waveHeight: null,
    }))
    const snapshot = { fetchedAt: Date.now(), source: 'Open-Meteo', hours, stale: false }
    localStorage.setItem('pin-end-forecast', JSON.stringify(snapshot))
    return snapshot
  } catch {
    const cached = localStorage.getItem('pin-end-forecast')
    if (cached) return { ...(JSON.parse(cached) as ForecastSnapshot), stale: true }
    return null
  }
}

export async function fetchMarineForecast(coordinate: Coordinate): Promise<MarineSnapshot | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(coordinate.latitude),
      longitude: String(coordinate.longitude),
      current: 'ocean_current_velocity,ocean_current_direction,sea_level_height_msl',
      velocity_unit: 'kn',
    })
    const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`)
    if (!response.ok) throw new Error('Marine forecast unavailable')
    const data = await response.json()
    const snapshot: MarineSnapshot = {
      fetchedAt: Date.now(),
      currentKnots: data.current?.ocean_current_velocity ?? null,
      currentDirection: data.current?.ocean_current_direction ?? null,
      seaLevelMetres: data.current?.sea_level_height_msl ?? null,
      stale: false,
    }
    localStorage.setItem('pin-end-marine-forecast', JSON.stringify(snapshot))
    return snapshot
  } catch {
    const cached = localStorage.getItem('pin-end-marine-forecast')
    return cached ? { ...(JSON.parse(cached) as MarineSnapshot), stale: true } : null
  }
}
