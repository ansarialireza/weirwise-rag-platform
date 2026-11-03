const CACHE_NAME = 'weirwise-pwa-v2';
const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.svg',
  '/weirwise-app-icon.svg',
  '/weirwise-symbol.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignore non-GET requests or chrome extension schemes
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        return cache.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Network-first with cache fallback for other assets
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        return new Response('Network unavailable', { status: 503, statusText: 'Offline' });
      })
  );
});
