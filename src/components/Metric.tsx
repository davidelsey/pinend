import type { ReactNode } from 'react'

export function Metric({ label, value, unit, icon }: { label: string; value: string; unit?: string; icon?: ReactNode }) {
  return (
    <div className="metric">
      <div className="metric__label">{icon}{label}</div>
      <div className="metric__value">{value}<span>{unit}</span></div>
    </div>
  )
}
