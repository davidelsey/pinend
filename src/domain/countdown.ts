export const syncStartFromSignal = (now: number, minutesToStart: 5 | 4 | 1 | 0) =>
  now + minutesToStart * 60_000

export function formatCountdown(milliseconds: number): string {
  const prefix = milliseconds < 0 ? '+' : ''
  const seconds = Math.floor(Math.abs(milliseconds) / 1000)
  return `${prefix}${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
