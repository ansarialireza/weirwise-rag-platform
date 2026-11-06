// Static assets are cache-first, so this version must be bumped whenever a
// precached brand asset changes — an installed PWA otherwise keeps serving the
// old icon forever. scripts/brand/build-official-mark.mjs rewrites those files.
const CACHE_NAME = "weirwise-pwa-v8";
const OFFLINE_URL = "/offline";

const PRECACHE_ASSETS = [
  "/offline",
  "/manifest.json",
  "/favicon.svg",
  "/favicon.ico",
  "/favicon-16.png",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/weirwise-mark.svg",
  "/weirwise-mark-ink.svg",
  "/weirwise-horizontal.svg",
  "/weirwise-app-icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/icon-512-monochrome.png",
];

// Only anonymous marketing and embed routes may ever be written to the cache.
// Dashboard, admin, auth, and API responses can contain private data.
const PUBLIC_PATHS = new Set([
  "/",
  "/pricing",
  "/blog",
  "/offline",
]);
const PUBLIC_PREFIXES = ["/blog/", "/embed/"];

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".webp")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_ASSETS.map((asset) => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Never intervene in API, health, telemetry, or Next.js RSC data requests.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/health/") ||
    url.pathname.startsWith("/_telemetry") ||
    url.pathname.startsWith("/_next/data/") ||
    request.headers.get("RSC") === "1"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200 && isPublicPath(url.pathname)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          if (isPublicPath(url.pathname)) {
            const cached = await cache.match(request);
            if (cached) return cached;
          }
          return (
            (await cache.match(OFFLINE_URL)) ||
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        })
    );
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});
