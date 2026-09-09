// Minimal service worker for now — just enough for "installable" status.
// We'll add real offline caching in the PWA-polish step.

const CACHE_NAME = 'paradise-voices-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Pass-through for now — no offline caching yet.
  event.respondWith(fetch(event.request));
});
