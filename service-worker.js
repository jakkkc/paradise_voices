// Paradise Voices — service worker
// Network-first: always try to fetch the latest version when online, and
// only fall back to the cached copy if there's no connection. This avoids
// tablets getting stuck with a stale mix of old/new files after updates —
// which is what caused the intermittent "works sometimes" bugs.

const CACHE_NAME = "paradise-voices-v3";

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

  // Only handle our own static GET requests — Supabase, Google Fonts, and
  // the Supabase JS CDN always go straight to the network, untouched.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
