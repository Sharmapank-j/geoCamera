// public/sw.js — GeoTag Camera Service Worker
// Stale-while-revalidate strategy: serve from cache instantly, update in background.

const CACHE = 'geocamera-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only cache GET requests
  if (request.method !== 'GET') return;
  // Skip cross-origin requests (e.g. external APIs)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached); // offline fallback to cache

      // Return cached immediately if available, fetch in background
      return cached ?? fetchPromise;
    })
  );
});
