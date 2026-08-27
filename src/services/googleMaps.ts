import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || (import.meta.env.DEV ? 'DEMO_MAP_ID' : undefined)
let configured = false
let librariesPromise: Promise<{ maps: google.maps.MapsLibrary; marker: google.maps.MarkerLibrary }> | null = null

export async function loadGoogleMaps() {
  if (!apiKey) throw new Error('Add VITE_GOOGLE_MAPS_API_KEY to show the live map')
  if (!mapId) throw new Error('Add VITE_GOOGLE_MAPS_MAP_ID to show the production map')
  if (!configured) {
    setOptions({ key: apiKey, v: 'quarterly' })
    configured = true
  }
  librariesPromise ??= Promise.all([importLibrary('maps'), importLibrary('marker')])
    .then(([maps, marker]) => ({ maps, marker }))
    .catch((error: unknown) => {
      librariesPromise = null
      throw error
    })
  return librariesPromise
}

export function googleMapOptions(center: google.maps.LatLngLiteral): google.maps.MapOptions {
  return {
    center,
    zoom: 12,
    minZoom: 8,
    maxZoom: 18,
    mapId,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    zoomControl: false,
    rotateControl: false,
    clickableIcons: false,
    gestureHandling: 'greedy',
  }
}
