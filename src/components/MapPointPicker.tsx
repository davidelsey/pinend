import { Crosshair, MapPin } from 'lucide-react'
import type { MouseEvent } from 'react'
import type { Coordinate } from '../domain/types'

const BOUNDS = { north: -33.81, south: -33.91, east: 151.30, west: 151.18 }

export function MapPointPicker({ value, onChange }: { value: Coordinate; onChange(coordinate: Coordinate): void }) {
  const x = ((value.longitude - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * 100
  const y = ((BOUNDS.north - value.latitude) / (BOUNDS.north - BOUNDS.south)) * 100
  const pick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const normalX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const normalY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    onChange({
      latitude: BOUNDS.north - normalY * (BOUNDS.north - BOUNDS.south),
      longitude: BOUNDS.west + normalX * (BOUNDS.east - BOUNDS.west),
    })
  }
  return (
    <div className="point-picker">
      <svg viewBox="0 0 100 100" onClick={pick} role="img" aria-label="Select reference point on Sydney Harbour map">
        <rect width="100" height="100" fill="#0a3045" />
        <path d="M0 67 C18 56 23 66 38 50 C51 37 67 44 74 26 C83 11 93 15 100 8 L100 100 L0 100Z" fill="#1d4b48" />
        <path d="M0 67 C18 56 23 66 38 50 C51 37 67 44 74 26 C83 11 93 15 100 8" fill="none" stroke="#4a7770" strokeWidth="1" />
        <g transform={`translate(${x} ${y})`}><circle r="4" fill="#ff6b35" stroke="white" strokeWidth="1" /><path d="M0 5v7" stroke="#ff6b35" strokeWidth="1" /></g>
      </svg>
      <span><Crosshair size={13} /> Tap to select · {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</span>
      <i><MapPin size={13} /> Sydney Harbour area</i>
    </div>
  )
}
