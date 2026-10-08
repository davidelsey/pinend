import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from './AppContext'
import { createSimulator } from '../services/simulator'

vi.mock('../services/auth', () => ({ supabase: null }))

function SensorConsumer() {
  const { latestReading, setSimulatorEnabled, acceptDeviceReading, placeSimulator } = useApp()
  return <>
    <output data-testid="fix">{JSON.stringify(latestReading)}</output>
    <button onClick={() => setSimulatorEnabled(true)}>Enable simulation</button>
    <button onClick={() => setSimulatorEnabled(false)}>Disable simulation</button>
    <button onClick={() => placeSimulator(-33.88, 151.24)}>Place boat</button>
    <button onClick={() => acceptDeviceReading({ latitude: 51, longitude: 0, timestamp: Date.now(), accuracy: 5, heading: 90, speedKnots: 2, source: 'device' })}>Real GPS update</button>
  </>
}

describe('shared simulator sensors', () => {
  it('drives all consumers without a race page, overrides real GPS and stops when disabled', async () => {
    localStorage.clear()
    localStorage.setItem('pin-end-dev-simulator', JSON.stringify({ enabled: false, simulator: createSimulator({ latitude: -33.87, longitude: 151.23 }) }))
    const view = render(<AppProvider><SensorConsumer /></AppProvider>)
    const reading = () => JSON.parse(screen.getByTestId('fix').textContent ?? 'null')
    expect(reading()).toMatchObject({ source: 'simulator', latitude: -33.87, longitude: 151.23 })
    fireEvent.click(screen.getByText('Real GPS update'))
    expect(reading().source).toBe('device')
    fireEvent.click(screen.getByText('Enable simulation'))
    fireEvent.click(screen.getByText('Place boat'))
    fireEvent.click(screen.getByText('Real GPS update'))
    expect(reading()).toMatchObject({ source: 'simulator', latitude: -33.88, longitude: 151.24, courseOverGround: 22 })
    await waitFor(() => expect(reading().latitude).toBeGreaterThan(-33.88), { timeout: 3000 })
    fireEvent.click(screen.getByText('Disable simulation'))
    expect(reading()).toMatchObject({ source: 'device', latitude: 51, longitude: 0 })
    view.unmount()
    localStorage.clear()
  })
})
