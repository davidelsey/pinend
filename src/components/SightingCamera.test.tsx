import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SightingCamera } from './SightingCamera'

describe('camera sighting viewfinder', () => {
  it('shows a crosshair and captures the displayed simulated bearing', () => {
    const onCapture = vi.fn()
    render(
      <SightingCamera
        endpoint="pin"
        simulated
        reading={{
          latitude: -33.87423,
          longitude: 151.23377,
          heading: 42,
          speedKnots: 0,
          accuracy: 4,
          timestamp: 1,
          source: 'simulator'
        }}
        onCapture={onCapture}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByTestId('viewfinder-crosshair')).toBeInTheDocument()
    expect(screen.getByText('042° T')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Capture pin sighting/i }))
    expect(onCapture).toHaveBeenCalledOnce()
  })
})
