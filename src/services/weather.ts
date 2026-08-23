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

const demoForecast = (): ForecastSnapshot => ({
  fetchedAt: Date.now(),
  source: 'Demo forecast',
  stale: false,
  hours: [
    { time: new Date().toISOString(), temperature: 19, windSpeed: 12, windDirection: 38, gust: 17, waveHeight: 0.5 },
    { time: new Date(Date.now() + 3_600_000).toISOString(), temperature: 20, windSpeed: 14, windDirection: 45, gust: 19, waveHeight: 0.6 },
    { time: new Date(Date.now() + 7_200_000).toISOString(), temperature: 20, windSpeed: 15, windDirection: 52, gust: 21, waveHeight: 0.7 },
  ],
})

export async function fetchForecast(coordinate: Coordinate): Promise<ForecastSnapshot> {
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
    return demoForecast()
  }
}
