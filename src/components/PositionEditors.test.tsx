import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Mark } from '../domain/types'
import { FullScreenLineMapEditor } from './FullScreenLineMapEditor'
import { FullScreenMarkMapEditor } from './FullScreenMarkMapEditor'

const coordinate = { latitude: -33.87234, longitude: 151.23123 }
const current = { ...coordinate, timestamp: Date.now(), accuracy: 4, source: 'device' as const }

describe('position editors', () => {
  it('places a mark at the current boat position', () => {
    const onSave = vi.fn()
    const mark: Mark = { id: 'laid', name: 'Laid mark', shortName: 'LAID', provenance: 'personal', position: { kind: 'variable' } }
    render(<FullScreenMarkMapEditor mark={mark} otherMarks={[]} fallback={current} onSave={onSave} onCancel={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Set mark here' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save position' }))

    expect(onSave).toHaveBeenCalledWith(coordinate)
  })

  it('places either gate endpoint at the current boat position', () => {
    const onSave = vi.fn()
    const mark: Mark = { id: 'gate', name: 'Gate', shortName: 'GATE', provenance: 'personal', position: { kind: 'gate', pointA: { latitude: -33.86, longitude: 151.22 }, pointB: { latitude: -33.86, longitude: 151.24 }, labels: ['Pin', 'Boat'] } }
    render(<FullScreenLineMapEditor mark={mark} otherMarks={[]} fallback={current} onSave={onSave} onCancel={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Boat here' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save position' }))

    expect(onSave).toHaveBeenCalledWith(mark.position.kind === 'gate' ? mark.position.pointA : undefined, coordinate)
  })

  it('disables here actions until a current position is available', () => {
    const mark: Mark = { id: 'laid', name: 'Laid mark', shortName: 'LAID', provenance: 'personal', position: { kind: 'variable' } }
    render(<FullScreenMarkMapEditor mark={mark} otherMarks={[]} fallback={null} onSave={() => undefined} onCancel={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Set mark here' })).toBeDisabled()
  })

  it('rejects stale fixes and zero-length gates', () => {
    const mark: Mark = { id: 'gate', name: 'Gate', shortName: 'GATE', provenance: 'personal', position: { kind: 'gate', pointA: { latitude: -33.86, longitude: 151.22 }, pointB: { latitude: -33.86, longitude: 151.24 }, labels: ['Pin', 'Boat'] } }
    const { unmount } = render(<FullScreenMarkMapEditor mark={{ ...mark, position: { kind: 'variable' } }} otherMarks={[]} fallback={{ ...current, timestamp: Date.now() - 31_000 }} onSave={() => undefined} onCancel={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Set mark here' })).toBeDisabled()
    unmount()

    render(<FullScreenLineMapEditor mark={mark} otherMarks={[]} fallback={current} onSave={() => undefined} onCancel={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pin here' }))
    fireEvent.click(screen.getByRole('button', { name: 'Boat here' }))
    expect(screen.getByRole('button', { name: 'Save position' })).toBeDisabled()
    expect(screen.getByText('Pin and Boat must be at least 3 m apart.')).toBeInTheDocument()
  })
})
