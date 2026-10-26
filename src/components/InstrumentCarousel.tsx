import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function InstrumentCarousel({ sync, stats }: { sync: ReactNode; stats: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const labels = ['Start sync', 'Boat stats']
  const selectPage = (next: number) => {
    setPage(next)
    const element = viewport.current
    element?.scrollTo?.({ left: next === 0 ? 0 : element.scrollWidth - element.clientWidth, behavior: 'smooth' })
  }

  return <div className="instrument-carousel" role="region" aria-roledescription="carousel" aria-label="Start synchronization and boat statistics">
    <div className="instrument-carousel__navigation">
      <button aria-label="Show start synchronization" disabled={page === 0} onClick={() => selectPage(0)}><ChevronLeft size={18} /></button>
      <span>{labels[page]} <small>{page + 1} / 2</small></span>
      <button aria-label="Show boat statistics" disabled={page === 1} onClick={() => selectPage(1)}><ChevronRight size={18} /></button>
    </div>
    <div className="instrument-carousel__viewport" ref={viewport} tabIndex={0}
      onScroll={(event) => { const element = event.currentTarget; if (element.scrollWidth > element.clientWidth) setPage(element.scrollLeft > (element.scrollWidth - element.clientWidth) / 2 ? 1 : 0) }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input')) return
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); selectPage(event.key === 'ArrowLeft' ? 0 : 1) }
      }}>
      {[sync, stats].map((content, index) => <div key={labels[index]} className="instrument-carousel__page" role="group" aria-roledescription="slide" aria-label={labels[index]} aria-hidden={page !== index} inert={page !== index}>{content}</div>)}
    </div>
    <div className="instrument-carousel__pagination">
      {labels.map((label, index) => <button key={label} className={page === index ? 'is-active' : ''} aria-label={`Go to ${label}`} aria-pressed={page === index} onClick={() => selectPage(index)} />)}
      <span className="sr-only" aria-live="polite">Page {page + 1} of 2: {labels[page]}</span>
    </div>
  </div>
}
