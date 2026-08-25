/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { createPartialResponse } from 'workbox-range-requests'
import { registerRoute } from 'workbox-routing'
import { OFFLINE_BASEMAP_PATH } from './services/offlineMapConfig'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> }

registerRoute(
  ({ url }) => url.pathname === OFFLINE_BASEMAP_PATH,
  async ({ request }) => {
    const completeArchive = await matchPrecache(OFFLINE_BASEMAP_PATH)
    if (!completeArchive) return fetch(request)
    return request.headers.has('range') ? createPartialResponse(request, completeArchive) : completeArchive
  },
)

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
self.skipWaiting()
clientsClaim()
