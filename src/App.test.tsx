import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { database } from './services/repository'

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
})
