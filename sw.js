// ProjectVault Expenses Tracker Service Worker
//
// IMPORTANT:
// Bump CACHE_NAME whenever the website's important static files change.
// Navigation requests are always network-first so GitHub Pages updates
// become visible without users remaining permanently stuck on old HTML.

const CACHE_NAME = 'expensestracker-cache-v6';

const FILES_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './brand-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  const isNavigation =
    request.mode === 'navigate' ||
    request.url.endsWith('/index.html') ||
    request.url.includes('/index.html?');

  // HTML/navigation:
  // Network first -> cache fallback.
  if (isNavigation) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });

          return response;
        })
        .catch(() => {
          return caches
            .match(request)
            .then((cached) => cached || caches.match('./index.html'));
        })
    );

    return;
  }

  // Other files:
  // Cache first -> network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
