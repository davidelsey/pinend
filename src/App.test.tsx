import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { database, seedDatabase } from './services/repository'

describe('primary local race journey', () => {
  beforeEach(async () => {
    await database.delete()
    await database.open()
    localStorage.clear()
    localStorage.setItem('pin-end-local-auth', 'true')
  })

  it('moves from setup through pre-start into race mode', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))

    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start race mode/i }))

    await waitFor(() => expect(screen.getByText('RACING')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Mark rounded/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Boat' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next mark' }))
    expect(await screen.findByRole('heading', { name: 'Windward mark' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(await screen.findByRole('heading', { name: 'Clark Island' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous mark' }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start race mode/i }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Boat' }))
    expect(await screen.findByRole('heading', { name: 'Second Wind' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Race' }))
    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('enters race mode automatically when the synchronized start arrives', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /START Gun/i }))

    expect(await screen.findByText('RACING')).toBeInTheDocument()
  })

  it('offers one sighting flow for the start line and every race mark', async () => {
    await seedDatabase()
    await database.observations.put({
      id: 'clark-sighting',
      sessionId: 'local-session',
      endpoint: 'mark',
      markId: 'clark-island',
      observer: { latitude: -33.86, longitude: 151.24 },
      bearingTrue: 42,
      accuracy: 3,
      timestamp: Date.now() - 30_000,
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Make shore time count.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Enter pre-start/i }))
    expect(await screen.findByText('PRE-START')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sight marks' }))
    const sightingDialog = screen.getByRole('dialog', { name: 'Sight marks' })
    const targets = within(sightingDialog)
    expect(targets.getByRole('button', { name: 'Pin end' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Committee boat' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Clark Island' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Windward mark' })).toBeInTheDocument()
    expect(targets.getByRole('button', { name: 'Shark Island' })).toBeInTheDocument()

    fireEvent.click(targets.getByRole('button', { name: 'Clark Island' }))
    expect(targets.getByRole('button', { name: 'Open Clark Island viewfinder' })).toBeEnabled()
    expect(targets.getByText(/30s ago/)).toBeInTheDocument()
    expect(targets.getByText(/42.0° true/)).toBeInTheDocument()
    fireEvent.click(targets.getByRole('button', { name: /Delete Clark Island sighting/ }))
    expect(await targets.findByText('No sightings recorded yet.')).toBeInTheDocument()
  })
})
