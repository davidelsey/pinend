import maplibregl from 'maplibre-gl'
import { layers, namedFlavor } from '@protomaps/basemaps'
import { PMTiles, Protocol } from 'pmtiles'

import { OFFLINE_BASEMAP_PATH } from './offlineMapConfig'
const protocol = new Protocol()
let protocolRegistered = false

export function createOfflineMap(container: HTMLElement) {
  const archiveUrl = new URL(OFFLINE_BASEMAP_PATH, window.location.href).href
  if (!protocolRegistered) {
    maplibregl.addProtocol('pmtiles', protocol.tile)
    protocolRegistered = true
  }
  protocol.add(new PMTiles(archiveUrl))
  const baseLayers = layers('protomaps', namedFlavor('dark'), { lang: 'en' }).filter((layer) => layer.type !== 'symbol')
  const map = new maplibregl.Map({
    container,
    attributionControl: false,
    minZoom: 8,
    maxZoom: 18,
    center: [151.235, -33.86],
    zoom: 12,
    style: {
      version: 8,
      sources: {
        protomaps: {
          type: 'vector',
          url: `pmtiles://${archiveUrl}`,
          attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      layers: baseLayers,
    },
  })
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
  return map
}
