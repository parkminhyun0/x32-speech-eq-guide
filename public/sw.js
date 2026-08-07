const CACHE_NAME = 'x32-speech-eq-guide-v8'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app-icon.svg',
  './touch-controls.css?v=8',
  './mobile-nav.css?v=8',
  './mobile-nav.js?v=8',
  './speech-presets.css?v=8',
  './measurement-confidence.css?v=8',
  './x32-ocr.css?v=8',
  './live-ipad-monitor.css?v=8',
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

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    await Promise.all(windows.map((client) => client.navigate(client.url)))
  })())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  )
})
