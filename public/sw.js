/* Financial Steward PWA: cache only public, static application resources. */
const CACHE_NAME = 'financial-steward-static-v1';
const STATIC_ASSETS = [
  '/offline.html',
  '/icon.svg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/apple-touch-icon.png'
];
const ALLOWED_DESTINATIONS = new Set(['script', 'style', 'image', 'font']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('financial-steward-static-') && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept user data, authentication, MCP or API requests.
  if (/^\/(?:api(?:\/|$)|mcp(?:\/|$)|healthz(?:\/|$))/.test(url.pathname)
      || request.headers.has('authorization')
      || request.cache === 'no-store') return;

  if (request.mode === 'navigate') {
    // Pages themselves are network-only. Offline fallback has no account data.
    event.respondWith(fetch(request).catch(async () => (
      await caches.match('/offline.html') || Response.error()
    )));
    return;
  }

  // An allowlist prevents future user-uploaded or private images from entering Cache Storage.
  const publicAsset = url.pathname.startsWith('/assets/') || STATIC_ASSETS.includes(url.pathname);
  if (!publicAsset || !ALLOWED_DESTINATIONS.has(request.destination)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic' && !response.headers.has('set-cookie')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }))
  );
});
