import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

class MockGoogleMap {
  container: HTMLElement
  zoom = 12
  constructor(container: HTMLElement) { this.container = container; container.dataset.zoom = String(this.zoom) }
  fitBounds() { this.container.dataset.fitted = 'true' }
  setCenter() { return undefined }
  getZoom() { return this.zoom }
  setZoom(zoom: number) { this.zoom = zoom; this.container.dataset.zoom = String(zoom) }
  moveCamera(options: { heading?: number }) { this.container.dataset.bearing = String(options.heading ?? 0) }
}

class MockAdvancedMarker {
  content: HTMLElement
  position: { lat: number; lng: number }
  private currentMap: MockGoogleMap | null = null
  constructor(options: { map: MockGoogleMap; content: HTMLElement; position: { lat: number; lng: number } }) {
    this.content = options.content
    this.position = options.position
    this.map = options.map
  }
  set map(map: MockGoogleMap | null) { this.content.remove(); this.currentMap = map; map?.container.append(this.content) }
  get map() { return this.currentMap }
  addListener(event: string, callback: () => void) {
    this.content.addEventListener(event, (domEvent) => {
      const detail = (domEvent as CustomEvent<{ lng?: number; lat?: number }>).detail
      if (detail?.lng != null && detail.lat != null) this.position = { lat: detail.lat, lng: detail.lng }
      callback()
    })
    return { remove: () => undefined }
  }
}

class MockPolyline { setMap() { return undefined } }

vi.stubGlobal('google', { maps: { Polyline: MockPolyline, event: { addListenerOnce: (_map: unknown, _event: string, callback: () => void) => callback() } } })
vi.mock('../services/googleMaps', () => ({
  googleMapOptions: (center: unknown) => ({ center, zoom: 12 }),
  loadGoogleMaps: async () => ({ maps: { Map: MockGoogleMap }, marker: { AdvancedMarkerElement: MockAdvancedMarker } }),
}))

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
