// Paradise Voices — service worker
// Caches the app shell so the tablet can still open the app with a
// weak/no connection. Supabase API calls and CDN scripts always go
// straight to the network — only our own static files get cached.

const CACHE_NAME = "paradise-voices-v2";

const PRECACHE_URLS = [
  "index.html",
  "dashboard.html",
  "manifest.json",
  "css/styles.css",
  "js/app.js",
  "js/dashboard.js",
  "js/supabase-client.js",
  "assets/logo.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle our own static GET requests — everything else
  // (Supabase, Google Fonts, the Supabase JS CDN) goes to the network.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
