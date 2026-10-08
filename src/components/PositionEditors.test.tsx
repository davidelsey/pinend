import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Mark } from '../domain/types'
import { FullScreenLineMapEditor } from './FullScreenLineMapEditor'
import { FullScreenMarkMapEditor } from './FullScreenMarkMapEditor'

const coordinate = { latitude: -33.87234, longitude: 151.23123 }
const current = { ...coordinate, timestamp: Date.now(), accuracy: 4, source: 'device' as const }

describe('position editors', () => {
  it('shows the ordered course and updates repeated legs while positioning a mark', async () => {
    const mark: Mark = { id: 'point', name: 'Point', shortName: 'P', provenance: 'personal', position: { kind: 'fixed', coordinate } }
    const other: Mark = { id: 'other', name: 'Other', shortName: 'O', provenance: 'personal', position: { kind: 'fixed', coordinate: { latitude: -33.85, longitude: 151.25 } } }
    const update = vi.spyOn(google.maps.Polyline.prototype, 'setOptions')
    try {
      render(<FullScreenMarkMapEditor mark={mark} otherMarks={[other]} courseMarkIds={['point', 'other', 'point']} onSave={() => undefined} onCancel={() => undefined} />)
      const map = screen.getByRole('img', { name: 'Drag mark on Sydney Harbour map' })
      await waitFor(() => expect(map.querySelector('.point-map-pin--first')).not.toBeNull())
      fireEvent(map.querySelector('.point-map-pin--first')!, new CustomEvent('drag', { detail: { lat: -33.84, lng: 151.24 } }))
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ path: [{ lat: -33.84, lng: 151.24 }, { lat: -33.85, lng: 151.25 }, { lat: -33.84, lng: 151.24 }], editable: false }))
    } finally { update.mockRestore() }
  })

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
