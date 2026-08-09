const CACHE_NAME = 'x32-speech-eq-guide-v21'
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './app-icon.svg',
  './touch-controls.css?v=21',
  './mobile-nav.css?v=21',
  './mobile-nav.js?v=21',
  './speech-presets.css?v=21',
  './measurement-confidence.css?v=21',
  './x32-ocr.css?v=21',
  './live-ipad-monitor.css?v=21',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request)
      const requestUrl = new URL(event.request.url)
      if (response.ok && requestUrl.origin === self.location.origin) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(event.request, response.clone())
      }
      return response
    } catch (error) {
      const cached = await caches.match(event.request)
      if (cached) return cached
      if (event.request.mode === 'navigate') {
        const fallback = await caches.match('./index.html')
        if (fallback) return fallback
      }
      return Response.error()
    }
  })())
})
