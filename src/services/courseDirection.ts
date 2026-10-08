/** Keep arrows moving even when a map render replaces its course polyline. */
export function animateCourseDirection(getLine: () => google.maps.Polyline | null) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  let frame = 0
  let previousLine: google.maps.Polyline | null = null
  let previousOffset = -1
  const tick = (time: number) => {
    const line = getLine()
    const offset = reducedMotion?.matches ? 24 : Math.floor(time * 0.024) % 96
    if (line && (line !== previousLine || offset !== previousOffset)) {
      line.setOptions({ icons: [{
        icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: '#ff6b35', fillOpacity: 1, strokeColor: '#071b2f', strokeWeight: 1 },
        offset: `${offset}px`, repeat: '96px',
      }] })
    }
    previousLine = line
    previousOffset = offset
    frame = window.requestAnimationFrame(tick)
  }
  frame = window.requestAnimationFrame(tick)
  return () => window.cancelAnimationFrame(frame)
}
