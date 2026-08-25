import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.mock('maplibre-gl', () => {
  class MockBounds {
    extend() { return this }
  }
  class MockMap {
    container: HTMLElement
    bearing = 0
    zoom = 12
    sources = new Map<string, { setData: (data: unknown) => void }>()
    layers = new Set<string>()
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
      this.container.dataset.zoom = String(this.zoom)
    }
    addControl() { return this }
    on(event: string, callback: () => void) { if (event === 'load') setTimeout(callback, 0); return this }
    remove() { this.container.replaceChildren() }
    getSource(id: string) { return this.sources.get(id) }
    addSource(id: string) { this.sources.set(id, { setData: () => undefined }); return this }
    getLayer(id: string) { return this.layers.has(id) ? { id } : undefined }
    addLayer(layer: { id: string }) { this.layers.add(layer.id); return this }
    fitBounds() { this.container.dataset.fitted = 'true'; return this }
    easeTo(options: { bearing?: number; zoom?: number }) { if (options.bearing != null) this.bearing = options.bearing; if (options.zoom != null) this.zoom = options.zoom; this.container.dataset.bearing = String(this.bearing); this.container.dataset.zoom = String(this.zoom); return this }
    getBearing() { return this.bearing }
    getZoom() { return this.zoom }
    zoomIn() { this.zoom += 1; this.container.dataset.zoom = String(this.zoom); return this }
    zoomOut() { this.zoom -= 1; this.container.dataset.zoom = String(this.zoom); return this }
  }
  class MockMarker {
    element: HTMLElement
    map?: MockMap
    lngLat = { lng: 0, lat: 0 }
    constructor(options: { element: HTMLElement }) { this.element = options.element }
    setLngLat(value: [number, number]) { this.lngLat = { lng: value[0], lat: value[1] }; return this }
    getLngLat() { return this.lngLat }
    on(event: string, callback: () => void) {
      this.element.addEventListener(event, (domEvent) => {
        const detail = (domEvent as CustomEvent<{ lng?: number; lat?: number }>).detail
        if (detail?.lng != null && detail.lat != null) this.lngLat = { lng: detail.lng, lat: detail.lat }
        callback()
      })
      return this
    }
    addTo(map: MockMap) { this.map = map; map.container.append(this.element); return this }
    remove() { this.element.remove() }
  }
  const api = { Map: MockMap, Marker: MockMarker, LngLatBounds: MockBounds, AttributionControl: class {}, addProtocol: () => undefined }
  return { default: api, ...api }
})

vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable in tests')))

afterEach(() => cleanup())

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: () => undefined,
})
