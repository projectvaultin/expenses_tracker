// IMPORTANT: bump CACHE_NAME any time index.html, manifest.json, or any icon/image file changes —
// otherwise returning visitors keep seeing the OLD cached version indefinitely (icons especially,
// since they're cached cache-first below with no expiry check).
const CACHE_NAME = 'expensestracker-cache-v5';
const FILES_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './brand-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// index.html (and any navigation request) is fetched from the network first, so that when you
// push an update to GitHub, returning visitors get it on their very next load instead of being
// stuck on whatever was cached the first time they ever opened the app. If they're offline, or the
// network request fails, we fall back to whatever copy is cached so the app still works offline.
// Other static assets (icons, manifest) stay cache-first since they rarely change and this keeps
// the app feeling instant.
self.addEventListener('fetch', (event) => {
  const isNavigation = event.request.mode === 'navigate' || event.request.url.endsWith('index.html');
  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((fresh) => {
          const freshClone = fresh.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, freshClone));
          return fresh;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() =>
          caches.match('./index.html')
        )
      );
    })
  );
});
