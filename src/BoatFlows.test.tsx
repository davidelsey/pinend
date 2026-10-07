import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { database } from './services/repository'

vi.mock('./services/auth', () => ({ isSupabaseConfigured: false, supabase: null, signInWithGoogle: vi.fn(), signOut: vi.fn() }))

describe('boat-first journeys', () => {
  beforeEach(async () => {
    await database.delete(); await database.open(); localStorage.clear()
    localStorage.setItem('pin-end-local-auth', 'true')
    localStorage.setItem('pin-end-empty', 'true')
  })
  it('onboards an owner and switches boats without leaking races or changing sessions', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Create a boat/ }))
    fireEvent.change(screen.getByLabelText('Boat name'), { target: { value: 'Saltwater' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create boat' }))
    expect(await screen.findByRole('heading', { name: 'See you on the line.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New race' }))
    const dialog = screen.getByRole('dialog', { name: 'New race' })
    fireEvent.change(within(dialog).getByLabelText('Race name'), { target: { value: 'Harbour race' } })
    fireEvent.change(within(dialog).getByLabelText('Scheduled start'), { target: { value: '2030-12-12T12:00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create race' }))
    await screen.findByRole('heading', { name: 'Race marks' })
    const original = await database.sessions.toArray()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Switch boat' }), { target: { value: '__add' } })
    fireEvent.click(screen.getByRole('button', { name: /Create a boat/ }))
    fireEvent.change(screen.getByLabelText('Boat name'), { target: { value: 'Windward' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create boat' }))
    await screen.findByRole('heading', { name: 'See you on the line.' })
    expect(screen.queryByText('Harbour race')).not.toBeInTheDocument()
    expect(await database.sessions.toArray()).toEqual(original)
    const saltwater = (await database.boats.toArray()).find((boat) => boat.name === 'Saltwater')!
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Switch boat' }), { target: { value: saltwater.id } })
    expect(await screen.findByText('Harbour race')).toBeInTheDocument()
    expect(localStorage.getItem('pin-end-selected-boat')).toBe(saltwater.id)
  })
  it('opens an unfinished past race as a race detail, not a replay', async () => {
    localStorage.removeItem('pin-end-empty')
    const view = render(<App />)
    await screen.findByRole('heading', { name: 'See you on the line.' })
    view.unmount()
    await database.races.toCollection().modify({ scheduledStart: '2020-01-01T10:00:00Z' })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Race 4.*No finish recorded/ }))
    expect(await screen.findByRole('button', { name: 'Enter race mode' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Finished.' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enter race mode' }))
    fireEvent.click(screen.getByRole('radio', { name: /Mark 2.*Windward/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Navigate to this target' }))
    await screen.findByText('RACING')
    await waitFor(async () => expect((await database.sessions.toArray())[0]).toMatchObject({ activeWaypointIndex: 2, syncedStartTime: Date.parse('2020-01-01T10:00:00Z'), roundedAt: {} }))
  })
  it('refreshes the default start to two hours ahead rounded to the nearest quarter hour', async () => {
    localStorage.removeItem('pin-end-empty')
    render(<App />)
    await screen.findByRole('heading', { name: 'See you on the line.' })
    for (const [now, expected] of [
      ['2030-12-12T12:07:29', '2030-12-12T14:00'],
      ['2030-12-12T12:07:30', '2030-12-12T14:15'],
      ['2030-12-12T23:56:00', '2030-12-13T02:00'],
    ]) {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date(now).getTime())
      try {
        fireEvent.click(screen.getByRole('button', { name: 'New race' }))
        expect(screen.getByLabelText('Scheduled start')).toHaveValue(expected)
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      } finally { clock.mockRestore() }
    }
  })
})
